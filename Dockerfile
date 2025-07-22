FROM nvidia/cuda:12.6.3-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Europe/Berlin

# Needed to compile custom PyTorch extensions with CUDA support
ENV FORCE_CUDA=1

# Set CUDA environment variables
ENV CUDA_HOME=/usr/local/cuda
ENV TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9;9.0"
ENV PATH=/usr/local/cuda-12.6/bin${PATH:+:${PATH}}
ENV LD_LIBRARY_PATH=/usr/local/cuda-12.6/lib64${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}

# Blueglass project environment variables
ENV PROJECT_ROOT=/home/tools/blueglass
ENV BENCHMARK_ROOT=/home/tools/blueglass/blueglass/modeling/modelstore
ENV THIRD_PARTY_ROOT=/home/tools/blueglass/blueglass/third_party

# software-properties-common ca-certificates required for adding PPA
RUN apt-get update && apt-get install --no-install-recommends -y git curl wget \
      software-properties-common ca-certificates \
      environment-modules libgeos-dev build-essential cmake \
      vim nano tree less emacs tmux gdb && rm -rf /var/lib/apt/lists/*

# Install Python 3.11 from deadsnakes PPA, the standard python3.11 available in ubuntu produces a segfault
RUN add-apt-repository ppa:deadsnakes/ppa && apt-get update && \
    apt-get install -y --no-install-recommends python3.11 python3.11-dev python3.11-distutils python3.11-venv && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/tools

RUN python3.11 -m venv /home/tools/env && . /home/tools/env/bin/activate \
    && python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel

RUN . /home/tools/env/bin/activate && python -m pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126

ARG blueglass_repo=https://github.com/IntelLabs/blueglass
ARG blueglass_branch=main

RUN git clone --depth 1 --branch ${blueglass_branch} ${blueglass_repo} ${PROJECT_ROOT}

RUN . /home/tools/env/bin/activate && python3 -m pip install --no-cache-dir -r ${PROJECT_ROOT}/requirements.txt

RUN git clone --depth 1 --branch master https://github.com/ppwwyyxx/cocoapi.git /home/tools/cocoapi
RUN . /home/tools/env/bin/activate && python3 -m pip install --no-cache-dir /home/tools/cocoapi/PythonAPI

RUN git clone --depth 1 --branch master https://github.com/lvis-dataset/lvis-api.git ${THIRD_PARTY_ROOT}/lvis
RUN . /home/tools/env/bin/activate && python3 -m pip install --no-cache-dir ${THIRD_PARTY_ROOT}/lvis

RUN . /home/tools/env/bin/activate && python3 -m pip install --no-cache-dir ${THIRD_PARTY_ROOT}/scalabel

# Prepare GenerateU environment
RUN set -e \
    && echo "Prepare GenerateU environment." \
    && rm -rf "$BENCHMARK_ROOT/generateu/projects/DDETRS/ddetrs/models/deformable_detr/ops/MultiScaleDeformableAttention.egg-info" \
    && rm -rf "$BENCHMARK_ROOT/generateu/projects/DDETRS/ddetrs/models/deformable_detr/ops/build" \
    && rm -rf "$BENCHMARK_ROOT/generateu/projects/DDETRS/ddetrs/models/deformable_detr/ops/dist" \
    && rm -rf "$BENCHMARK_ROOT/generateu/build" \
    && rm -rf "$BENCHMARK_ROOT/generateu/detectron2.egg-info" \
    && . /home/tools/env/bin/activate \
    && pip install --no-cache-dir "$BENCHMARK_ROOT/generateu" \
    && cd "$BENCHMARK_ROOT/generateu/projects/DDETRS/ddetrs/models/deformable_detr/ops/" \
    && bash make.sh \
    && cd "$PROJECT_ROOT" \
    && echo "Done."

# Prepare Grounding DINO environment.
RUN set -e \
    && echo "Prepare Grounding DINO environment." \
    && rm -rf "${BENCHMARK_ROOT}/grounding_dino/build" \
    && rm -rf "${BENCHMARK_ROOT}/grounding_dino/groundingdino.egg-info" \
    && . /home/tools/env/bin/activate \
    && pip install --no-cache-dir "${BENCHMARK_ROOT}/grounding_dino" \
    && echo "Done."

# Prepare MMDET environment.
# Optionally mmcv==2.1.0 can be installed, which doesn't require updating mmdetection's __init__.py
RUN . /home/tools/env/bin/activate && python3 -m pip install --no-cache-dir openmim  && mim install mmengine mmcv==2.2.0

RUN git clone --depth 1 --branch main https://github.com/open-mmlab/mmdetection.git ${THIRD_PARTY_ROOT}/mmdet && sed -i 's/mmcv_version < digit_version(mmcv_maximum_version))/mmcv_version <= digit_version(mmcv_maximum_version))/' "${THIRD_PARTY_ROOT}/mmdet/mmdet/__init__.py"
RUN . /home/tools/env/bin/activate && python3 -m pip install --no-cache-dir ${THIRD_PARTY_ROOT}/mmdet

# Install blueglass
RUN . /home/tools/env/bin/activate && python3 -m pip install --no-cache-dir -e /home/tools/blueglass

# opencv-python requires libGL.so.1, which is not available in the base image.
# uninstall opencv-python and opencv-python-headless, reinstall opencv-python-headless
RUN . /home/tools/env/bin/activate && python3 -m pip uninstall -y opencv-python opencv-python-headless && python3 -m pip install --no-cache-dir opencv-python-headless

RUN echo "source /home/tools/env/bin/activate" >> /root/.bashrc

COPY entrypoint.sh /entrypoint.sh

WORKDIR /home/tools/blueglass

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]