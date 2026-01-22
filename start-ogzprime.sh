#!/bin/bash
# OGZ PRIME - Unified Startup Script
# Usage: ./start-ogzprime.sh [start|stop|restart|status]

PROJECT_ROOT="/opt/ogzprime/OGZPMLV2"
cd "$PROJECT_ROOT" || exit 1

# Load environment
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

setup() {
    echo -e "${YELLOW}[Setup] Creating TRAI inference server symlinks...${NC}"
    ln -sf "$PROJECT_ROOT/trai_brain/inference_server.py" "$PROJECT_ROOT/core/inference_server.py" 2>/dev/null
    ln -sf "$PROJECT_ROOT/trai_brain/inference_server_ct.py" "$PROJECT_ROOT/core/inference_server_ct.py" 2>/dev/null
    ln -sf "$PROJECT_ROOT/trai_brain/inference_server_gguf.py" "$PROJECT_ROOT/core/inference_server_gguf.py" 2>/dev/null

    echo -e "${YELLOW}[Setup] Fixing web file permissions...${NC}"
    chmod 644 "$PROJECT_ROOT/public/trai-widget.js" 2>/dev/null

    echo -e "${YELLOW}[Setup] Clearing stale locks...${NC}"
    rm -f "$PROJECT_ROOT/.ogz-prime-v14.lock" 2>/dev/null

    # Verify model
    if [ -f "/opt/ogzprime/trai/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf" ]; then
        echo -e "${GREEN}[Setup] TRAI LLM model found${NC}"
    else
        echo -e "${YELLOW}[Setup] TRAI LLM model not found - using rule-based${NC}"
    fi
}

start() {
    echo -e "\n${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                 🚀 STARTING OGZ PRIME                          ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}\n"

    setup

    echo -e "\n${YELLOW}[Start] WebSocket server...${NC}"
    pm2 start ogz-websocket --update-env 2>/dev/null || pm2 restart ogz-websocket --update-env

    echo -e "${YELLOW}[Start] Dashboard server...${NC}"
    pm2 start ogz-dashboard --update-env 2>/dev/null || pm2 restart ogz-dashboard --update-env

    echo -e "${YELLOW}[Start] Trading bot + TRAI...${NC}"
    pm2 start ogz-prime-v2 --update-env 2>/dev/null || pm2 restart ogz-prime-v2 --update-env

    pm2 save
    sleep 3
    status
}

stop() {
    echo -e "\n${YELLOW}[Stop] Stopping all services...${NC}"
    pm2 stop ogz-prime-v2 ogz-dashboard ogz-websocket 2>/dev/null
    echo -e "${GREEN}[Stop] All services stopped${NC}"
}

status() {
    echo -e "\n${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                      SERVICE STATUS                           ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}\n"

    pm2 list | grep -E "ogz-|id.*name"

    echo -e "\n${YELLOW}TRAI Status:${NC}"
    if pm2 logs ogz-prime-v2 --lines 30 --nostream 2>/dev/null | grep -q "TRAI LLM Ready\|TRAI Server Ready"; then
        echo -e "  ${GREEN}✓ TRAI LLM loaded and ready${NC}"
    else
        echo -e "  ${YELLOW}⚠ TRAI status unknown (check logs)${NC}"
    fi

    echo -e "\n${YELLOW}URLs:${NC}"
    echo "  Dashboard:  https://ogzprime.com/unified-dashboard.html"
    echo "  WebSocket:  wss://ogzprime.com/ws"
    echo ""
}

case "${1:-start}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; sleep 2; start ;;
    status)  status ;;
    setup)   setup ;;
    *)       echo "Usage: $0 {start|stop|restart|status|setup}"; exit 1 ;;
esac
