<#
.SYNOPSIS
Copia el backend a un clon local del Space de Hugging Face, listo para "git push".

.DESCRIPTION
Uso:
  1. Crea el Space en https://huggingface.co/new-space (SDK: Docker, plantilla Blank, público).
  2. git clone https://huggingface.co/spaces/<usuario>/spherex-api C:\ruta\spherex-api
  3. .\preparar_space_hf.ps1 -Destino C:\ruta\spherex-api
  4. cd C:\ruta\spherex-api; git add -A; git commit -m "Backend SPHEREx Explorer"; git push
     (usuario de HF y un token de acceso con permiso de escritura como contraseña)

  Alternativa sin git: hf auth login, y luego
  .\preparar_space_hf.ps1 -Destino C:\ruta\carpeta_nueva
  hf upload <usuario>/spherex-api C:\ruta\carpeta_nueva . --repo-type space

No copia la caché de recortes (cache/), los entornos virtuales ni las pruebas.
#>
param(
    [Parameter(Mandatory = $true)][string]$Destino
)

$ErrorActionPreference = "Stop"
$origen = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path $Destino)) {
    New-Item -ItemType Directory -Path $Destino | Out-Null
}
if (-not (Test-Path (Join-Path $Destino ".git"))) {
    Write-Host "Aviso: '$Destino' no es un clon de git; súbelo con: hf upload <usuario>/spherex-api $Destino . --repo-type space"
}

$excluir = @(".venv", "venv", "__pycache__", ".pytest_cache", "cache", "tests", "despliegue")
Get-ChildItem -Path $origen -Force | Where-Object { $excluir -notcontains $_.Name } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $Destino -Recurse -Force
}
Copy-Item -Path (Join-Path $PSScriptRoot "README_space.md") -Destination (Join-Path $Destino "README.md") -Force
Get-ChildItem -Path (Join-Path $Destino "data") -Filter "*.fits*" -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "Listo. Archivos copiados a $Destino. Revisa con 'git status' y haz commit + push."
