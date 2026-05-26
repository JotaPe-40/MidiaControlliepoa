# Toggle vMix

API local com um painel web leve para ligar e desligar a integracao entre Holyrics e vMix.

## Status atual

Primeira entrega em andamento:

- interface web acessada no navegador
- switch on/off para a integracao
- servidor HTTP local escutando as rotas do Holyrics

## Como executar em desenvolvimento

```powershell
cd "c:\Users\joaop\Documents\GitHub\MIdiaControlliepoa\apps\toggleVmix"
npm install
npm start
```

Importante: rode os comandos na pasta `apps/toggleVmix` (nao dentro de `src`).
Para uma maquina nova, basta ter Node.js e npm instalados.

Depois de iniciar, abra a interface em:

`http://127.0.0.1:5000`

## Observacao sobre dependencias

Esta versao nao usa Electron. Se voce estiver com um clone antigo, atualize o repositorio para remover qualquer dependencia velha de Electron ou `electron-prebuilt`.

## Rotas

O app escuta estas rotas para o Holyrics e para o painel web:

- `GET` ou `POST` `/holyrics/project` -> chama `vmix-1`
- `GET` ou `POST` `/holyrics/remove` -> chama `vmix-2`
- `GET` `/api/state` -> estado atual da integracao
- `POST` `/api/toggle` -> alterna a integracao

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
- `api.host`: host local, normalmente `0.0.0.0`

## Execucao

Ao rodar `npm start`, o servidor sobe e a UI fica disponivel no navegador. O app guarda o estado local em um arquivo por usuario, fora da pasta do projeto.

## Estrutura

- `src/main.js`: servidor HTTP principal e roteamento do painel
- `src/renderer.html`: interface web do painel
- `src/renderer.js`: logica do painel no navegador
- `src/styles.css`: visual do painel
- `src/api-server.js`: helper do backend das rotas Holyrics
- `src/holyrics-adapter.js`: ponte para as URLs do vMix
- `src/trigger-state.js`: estado local da integracao
- `src/config.js`: carregamento da configuracao