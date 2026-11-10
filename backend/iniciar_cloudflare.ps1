$ErrorActionPreference = 'Stop'
try {
    Invoke-WebRequest 'http://127.0.0.1:8000/' -TimeoutSec 5 | Out-Null
    $tunnelCommand = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if (-not $tunnelCommand) { throw 'Instale cloudflared para usar o tunel alternativo. O backend deve permanecer aberto.' }
    Write-Host 'O endereco HTTPS temporario aparece abaixo. Configure-o como API publica e publique o dashboard. Ele muda ao reiniciar o tunel.'
    & $tunnelCommand.Source tunnel --url http://127.0.0.1:8000
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
