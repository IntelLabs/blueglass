#!/bin/bash
# Copyright 2025 Intel Corporation
# SPDX: Apache-2.0

# Build configuration for multiple CUDA and PyTorch versions
# This file defines the supported combinations and their corresponding tags

# Registry configuration
REGISTRY="${DOCKER_REGISTRY}"
IMAGE_NAME="${IMAGE_NAME:-blueglass}"
BASE_TAG="${BASE_TAG:-multi}"

# Function to get PyTorch CUDA version suffix from CUDA version
get_pytorch_cuda_version() {
    local cuda_version=$1
    case $cuda_version in
        "11.8"*) echo "cu118" ;;
        "12.1"*) echo "cu121" ;;
        "12.4"*) echo "cu124" ;;
        "12.6"*) echo "cu126" ;;
        *) echo "cu126" ;;  # default
    esac
}

# Function to get CUDA image tag from version
get_cuda_image_tag() {
    local cuda_version=$1
    echo "${cuda_version}-cudnn-devel-ubuntu22.04"
}

# Define version combinations
# Format: "CUDA_VERSION:PYTORCH_VERSION:PYTHON_VERSION:TAG_SUFFIX"
declare -a VERSION_COMBINATIONS=(
    # CUDA 12.6.3 combinations
    "12.6.3:2.7.1:3.11:cuda12.6-torch2.7.1-py3.11"
    "12.6.3:2.6.0:3.11:cuda12.6-torch2.6.0-py3.11"

    # CUDA 12.4.1 combinations  
    "12.4.1:2.6.0:3.11:cuda12.4-torch2.6.0-py3.11"
    "12.4.1:2.5.1:3.11:cuda12.4-torch2.5.1-py3.11"
    "12.4.1:2.4.1:3.11:cuda12.4-torch2.4.1-py3.11"
)

# Function to build a single image
build_image() {
    local cuda_version=$1
    local pytorch_version=$2
    local python_version=$3
    local tag_suffix=$4
    
    local pytorch_cuda_version=$(get_pytorch_cuda_version $cuda_version)
    local cuda_image_tag=$(get_cuda_image_tag $cuda_version)
    #if  registry is not specified dont use it in full tag
    if [ -z "$REGISTRY" ]; then
        local full_tag="${IMAGE_NAME}:${tag_suffix}"
    else
        local full_tag="${REGISTRY}/${IMAGE_NAME}:${tag_suffix}"
    fi

    echo "Building image: $full_tag"
    echo "  CUDA: $cuda_version"
    echo "  PyTorch: $pytorch_version"
    echo "  Python: $python_version"
    echo "  PyTorch CUDA: $pytorch_cuda_version"
    
    docker build \
        --build-arg CUDA_VERSION="$cuda_version" \
        --build-arg CUDA_IMAGE_TAG="$cuda_image_tag" \
        --build-arg PYTORCH_VERSION="$pytorch_version" \
        --build-arg PYTORCH_CUDA_VERSION="$pytorch_cuda_version" \
        --build-arg PYTHON_VERSION="$python_version" \
        --build-arg blueglass_repo=https://github.com/jjarquin/blueglass \
        --build-arg blueglass_branch=feature/docker_build \
        --tag "$full_tag" \
        --file Dockerfile.multi \
        .
    
    local build_status=$?
    if [ $build_status -eq 0 ]; then
        echo "✅ Successfully built: $full_tag"
        
        # Also tag as latest if this is the default combination
        if [ "$tag_suffix" == "cuda12.6-torch2.7.1-py3.11" ]; then
            if [ -z "$REGISTRY" ]; then
                local latest_tag="${IMAGE_NAME}:latest"
            else
                local latest_tag="${REGISTRY}/${IMAGE_NAME}:latest"
            fi
            docker tag "$full_tag" "$latest_tag"
            echo "✅ Tagged as latest: $latest_tag"
        fi
        
        return 0
    else
        echo "❌ Failed to build: $full_tag"
        return 1
    fi
}

