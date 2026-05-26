const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const electronModuleDir = path.resolve(__dirname, '..', 'node_modules', 'electron');
const electronPathFile = path.join(electronModuleDir, 'path.txt');
const electronInstallScript = path.join(electronModuleDir, 'install.js');

if (fs.existsSync(electronPathFile)) {
  process.exit(0);
}

if (!fs.existsSync(electronInstallScript)) {
  console.error('Electron install.js nao foi encontrado em node_modules. Rode npm install novamente.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [electronInstallScript], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status || 0);