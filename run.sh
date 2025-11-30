#!/bin/bash
# Voice Agent - Startup Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║         🎙️  Voice Agent               ║"
echo "║    Real-time Voice Assistant          ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Check for .env file
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}No .env file found. Creating from template...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}Created .env file. Edit it to customize settings.${NC}"
    else
        echo -e "${RED}Warning: No .env.example file found${NC}"
    fi
fi

# Check for virtual environment
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Check if dependencies are installed
if ! python -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pip install -r requirements.txt
fi

# Check if Ollama is running
echo -e "${BLUE}Checking Ollama...${NC}"
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Ollama is running${NC}"
else
    echo -e "${RED}✗ Ollama is not running${NC}"
    echo -e "${YELLOW}Starting Ollama...${NC}"
    # Try to start Ollama in background
    if command -v ollama &> /dev/null; then
        ollama serve &
        sleep 3
    else
        echo -e "${RED}Ollama not found. Please install from https://ollama.ai${NC}"
        exit 1
    fi
fi

# Check for required model
MODEL=${OLLAMA_MODEL:-llama3.2}
echo -e "${BLUE}Checking for model: $MODEL${NC}"
if ! ollama list 2>/dev/null | grep -q "$MODEL"; then
    echo -e "${YELLOW}Model $MODEL not found. Pulling...${NC}"
    ollama pull "$MODEL"
fi
echo -e "${GREEN}✓ Model $MODEL available${NC}"

# Get host and port from environment or defaults
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8000}

echo ""
echo -e "${GREEN}Starting Voice Agent server...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Open: ${GREEN}http://localhost:$PORT${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Run the server
exec python -m uvicorn server.main:app --host "$HOST" --port "$PORT" --reload
