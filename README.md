# MidiaControlliepoa

Bridge de automacao para trocar entradas da ATEM Mini Pro a partir de eventos do Holyrics, com dois modos de operacao:

1. Modo 1 (companion): Holyrics -> Bridge -> Companion -> ATEM
2. Modo 2 (atemDirect): Holyrics -> Bridge -> ATEM (direto por rede)

Os dois modos coexistem no mesmo projeto. Voce escolhe no arquivo config.json.

## Requisitos

- Node.js 18+
- Holyrics no notebook de midia
- ATEM e notebook na mesma rede (recomendado IP fixo)

Para o modo companion:

- Companion instalado e em execucao

Para o modo atemDirect:

- Biblioteca atem-connection (instalada via npm install)
- Controle direto por IP da ATEM

Observacao importante sobre USB:

- O modo atemDirect desta implementacao usa rede (IP), nao USB.
- Se voce precisa controle via USB especificamente, mantenha o modo companion ou use o software oficial da Blackmagic para operacao manual local.

## Estrutura

- src/server.js: servidor HTTP e logica de comutacao
- config.example.json: modelo completo para os 2 modos
- config.json: configuracao ativa

## Instalacao

### Onde rodar os comandos

Execute os comandos no terminal do proprio notebook de midia, dentro da pasta do projeto:

```powershell
cd "c:\Users\joaop\Documents\GitHub\MidiaControlliepoa"
```

Se rodar fora dessa pasta, o npm nao encontra o package.json do projeto.

### Passo a passo de instalacao

1. Verifique Node.js e npm:

```powershell
node -v
npm -v
```

2. Instale dependencias do projeto (inclui atem-connection automaticamente porque ela ja esta no package.json):

```bash
npm install
```

3. (Opcional) Reinstalar apenas a biblioteca ATEM direct manualmente:

```bash
npm install atem-connection --save
```

4. Ajuste config.json conforme o modo escolhido.

Observacao: config.json precisa ser JSON valido, sem comentarios com //.

5. Inicie o servico:

```bash
npm start
```

### Detalhes da execucao

1. O terminal deve permanecer aberto enquanto a automacao estiver em uso.
2. Ao iniciar, o log mostra host, porta, auth e modo ativo.
3. Para trocar de modo, altere controllerMode no config.json e reinicie o servico.
4. Se alterar qualquer valor do config.json, reinicie o npm start para aplicar.

Exemplo de execucao no Windows PowerShell:

```powershell
cd "c:\Users\joaop\Documents\GitHub\MidiaControlliepoa"
npm install
npm start
```

## Assistente .exe (verificacao e setup automatico)

Foi criado um programa em C# que verifica requisitos e configura o que estiver faltando.

Arquivo fonte do assistente:

- tools/SetupAssistant/Program.cs

O que ele faz automaticamente:

1. Verifica se Node.js e npm estao instalados.
2. Se faltar Node/npm, tenta instalar Node.js LTS via winget.
3. Verifica versao minima do Node (18+).
4. Executa npm install no projeto.
5. Verifica e instala atem-connection se necessario.
6. Cria ou corrige config.json com base em config.example.json.
7. Garante que controllerMode seja valido.

### Como gerar o .exe

No PowerShell, dentro da pasta do projeto:

```powershell
cd "c:\Users\joaop\Documents\GitHub\MidiaControlliepoa"
dotnet publish .\tools\SetupAssistant\SetupAssistant.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

Saida do executavel:

- tools/SetupAssistant/bin/Release/net8.0/win-x64/publish/MidiaControlliepoa.SetupAssistant.exe

Executavel pronto para uso rapido neste projeto:

- dist/MidiaControlliepoa.SetupAssistant.exe

### Como executar o .exe

Opcao 1 (rodando na pasta do projeto atual):

```powershell
cd "c:\Users\joaop\Documents\GitHub\MidiaControlliepoa"
.\dist\MidiaControlliepoa.SetupAssistant.exe
```

Opcao 2 (informando pasta do projeto por argumento):

```powershell
MidiaControlliepoa.SetupAssistant.exe --project "c:\Users\joaop\Documents\GitHub\MidiaControlliepoa"
```

### Observacoes de execucao

1. Para instalar Node via winget, pode ser necessario abrir PowerShell como Administrador.
2. Se o config.json estiver invalido, o assistente cria backup e recria com base no config.example.json.
3. Depois que o assistente concluir, execute npm start para iniciar o bridge.

## Endpoints do bridge

Base: http://IP_DO_NOTEBOOK:8787

- GET /health
	- Status do servico e modo ativo.

- GET ou POST /event/show
	- Evento de letra/versiculo visivel.
	- Troca para input configurado de show.

- GET ou POST /event/hide
	- Evento de letra removida.
	- Troca para input configurado de hide.

- POST /event/overlay
	- Body JSON obrigatorio: { "visible": true } ou { "visible": false }

## Autenticacao

Se authToken estiver preenchido em config.json, envie token de uma destas formas:

- Query string: ?token=SEU_TOKEN
- Header: x-automation-token: SEU_TOKEN

## Modo 1: Companion (versao 1 preservada)

### 1) Configuracao no Companion

1. Adicione a conexao Blackmagic ATEM com o IP da sua mesa.
2. Crie 2 botoes:
	 - Botao A: Program Input 1
	 - Botao B: Program Input 2
3. Copie as URLs HTTP desses botoes (varia por versao do Companion).

### 2) Configuracao no config.json

```json
{
	"controllerMode": "companion",
	"switching": {
		"cooldownMs": 150,
		"timeoutMs": 3000,
		"showAction": {
			"method": "GET",
			"url": "http://127.0.0.1:8000/api/location/1/1/1/press"
		},
		"hideAction": {
			"method": "GET",
			"url": "http://127.0.0.1:8000/api/location/1/1/2/press"
		}
	}
}
```

### 3) Configuracao no Holyrics

1. Evento mostrar letra/versiculo:
	 - URL: http://IP_NOTEBOOK:8787/event/show?token=SEU_TOKEN
	 - Metodo: GET (ou POST)
2. Evento limpar/remover letra:
	 - URL: http://IP_NOTEBOOK:8787/event/hide?token=SEU_TOKEN
	 - Metodo: GET (ou POST)

### 4) Teste do modo Companion

1. curl "http://127.0.0.1:8787/health"
2. curl "http://127.0.0.1:8787/event/show?token=SEU_TOKEN"
3. curl "http://127.0.0.1:8787/event/hide?token=SEU_TOKEN"

## Modo 2: ATEM Direct (versao 2)

### 1) Preparar rede

1. Descubra o IP da ATEM.
2. Garanta que notebook e ATEM estao na mesma sub-rede.
3. Recomendado: IP fixo para ATEM.

### 2) Configuracao no config.json

```json
{
	"controllerMode": "atemDirect",
	"switching": {
		"cooldownMs": 150,
		"timeoutMs": 3000,
		"showAction": {
			"method": "GET",
			"url": "http://127.0.0.1:8000/api/location/1/1/1/press"
		},
		"hideAction": {
			"method": "GET",
			"url": "http://127.0.0.1:8000/api/location/1/1/2/press"
		}
	},
	"atemDirect": {
		"ip": "192.168.0.120",
		"mixEffect": 0,
		"showInput": 1,
		"hideInput": 2,
		"connectTimeoutMs": 4000
	}
}
```

Notas do bloco atemDirect:

- ip: endereco da ATEM
- mixEffect: normalmente 0
- showInput: entrada usada quando mostrar letra
- hideInput: entrada usada quando remover letra
- connectTimeoutMs: timeout de conexao ATEM

### 3) Configuracao no Holyrics

Igual ao modo companion:

1. Evento mostrar letra/versiculo -> /event/show
2. Evento remover letra -> /event/hide

### 4) Teste do modo ATEM Direct

1. curl "http://127.0.0.1:8787/health"
	 - Deve exibir controllerMode: atemDirect
2. curl "http://127.0.0.1:8787/event/show?token=SEU_TOKEN"
3. curl "http://127.0.0.1:8787/event/hide?token=SEU_TOKEN"

## Parametros globais importantes

- switching.cooldownMs
	- Evita trocas excessivas em sequencia rapida.

- switching.timeoutMs
	- Timeout de chamadas HTTP no modo companion.

- O bridge ignora eventos repetidos de mesmo estado (show/show ou hide/hide).

## Solucao de problemas

- 401 nao autorizado
	- Token ausente ou incorreto.

- 500 timeout no modo companion
	- Companion indisponivel, URL errada, porta errada ou firewall.

- 500 no modo atemDirect
	- IP da ATEM errado, mesa fora da rede, bloqueio de firewall, ou mesa ocupada por outra sessao instavel.

- Nao comuta
	- Teste primeiro o endpoint /health
	- Teste depois /event/show e /event/hide manualmente
	- Depois valide o gatilho do Holyrics
