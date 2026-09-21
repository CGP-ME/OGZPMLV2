#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# OGZPrime Backtest Runner — Boomer-Proof Edition (Linux/VPS)
#
# Usage:  ./backtest.sh baseline
#         ./backtest.sh sms --long-only
#
# Presets: baseline, sms, rsi-only, ema-only
# Options: --long-only, --fee-profile=ttp_real|zero
# Note: All presets default to shorts=true. Use --long-only to override.
# ═══════════════════════════════════════════════════════════════

PRESET="${1:-help}"
LONG_ONLY_OVERRIDE=false
FEE_PROFILE="ttp_real"

shift 2>/dev/null
for arg in "$@"; do
    case $arg in
        --long-only) LONG_ONLY_OVERRIDE=true ;;
        --fee-profile=*) FEE_PROFILE="${arg#*=}" ;;
        --fee-profile)
            echo "  --fee-profile requires a value: ttp_real or zero"
            exit 1
            ;;
        *)
            echo "  Unknown option: $arg"
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
        echo "  Usage: ./backtest.sh <preset> [--long-only] [--fee-profile=ttp_real|zero]"
        echo "  Options:"
        echo "    --long-only  Override preset to disable shorts"
        echo "    --fee-profile Venue economics profile (default: ttp_real)"
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
echo "  Fees:      $FEE_PROFILE"
echo "  Desc:      $DESC"
echo "═══════════════════════════════════════════════════════"
echo ""

if [ "$SHORTS" = true ]; then
    DIRECTION_FILTER="both"
else
    DIRECTION_FILTER="long_only"
fi

echo "Running backtest..."
node tools/single-backtest.js \
    --name="$PRESET" \
    --data="$DATAFILE" \
    --solo="$STRATEGY" \
    --direction="$DIRECTION_FILTER" \
    --profile="current-eval" \
    --fee-profile="$FEE_PROFILE" \
    --output-dir="backtest-results"
STATUS=$?

echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$STATUS" -eq 0 ]; then
    echo "  Done."
else
    echo "  Backtest failed with exit code $STATUS."
fi
echo "═══════════════════════════════════════════════════════"

exit "$STATUS"
