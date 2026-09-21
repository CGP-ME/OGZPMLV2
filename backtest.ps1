# ═══════════════════════════════════════════════════════════════
# OGZPrime Backtest Runner — Boomer-Proof Edition (Windows)
#
# Usage:  .\backtest.ps1 baseline
#         .\backtest.ps1 sms -longonly
#
# Presets: baseline, sms, rsi-only, ema-only
# Options: -longonly, -feeprofile ttp_real|zero
# Note: All presets default to shorts=true. Use -longonly to override.
# ═══════════════════════════════════════════════════════════════

param(
    [Parameter(Position=0)]
    [string]$Preset = "help",
    [switch]$longonly,
    [string]$feeprofile = "ttp_real"
)

# ─── Preset configs ───
$presets = @{
    "baseline" = @{
        Strategy = "RSI,EMASMACrossover"
        DataFile = "tuning/tsla-15m-18mo.json"
        Desc     = "RSI+EMA Baseline — TSLA 15m 18mo"
        Shorts   = $true
    }
    "sms" = @{
        Strategy = "SmartMoneySweep"
        DataFile = "tuning/tsla-15m-18mo.json"
        Desc     = "SmartMoneySweep — TSLA 15m 18mo"
        Shorts   = $true
    }
    "rsi-only" = @{
        Strategy = "RSI"
        DataFile = "tuning/tsla-15m-18mo.json"
        Desc     = "RSI Solo — TSLA 15m 18mo"
        Shorts   = $true
    }
    "ema-only" = @{
        Strategy = "EMASMACrossover"
        DataFile = "tuning/tsla-15m-18mo.json"
        Desc     = "EMA Solo — TSLA 15m 18mo"
        Shorts   = $true
    }
}

if ($Preset -eq "help" -or -not $presets.ContainsKey($Preset)) {
    Write-Host ""
    Write-Host "  OGZPrime Backtest Runner" -ForegroundColor Yellow
    Write-Host "  All presets use tsla-15m-18mo.json (same data, fair comparison)" -ForegroundColor Cyan
    Write-Host "  Available presets (all default to shorts=true):" -ForegroundColor Cyan
    Write-Host "    baseline  — RSI+EMA combined" -ForegroundColor White
    Write-Host "    sms       — SmartMoneySweep" -ForegroundColor White
    Write-Host "    rsi-only  — RSI Solo" -ForegroundColor White
    Write-Host "    ema-only  — EMA Solo" -ForegroundColor White
    Write-Host ""
    Write-Host "  Usage: .\backtest.ps1 <preset> [-longonly] [-feeprofile ttp_real|zero]"
    Write-Host "  Options:"
    Write-Host "    -longonly   Override preset to disable shorts"
    Write-Host "    -feeprofile Canonical venue economics profile (default: ttp_real)"
    Write-Host ""
    exit
}

$config = $presets[$Preset]
$useShorts = if ($longonly) { $false } else { $config.Shorts }

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  OGZPrime Backtest Runner" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  Preset:    $Preset" -ForegroundColor Cyan
Write-Host "  Strategy:  $($config.Strategy)" -ForegroundColor Cyan
Write-Host "  Data:      $($config.DataFile)" -ForegroundColor Cyan
Write-Host "  Shorts:    $useShorts" -ForegroundColor Cyan
Write-Host "  Desc:      $($config.Desc)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""

if ($useShorts) {
    $directionFilter = "both"
} else {
    $directionFilter = "long_only"
}

Write-Host "Running backtest..." -ForegroundColor Yellow
node tools/single-backtest.js `
    "--name=$Preset" `
    "--data=$($config.DataFile)" `
    "--solo=$($config.Strategy)" `
    "--direction=$directionFilter" `
    "--profile=current-eval" `
    "--fee-profile=$feeprofile" `
    "--output-dir=backtest-results"
$status = $LASTEXITCODE

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor White
if ($status -eq 0) {
    Write-Host "  Done." -ForegroundColor Green
} else {
    Write-Host "  Backtest failed with exit code $status." -ForegroundColor Red
}
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor White

exit $status
