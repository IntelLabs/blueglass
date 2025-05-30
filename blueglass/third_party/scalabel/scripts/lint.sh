# Copyright 2025 Intel Corporation
# SPDX: Apache-2.0

#!/bin/bash

python3 -m black scalabel
python3 -m isort scalabel
python3 -m pylint scalabel
python3 -m pydocstyle scalabel
python3 -m mypy --strict --show-error-codes --allow-untyped-calls scalabel
