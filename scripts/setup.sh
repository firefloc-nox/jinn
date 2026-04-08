#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Jinn×Hermes Setup Script
# ═══════════════════════════════════════════════════════════════════════════════
# Interactive setup wizard for first-time installation.
# Run: ./scripts/setup.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Symbols
CHECK="${GREEN}✓${NC}"
CROSS="${RED}✗${NC}"
ARROW="${CYAN}→${NC}"
WARN="${YELLOW}⚠${NC}"

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}                        ${BLUE}🧞✨ Jinn×Hermes Setup${NC}                              ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────────
# Check prerequisites
# ─────────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 20 ]; then
        echo -e "  ${CHECK} Node.js ${NODE_VERSION}"
    else
        echo -e "  ${WARN} Node.js ${NODE_VERSION} (recommend 20+)"
    fi
else
    echo -e "  ${CROSS} Node.js not found"
    echo -e "     ${ARROW} Install: https://nodejs.org/"
    exit 1
fi

# pnpm
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm -v)
    echo -e "  ${CHECK} pnpm ${PNPM_VERSION}"
else
    echo -e "  ${CROSS} pnpm not found"
    echo -e "     ${ARROW} Install: npm install -g pnpm"
    exit 1
fi

# Hermes (optional but recommended)
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
if [ -d "$HERMES_HOME" ]; then
    echo -e "  ${CHECK} Hermes found at ${HERMES_HOME}"
    HERMES_INSTALLED=true
else
    echo -e "  ${WARN} Hermes not found (optional)"
    echo -e "     ${ARROW} Install: pip install hermes-cli"
    HERMES_INSTALLED=false
fi

# Honcho (optional)
if command -v honcho &> /dev/null || [ -f "$HOME/honcho/start.sh" ]; then
    echo -e "  ${CHECK} Honcho available"
    HONCHO_INSTALLED=true
else
    echo -e "  ${YELLOW}○${NC} Honcho not found (optional)"
    HONCHO_INSTALLED=false
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────────
# Environment setup
# ─────────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}Setting up environment...${NC}"
echo ""

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "  ${CHECK} Created .env from .env.example"
    else
        touch .env
        echo -e "  ${CHECK} Created empty .env"
    fi
else
    echo -e "  ${CHECK} .env already exists"
fi

# ─────────────────────────────────────────────────────────────────────────────────
# Interactive configuration
# ─────────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}Configuration${NC}"
echo ""

# Port
read -p "  Gateway port [7777]: " JINN_PORT
JINN_PORT=${JINN_PORT:-7777}

# Update .env
if grep -q "^JINN_PORT=" .env; then
    sed -i.bak "s/^JINN_PORT=.*/JINN_PORT=${JINN_PORT}/" .env
else
    echo "JINN_PORT=${JINN_PORT}" >> .env
fi
echo -e "  ${CHECK} Port set to ${JINN_PORT}"

# Hermes configuration
if [ "$HERMES_INSTALLED" = true ]; then
    echo ""
    read -p "  Use Hermes as primary engine? [Y/n]: " USE_HERMES
    USE_HERMES=${USE_HERMES:-Y}
    if [[ "$USE_HERMES" =~ ^[Yy] ]]; then
        echo -e "  ${CHECK} Hermes enabled as primary engine"
        
        # List available profiles
        if [ -d "$HERMES_HOME/profiles" ]; then
            echo ""
            echo -e "  Available Hermes profiles:"
            ls -1 "$HERMES_HOME/profiles" 2>/dev/null | while read profile; do
                echo -e "    ${ARROW} ${profile}"
            done
            echo ""
            read -p "  Default profile [default]: " HERMES_PROFILE
            HERMES_PROFILE=${HERMES_PROFILE:-default}
            
            if grep -q "^HERMES_PROFILE=" .env; then
                sed -i.bak "s/^HERMES_PROFILE=.*/HERMES_PROFILE=${HERMES_PROFILE}/" .env
            else
                echo "HERMES_PROFILE=${HERMES_PROFILE}" >> .env
            fi
            echo -e "  ${CHECK} Profile set to ${HERMES_PROFILE}"
        fi
    fi
fi

# Honcho configuration
if [ "$HONCHO_INSTALLED" = true ]; then
    echo ""
    read -p "  Enable Honcho memory integration? [Y/n]: " USE_HONCHO
    USE_HONCHO=${USE_HONCHO:-Y}
    if [[ "$USE_HONCHO" =~ ^[Yy] ]]; then
        read -p "  Honcho URL [http://127.0.0.1:8000]: " HONCHO_URL
        HONCHO_URL=${HONCHO_URL:-http://127.0.0.1:8000}
        
        read -p "  Honcho peer name [default]: " HONCHO_PEER
        HONCHO_PEER=${HONCHO_PEER:-default}
        
        if grep -q "^HONCHO_URL=" .env; then
            sed -i.bak "s|^HONCHO_URL=.*|HONCHO_URL=${HONCHO_URL}|" .env
        else
            echo "HONCHO_URL=${HONCHO_URL}" >> .env
        fi
        
        if grep -q "^HONCHO_PEER_NAME=" .env; then
            sed -i.bak "s/^HONCHO_PEER_NAME=.*/HONCHO_PEER_NAME=${HONCHO_PEER}/" .env
        else
            echo "HONCHO_PEER_NAME=${HONCHO_PEER}" >> .env
        fi
        
        echo -e "  ${CHECK} Honcho configured"
    fi
fi

# Clean up backup files
rm -f .env.bak

# ─────────────────────────────────────────────────────────────────────────────────
# Install dependencies
# ─────────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}Installing dependencies...${NC}"
echo ""

pnpm install

echo ""
echo -e "  ${CHECK} Dependencies installed"

# ─────────────────────────────────────────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}Building...${NC}"
echo ""

pnpm build

echo ""
echo -e "  ${CHECK} Build complete"

# ─────────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                           ${GREEN}Setup complete! 🎉${NC}                                ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Start the gateway:"
echo -e "    ${CYAN}pnpm start${NC}"
echo ""
echo -e "  Or in dev mode:"
echo -e "    ${CYAN}pnpm dev${NC}"
echo ""
echo -e "  Then open:"
echo -e "    ${CYAN}http://localhost:${JINN_PORT}${NC}"
echo ""
