#!/bin/bash

# 🎬 Video Clipper - Quick Start Script

echo "╔════════════════════════════════════════╗"
echo "║   🎬 Video Clipper - Quick Start 🎬   ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on Linux
if [[ ! "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${RED}❌ This script is for Linux only${NC}"
    exit 1
fi

# Create necessary directories
mkdir -p uploads output

# Check for Docker
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✅ Docker found${NC}"
    echo ""
    read -p "Use Docker? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🚀 Starting with Docker...${NC}"
        docker-compose up
        exit 0
    fi
fi

# Manual setup
echo -e "${YELLOW}🔧 Running manual setup...${NC}"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv
fi

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}❌ FFmpeg not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y ffmpeg ffprobe
fi

# Create venv
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}📦 Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install requirements
echo -e "${YELLOW}📚 Installing Python dependencies...${NC}"
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${YELLOW}📋 Starting services...${NC}"
echo ""

# Start backend in background
echo -e "${GREEN}🔌 Backend starting on http://localhost:5000${NC}"
python3 backend.py &
BACKEND_PID=$!

# Check if Node.js is installed
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js/npm not found!${NC}"
    echo -e "${YELLOW}Install from: https://nodejs.org/${NC}"
    wait $BACKEND_PID
    exit 1
fi

# Install frontend dependencies
echo -e "${GREEN}🔌 Frontend starting on http://localhost:3000${NC}"
npm install --quiet
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo "🌐 Open browser:"
echo "   http://localhost:3000"
echo ""
echo "To stop:"
echo "   Ctrl+C"
echo ""

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" EXIT INT TERM

wait