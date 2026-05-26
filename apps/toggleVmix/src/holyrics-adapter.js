const { requestVmix } = require('./vmix-client');

function createHolyricsAdapter(config) {
  async function project() {
    return requestVmix(config.vmix.vmix1Url, config.vmix.timeoutMs);
  }

  async function remove() {
    return requestVmix(config.vmix.vmix2Url, config.vmix.timeoutMs);
  }

  return {
    project,
    remove,
  };
}

module.exports = {
  createHolyricsAdapter,
};