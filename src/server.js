const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(process.cwd(), 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      'Arquivo config.json nao encontrado. Copie config.example.json para config.json e ajuste as URLs.'
    );
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const normalized = raw.replace(/^\uFEFF/, '');
  const parsed = JSON.parse(normalized);

  return {
    listen: {
      host: parsed.listen?.host || '0.0.0.0',
      port: Number(parsed.listen?.port || 8787),
    },
    authToken: parsed.authToken || '',
    controllerMode: String(parsed.controllerMode || 'companion'),
    switching: {
      cooldownMs: Number(parsed.switching?.cooldownMs || 0),
      timeoutMs: Number(parsed.switching?.timeoutMs || 3000),
      showAction: {
        method: String(parsed.switching?.showAction?.method || 'GET').toUpperCase(),
        url: parsed.switching?.showAction?.url || '',
      },
      hideAction: {
        method: String(parsed.switching?.hideAction?.method || 'GET').toUpperCase(),
        url: parsed.switching?.hideAction?.url || '',
      },
    },
    atemDirect: {
      ip: parsed.atemDirect?.ip || '',
      mixEffect: Number(parsed.atemDirect?.mixEffect ?? 0),
      showInput: Number(parsed.atemDirect?.showInput ?? 1),
      hideInput: Number(parsed.atemDirect?.hideInput ?? 2),
      connectTimeoutMs: Number(parsed.atemDirect?.connectTimeoutMs || 4000),
    },
    logging: parsed.logging !== false,
  };
}

const config = loadConfig();

if (!['companion', 'atemDirect', 'mock'].includes(config.controllerMode)) {
  throw new Error("controllerMode invalido. Use 'companion', 'atemDirect' ou 'mock'.");
}

if (config.controllerMode === 'companion') {
  if (!config.switching.showAction.url || !config.switching.hideAction.url) {
    throw new Error('URLs de showAction/hideAction precisam ser configuradas em config.json');
  }
}

if (config.controllerMode === 'atemDirect') {
  if (!config.atemDirect.ip) {
    throw new Error("atemDirect.ip precisa ser configurado quando controllerMode='atemDirect'");
  }
}

let overlayVisible = null;
let lastSwitchAt = 0;

function log(...args) {
  if (!config.logging) {
    return;
  }
  const stamp = new Date().toISOString();
  console.log(stamp, '-', ...args);
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function isAuthorized(reqUrl, headers) {
  if (!config.authToken) {
    return true;
  }

  const urlObj = new URL(reqUrl, 'http://localhost');
  const tokenFromQuery = urlObj.searchParams.get('token');
  const tokenFromHeader = headers['x-automation-token'];

  return tokenFromQuery === config.authToken || tokenFromHeader === config.authToken;
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Payload muito grande'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error('JSON invalido'));
      }
    });

    req.on('error', reject);
  });
}

function httpRequest(action, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(action.url);
    const transport = target.protocol === 'https:' ? https : http;
    const defaultPort = target.protocol === 'https:' ? 443 : 80;

    const req = transport.request(
      {
        method: action.method,
        hostname: target.hostname,
        port: target.port || defaultPort,
        path: `${target.pathname}${target.search}`,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode || 0,
            body: responseBody,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Timeout na chamada HTTP de automacao'));
    });

    req.on('error', reject);
    req.end();
  });
}

function createCompanionController(currentConfig) {
  return {
    mode: 'companion',
    async switchByOverlayState(visible) {
      const action = visible ? currentConfig.switching.showAction : currentConfig.switching.hideAction;
      const result = await httpRequest(action, currentConfig.switching.timeoutMs);

      if (result.statusCode >= 200 && result.statusCode < 300) {
        return {
          ok: true,
          mode: 'companion',
          statusCode: result.statusCode,
          actionUrl: action.url,
        };
      }

      throw new Error(`Chamada HTTP retornou status ${result.statusCode}`);
    },
    getHealth() {
      return {
        mode: 'companion',
      };
    },
  };
}

