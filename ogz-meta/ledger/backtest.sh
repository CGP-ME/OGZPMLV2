#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# OGZPrime Backtest Runner — Boomer-Proof Edition
# 
# Usage:  ./backtest.sh <preset> [options]
#
# Presets:
#   baseline       RSI+EMA on TSLA 2y (the $970 anchor)
#   sms-10mo       SmartMoneySweep on TSLA 10mo
#   sms-18mo       SmartMoneySweep on TSLA 18mo  
#   rsi-only       RSI solo on TSLA 2y
#   ema-only       EMA solo on TSLA 2y
#   custom         Use your own settings (prompts you)
#
# Options:
#   --shorts       Enable short selling (default: longs only)
#   --verbose      Show all output (default: summary only)
#   --receipts     Show trade receipts
#   --csv          Export trades to CSV
#
# Examples:
#   ./backtest.sh baseline
#   ./backtest.sh sms-18mo --shorts
#   ./backtest.sh baseline --receipts
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Defaults (LOCKED — do not change without Trey's approval) ───
PRESET="${1:-help}"
ENABLE_SHORTS="false"
SHOW_VERBOSE="false"
SHOW_RECEIPTS="false"
EXPORT_CSV="false"

# ─── Parse options ───
shift 2>/dev/null || true
for arg in "$@"; do
  case "$arg" in
    --shorts)   ENABLE_SHORTS="true" ;;
    --verbose)  SHOW_VERBOSE="true" ;;
    --receipts) SHOW_RECEIPTS="true" ;;
    --csv)      EXPORT_CSV="true" ;;
    *)          echo -e "${RED}Unknown option: $arg${NC}"; exit 1 ;;
  esac
done

# ─── Preset configs ───
case "$PRESET" in
  baseline)
    STRATEGY="RSI,EMASMACrossover"
    DATA_FILE="tuning/tsla-15m-2y.json"
    DESCRIPTION="RSI+EMA Baseline — TSLA 15m 2 Years"
    EXPECTED_PROFIT="~\$970"
    EXPECTED_TRADES="~1416"
    EXPECTED_WR="~47.5%"
    ;;
  sms-10mo)
    STRATEGY="SmartMoneySweep"
    DATA_FILE="tuning/tsla-15m-10mo.json"
    DESCRIPTION="SmartMoneySweep — TSLA 15m 10 Months"
    ENABLE_SHORTS="true"
    EXPECTED_PROFIT="TBD"
    EXPECTED_TRADES="TBD"
    EXPECTED_WR="TBD"
    ;;
  sms-18mo)
    STRATEGY="SmartMoneySweep"
    DATA_FILE="tuning/tsla-15m-18mo.json"
    DESCRIPTION="SmartMoneySweep — TSLA 15m 18 Months"
    ENABLE_SHORTS="true"
    EXPECTED_PROFIT="TBD"
    EXPECTED_TRADES="TBD"
    EXPECTED_WR="TBD"
    ;;
  rsi-only)
    STRATEGY="RSI"
    DATA_FILE="tuning/tsla-15m-2y.json"
    DESCRIPTION="RSI Solo — TSLA 15m 2 Years"
    EXPECTED_PROFIT="TBD"
    EXPECTED_TRADES="TBD"
    EXPECTED_WR="TBD"
    ;;
  ema-only)
    STRATEGY="EMASMACrossover"
    DATA_FILE="tuning/tsla-15m-2y.json"
    DESCRIPTION="EMA Solo — TSLA 15m 2 Years"
    EXPECTED_PROFIT="TBD"
    EXPECTED_TRADES="TBD"
    EXPECTED_WR="TBD"
    ;;
  help|--help|-h)
    head -25 "$0" | tail -23
    exit 0
    ;;
  *)
    echo -e "${RED}Unknown preset: $PRESET${NC}"
    echo "Run ./backtest.sh help for available presets"
    exit 1
    ;;
esac

# ─── Verify data file exists ───
if [ ! -f "$DATA_FILE" ]; then
  echo -e "${RED}ERROR: Data file not found: $DATA_FILE${NC}"
  exit 1
fi

