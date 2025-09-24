#!/bin/bash

# Installation script for Python WebSocket dependencies
# This script installs all required packages for the Python WebSocket servers

echo "Installing Python WebSocket dependencies..."

# Check if Python 3.7+ is available
python_version=$(python3 --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
required_version="3.7"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "Error: Python 3.7 or higher is required. Found: $python_version"
    exit 1
fi

echo "Python version check passed: $python_version"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install system dependencies for face_recognition (Ubuntu/Debian)
if command -v apt-get &> /dev/null; then
    echo "Installing system dependencies (Ubuntu/Debian)..."
    sudo apt-get update
    sudo apt-get install -y build-essential cmake libopenblas-dev liblapack-dev
    sudo apt-get install -y libx11-dev libgtk-3-dev
    sudo apt-get install -y python3-dev python3-pip
fi

# Install system dependencies for face_recognition (CentOS/RHEL/Fedora)
if command -v yum &> /dev/null; then
    echo "Installing system dependencies (CentOS/RHEL/Fedora)..."
    sudo yum groupinstall -y "Development Tools"
    sudo yum install -y cmake openblas-devel lapack-devel
    sudo yum install -y python3-devel
fi

# Install system dependencies for face_recognition (macOS)
if command -v brew &> /dev/null; then
    echo "Installing system dependencies (macOS)..."
    brew install cmake
fi

# Install Python packages
echo "Installing Python packages..."

# Install basic dependencies first
pip install numpy==1.24.3
pip install opencv-python==4.8.1.78
pip install websockets==11.0.3

# Install face recognition dependencies
echo "Installing dlib (this may take a while)..."
pip install dlib==19.24.2

echo "Installing face_recognition..."
pip install face-recognition==1.3.0

# Install additional dependencies
pip install Pillow==10.0.1
pip install scipy==1.11.3

# Install development dependencies
pip install pytest==7.4.2
pip install pytest-asyncio==0.21.1

echo "Installation completed successfully!"

# Create necessary directories
mkdir -p student_encodings
mkdir -p logs

# Set permissions
chmod +x start_websockets.py
chmod +x websocket_face_scanner.py
chmod +x websocket_student_manager.py

echo "Setup completed!"
echo ""
echo "To start the WebSocket servers:"
echo "1. Activate the virtual environment: source venv/bin/activate"
echo "2. Run the servers: python start_websockets.py"
echo ""
echo "WebSocket endpoints will be available at:"
echo "- Face Scanner: ws://localhost:8765"
echo "- Student Manager: ws://localhost:8766"