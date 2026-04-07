#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# OGZPrime Backtest Runner — Boomer-Proof Edition (Linux/VPS)
#
# Usage:  ./backtest.sh baseline
#         ./backtest.sh sms-18mo --long-only
#         ./backtest.sh baseline --receipts
#
# Presets: baseline, sms-10mo, sms-18mo, rsi-only, ema-only
# Options: --long-only, --verbose, --receipts
# Note: All presets default to shorts=true. Use --long-only to override.
# ═══════════════════════════════════════════════════════════════

PRESET="${1:-help}"
LONG_ONLY_OVERRIDE=false
VERBOSE=false
RECEIPTS=false

shift 2>/dev/null
for arg in "$@"; do
    case $arg in
        --long-only) LONG_ONLY_OVERRIDE=true ;;
        --verbose) VERBOSE=true ;;
        --receipts) RECEIPTS=true ;;
    esac
done

# ─── Preset configs ───
case $PRESET in
    baseline)
        STRATEGY="RSI,EMASMACrossover"
        DATAFILE="tuning/tsla-15m-2y.json"
        DESC="RSI+EMA Baseline — TSLA 15m 2 Years"
        SHORTS=true
        ;;
    sms-10mo)
        STRATEGY="SmartMoneySweep"
        DATAFILE="tuning/tsla-15m-10mo.json"
        DESC="SmartMoneySweep — TSLA 15m 10 Months"
        SHORTS=true
        ;;
    sms-18mo)
        STRATEGY="SmartMoneySweep"
        DATAFILE="tuning/tsla-15m-18mo.json"
        DESC="SmartMoneySweep — TSLA 15m 18 Months"
        SHORTS=true
        ;;
    rsi-only)
        STRATEGY="RSI"
        DATAFILE="tuning/tsla-15m-2y.json"
        DESC="RSI Solo — TSLA 15m 2 Years"
        SHORTS=true
        ;;
    ema-only)
        STRATEGY="EMASMACrossover"
        DATAFILE="tuning/tsla-15m-2y.json"
        DESC="EMA Solo — TSLA 15m 2 Years"
        SHORTS=true
        ;;
    *)
        echo ""
        echo "  OGZPrime Backtest Runner"
        echo "  Available presets (all default to shorts=true):"
        echo "    baseline  — RSI+EMA Baseline — TSLA 15m 2 Years"
        echo "    sms-10mo  — SmartMoneySweep — TSLA 15m 10 Months"
        echo "    sms-18mo  — SmartMoneySweep — TSLA 15m 18 Months"
        echo "    rsi-only  — RSI Solo — TSLA 15m 2 Years"
        echo "    ema-only  — EMA Solo — TSLA 15m 2 Years"
        echo ""
        echo "  Usage: ./backtest.sh <preset> [--long-only] [--verbose] [--receipts]"
        echo "  Options:"
        echo "    --long-only  Override preset to disable shorts"
        echo "    --verbose    Show full output (no filtering)"
        echo "    --receipts   Include TRADE-RECEIPT lines in output"
        echo ""
        exit 0
        ;;
esac

if [ "$LONG_ONLY_OVERRIDE" = true ]; then
    SHORTS=false
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  OGZPrime Backtest Runner"
echo "═══════════════════════════════════════════════════════"
echo "  Preset:    $PRESET"
echo "  Strategy:  $STRATEGY"
echo "  Data:      $DATAFILE"
echo "  Shorts:    $SHORTS"
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
export FEE_MAKER="0"
export FEE_TAKER="0"
export ENABLE_TRAI="false"
export ACCOUNT_DRAWDOWN_BYPASS="true"

if [ "$SHORTS" = true ]; then
    export DIRECTION_FILTER="both"
    export ENABLE_SHORTS="true"
else
    export DIRECTION_FILTER="long"
    export ENABLE_SHORTS="false"
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
unset FEE_MAKER FEE_TAKER ENABLE_TRAI ACCOUNT_DRAWDOWN_BYPASS
unset DIRECTION_FILTER ENABLE_SHORTS
