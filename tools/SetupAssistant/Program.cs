using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MIdiaControlliepoa.SetupAssistant;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private static int Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Log("=== MIdiaControlliepoa Setup Assistant ===");

        try
        {
            string projectPath = ResolveProjectPath(args);
            Log($"Projeto: {projectPath}");

            EnsureNodeAndNpm();
            EnsureProjectDependencies(projectPath);
            EnsureAtemConnectionPackage(projectPath);
            EnsureConfig(projectPath);

            Log("Setup concluido com sucesso.");
            Log("Proximo passo: rode 'npm start' dentro da pasta do projeto.");
            return 0;
        }
        catch (Exception ex)
        {
            Error($"Falha no setup: {ex.Message}");
            return 1;
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
        bool hasNode = TryGetCommandVersion("node", "-v", out string? nodeVersion);
        bool hasNpm = TryGetCommandVersion("npm", "-v", out string? npmVersion);

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

        RunCommandOrThrow(
            "winget",
            "install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent",
            Directory.GetCurrentDirectory(),
            timeoutMs: 10 * 60 * 1000
        );

        if (!TryGetCommandVersion("node", "-v", out nodeVersion) || !TryGetCommandVersion("npm", "-v", out npmVersion))
        {
            throw new InvalidOperationException("Node/npm ainda nao disponiveis apos instalacao. Reinicie o terminal e execute novamente.");
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
        RunCommandOrThrow("npm", "install", projectPath, timeoutMs: 10 * 60 * 1000);
    }

    private static void EnsureAtemConnectionPackage(string projectPath)
    {
        Log("Verificando dependencia atem-connection...");

        int exitCode = RunCommand(
            "npm",
            "ls atem-connection --depth=0",
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
        RunCommandOrThrow("npm", "install atem-connection --save", projectPath, timeoutMs: 5 * 60 * 1000);
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
            string.Equals(mode, "atemDirect", StringComparison.OrdinalIgnoreCase))
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

    private static bool TryGetCommandVersion(string command, string args, out string? version)
    {
        int exitCode = RunCommand(command, args, Directory.GetCurrentDirectory(), 30 * 1000, out string stdout, out _);
        version = exitCode == 0 ? FirstNonEmptyLine(stdout) : null;
        return exitCode == 0 && !string.IsNullOrWhiteSpace(version);
    }

    private static string FirstNonEmptyLine(string text)
    {
        foreach (string line in text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None))
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                return line.Trim();
            }
        }

        return string.Empty;
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

    private static int RunCommand(
        string fileName,
        string args,
        string workingDirectory,
        int timeoutMs,
        out string stdout,
        out string stderr)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = args,
            WorkingDirectory = workingDirectory,
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        using var process = new Process { StartInfo = startInfo };
        process.Start();

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

    private static void Log(string message)
    {
        Console.WriteLine($"[INFO] {message}");
    }

    private static void Warn(string message)
    {
        Console.WriteLine($"[WARN] {message}");
    }

    private static void Error(string message)
    {
        Console.WriteLine($"[ERRO] {message}");
    }
}
