const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  api: {
    host: '0.0.0.0',
    port: 5000,
  },
  holyrics: {
    triggerPauseMode: 'receiver',
    tag: '',
    receiver: '',
  },
  vmix: {
    vmix1Url: 'http://127.0.0.1/vmix/vmix-1',
    vmix2Url: 'http://127.0.0.1/vmix/vmix-2',
    timeoutMs: 3000,
  },
  state: {
    integrationEnabled: true,
  },
  logging: true,
};

function mergeConfig(base, override) {
  return {
    api: {
      host: override.api?.host || base.api.host,
      port: Number(override.api?.port || base.api.port),
    },
    holyrics: {
      triggerPauseMode: override.holyrics?.triggerPauseMode || base.holyrics.triggerPauseMode,
      tag: override.holyrics?.tag || base.holyrics.tag,
      receiver: override.holyrics?.receiver || base.holyrics.receiver,
    },
    vmix: {
      vmix1Url: override.vmix?.vmix1Url || base.vmix.vmix1Url,
      vmix2Url: override.vmix?.vmix2Url || base.vmix.vmix2Url,
      timeoutMs: Number(override.vmix?.timeoutMs || base.vmix.timeoutMs),
    },
    state: {
      integrationEnabled: override.state?.integrationEnabled ?? base.state.integrationEnabled,
    },
    logging: override.logging !== false,
  };
}

function loadConfig(baseDir = path.resolve(__dirname, '..')) {
  const configPath = path.resolve(baseDir, 'config.json');

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(raw);

  return mergeConfig(DEFAULT_CONFIG, parsed);
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
};