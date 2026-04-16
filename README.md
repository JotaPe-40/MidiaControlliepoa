# MidiaControlliepoa

Bridge de automacao para trocar entradas da ATEM Mini Pro a partir de eventos do Holyrics, com dois modos de operacao:

1. Modo 1 (companion): Holyrics -> Bridge -> Companion -> ATEM
2. Modo 2 (atemDirect): Holyrics -> Bridge -> ATEM (direto por rede)
3. Modo 3 (mock): Holyrics -> Bridge (simulacao, sem ATEM)

Os tres modos coexistem no mesmo projeto. Voce escolhe no arquivo config.json.

## Requisitos

- Node.js 18+
- Holyrics no notebook de midia
- ATEM e notebook na mesma rede (recomendado IP fixo)

Para o modo companion:

- Companion instalado e em execucao

Para o modo atemDirect:

- Biblioteca atem-connection (instalada via npm install)
- Controle direto por IP da ATEM

Para o modo mock:

- Nao precisa Companion
- Nao precisa ATEM
- Ideal para validar fluxo HTTP com Holyrics

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
4. Se o winget disser que o Node ja esta instalado, mas node/npm ainda nao forem reconhecidos, feche e abra o Windows/terminal e execute o assistente novamente.

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

## Modo 3: Mock (teste sem hardware)

Use este modo quando voce quiser testar apenas o Holyrics e o bridge, sem ATEM e sem Companion.

### 1) Configuracao no config.json

Defina apenas:

- controllerMode: mock

Exemplo minimo:

{
	"listen": {
		"host": "0.0.0.0",
		"port": 8787
	},
	"authToken": "troque-este-token",
	"controllerMode": "mock",
	"logging": true
}

### 2) Inicie o bridge

1. npm install
2. npm start

### 3) Configure eventos no Holyrics

1. Mostrar letra/versiculo:
	 - URL: http://IP_NOTEBOOK:8787/event/show?token=SEU_TOKEN
	 - Metodo: GET (ou POST)
2. Esconder letra/versiculo:
	 - URL: http://IP_NOTEBOOK:8787/event/hide?token=SEU_TOKEN
	 - Metodo: GET (ou POST)

### 4) Como validar se funcionou

1. Acesse /health e confira controllerMode = mock.
2. Dispare show/hide no Holyrics.
3. Veja no terminal do bridge os logs de "Comutacao simulada (mock)".

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

- node ou npm nao reconhecidos no terminal
	- Feche e abra novamente o terminal.
	- Se ainda falhar, rode direto com caminho absoluto do Node:
	  C:\Program Files\nodejs\node.exe src/server.js





/*$ErrorActionPreference = "Stop"
Set-Location "C:\Users\joaop\Documents\GitHub\MIdiaControlliepoa"

$config = Get-Content ".\config.json" -Raw | ConvertFrom-Json

if ($config.controllerMode -ne "mock") {
$config.controllerMode = "mock"
}

if ($null -eq $config.switching) {
$config | Add-Member -NotePropertyName switching -NotePropertyValue ([pscustomobject]@{})
}
$config.switching.cooldownMs = 0

$config | ConvertTo-Json -Depth 20 | Set-Content ".\config.json" -Encoding UTF8

$port = [int]$config.listen.port
$token = [string]$config.authToken

if ([string]::IsNullOrWhiteSpace($token)) {
throw "Preencha authToken no config.json antes de testar."
}

$listenerPids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $listenerPids) {
try { Stop-Process -Id $procId -Force } catch {}
}

$nodeExe = "C:\Program Files\nodejs\node.exe"
$proc = Start-Process -FilePath $nodeExe -ArgumentList ".\src\server.js" -WorkingDirectory (Get-Location).Path -PassThru

$health = $null
for ($i = 0; $i -lt 200; $i++) {
try {
$health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2
break
} catch {}
}

if ($null -eq $health) {
throw "Bridge nao subiu na porta $port."
}

$show = Invoke-RestMethod -Uri "http://127.0.0.1:$port/event/show?token=$token" -Method Get -TimeoutSec 5
$hide = Invoke-RestMethod -Uri "http://127.0.0.1:$port/event/hide?token=$token" -Method Get -TimeoutSec 5

"OK: bridge rodando com PID $($proc.Id)"
"HEALTH: $(($health | ConvertTo-Json -Compress))"
"SHOW: $(($show | ConvertTo-Json -Compress))"
"HIDE: $(($hide | ConvertTo-Json -Compress))"
"Use no Holyrics:"
" http://SEU_IP:$port/event/show?token=$token"
" http://SEU_IP:$port/event/hide?token=$token"

*/