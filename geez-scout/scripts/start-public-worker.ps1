param(
  [Parameter(Mandatory)]
  [string]$CredentialPath,

  [Parameter(Mandatory)]
  [string]$LoopbackEnvFile
)

$ErrorActionPreference = 'Stop'
$protected = (Get-Content -LiteralPath $CredentialPath -Raw).Trim()
$secure = ConvertTo-SecureString $protected
$token = [System.Net.NetworkCredential]::new('', $secure).Password

try {
  @{token = $token} | ConvertTo-Json -Compress |
    & node "--env-file-if-exists=$LoopbackEnvFile" (Join-Path $PSScriptRoot 'start-public-worker.mjs')
  exit $LASTEXITCODE
} finally {
  $token = $null
  $secure.Dispose()
}
