const http = require('http');
const fs = require('fs');
const path = require('path');
const { createHolyricsAdapter } = require('./holyrics-adapter');
const { getDefaultState, loadState, saveState } = require('./trigger-state');
const { loadConfig } = require('./config');

const APP_ROOT = path.resolve(__dirname, '..');
const ROUTES = {
  project: '/holyrics/project',
  remove: '/holyrics/remove',
};

const STATIC_FILES = {
  '/': path.join(__dirname, 'renderer.html'),
  '/index.html': path.join(__dirname, 'renderer.html'),
  '/renderer.html': path.join(__dirname, 'renderer.html'),
  '/renderer.js': path.join(__dirname, 'renderer.js'),
  '/styles.css': path.join(__dirname, 'styles.css'),
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

let config;
let currentState;
let holyricsAdapter;

function log(...args) {
  if (!config?.logging) {
    return;
  }

  console.log(new Date().toISOString(), '-', ...args);
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'text/plain; charset=utf-8';

  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (error) {
    jsonResponse(res, 500, { success: false, error: error.message });
  }
}

function setIntegrationEnabled(enabled) {
  currentState = {
    ...currentState,
    integrationEnabled: enabled,
    updatedAt: new Date().toISOString(),
  };

  saveState(currentState);
  return currentState;
}

function setLastAction(lastAction) {
  currentState = {
    ...currentState,
    lastAction,
    updatedAt: new Date().toISOString(),
  };

  saveState(currentState);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }

      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function getAppBaseUrl() {
  const host = config.api.host === '0.0.0.0' ? '127.0.0.1' : config.api.host;
  return `http://${host}:${config.api.port}`;
}

function getRoutesInfo() {
  return {
    project: ROUTES.project,
    remove: ROUTES.remove,
  };
}

async function handleHolyricsRoute(pathname, res) {
  if (!currentState.integrationEnabled) {
    jsonResponse(res, 503, {
      success: false,
      integrationEnabled: false,
      error: 'Integracao desligada',
    });
    return;
  }

  const targetUrl = pathname === ROUTES.project ? config.vmix.vmix1Url : config.vmix.vmix2Url;
  const targetName = pathname === ROUTES.project ? 'vmix-1' : 'vmix-2';
  const result = pathname === ROUTES.project ? await holyricsAdapter.project() : await holyricsAdapter.remove();

  if (result.ok) {
    setLastAction({
      endpoint: pathname,
      targetName,
      targetUrl,
      statusCode: result.statusCode,
      at: new Date().toISOString(),
    });

    jsonResponse(res, 200, {
      success: true,
      integrationEnabled: true,
      endpoint: pathname,
      targetName,
      targetUrl,
      statusCode: result.statusCode,
    });
    return;
  }

  log('Falha ao chamar vMix', { endpoint: pathname, targetUrl, statusCode: result.statusCode });
  jsonResponse(res, 502, {
    success: false,
    integrationEnabled: true,
    endpoint: pathname,
    error: 'Erro ao comunicar com vMix',
    statusCode: result.statusCode,
  });
}

function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      const method = req.method || 'GET';

      if (STATIC_FILES[pathname] && method === 'GET') {
        sendFile(res, STATIC_FILES[pathname]);
        return;
      }

      if (pathname === '/api/state' && method === 'GET') {
        jsonResponse(res, 200, {
          success: true,
          integrationEnabled: currentState.integrationEnabled,
          updatedAt: currentState.updatedAt,
          lastAction: currentState.lastAction || null,
          routes: getRoutesInfo(),
          baseUrl: getAppBaseUrl(),
        });
        return;
      }

      if (pathname === '/api/toggle' && (method === 'GET' || method === 'POST')) {
        let enabled = !currentState.integrationEnabled;

        if (method === 'POST') {
          const body = await readJsonBody(req).catch((error) => {
            throw new Error(`JSON invalido: ${error.message}`);
          });

          if (body && typeof body.enabled === 'boolean') {
            enabled = body.enabled;
          }
        }

        const updatedState = setIntegrationEnabled(enabled);
        jsonResponse(res, 200, {
          success: true,
          integrationEnabled: updatedState.integrationEnabled,
          updatedAt: updatedState.updatedAt,
          lastAction: updatedState.lastAction || null,
          routes: getRoutesInfo(),
          baseUrl: getAppBaseUrl(),
        });
        return;
      }

      if ((pathname === ROUTES.project || pathname === ROUTES.remove) && (method === 'GET' || method === 'POST')) {
        await handleHolyricsRoute(pathname, res);
        return;
      }

      if (pathname === '/api/health' && method === 'GET') {
        jsonResponse(res, 200, {
          success: true,
          baseUrl: getAppBaseUrl(),
        });
        return;
      }

      jsonResponse(res, 404, {
        success: false,
        error: 'Rota nao encontrada',
      });
    } catch (error) {
      log('Erro ao processar requisicao', error.message);
      jsonResponse(res, 500, {
        success: false,
        error: error.message,
      });
    }
  });

  return server;
}

async function start() {
  config = loadConfig(APP_ROOT);
  currentState = loadState(config) || getDefaultState(config);
  holyricsAdapter = createHolyricsAdapter(config);
  const server = createServer();

  await new Promise((resolve) => {
    server.listen(config.api.port, config.api.host, resolve);
  });

  log(`API escutando em ${getAppBaseUrl()}`);
  log(`Rotas Holyrics: ${ROUTES.project} e ${ROUTES.remove}`);
  log('Abra a interface no navegador apontando para a URL acima.');

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  start,
  setIntegrationEnabled,
};
