# =============================================================================
# OGZ PRIME V14 - PRODUCTION DOCKER IMAGE
# =============================================================================
# Multi-tier trading bot with optional TRAI AI co-founder
# CHANGE 664: Docker container with tier-aware launcher
# =============================================================================

FROM node:18-alpine AS base

# Install Python and system dependencies for all tiers
RUN apk add --no-cache \
    python3 \
    py3-pip \
    bash \
    curl \
    git \
    build-base \
    python3-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production && \
    npm install -g pm2

# Copy application code
COPY . .

# Install Python dependencies for TRAI (ML tier only)
# These are lightweight and won't hurt basic/pro tiers
RUN pip3 install --no-cache-dir \
    ctransformers \
    flask \
    flask-cors

# Create necessary directories
RUN mkdir -p data logs trai_brain/models

# Make launch scripts executable
RUN chmod +x launch-ogzprime-tiered.sh

# Expose ports
EXPOSE 3000 3010 3001 3002 3003 5000

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production \
    SUBSCRIPTION_TIER=indicator \
    WS_HOST=127.0.0.1 \
    BACKTEST_MODE=false \
    MIN_TRADE_CONFIDENCE=0.03 \
    ENABLE_TRAI=false

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command - tier-aware launcher
CMD ["./launch-ogzprime-tiered.sh"]

# =============================================================================
# BUILD INSTRUCTIONS:
# =============================================================================
# Build the image:
#   docker build -t ogzprime:v14 .
#
# Run for different tiers:
#   INDICATOR (Core features, no TRAI):
#     docker run -e SUBSCRIPTION_TIER=indicator ogzprime:v14
#
#   ML (with TRAI AI co-founder):
#     docker run -e SUBSCRIPTION_TIER=ml \
#                -v ./trai_brain/models:/app/trai_brain/models \
#                ogzprime:v14
#
# Custom configuration:
#   docker run -e SUBSCRIPTION_TIER=ml \
#              -e MIN_TRADE_CONFIDENCE=0.05 \
#              -e KRAKEN_API_KEY=your_key \
#              -e KRAKEN_API_SECRET=your_secret \
#              -p 3000:3000 \
#              -p 3010:3010 \
#              ogzprime:v14
# =============================================================================