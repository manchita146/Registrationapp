$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledPython = "C:\Users\DELL i7 16GB\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (Get-Command python -ErrorAction SilentlyContinue) {
    $python = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $python = "py"
} elseif (Test-Path $bundledPython) {
    $python = $bundledPython
} else {
    throw "No se encontro Python. Instala Python 3 o ejecuta la app desde Codex con su runtime empaquetado."
}

Set-Location $projectDir
& $python -B app.py

python --version