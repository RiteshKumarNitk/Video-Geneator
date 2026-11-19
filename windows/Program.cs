using System.Diagnostics;

static string? FindDocker()
{
    var candidates = new[]
    {
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Docker", "Docker", "resources", "bin", "docker.exe"),
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Docker", "Docker", "resources", "bin", "docker.exe")
    };
    var installed = candidates.FirstOrDefault(File.Exists);
    if (installed is not null) return installed;

    try
    {
        using var lookup = Process.Start(new ProcessStartInfo
        {
            FileName = "where.exe",
            Arguments = "docker.exe",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            CreateNoWindow = true,
        });
        var path = lookup?.StandardOutput.ReadLine();
        lookup?.WaitForExit();
        return !string.IsNullOrWhiteSpace(path) && File.Exists(path) ? path : null;
    }
    catch
    {
        return null;
    }
}

static bool RunDocker(string docker, string arguments, string workingDirectory, bool wait = true)
{
    using var process = new Process();
    process.StartInfo = new ProcessStartInfo
    {
        FileName = docker,
        Arguments = arguments,
        WorkingDirectory = workingDirectory,
        UseShellExecute = false,
        CreateNoWindow = false,
    };
    process.Start();
    if (!wait) return true;
    process.WaitForExit();
    return process.ExitCode == 0;
}

var packageRoot = AppContext.BaseDirectory;
var appRoot = Path.Combine(packageRoot, "app");
var docker = FindDocker();

if (args.Any(a => a.Equals("--stop", StringComparison.OrdinalIgnoreCase)))
{
    if (docker is null) { Console.Error.WriteLine("Docker was not found."); return 1; }
    return RunDocker(docker, "compose down", appRoot) ? 0 : 1;
}

if (docker is null)
{
    Console.Error.WriteLine("Docker Desktop is required. Install it from https://www.docker.com/products/docker-desktop/");
    return 1;
}

if (!File.Exists(Path.Combine(appRoot, "docker-compose.yml")))
{
    Console.Error.WriteLine($"Could not find the bundled application at: {appRoot}");
    return 1;
}

var dockerDesktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Docker", "Docker", "Docker Desktop.exe");
if (File.Exists(dockerDesktop))
{
    try { Process.Start(new ProcessStartInfo(dockerDesktop) { UseShellExecute = true }); } catch { }
}

Console.WriteLine("Waiting for Docker Desktop...");
var ready = false;
for (var attempt = 0; attempt < 60; attempt++)
{
    if (RunDocker(docker, "info", appRoot)) { ready = true; break; }
    Thread.Sleep(2000);
}

if (!ready)
{
    Console.Error.WriteLine("Docker Desktop did not become ready within two minutes.");
    return 1;
}

Console.WriteLine("Starting ChromaAI. The first launch may download images and model files.");
return RunDocker(docker, "compose up --build", appRoot, wait: true) ? 0 : 1;