# Function to build all images
build_all() {
    local failed_builds=()
    local successful_builds=()
    
    echo "Starting multi-version Docker build process..."
    echo "Total combinations to build: ${#VERSION_COMBINATIONS[@]}"
    echo ""
    
    for combination in "${VERSION_COMBINATIONS[@]}"; do
        IFS=':' read -r cuda_version pytorch_version python_version tag_suffix <<< "$combination"
        
        echo "=========================================="
        echo "Building combination: $tag_suffix"
        echo "=========================================="
        
        if build_image "$cuda_version" "$pytorch_version" "$python_version" "$tag_suffix"; then
            successful_builds+=("$tag_suffix")
        else
            failed_builds+=("$tag_suffix")
        fi
        
        echo ""
    done
    
    echo "=========================================="
    echo "Build Summary"
    echo "=========================================="
    echo "Successful builds (${#successful_builds[@]}):"
    for build in "${successful_builds[@]}"; do
        echo "  ✅ $build"
    done
    
    if [ ${#failed_builds[@]} -gt 0 ]; then
        echo ""
        echo "Failed builds (${#failed_builds[@]}):"
        for build in "${failed_builds[@]}"; do
            echo "  ❌ $build"
        done
        echo ""
        echo "Some builds failed. Check the logs above for details."
        return 1
    else
        echo ""
        echo "🎉 All builds completed successfully!"
        return 0
    fi
}

# Function to build a specific combination
build_specific() {
    local target_tag=$1
    
    for combination in "${VERSION_COMBINATIONS[@]}"; do
        IFS=':' read -r cuda_version pytorch_version python_version tag_suffix <<< "$combination"
        
        if [ "$tag_suffix" == "$target_tag" ]; then
            echo "Building specific combination: $target_tag"
            build_image "$cuda_version" "$pytorch_version" "$python_version" "$tag_suffix"
            return $?
        fi
    done
    
    echo "❌ Tag '$target_tag' not found in supported combinations."
    echo "Available tags:"
    for combination in "${VERSION_COMBINATIONS[@]}"; do
        IFS=':' read -r _ _ _ tag_suffix <<< "$combination"
        echo "  - $tag_suffix"
    done
    return 1
}

# Function to list all supported combinations
list_combinations() {
    echo "Supported version combinations:"
    echo "==============================="
    printf "%-30s %-12s %-12s %-8s\n" "Tag" "CUDA" "PyTorch" "Python"
    echo "--------------------------------------------------------------"
    
    # if registry is set 
    if [ -z "$REGISTRY" ]; then
        echo "Registry not set. Using local image names."
        echo "Base Image: ${IMAGE_NAME}:${BASE_TAG}"
    else
        echo "Registry: ${REGISTRY}"
        echo "Base Image: ${REGISTRY}/${IMAGE_NAME}:${BASE_TAG}"
    fi
    echo "--------------------------------------------------------------"

    for combination in "${VERSION_COMBINATIONS[@]}"; do
        IFS=':' read -r cuda_version pytorch_version python_version tag_suffix <<< "$combination"
        printf "%-30s %-12s %-12s %-8s\n" "$tag_suffix" "$cuda_version" "$pytorch_version" "$python_version"
    done
}

# Function to push images to registry
push_all() {
    echo "Pushing all images to registry..."
    
    # avoid push if registry is not defined
    if [ -z "$REGISTRY" ]; then
        echo "❌ No registry defined. Set DOCKER_REGISTRY environment variable."
        return 1
    fi

    for combination in "${VERSION_COMBINATIONS[@]}"; do
        IFS=':' read -r _ _ _ tag_suffix <<< "$combination"
        local full_tag="${REGISTRY}/${IMAGE_NAME}:${tag_suffix}"

        # Check if the image exists before pushing
        if ! docker image inspect "$full_tag" &>/dev/null; then
            echo "❌ Image not found: $full_tag"
            continue
        fi

        # Check if image exist without REGISTRY on it
        if docker image inspect "${IMAGE_NAME}:${tag_suffix}" &>/dev/null; then
            echo "Image found locally: ${IMAGE_NAME}:${tag_suffix}"
            full_tag="${IMAGE_NAME}:${tag_suffix}"
            # ask if want the user wants to use the local base image and tag it for the registry and push it
            read -p "Do you want to tag and push this local image to the registry? (y/n): " use_local
            if [[ "$use_local" =~ ^[Yy]$ ]]; then
                echo "Tagging local image ${IMAGE_NAME}:${tag_suffix} as $full_tag"
                docker tag "${IMAGE_NAME}:${tag_suffix}" "$full_tag"
            else

                echo "Skipping local image ${IMAGE_NAME}:${tag_suffix} for registry push."
                continue
            fi
        fi



        echo "Pushing: $full_tag"
        if docker push "$full_tag"; then
            echo "✅ Pushed: $full_tag"
        else
            echo "❌ Failed to push: $full_tag"
        fi
    done
    
    # Push latest tag if it exists
    local latest_tag="${REGISTRY}/${IMAGE_NAME}:latest"
    if docker image inspect "$latest_tag" &>/dev/null; then
        echo "Pushing: $latest_tag"
        docker push "$latest_tag"
    fi
}

# Main script logic
case "${1:-}" in
    "build-all"|"")
        build_all
        ;;
    "build")
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 build <tag-suffix>"
            echo "Example: $0 build cuda12.6-torch2.7.1-py3.11"
            exit 1
        fi
        build_specific "$2"
        ;;
    "list")
        list_combinations
        ;;
    "push")
        push_all
        ;;
    "help"|"-h"|"--help")
        echo "BlueGlass Multi-Version Docker Builder"
        echo ""
        echo "Usage: $0 [COMMAND] [OPTIONS]"
        echo ""
        echo "Commands:"
        echo "  build-all    Build all supported combinations (default)"
        echo "  build <tag>  Build a specific combination"
        echo "  list         List all supported combinations"
        echo "  push         Push all built images to registry"
        echo "  help         Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  DOCKER_REGISTRY  Registry to push to (default: ghcr.io)"
        echo "  IMAGE_NAME       Image name (default: intellabs/blueglass)"
        echo "  BASE_TAG         Base tag prefix (default: multi)"
        echo ""
        echo "Examples:"
        echo "  $0                                    # Build all combinations"
        echo "  $0 build cuda12.6-torch2.5-py3.11    # Build specific combination"
        echo "  $0 list                               # List all combinations"
        echo "  $0 push                               # Push all images"
        echo ""
        echo "  DOCKER_REGISTRY=my-registry.com $0   # Use custom registry"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information."
        exit 1
        ;;
esac
