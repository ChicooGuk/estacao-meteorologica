$ErrorActionPreference='Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'backend/iniciar_cloudflare.ps1') -SomenteFuncoes
function Assert-Equal($Actual,$Expected,[string]$Message) { if ($Actual -ne $Expected) { throw $Message } }
Assert-Equal (Get-TunnelUrl 'INF | https://sample-test.trycloudflare.com |') 'https://sample-test.trycloudflare.com' 'Endereco valido nao encontrado.'
foreach ($bad in @('http://sample-test.trycloudflare.com','https://sample-test.trycloudflare.com.evil.test','https://example.com','sem endereco')) {
 Assert-Equal (Get-TunnelUrl $bad) $null 'Endereco indevido aceito.'
}
$rejected=$false
try { New-DashboardConfig 'https://example.com' | Out-Null } catch { $rejected=$true }
Assert-Equal $rejected $true 'Geracao aceitou outro dominio.'
$config=New-DashboardConfig 'https://sample-test.trycloudflare.com'
if ($config -notmatch 'estacao-metedologica.web.app' -or $config -notmatch 'sample-test.trycloudflare.com') {throw 'Configuracao incompleta.'}
$p=Get-Process -Id $PID
$state=@{pid=$PID;start_ticks=$p.StartTime.ToUniversalTime().Ticks.ToString()}
Assert-Equal (Test-OwnedTunnel $state $p.Path) $true 'Processo proprio nao reconhecido.'
$state.start_ticks='0'
Assert-Equal (Test-OwnedTunnel $state $p.Path) $false 'PID reaproveitado foi aceito.'
'Cloudflare: extracao segura de URL, configuracao e identidade de processo OK.'
