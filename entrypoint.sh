#!/bin/bash
set -e

export CUDA_VISIBLE_DEVICES=0,1

export DATASET_DIR="/workspace/datasets"
export WEIGHTS_DIR="/workspace/weights"
export FEATURE_DIR="/workspace/features"

export WANDB_PROJECT=BlueGlass
export WANDB_ENTITY=intellabs
export WANDB_MODE=offline
export WANDB_SILENT=true

export MKL_NUM_THREADS=8
export OMP_NUM_THREADS=8


echo Execute: $@
exec "$@"