function createAtemDirectController(currentConfig) {
  let Atem;
  try {
    ({ Atem } = require('atem-connection'));
  } catch (error) {
    throw new Error(
      "Dependencia 'atem-connection' nao encontrada. Rode npm install para usar controllerMode='atemDirect'"
    );
  }

  const atem = new Atem();
  let connected = false;
  let connectPromise = null;

  function startConnection() {
    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = Promise.resolve()
      .then(() => atem.connect(currentConfig.atemDirect.ip))
      .catch((error) => {
        throw new Error(`Falha ao iniciar conexao ATEM: ${error.message}`);
      })
      .finally(() => {
        connectPromise = null;
      });

    return connectPromise;
  }

  function waitForConnected(timeoutMs) {
    if (connected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let done = false;

      function finalize(next) {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        atem.off('connected', onConnected);
        atem.off('error', onError);
        next();
      }

      function onConnected() {
        finalize(resolve);
      }

      function onError(error) {
        finalize(() => reject(new Error(`Erro de conexao ATEM: ${error.message}`)));
      }

      const timer = setTimeout(() => {
        finalize(() => reject(new Error('Timeout ao conectar na ATEM')));
      }, timeoutMs);

      atem.on('connected', onConnected);
      atem.on('error', onError);
    });
  }

  atem.on('connected', () => {
    connected = true;
    log('ATEM conectada', { ip: currentConfig.atemDirect.ip });
  });

  atem.on('disconnected', () => {
    connected = false;
    log('ATEM desconectada');
  });

  atem.on('error', (error) => {
    connected = false;
    log('ATEM erro', error.message);
  });

  startConnection().catch((error) => {
    log('Falha de conexao ATEM na inicializacao', error.message);
  });

  return {
    mode: 'atemDirect',
    async switchByOverlayState(visible) {
      const targetInput = visible ? currentConfig.atemDirect.showInput : currentConfig.atemDirect.hideInput;

      if (!connected) {
        await startConnection();
        await waitForConnected(currentConfig.atemDirect.connectTimeoutMs);
      }

      await atem.changeProgramInput(targetInput, currentConfig.atemDirect.mixEffect);

      return {
        ok: true,
        mode: 'atemDirect',
        targetInput,
        mixEffect: currentConfig.atemDirect.mixEffect,
      };
    },
    getHealth() {
      return {
        mode: 'atemDirect',
        connected,
        ip: currentConfig.atemDirect.ip,
      };
    },
  };
}

function createController(currentConfig) {
  if (currentConfig.controllerMode === 'companion') {
    return createCompanionController(currentConfig);
  }
  if (currentConfig.controllerMode === 'mock') {
    return createMockController();
  }
  return createAtemDirectController(currentConfig);
}

function createMockController() {
  return {
    mode: 'mock',
    async switchByOverlayState(visible) {
      log('Comutacao simulada (mock)', {
        visible,
        simulatedAction: visible ? 'show' : 'hide',
      });

      return {
        ok: true,
        mode: 'mock',
        simulated: true,
        simulatedAction: visible ? 'show' : 'hide',
      };
    },
    getHealth() {
      return {
        mode: 'mock',
        simulated: true,
      };
    },
  };
}

const controller = createController(config);

async function switchByOverlayState(visible, source = 'unknown') {
  const now = Date.now();
  if (config.switching.cooldownMs > 0 && now - lastSwitchAt < config.switching.cooldownMs) {
    log('Ignorado por cooldown', { visible, source });
    return { skipped: true, reason: 'cooldown' };
  }

  if (overlayVisible === visible) {
    log('Ignorado por estado repetido', { visible, source });
    return { skipped: true, reason: 'same-state' };
  }

  const result = await controller.switchByOverlayState(visible);

  overlayVisible = visible;
  lastSwitchAt = now;
  log('Comutacao executada', {
    visible,
    source,
    controllerMode: controller.mode,
    result,
  });
  return result;
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const pathname = urlObj.pathname;
    const method = req.method || 'GET';

    if (pathname === '/health' && method === 'GET') {
      jsonResponse(res, 200, {
        ok: true,
        service: 'holyrics-atem-bridge',
        controllerMode: controller.mode,
        overlayVisible,
        controllerHealth: controller.getHealth(),
      });
      return;
    }

    if (!isAuthorized(req.url || '/', req.headers)) {
      jsonResponse(res, 401, {
        ok: false,
        error: 'nao autorizado',
      });
      return;
    }

    if (pathname === '/event/show' && (method === 'GET' || method === 'POST')) {
      const result = await switchByOverlayState(true, 'event-show');
      jsonResponse(res, 200, {
        ok: true,
        event: 'show',
        result,
      });
      return;
    }

    if (pathname === '/event/hide' && (method === 'GET' || method === 'POST')) {
      const result = await switchByOverlayState(false, 'event-hide');
      jsonResponse(res, 200, {
        ok: true,
        event: 'hide',
        result,
      });
      return;
    }

    if (pathname === '/event/overlay' && method === 'POST') {
      const body = await parseRequestBody(req);
      if (typeof body.visible !== 'boolean') {
        throw new Error("Campo 'visible' deve ser boolean no endpoint /event/overlay");
      }
      const visible = body.visible;
      const result = await switchByOverlayState(visible, 'event-overlay');

      jsonResponse(res, 200, {
        ok: true,
        event: 'overlay',
        visible,
        result,
      });
      return;
    }

    jsonResponse(res, 404, {
      ok: false,
      error: 'rota nao encontrada',
    });
  } catch (error) {
    log('Erro ao processar requisicao', error.message);
    jsonResponse(res, 500, {
      ok: false,
      error: error.message,
    });
  }
});

server.listen(config.listen.port, config.listen.host, () => {
  log(
    `Bridge em execucao: http://${config.listen.host}:${config.listen.port} (auth ${config.authToken ? 'ON' : 'OFF'}, mode ${controller.mode})`
  );
});
