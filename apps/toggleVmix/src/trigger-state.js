const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'togglevmix-state.json');
}

function getDefaultState() {
  return {
    enabled: false,
    updatedAt: null,
  };
}

function loadState() {
  try {
    const filePath = getStateFilePath();
    if (!fs.existsSync(filePath)) {
      return getDefaultState();
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...getDefaultState(),
      ...parsed,
    };
  } catch {
    return getDefaultState();
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