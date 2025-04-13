#!/bin/bash
set -e

if [ "$EUID" -ne 0 ]; then
    SUDO='sudo'
    echo "🔧 Not running as root. Will install using sudo."
else
    SUDO=''
    echo "🛠️ Running as root. Installing without sudo."
fi


CUDA_HOME=/home/Alan_Smithee/software/cuda-12.4
if [[ "$CUDA_HOME" == *"Alan_Smithee"* ]]; then
    echo "🎬 Plot twist: CUDA path contains 'Alan_Smithee' — the infamous unknown director. This script refuses to work with mysterious identities. 
    Please pass a real CUDA path."
    exit 1
fi

echo "🌍  Exporting environment variables"
# Define the CUDA installation path
export PATH=$CUDA_HOME/bin:$PATH
export LD_LIBRARY_PATH=
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH

echo "🖥️  Checking OS..."
if [[ "$(uname)" == "Linux" ]]; then
    echo "✅ Linux environment detected."
else
    echo "❌ This script is intended for Linux only."
    exit 1
fi

echo ""
echo "📦 Checking for NVIDIA CUDA..."
if command -v nvcc &> /dev/null; then
    echo "✅ nvcc version: $(nvcc --version)"
else
    echo "❌  NVIDIA CUDA not found.  Please install and try again."
    exit 1
fi

echo ""
echo "🔍 Checking for NVIDIA GPU (nvidia-smi)..."
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected."
    # nvidia-smi
else
    echo "⚠️ nvidia-smi not found. GPU drivers may not be installed or system is CPU-only."
fi

echo ""
echo "📦 Checking for required dependencies..."
packages=(
    curl \
    git \
    python3-dev \
    python3-pip \
    g++ \
    libgeos-dev \
    environment-modules)

for pkg in "${packages[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
        missing+=("$pkg")
    fi
done

if [ "${#missing[@]}" -gt 0 ]; then
    echo "⚠️ Missing dependencies found: ${missing[*]}"
    echo "🔧 Attempting to install with sudo (press Enter to skip)..."

    echo "📦 Running apt-get update..."
    set +e
    $SUDO apt-get update
    UPDATE_STATUS=$?
    set -e

    if [ $UPDATE_STATUS -ne 0 ]; then
        echo "❌ apt-get update failed or was cancelled. Skipping installation."
    else
        echo "📦 Installing missing packages..."
        set +e
        $SUDO apt-get install -y --no-install-recommends "${missing[@]}"
        INSTALL_STATUS=$?
        set -e

        if [ $INSTALL_STATUS -ne 0 ]; then
            echo "❌ apt-get install failed or was cancelled. Continuing script..."
        else
            echo "✅ Packages installed successfully."
        fi
    fi
else
    echo "✅ All required dependencies are installed."
fi


## Specify the path of your installed mamba
MAMBA_PATH=~/micromamba
source "$MAMBA_PATH/etc/profile.d/mamba.sh"

echo ""
echo "📦 Checking micromamba..."
if command -v micromamba &> /dev/null; then
    echo "✅ micromamba version: $(micromamba --version)"
else
    echo "❌  micromamba not found.  Installing..."
    echo "" | "${SHELL}" <(curl -L "micro.mamba.pm/install.sh")
    curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/latest | tar -xvj bin/micromamba
    export MAMBA_ROOT_PREFIX=$HOME/micromamba
    eval "$(./bin/micromamba shell hook -s posix)"
    ./bin/micromamba shell init -s bash -r ~/micromamba
    source $HOME/.bashrc
    MAMBA_PATH=$HOME/micromamba
    source "$MAMBA_PATH/etc/profile.d/mamba.sh"
    echo "✅ micromamba $(micromamba --version) installed."
fi

# Create micromamba env
eval "$(micromamba shell hook --shell bash)"

# Check if existing micromamba environment exists
if micromamba env list | grep -q "blueglass_env"; then
    echo "⚠️  Environment 'blueglass_env' already exists. Skipping creation."
else
    echo "Creating micromamba environment 'blueglass_env'..."
    micromamba create -y -n blueglass_env python=3.11
fi
micromamba activate blueglass_env