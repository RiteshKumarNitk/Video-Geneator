$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$windowsRoot = Join-Path $repoRoot 'windows'
$distRoot = Join-Path $repoRoot 'dist\ChromaAI'
$appRoot = Join-Path $distRoot 'app'

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw 'The .NET 8 SDK is required to build the Windows launcher.'
}

if (Test-Path -LiteralPath $distRoot) {
  Remove-Item -LiteralPath $distRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null

dotnet restore (Join-Path $windowsRoot 'ChromaAI.Launcher.csproj') --configfile (Join-Path $windowsRoot 'NuGet.Config')
if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed with exit code $LASTEXITCODE" }
dotnet publish (Join-Path $windowsRoot 'ChromaAI.Launcher.csproj') -c Release -r win-x64 --self-contained true --no-restore -o $distRoot
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE" }

$exclude = @('.git', 'node_modules', '.next', 'shared-storage', 'dist', '__pycache__', '.venv')
Get-ChildItem -LiteralPath $repoRoot -Force | Where-Object { $_.Name -notin $exclude -and $_.Name -ne 'windows' } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $appRoot -Recurse -Force
}

Copy-Item -LiteralPath (Join-Path $windowsRoot 'README-Windows.md') -Destination (Join-Path $distRoot 'README-Windows.md') -Force
Write-Host "Windows package created at $distRoot"
