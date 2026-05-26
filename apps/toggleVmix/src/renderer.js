const stateLabel = document.getElementById('stateLabel');
const toggleButton = document.getElementById('toggleButton');
const detailLabel = document.getElementById('detailLabel');
const footerLabel = document.getElementById('footerLabel');
const statusPill = document.getElementById('statusPill');
const actionResult = document.getElementById('actionResult');
const baseUrlLabel = document.getElementById('baseUrlLabel');
const projectButton = document.getElementById('projectButton');
const removeButton = document.getElementById('removeButton');

let currentState = null;

async function api(pathname, options = {}) {
  const response = await fetch(pathname, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function renderState(payload) {
  currentState = payload;
  const enabled = Boolean(payload.integrationEnabled);

  stateLabel.textContent = enabled ? 'INTEGRACAO ATIVA' : 'INTEGRACAO DESLIGADA';
  toggleButton.textContent = enabled ? 'Desligar integracao' : 'Ligar integracao';
  toggleButton.classList.toggle('is-on', enabled);
  statusPill.textContent = enabled ? 'Ativa' : 'Desligada';
  statusPill.classList.toggle('is-off', !enabled);
  footerLabel.textContent = enabled
    ? 'As rotas Holyrics vao encaminhar para vMix 1 e 2.'
    : 'As rotas Holyrics respondem com erro controlado 503.';
  detailLabel.textContent = payload.lastAction
    ? `Ultima acao: ${payload.lastAction.endpoint} em ${new Date(payload.lastAction.at).toLocaleString()}`
    : 'Nenhuma acao executada ainda.';
  baseUrlLabel.textContent = payload.baseUrl || 'http://127.0.0.1:5000';
}

function setBusy(isBusy) {
  toggleButton.disabled = isBusy;
  projectButton.disabled = isBusy;
  removeButton.disabled = isBusy;
}

async function refreshState() {
  const payload = await api('/api/state');
  renderState(payload);
}

async function toggleIntegration() {
  setBusy(true);
  try {
    const payload = await api('/api/toggle', { method: 'POST', body: '{}' });
    renderState(payload);
    actionResult.textContent = `Integracao ${payload.integrationEnabled ? 'ativada' : 'desativada'}.`;
  } catch (error) {
    actionResult.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function runHolyricsRoute(route, label) {
  setBusy(true);
  try {
    const payload = await api(route, { method: 'POST', body: '{}' });
    actionResult.textContent = `${label} enviado com sucesso para ${payload.targetName}.`;
    await refreshState();
  } catch (error) {
    actionResult.textContent = `Erro ao executar ${label}: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

toggleButton.addEventListener('click', toggleIntegration);
projectButton.addEventListener('click', () => runHolyricsRoute('/holyrics/project', 'project'));
removeButton.addEventListener('click', () => runHolyricsRoute('/holyrics/remove', 'remove'));

refreshState().catch((error) => {
  stateLabel.textContent = 'ERRO';
  detailLabel.textContent = error.message;
  footerLabel.textContent = 'Verifique se a API local esta rodando.';
  toggleButton.disabled = true;
  projectButton.disabled = true;
  removeButton.disabled = true;
  statusPill.textContent = 'Offline';
  statusPill.classList.add('is-off');
});