#!/bin/bash

set -e
echo ""

if [[ ! "$OSTYPE" == "linux-gnu" ]];then
    echo "This script is for linux only !"
    exit 1
fi

echo "Update system packages.."
sudo apt-get update -qq


echo "Installing FFmpeg.."
if ! command -v ffmpeg &> /dev/null; then
    sudo apt-get install -y ffmpeg ffprobe
    echo "FFmpeg installed"
else
    echo "FFmpeg already installed"
fi

echo "Installing Python3..."
if ! command -v python3 &> /dev/null; then
    sudo apt-get install -y python3 python3-pip python3-venv
    echo "Python3 installed"
else
    echo "Python3 already installed"
fi

echo "Installing Python dependencies..."
pip install --upgrade pip setuptools wheel -q

pip install flask flask-cors werkzeug -q
echo "Flask, CORS, Werkzeug"

pip install moviepy imageio imageio-ffmpeg -q
echo "MoviePy, ImageIO"

pip install librosa scipy numpy -q
echo "LibROSA, SciPy, NumPy"

echo "If you don't have Node.js:"
echo "   $ curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -"
echo "   $ sudo apt-get install -y nodejs"
