# Toggle vMix

API local com uma pequena janela desktop para ligar e desligar a integracao entre Holyrics e vMix.

## Status atual

Primeira entrega em andamento:

- janela pequena no canto inferior da tela
- sempre em primeiro plano
- switch on/off para a integracao
- servidor HTTP local escutando as rotas do Holyrics
- confirmacao ao fechar

## Como executar em desenvolvimento

```powershell
cd "c:\Users\joaop\Documents\GitHub\MIdiaControlliepoa\apps\toggleVmix"
npm install
npm start
```

## Executavel

Ao compilar com `npm run build`, o executavel portable fica em `dist/` dentro desta pasta:

- `dist/ToggleVMix-Portable-0.1.0.exe`

Se a versao mudar, o nome do arquivo tambem muda.

## Rotas

O app escuta apenas estas rotas para o Holyrics:

- `GET` ou `POST` `/holyrics/project` -> chama `vmix-1`
- `GET` ou `POST` `/holyrics/remove` -> chama `vmix-2`

Quando a integracao estiver desligada, a resposta e controlada com erro `503`.

## Holyrics

Pela documentacao do `holyrics/jslib`, os pontos de pausa mais proximos do que voce descreveu sao:

- `settings_trigger_pause_for_tag`
- `settings_trigger_pause_for_receiver`

O app nao chama essas acoes sozinho ainda, porque isso depende de como o Holyrics esta exposto no seu ambiente. Mas a configuracao ja esta preparada para você informar `tag` ou `receiver` em `config.json` quando for ligar essa ponte.

## Configuracao

Edite `config.json` para ajustar as URLs do vMix e a porta da API local.

- `holyrics.triggerPauseMode`: `tag` ou `receiver`
- `holyrics.tag`: tag que sera usada quando o modo for `tag`
- `holyrics.receiver`: receiver que sera usado quando o modo for `receiver`
- `vmix.vmix1Url`: endpoint usado quando a letra/versiculo e projetado
- `vmix.vmix2Url`: endpoint usado quando a letra/versiculo e removido
- `api.port`: porta local da API

## Estrutura

- `src/main.js`: processo principal do Electron e orquestracao da API
- `src/api-server.js`: servidor HTTP local com as rotas do Holyrics
- `src/holyrics-adapter.js`: ponte para as URLs do vMix
- `src/trigger-state.js`: estado local da integracao
- `src/config.js`: carregamento da configuracao
- `src/renderer.js`: interface da janela