# ─── Print header ───
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
echo -e "${GOLD}  OGZPrime Backtest Runner${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
echo -e "  Preset:    ${CYAN}$PRESET${NC}"
echo -e "  Strategy:  ${CYAN}$STRATEGY${NC}"
echo -e "  Data:      ${CYAN}$DATA_FILE${NC}"
echo -e "  Shorts:    ${CYAN}$ENABLE_SHORTS${NC}"
echo -e "  Desc:      ${CYAN}$DESCRIPTION${NC}"
if [ "$EXPECTED_PROFIT" != "TBD" ]; then
  echo -e "  Expected:  ${GREEN}$EXPECTED_PROFIT | $EXPECTED_TRADES trades | $EXPECTED_WR WR${NC}"
fi
echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
echo ""

# ─── Set ALL env vars explicitly (no relying on .env) ───
export SOLO_STRATEGY="$STRATEGY"
export EXECUTION_MODE="backtest"
export CANDLE_SOURCE="file"
export CANDLE_DATA_FILE="$DATA_FILE"
export BACKTEST_MODE="true"
export BACKTEST_FAST="true"
export BACKTEST_NO_PATTERN_SAVE="true"
export FEE_MAKER="0"
export FEE_TAKER="0"
export ENABLE_TRAI="false"
export ACCOUNT_DRAWDOWN_BYPASS="true"

# Direction filter
if [ "$ENABLE_SHORTS" = "true" ]; then
  export DIRECTION_FILTER="both"
  export ENABLE_SHORTS="true"
else
  export DIRECTION_FILTER="long"
  export ENABLE_SHORTS="false"
fi

# Strategy-specific enables
export ENABLE_SMS="false"
export ENABLE_RSI="false"
export ENABLE_EMA="false"
export ENABLE_MASR="false"
export ENABLE_LIQSWEEP="false"
export ENABLE_MTF="false"
export ENABLE_TPO="false"

# Turn on only what's needed
case "$STRATEGY" in
  *RSI*)              export ENABLE_RSI="true" ;;&
  *EMASMACrossover*)  export ENABLE_EMA="true" ;;&
  *SmartMoneySweep*)  export ENABLE_SMS="true" ;;
esac

# ─── Run backtest ───
TIMESTAMP=$(date +%s)
OUTPUT_FILE="/tmp/ogz-backtest-${PRESET}-${TIMESTAMP}.txt"

echo -e "${GOLD}Running backtest...${NC}"
node run-empire-v2.js 2>&1 | tee "$OUTPUT_FILE" | {
  if [ "$SHOW_VERBOSE" = "true" ]; then
    cat
  elif [ "$SHOW_RECEIPTS" = "true" ]; then
    grep -E "TRADE-RECEIPT|Final Balance|BACKTEST COMPLETE|BACKTEST SUMMARY|ACCOUNT:|PERFORMANCE:|RISK:|BY STRATEGY:|BY EXIT|═|💰|📈|⚠️|🎯|🚪|P&L:|Total Trades|Win Rate|Profit Factor|Max Drawdown"
  else
    grep -E "Final Balance|BACKTEST COMPLETE|BACKTEST SUMMARY|ACCOUNT:|PERFORMANCE:|RISK:|BY STRATEGY:|BY EXIT|═|💰|📈|⚠️|🎯|🚪|P&L:|Total Trades|Win Rate|Profit Factor|Max Drawdown|Net P&L"
  fi
}

# ─── Parse results from saved output ───
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
echo -e "${GOLD}  Results saved to: $OUTPUT_FILE${NC}"

# Get BacktestRecorder final balance (the real one)
FINAL=$(grep "Final Balance:" "$OUTPUT_FILE" | tail -1 | grep -oP '[\d,]+\.[\d]+' | tail -1)
if [ -n "$FINAL" ]; then
  echo -e "  Final Balance:  ${CYAN}\$$FINAL${NC}"
fi

# Compare to expected if available
if [ "$EXPECTED_PROFIT" != "TBD" ] && [ -n "$FINAL" ]; then
  echo ""
  echo -e "  Expected: ${GREEN}$EXPECTED_PROFIT${NC}"
  echo -e "  ${GOLD}Compare and verify manually.${NC}"
fi

echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
echo ""
