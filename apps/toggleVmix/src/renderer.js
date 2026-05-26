const stateLabel = document.getElementById('stateLabel');
const toggleButton = document.getElementById('toggleButton');
const detailLabel = document.getElementById('detailLabel');

function renderState(enabled) {
  stateLabel.textContent = enabled ? 'INTEGRACAO ATIVA' : 'INTEGRACAO DESLIGADA';
  toggleButton.textContent = enabled ? 'Desligar integracao' : 'Ligar integracao';
  toggleButton.classList.toggle('is-on', enabled);
  detailLabel.textContent = enabled
    ? 'As rotas Holyrics vao encaminhar para vMix 1 e 2.'
    : 'As rotas Holyrics respondem com erro controlado.';
}

async function refreshState() {
  const currentState = await window.toggleVmix.getState();
  renderState(Boolean(currentState.integrationEnabled));
}

toggleButton.addEventListener('click', async () => {
  toggleButton.disabled = true;
  try {
    const currentState = await window.toggleVmix.getState();
    const nextState = !Boolean(currentState.integrationEnabled);
    const updatedState = await window.toggleVmix.setState(nextState);
    renderState(Boolean(updatedState.integrationEnabled));
    await window.toggleVmix.ensureTopmost();
  } finally {
    toggleButton.disabled = false;
  }
});

refreshState().catch((error) => {
  stateLabel.textContent = 'ERRO';
  detailLabel.textContent = error.message;
  toggleButton.disabled = true;
});