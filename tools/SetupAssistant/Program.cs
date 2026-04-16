using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MidiaControlliepoa.SetupAssistant;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private static readonly List<string> CompletedSteps = new();
    private static int WarningCount;
    private static int ErrorCount;
    private static string? ActiveProjectPath;

    private static int Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Log("=== MidiaControlliepoa Setup Assistant ===");

        bool success = false;
        string? failureMessage = null;

        try
        {
            string projectPath = ResolveProjectPath(args);
            ActiveProjectPath = projectPath;
            AddCompletedStep($"Projeto resolvido: {projectPath}");
            Log($"Projeto: {projectPath}");

            EnsureNodeAndNpm();
            AddCompletedStep("Node.js e npm verificados");

            EnsureProjectDependencies(projectPath);
            AddCompletedStep("Dependencias instaladas com npm install");

            EnsureAtemConnectionPackage(projectPath);
            AddCompletedStep("Dependencia atem-connection validada");

            EnsureConfig(projectPath);
            AddCompletedStep("Arquivo config.json validado/atualizado");

            success = true;
            Log("Setup concluido com sucesso.");
            Log("Proximo passo: rode 'npm start' dentro da pasta do projeto.");
            return 0;
        }
        catch (Exception ex)
        {
            failureMessage = ex.Message;
            Error($"Falha no setup: {ex.Message}");
            return 1;
        }
        finally
        {
            PrintExecutionSummary(success, failureMessage);
            PauseBeforeExit(args);
        }
    }

    private static string ResolveProjectPath(string[] args)
    {
        string? fromArg = null;
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i].Equals("--project", StringComparison.OrdinalIgnoreCase))
            {
                fromArg = args[i + 1];
                break;
            }
        }

        string candidate = string.IsNullOrWhiteSpace(fromArg)
            ? Directory.GetCurrentDirectory()
            : Path.GetFullPath(fromArg);

        string packageJson = Path.Combine(candidate, "package.json");
        if (!File.Exists(packageJson) && Path.GetFileName(candidate).Equals("dist", StringComparison.OrdinalIgnoreCase))
        {
            string? parentPath = Directory.GetParent(candidate)?.FullName;
            if (!string.IsNullOrWhiteSpace(parentPath))
            {
                string parentPackage = Path.Combine(parentPath, "package.json");
                if (File.Exists(parentPackage))
                {
                    candidate = parentPath;
                    packageJson = parentPackage;
                    Log("package.json nao encontrado em dist. Usando pasta pai automaticamente.");
                }
            }
        }

        if (!File.Exists(packageJson))
        {
            throw new InvalidOperationException(
                $"Nao encontrei package.json em '{candidate}'. Rode o .exe na pasta do projeto ou use --project CAMINHO."
            );
        }

        return candidate;
    }

    private static void EnsureNodeAndNpm()
    {
        bool hasNode = TryGetCommandVersion("node", "-v", out string? nodeVersion, out string resolvedNodeCommand);
        bool hasNpm = TryGetCommandVersion("npm", "-v", out string? npmVersion, out string resolvedNpmCommand);

        if (hasNode && hasNpm)
        {
            Log($"Node detectado: {nodeVersion}");
            Log($"npm detectado: {npmVersion}");
            ValidateNodeMajor(nodeVersion!);
            return;
        }

        Warn("Node e/ou npm nao encontrados. Tentando instalar Node.js LTS via winget...");
        if (!IsCommandAvailable("winget"))
        {
            throw new InvalidOperationException("winget nao encontrado. Instale o Node.js 18+ manualmente e execute novamente.");
        }

        int wingetExitCode = RunCommand(
            "winget",
            "install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent",
            Directory.GetCurrentDirectory(),
            timeoutMs: 10 * 60 * 1000,
            out string wingetStdout,
            out string wingetStderr
        );

        if (wingetExitCode != 0)
        {
            string wingetOutput = string.Join(
                "\n",
                new[] { wingetStdout, wingetStderr }.Where(s => !string.IsNullOrWhiteSpace(s))
            );

            if (LooksLikeNodeAlreadyInstalledWithoutUpdate(wingetOutput))
            {
                Warn("winget informou que o Node.js ja estava instalado e sem atualizacao. Tentando continuar com a instalacao existente...");
            }
            else
            {
                throw new InvalidOperationException(
                    $"Comando falhou: winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent\nSaida: {wingetStdout}\nErro: {wingetStderr}"
                );
            }
        }

        bool nodeDetectedAfterWinget = TryGetCommandVersion("node", "-v", out nodeVersion, out resolvedNodeCommand);
        bool npmDetectedAfterWinget = TryGetCommandVersion("npm", "-v", out npmVersion, out resolvedNpmCommand);

        if (!nodeDetectedAfterWinget || !npmDetectedAfterWinget)
        {
            throw new InvalidOperationException(
                "Node/npm ainda nao disponiveis apos tentativa de instalacao. Se o Node ja estiver instalado, feche e abra novamente o terminal/Windows e execute o assistente de novo."
            );
        }

        Log($"Node instalado: {nodeVersion}");
        Log($"npm instalado: {npmVersion}");
        ValidateNodeMajor(nodeVersion!);
    }

    private static void ValidateNodeMajor(string version)
    {
        string cleaned = version.Trim().TrimStart('v', 'V');
        string majorPart = cleaned.Split('.', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "0";
        if (!int.TryParse(majorPart, out int major) || major < 18)
        {
            throw new InvalidOperationException($"Node.js {version} detectado. E necessario Node.js 18 ou superior.");
        }
    }

    private static void EnsureProjectDependencies(string projectPath)
    {
        Log("Instalando dependencias do projeto com npm install...");
        RunNpmCommandOrThrow("install", projectPath, timeoutMs: 10 * 60 * 1000);
    }

    private static void EnsureAtemConnectionPackage(string projectPath)
    {
        Log("Verificando dependencia atem-connection...");

        int exitCode = RunCommand(
            GetCmdExePath(),
            "/d /c npm ls atem-connection --depth=0",
            projectPath,
            timeoutMs: 60 * 1000,
            out _,
            out _
        );

        if (exitCode == 0)
        {
            Log("atem-connection ja esta instalada.");
            return;
        }

        Warn("atem-connection nao encontrada. Instalando...");
        RunNpmCommandOrThrow("install atem-connection --save", projectPath, timeoutMs: 5 * 60 * 1000);
    }

    private static void EnsureConfig(string projectPath)
    {
        string examplePath = Path.Combine(projectPath, "config.example.json");
        string configPath = Path.Combine(projectPath, "config.json");

        if (!File.Exists(examplePath))
        {
            throw new InvalidOperationException("config.example.json nao encontrado.");
        }

        JsonObject defaults = ParseJsonObjectOrThrow(examplePath);

        JsonObject config;
        if (!File.Exists(configPath))
        {
            Warn("config.json nao encontrado. Criando a partir de config.example.json...");
            config = (JsonObject)defaults.DeepClone();
        }
        else
        {
            try
            {
                config = ParseJsonObjectOrThrow(configPath);
            }
            catch
            {
                string backup = Path.Combine(
                    projectPath,
                    $"config.invalid.{DateTime.Now:yyyyMMdd_HHmmss}.json"
                );
                File.Copy(configPath, backup, overwrite: true);
                Warn($"config.json invalido. Backup salvo em {Path.GetFileName(backup)} e arquivo sera recriado.");
                config = (JsonObject)defaults.DeepClone();
            }
        }

        MergeMissing(config, defaults);
        NormalizeControllerMode(config);

        File.WriteAllText(configPath, config.ToJsonString(JsonOptions));
        Log("config.json validado e atualizado.");
    }

    private static JsonObject ParseJsonObjectOrThrow(string path)
    {
        string raw = File.ReadAllText(path);
        JsonNode? node = JsonNode.Parse(raw);
        if (node is not JsonObject obj)
        {
            throw new InvalidOperationException($"Arquivo {Path.GetFileName(path)} nao contem objeto JSON valido.");
        }

        return obj;
    }

    private static void MergeMissing(JsonObject target, JsonObject defaults)
    {
        foreach (var pair in defaults)
        {
            if (pair.Value is null)
            {
                continue;
            }

            if (!target.ContainsKey(pair.Key) || target[pair.Key] is null)
            {
                target[pair.Key] = pair.Value.DeepClone();
                continue;
            }

            if (pair.Value is JsonObject defaultChild && target[pair.Key] is JsonObject targetChild)
            {
                MergeMissing(targetChild, defaultChild);
            }
        }
    }

    private static void NormalizeControllerMode(JsonObject config)
    {
        string? mode = config["controllerMode"]?.GetValue<string>();
        if (string.Equals(mode, "companion", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(mode, "atemDirect", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(mode, "mock", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        Warn("controllerMode ausente/invalido. Ajustando para 'companion'.");
        config["controllerMode"] = "companion";
    }

    private static bool IsCommandAvailable(string command)
    {
        int exitCode = RunCommand(
            "where",
            command,
            Directory.GetCurrentDirectory(),
            timeoutMs: 30 * 1000,
            out _,
            out _
        );

        return exitCode == 0;
    }

    private static bool TryGetCommandVersion(string command, string args, out string? version, out string resolvedCommand)
    {
        if (command.Equals("npm", StringComparison.OrdinalIgnoreCase))
        {
            int npmExit = RunCommand(GetCmdExePath(), $"/d /c npm {args}", Directory.GetCurrentDirectory(), 30 * 1000, out string npmStdout, out _);
            version = npmExit == 0 ? FirstNonEmptyLine(npmStdout) : null;
            resolvedCommand = "npm";
            return npmExit == 0 && !string.IsNullOrWhiteSpace(version);
        }

        string[] candidates = command.Equals("npm", StringComparison.OrdinalIgnoreCase)
            ? new[] { "npm", "npm.cmd" }
            : new[] { command };

        foreach (string candidate in candidates)
        {
            int exitCode = RunCommand(candidate, args, Directory.GetCurrentDirectory(), 30 * 1000, out string stdout, out _);
            version = exitCode == 0 ? FirstNonEmptyLine(stdout) : null;
            if (exitCode == 0 && !string.IsNullOrWhiteSpace(version))
            {
                resolvedCommand = candidate;
                return true;
            }
        }

        version = null;
        resolvedCommand = command;
        return false;
    }

    private static void RunNpmCommandOrThrow(string npmArgs, string workingDirectory, int timeoutMs)
    {
        int exitCode = RunCommand(
            GetCmdExePath(),
            $"/d /c npm {npmArgs}",
            workingDirectory,
            timeoutMs,
            out string stdout,
            out string stderr
        );

        if (exitCode != 0)
        {
            throw new InvalidOperationException(
                $"Comando falhou: npm {npmArgs}\nSaida: {stdout}\nErro: {stderr}"
            );
        }

        if (!string.IsNullOrWhiteSpace(stdout))
        {
            Log(stdout.Trim());
        }
    }

    private static string GetCmdExePath()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
    }

    private static string FirstNonEmptyLine(string text)
    {
        return text
            .Split(new[] { "\r\n", "\n" }, StringSplitOptions.None)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(line => line.Trim())
            .FirstOrDefault() ?? string.Empty;
    }

    private static void RunCommandOrThrow(string fileName, string args, string workingDirectory, int timeoutMs)
    {
        int exitCode = RunCommand(fileName, args, workingDirectory, timeoutMs, out string stdout, out string stderr);
        if (exitCode != 0)
        {
            throw new InvalidOperationException(
                $"Comando falhou: {fileName} {args}\nSaida: {stdout}\nErro: {stderr}"
            );
        }

        if (!string.IsNullOrWhiteSpace(stdout))
        {
            Log(stdout.Trim());
        }
    }

    private static bool LooksLikeNodeAlreadyInstalledWithoutUpdate(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        string normalized = text.ToLowerInvariant();
        return
            (normalized.Contains("pacote existente") && normalized.Contains("nenhuma atualiza")) ||
            (normalized.Contains("already installed") && normalized.Contains("no available upgrade")) ||
            (normalized.Contains("already installed") && normalized.Contains("no newer package version"));
    }

    private static string BuildEffectivePath()
    {
        var unique = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var ordered = new List<string>();

        void AddPathEntries(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return;
            }

            foreach (string piece in raw.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (string.IsNullOrWhiteSpace(piece))
                {
                    continue;
                }

                if (unique.Add(piece))
                {
                    ordered.Add(piece);
                }
            }
        }

        AddPathEntries(Environment.GetEnvironmentVariable("PATH"));
        AddPathEntries(Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User));
        AddPathEntries(Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Machine));

        string programFilesNode = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs");
        if (Directory.Exists(programFilesNode))
        {
            AddPathEntries(programFilesNode);
        }

        string localAppDataNode = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs");
        if (Directory.Exists(localAppDataNode))
        {
            AddPathEntries(localAppDataNode);
        }

        return string.Join(Path.PathSeparator, ordered);
    }

    private static int RunCommand(
        string fileName,
        string args,
        string workingDirectory,
        int timeoutMs,
        out string stdout,
        out string stderr)
    {
        string effectivePath = BuildEffectivePath();
        string resolvedFileName = ResolveExecutablePath(fileName, effectivePath) ?? fileName;

        var startInfo = new ProcessStartInfo
        {
            FileName = resolvedFileName,
            Arguments = args,
            WorkingDirectory = workingDirectory,
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        if (!string.IsNullOrWhiteSpace(effectivePath))
        {
            startInfo.Environment["PATH"] = effectivePath;
        }

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
        }
        catch (Exception ex)
        {
            stdout = string.Empty;
            stderr = ex.Message;
            return -1;
        }

        string outText = process.StandardOutput.ReadToEnd();
        string errText = process.StandardError.ReadToEnd();

        if (!process.WaitForExit(timeoutMs))
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch (Exception ex)
            {
                Warn($"Falha ao finalizar processo apos timeout: {ex.Message}");
            }
            throw new TimeoutException($"Timeout no comando: {fileName} {args}");
        }

        stdout = outText;
        stderr = errText;
        return process.ExitCode;
    }

    private static string? ResolveExecutablePath(string fileName, string effectivePath)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return null;
        }

        if (Path.IsPathRooted(fileName) || fileName.Contains(Path.DirectorySeparatorChar) || fileName.Contains(Path.AltDirectorySeparatorChar))
        {
            return File.Exists(fileName) ? fileName : null;
        }

        string[] directories = effectivePath
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        bool hasExtension = Path.HasExtension(fileName);
        string[] extensions;
        if (hasExtension)
        {
            extensions = new[] { string.Empty };
        }
        else
        {
            string rawPathext = Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT;.COM";
            extensions = rawPathext
                .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(ext => ext.StartsWith('.') ? ext : "." + ext)
                .ToArray();
        }

        foreach (string dir in directories)
        {
            foreach (string ext in extensions)
            {
                string candidatePath = Path.Combine(dir, fileName + ext);
                if (File.Exists(candidatePath))
                {
                    return candidatePath;
                }
            }
        }

        return null;
    }

    private static void AddCompletedStep(string step)
    {
        CompletedSteps.Add(step);
    }

    private static void PrintExecutionSummary(bool success, string? failureMessage)
    {
        Console.WriteLine();
        Console.WriteLine("========== RESUMO DA EXECUCAO ==========");
        Console.WriteLine($"Status final: {(success ? "OK" : "FALHA")}");

        if (!string.IsNullOrWhiteSpace(ActiveProjectPath))
        {
            Console.WriteLine($"Projeto: {ActiveProjectPath}");
        }

        Console.WriteLine($"Etapas concluidas: {CompletedSteps.Count}");
        for (int i = 0; i < CompletedSteps.Count; i++)
        {
            Console.WriteLine($"{i + 1}. {CompletedSteps[i]}");
        }

        if (!success && !string.IsNullOrWhiteSpace(failureMessage))
        {
            Console.WriteLine($"Motivo da falha: {failureMessage}");
        }

        Console.WriteLine($"Avisos: {WarningCount}");
        Console.WriteLine($"Erros: {ErrorCount}");
        Console.WriteLine("========================================");
        Console.WriteLine();
    }

    private static void PauseBeforeExit(string[] args)
    {
        bool noPause = args.Any(a => a.Equals("--no-pause", StringComparison.OrdinalIgnoreCase));
        if (noPause || Console.IsInputRedirected || Console.IsOutputRedirected)
        {
            return;
        }

        Console.WriteLine("Pressione ENTER para fechar...");
        try
        {
            Console.ReadLine();
        }
        catch
        {
            // Ignora falhas de leitura para nao mascarar o resultado do setup.
        }
    }

    private static void Log(string message)
    {
        Console.WriteLine($"[INFO] {message}");
    }

    private static void Warn(string message)
    {
        WarningCount++;
        Console.WriteLine($"[WARN] {message}");
    }

    private static void Error(string message)
    {
        ErrorCount++;
        Console.WriteLine($"[ERRO] {message}");
    }
}
