#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# OGZPrime Backtest Runner — Boomer-Proof Edition (Linux/VPS)
#
# Usage:  ./backtest.sh baseline
#         ./backtest.sh sms-18mo --long-only
#         ./backtest.sh baseline --receipts
#
# Presets: baseline, sms-10mo, sms-18mo, rsi-only, ema-only
# Options: --long-only, --verbose, --receipts, --fee-profile=ttp_real|zero
# Note: All presets default to shorts=true. Use --long-only to override.
# ═══════════════════════════════════════════════════════════════

PRESET="${1:-help}"
LONG_ONLY_OVERRIDE=false
VERBOSE=false
RECEIPTS=false
FEE_PROFILE="ttp_real"

shift 2>/dev/null
for arg in "$@"; do
    case $arg in
        --long-only) LONG_ONLY_OVERRIDE=true ;;
        --verbose) VERBOSE=true ;;
        --receipts) RECEIPTS=true ;;
        --fee-profile=*) FEE_PROFILE="${arg#*=}" ;;
        --fee-profile)
            echo "  --fee-profile requires a value: ttp_real or zero"
            exit 1
            ;;
    esac
done

# ─── Preset configs ───
case $PRESET in
    baseline)
        STRATEGY="RSI,EMASMACrossover"
        DATAFILE="tuning/tsla-15m-18mo.json"
        DESC="RSI+EMA Baseline — TSLA 15m 18mo"
        SHORTS=true
        ;;
    sms)
        STRATEGY="SmartMoneySweep"
        DATAFILE="tuning/tsla-15m-18mo.json"
        DESC="SmartMoneySweep — TSLA 15m 18mo"
        SHORTS=true
        ;;
    rsi-only)
        STRATEGY="RSI"
        DATAFILE="tuning/tsla-15m-18mo.json"
        DESC="RSI Solo — TSLA 15m 18mo"
        SHORTS=true
        ;;
    ema-only)
        STRATEGY="EMASMACrossover"
        DATAFILE="tuning/tsla-15m-18mo.json"
        DESC="EMA Solo — TSLA 15m 18mo"
        SHORTS=true
        ;;
    *)
        echo ""
        echo "  OGZPrime Backtest Runner"
        echo "  All presets use tsla-15m-18mo.json (same data, fair comparison)"
        echo "  Available presets (all default to shorts=true):"
        echo "    baseline  — RSI+EMA combined"
        echo "    sms       — SmartMoneySweep"
        echo "    rsi-only  — RSI Solo"
        echo "    ema-only  — EMA Solo"
        echo ""
        echo "  Usage: ./backtest.sh <preset> [--long-only] [--verbose] [--receipts] [--fee-profile=ttp_real|zero]"
        echo "  Options:"
        echo "    --long-only  Override preset to disable shorts"
        echo "    --verbose    Show full output (no filtering)"
        echo "    --receipts   Include TRADE-RECEIPT lines in output"
        echo "    --fee-profile Venue economics profile (default: ttp_real)"
        echo ""
        exit 0
        ;;
esac

if [ "$LONG_ONLY_OVERRIDE" = true ]; then
    SHORTS=false
fi

FEE_PROFILE_EXPORTS="$(node tools/fee-profiles.js shell-export "$FEE_PROFILE")" || exit 1
if [ -z "$FEE_PROFILE_EXPORTS" ]; then
    echo "  Fee profile export was empty for: $FEE_PROFILE"
    exit 1
fi
case "$FEE_PROFILE_EXPORTS" in
    *"BACKTEST_FEE_PROFILE="*) ;;
    *)
        echo "  Fee profile export missing BACKTEST_FEE_PROFILE for: $FEE_PROFILE"
        exit 1
        ;;
esac
eval "$FEE_PROFILE_EXPORTS"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  OGZPrime Backtest Runner"
echo "═══════════════════════════════════════════════════════"
echo "  Preset:    $PRESET"
echo "  Strategy:  $STRATEGY"
echo "  Data:      $DATAFILE"
echo "  Shorts:    $SHORTS"
echo "  Fees:      $FEE_PROFILE"
echo "  Desc:      $DESC"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Set ALL env vars explicitly ───
export SOLO_STRATEGY="$STRATEGY"
export EXECUTION_MODE="backtest"
export CANDLE_SOURCE="file"
export CANDLE_DATA_FILE="$DATAFILE"
export BACKTEST_MODE="true"
export BACKTEST_FAST="true"
export BACKTEST_NO_PATTERN_SAVE="true"
export ENABLE_TRAI="false"
export ACCOUNT_DRAWDOWN_BYPASS="true"

if [ "$SHORTS" = true ]; then
    export DIRECTION_FILTER="both"
else
    export DIRECTION_FILTER="long"
fi

# SMS-specific env vars (required for SmartMoneySweep to fire)
if [[ "$STRATEGY" == *"SmartMoneySweep"* ]]; then
    export ENABLE_SMS="true"
    export SMS_VP_RTH_ONLY="true"
fi

echo "Running backtest..."

# Grep pattern for filtered output (includes ENV fingerprint and BACKTEST SUMMARY)
GREP_PATTERN="ENV FINGERPRINT|SOLO_STRATEGY|EXECUTION_MODE|CANDLE_|BACKTEST_|FEE_|ENABLE_|DIRECTION_|ACCOUNT_DRAWDOWN|Final Balance|BACKTEST|ACCOUNT|PERFORMANCE|RISK|STRATEGY|EXIT|P&L|Total Trades|Win Rate|Profit Factor|Max Drawdown|Report saved|trades\.csv"

if [ "$VERBOSE" = true ]; then
    node run-empire-v2.js
elif [ "$RECEIPTS" = true ]; then
    node run-empire-v2.js 2>&1 | grep -E "TRADE-RECEIPT|$GREP_PATTERN"
else
    node run-empire-v2.js 2>&1 | grep -E "$GREP_PATTERN"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Done."
echo "═══════════════════════════════════════════════════════"

# ─── Clean up env vars so they don't leak to next run ───
unset SOLO_STRATEGY EXECUTION_MODE CANDLE_SOURCE CANDLE_DATA_FILE
unset BACKTEST_MODE BACKTEST_FAST BACKTEST_NO_PATTERN_SAVE
unset BACKTEST_FEE_PROFILE FEE_MODEL FEE_MAKER FEE_TAKER FEE_TOTAL_ROUNDTRIP FEE_SAFETY_BUFFER FEE_SLIPPAGE FEE_PER_SHARE FEE_MIN_ORDER
unset ENABLE_TRAI ACCOUNT_DRAWDOWN_BYPASS
unset DIRECTION_FILTER ENABLE_SMS SMS_VP_RTH_ONLY
