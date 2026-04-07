# ═══════════════════════════════════════════════════════════════
# OGZPrime Backtest Runner — Boomer-Proof Edition (Windows)
#
# Usage:  .\backtest.ps1 baseline
#         .\backtest.ps1 sms-18mo -longonly
#         .\backtest.ps1 baseline -receipts
#
# Presets: baseline, sms-10mo, sms-18mo, rsi-only, ema-only
# Options: -longonly, -verbose, -receipts
# Note: All presets default to shorts=true. Use -longonly to override.
# ═══════════════════════════════════════════════════════════════

param(
    [Parameter(Position=0)]
    [string]$Preset = "help",
    [switch]$longonly,
    [switch]$verbose,
    [switch]$receipts
)

# ─── Preset configs ───
$presets = @{
    "baseline" = @{
        Strategy = "RSI,EMASMACrossover"
        DataFile = "tuning/tsla-15m-2y.json"
        Desc     = "RSI+EMA Baseline — TSLA 15m 2 Years"
        Shorts   = $true
    }
    "sms-10mo" = @{
        Strategy = "SmartMoneySweep"
        DataFile = "tuning/tsla-15m-10mo.json"
        Desc     = "SmartMoneySweep — TSLA 15m 10 Months"
        Shorts   = $true
    }
    "sms-18mo" = @{
        Strategy = "SmartMoneySweep"
        DataFile = "tuning/tsla-15m-18mo.json"
        Desc     = "SmartMoneySweep — TSLA 15m 18 Months"
        Shorts   = $true
    }
    "rsi-only" = @{
        Strategy = "RSI"
        DataFile = "tuning/tsla-15m-2y.json"
        Desc     = "RSI Solo — TSLA 15m 2 Years"
        Shorts   = $true
    }
    "ema-only" = @{
        Strategy = "EMASMACrossover"
        DataFile = "tuning/tsla-15m-2y.json"
        Desc     = "EMA Solo — TSLA 15m 2 Years"
        Shorts   = $true
    }
}

if ($Preset -eq "help" -or -not $presets.ContainsKey($Preset)) {
    Write-Host ""
    Write-Host "  OGZPrime Backtest Runner" -ForegroundColor Yellow
    Write-Host "  Available presets (all default to shorts=true):" -ForegroundColor Cyan
    foreach ($key in $presets.Keys) {
        Write-Host "    $key — $($presets[$key].Desc)" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "  Usage: .\backtest.ps1 <preset> [-longonly] [-verbose] [-receipts]"
    Write-Host "  Options:"
    Write-Host "    -longonly   Override preset to disable shorts"
    Write-Host "    -verbose    Show full output (no filtering)"
    Write-Host "    -receipts   Include TRADE-RECEIPT lines in output"
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

# ─── Set ALL env vars explicitly ───
$env:SOLO_STRATEGY = $config.Strategy
$env:EXECUTION_MODE = "backtest"
$env:CANDLE_SOURCE = "file"
$env:CANDLE_DATA_FILE = $config.DataFile
$env:BACKTEST_MODE = "true"
$env:BACKTEST_FAST = "true"
$env:BACKTEST_NO_PATTERN_SAVE = "true"
$env:FEE_MAKER = "0"
$env:FEE_TAKER = "0"
$env:ENABLE_TRAI = "false"
$env:ACCOUNT_DRAWDOWN_BYPASS = "true"

if ($useShorts) {
    $env:DIRECTION_FILTER = "both"
    $env:ENABLE_SHORTS = "true"
} else {
    $env:DIRECTION_FILTER = "long"
    $env:ENABLE_SHORTS = "false"
}

Write-Host "Running backtest..." -ForegroundColor Yellow

# Grep pattern for filtered output (includes ENV fingerprint and BACKTEST SUMMARY)
$GrepPattern = "ENV FINGERPRINT|SOLO_STRATEGY|EXECUTION_MODE|CANDLE_|BACKTEST_|FEE_|ENABLE_|DIRECTION_|ACCOUNT_DRAWDOWN|Final Balance|BACKTEST|ACCOUNT|PERFORMANCE|RISK|STRATEGY|EXIT|P&L|Total Trades|Win Rate|Profit Factor|Max Drawdown|Report saved|trades\.csv"

if ($verbose) {
    node run-empire-v2.js
} elseif ($receipts) {
    node run-empire-v2.js 2>&1 | Select-String -Pattern "TRADE-RECEIPT|$GrepPattern"
} else {
    node run-empire-v2.js 2>&1 | Select-String -Pattern $GrepPattern
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  Done." -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor White

# ─── Clean up env vars so they don't leak to next run ───
Remove-Item Env:SOLO_STRATEGY -ErrorAction SilentlyContinue
Remove-Item Env:EXECUTION_MODE -ErrorAction SilentlyContinue
Remove-Item Env:CANDLE_SOURCE -ErrorAction SilentlyContinue
Remove-Item Env:CANDLE_DATA_FILE -ErrorAction SilentlyContinue
Remove-Item Env:BACKTEST_MODE -ErrorAction SilentlyContinue
Remove-Item Env:BACKTEST_FAST -ErrorAction SilentlyContinue
Remove-Item Env:BACKTEST_NO_PATTERN_SAVE -ErrorAction SilentlyContinue
Remove-Item Env:FEE_MAKER -ErrorAction SilentlyContinue
Remove-Item Env:FEE_TAKER -ErrorAction SilentlyContinue
Remove-Item Env:ENABLE_TRAI -ErrorAction SilentlyContinue
Remove-Item Env:ACCOUNT_DRAWDOWN_BYPASS -ErrorAction SilentlyContinue
Remove-Item Env:DIRECTION_FILTER -ErrorAction SilentlyContinue
Remove-Item Env:ENABLE_SHORTS -ErrorAction SilentlyContinue
