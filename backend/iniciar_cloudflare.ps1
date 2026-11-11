param([switch]$SomenteFuncoes, [switch]$Encerrar)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
function Get-TunnelUrl([string]$Text) {
    $found = [regex]::Match($Text, 'https://[a-z0-9-]+\.trycloudflare\.com(?=[\s/]|$)')
    if ($found.Success) { return $found.Value }
    return $null
}
function Get-StationApi([string]$Base) {
    $result = Invoke-RestMethod -Uri ($Base.TrimEnd('/') + '/api/leituras/ultimas-24h?id_estacao=1') -TimeoutSec 15
    if ($null -eq $result.estacao -or $null -eq $result.PSObject.Properties['historico']) {
        throw 'A API respondeu sem a estrutura esperada da estacao.'
    }
    return $result
}
function Test-OwnedTunnel($State, [string]$Executable) {
    try {
        $p = Get-Process -Id ([int]$State.pid) -ErrorAction Stop
        return ($p.Path -eq $Executable -and $p.StartTime.ToUniversalTime().Ticks.ToString() -eq [string]$State.start_ticks)
    } catch { return $false }
}
function New-DashboardConfig([string]$Url) {
    if ((Get-TunnelUrl $Url) -ne $Url) { throw 'Endereco Cloudflare invalido.' }
    $jsonUrl = ConvertTo-Json $Url -Compress
    return @"
// API publica encaminhada pelo Cloudflare Tunnel.
// Em localhost, o dashboard utiliza a API da mesma origem.
(() => {
  const hostsFirebase = ['estacao-metedologica.web.app', 'estacao-metedologica.firebaseapp.com'];
  if (hostsFirebase.includes(window.location.hostname)) {
    window.ESTACAO_API_BASE = $jsonUrl;
  }
})();
"@
}
if ($SomenteFuncoes) { return }
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$private = Join-Path $root '.estacao-local/cloudflare'
New-Item -ItemType Directory -Path $private -Force | Out-Null
$statePath = Join-Path $private 'estado.json'
$configPath = Join-Path $root 'dashboard/config.js'
if ($Encerrar) {
    if (-not (Test-Path -LiteralPath $statePath)) { Write-Host 'Nenhum tunel registrado para encerrar.'; exit 0 }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $cloud = (Get-Command cloudflared.exe -ErrorAction Stop).Source
    if (-not (Test-OwnedTunnel $state $cloud)) { throw 'O processo registrado nao corresponde ao tunel. Nenhum processo foi encerrado.' }
    $state | Add-Member -NotePropertyName encerramento_solicitado -NotePropertyValue $true -Force
    [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    Stop-Process -Id ([int]$state.pid) -ErrorAction Stop
    Write-Host 'Tunel da estacao encerrado. O backend e o banco continuam ativos.'
    exit 0
}

$hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($root))).Replace('-', '').Substring(0, 16)
$mutex = New-Object Threading.Mutex($false, ('Local\EstacaoCloudflare-' + $hash))
$locked = $false
$created = $false
$published = $false
$tunnel = $null
$previousConfig = $null
$exitCode = 0
try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) {
        Write-Host 'O iniciador Cloudflare ja esta em execucao. Nao sera aberto outro tunel.' -ForegroundColor Yellow
        if (Test-Path -LiteralPath $statePath) {
            try { $active = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json; if ($active.url) { Write-Host ('API: ' + $active.url) } } catch {}
        }
        exit 0
    }
    $local = Get-StationApi 'http://127.0.0.1:8000'
    Write-Host 'API local e consulta ao banco: OK.' -ForegroundColor Green
    $cloud = (Get-Command cloudflared.exe -ErrorAction Stop).Source
    $firebase = (Get-Command firebase.cmd -ErrorAction Stop).Source
    # Do not print or save login:list JSON: it contains authentication credentials.
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $authText = & $firebase login:list --json 2>$null | Out-String
        $authCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if ($authCode -ne 0) { throw 'Firebase sem autenticacao disponivel. Execute firebase login e tente novamente.' }
    try { $auth = $authText | ConvertFrom-Json } catch { throw 'Nao foi possivel verificar a autenticacao do Firebase.' }
    if ($auth.status -ne 'success' -or @($auth.result).Count -eq 0) { throw 'Nenhuma conta autenticada no Firebase. Execute firebase login.' }
    $authText = $null; $auth = $null
    if (Test-Path -LiteralPath $statePath) {
        try {
            $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
            if ((Test-OwnedTunnel $state $cloud) -and $state.url -and ((Get-TunnelUrl $state.url) -eq $state.url)) {
                $tunnel = Get-Process -Id ([int]$state.pid)
                $url = [string]$state.url
                Write-Host ('Reutilizando tunel existente: ' + $url)
            }
        } catch { $tunnel = $null }
    }
    if ($null -eq $tunnel) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $stdout = Join-Path $private ('tunel-' + $stamp + '.stdout.log')
        $stderr = Join-Path $private ('tunel-' + $stamp + '.stderr.log')
        $tunnel = Start-Process -FilePath $cloud -ArgumentList @('--no-autoupdate', 'tunnel', '--protocol', 'http2', '--url', 'http://127.0.0.1:8000') -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        $created = $true
        $deadline = (Get-Date).AddSeconds(90)
        $url = $null
        do {
            if ($tunnel.HasExited) { throw ('Cloudflare encerrou. Consulte o registro privado: ' + $stderr) }
            if (Test-Path -LiteralPath $stderr) { $url = Get-TunnelUrl (Get-Content -LiteralPath $stderr -Raw) }
            if (-not $url -and (Test-Path -LiteralPath $stdout)) { $url = Get-TunnelUrl (Get-Content -LiteralPath $stdout -Raw) }
            if (-not $url) { Start-Sleep -Milliseconds 500 }
        } while (-not $url -and (Get-Date) -lt $deadline)
        if (-not $url) { throw 'Cloudflare nao forneceu endereco HTTPS em 90 segundos.' }
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 8; $attempt++) {
        try { $public = Get-StationApi $url; $ready = $true; break } catch { $publicError = $_.Exception.Message; Start-Sleep -Seconds 2 }
    }
    if (-not $ready) { throw ('A API publica nao respondeu corretamente. A configuracao anterior foi preservada. Motivo: ' + $publicError) }
    Write-Host ('API publica validada: ' + $url) -ForegroundColor Green
    $previousConfig = [IO.File]::ReadAllBytes($configPath)
    $backup = Join-Path $private ('config-anterior-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.js')
    [IO.File]::WriteAllBytes($backup, $previousConfig)
    [IO.File]::WriteAllText($configPath, (New-DashboardConfig $url), (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Publicando somente o Hosting no Firebase...'
    $deployLog = Join-Path $private ('firebase-deploy-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.log')
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $firebase deploy --only hosting --project estacao-metedologica --non-interactive *> $deployLog
        $deployCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if ($deployCode -ne 0) { throw ('Falha ao publicar no Firebase. Consulte: ' + $deployLog) }
    $published = $true
    $state = [ordered]@{pid=$tunnel.Id;start_ticks=$tunnel.StartTime.ToUniversalTime().Ticks.ToString();url=$url;published_at=(Get-Date).ToUniversalTime().ToString('o');controller_pid=$PID}
    [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    Write-Host 'SITE PUBLICO: https://estacao-metedologica.web.app/' -ForegroundColor Green
    Write-Host 'Deixe este iniciador, o backend, MySQL e Mosquitto em funcionamento.'
    Write-Host 'Ao encerrar um tunel temporario, o site deixa de receber novas leituras.'
    if (-not $created) { Write-Host 'O tunel foi reutilizado e continuara sob controle do iniciador original.'; exit 0 }
    Write-Host 'Para encerrar este tunel: Ctrl+C nesta janela.'
    while (-not $tunnel.WaitForExit(1000)) {}
    $requested = $false
    if (Test-Path -LiteralPath $statePath) { try { $requested = [bool]((Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).encerramento_solicitado) } catch {} }
    if (-not $requested) { throw 'O tunel foi encerrado. Execute iniciar_cloudflare.bat novamente para republicar um novo endereco.' }
    Write-Host 'Tunel encerrado pelo operador.'
} catch {
    $exitCode = 1
    if (-not $published -and $null -ne $previousConfig) { [IO.File]::WriteAllBytes($configPath, $previousConfig) }
    Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
} finally {
    if ($created -and $null -ne $tunnel) {
        try { if (-not $tunnel.HasExited) { $tunnel.Kill(); $tunnel.WaitForExit(5000) | Out-Null } } catch {}
        if (Test-Path -LiteralPath $statePath) {
            try { $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json; if ([int]$saved.pid -eq $tunnel.Id) { Remove-Item -LiteralPath $statePath } } catch {}
        }
    }
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
exit $exitCode
