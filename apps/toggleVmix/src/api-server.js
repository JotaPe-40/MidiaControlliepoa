const http = require('http');
const { requestVmix } = require('./vmix-client');

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function createApiServer({ config, getIntegrationEnabled, setLastAction, log }) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      const method = req.method || 'GET';

      if ((pathname === '/holyrics/project' || pathname === '/holyrics/remove') && (method === 'GET' || method === 'POST')) {
        if (!getIntegrationEnabled()) {
          jsonResponse(res, 503, {
            success: false,
            integrationEnabled: false,
            error: 'Integracao desligada',
          });
          return;
        }

        const targetUrl = pathname === '/holyrics/project' ? config.vmix.vmix1Url : config.vmix.vmix2Url;
        const targetName = pathname === '/holyrics/project' ? 'vmix-1' : 'vmix-2';
        const result = await requestVmix(targetUrl, config.vmix.timeoutMs);

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

  function listen() {
    return new Promise((resolve) => {
      server.listen(config.api.port, config.api.host, () => resolve(server));
    });
  }

  function close() {
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { listen, close };
}

module.exports = {
  createApiServer,
};