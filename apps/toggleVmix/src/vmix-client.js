const http = require('http');
const https = require('https');

function requestVmix(targetUrl, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const url = new URL(targetUrl);
      const transport = url.protocol === 'https:' ? https : http;
      const defaultPort = url.protocol === 'https:' ? 443 : 80;

      const req = transport.request(
        {
          method: 'GET',
          hostname: url.hostname,
          port: url.port || defaultPort,
          path: `${url.pathname}${url.search}`,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];

          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              statusCode: res.statusCode || 0,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Timeout ao chamar vMix'));
      });

      req.on('error', (error) => {
        resolve({
          ok: false,
          statusCode: 0,
          body: error.message,
        });
      });

      req.end();
    } catch (error) {
      resolve({
        ok: false,
        statusCode: 0,
        body: error.message,
      });
    }
  });
}

module.exports = {
  requestVmix,
};