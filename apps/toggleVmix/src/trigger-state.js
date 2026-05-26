const fs = require('fs');
const os = require('os');
const path = require('path');

function getStateFilePath() {
  const configuredPath = process.env.TOGGLEVMIX_STATE_FILE;

  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.join(os.homedir(), '.togglevmix', 'state.json');
}

function getDefaultState(config = {}) {
  return {
    integrationEnabled: config.state?.integrationEnabled ?? false,
    updatedAt: null,
    lastAction: null,
  };
}

function loadState(config = {}) {
  try {
    const filePath = getStateFilePath();
    if (!fs.existsSync(filePath)) {
      return getDefaultState(config);
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const normalizedIntegrationEnabled =
      typeof parsed.integrationEnabled === 'boolean'
        ? parsed.integrationEnabled
        : typeof parsed.enabled === 'boolean'
          ? parsed.enabled
          : getDefaultState(config).integrationEnabled;

    return {
      ...getDefaultState(config),
      ...parsed,
      integrationEnabled: normalizedIntegrationEnabled,
    };
  } catch {
    return getDefaultState(config);
  }
}

function saveState(state) {
  const filePath = getStateFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = {
  getDefaultState,
  loadState,
  saveState,
};