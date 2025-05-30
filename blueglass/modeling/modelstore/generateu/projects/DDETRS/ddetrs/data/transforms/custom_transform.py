# Copyright 2025 Intel Corporation
# SPDX: Apache-2.0

# -*- coding: utf-8 -*-
# Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved
# Part of the code is from https://github.com/rwightman/efficientdet-pytorch/blob/master/effdet/data/transforms.py
# Modified by Xingyi Zhou
# The original code is under Apache-2.0 License
import numpy as np
import torch
import torch.nn.functional as F
from fvcore.transforms.transform import (
    Transform,
)
from PIL import Image

try:
    import cv2  # noqa
except ImportError:
    # OpenCV is an optional dependency at the moment
    pass

__all__ = [
    "EfficientDetResizeCropTransform",
]


class EfficientDetResizeCropTransform(Transform):
    """ """

    def __init__(
        self,
        scaled_h,
        scaled_w,
        offset_y,
        offset_x,
        img_scale,
        target_size,
        interp=None,
    ):
        """
        Args:
            h, w (int): original image size
            new_h, new_w (int): new image size
            interp: PIL interpolation methods, defaults to bilinear.
        """
        # TODO decide on PIL vs opencv
        super().__init__()
        if interp is None:
            interp = Image.BILINEAR
        self._set_attributes(locals())

    def apply_image(self, img, interp=None):
        assert len(img.shape) <= 4

        if img.dtype == np.uint8:
            pil_image = Image.fromarray(img)
            interp_method = interp if interp is not None else self.interp
            pil_image = pil_image.resize((self.scaled_w, self.scaled_h), interp_method)
            ret = np.asarray(pil_image)
            right = min(self.scaled_w, self.offset_x + self.target_size[1])
            lower = min(self.scaled_h, self.offset_y + self.target_size[0])
            if len(ret.shape) <= 3:
                ret = ret[self.offset_y : lower, self.offset_x : right]
            else:
                ret = ret[..., self.offset_y : lower, self.offset_x : right, :]
        else:
            # PIL only supports uint8
            img = torch.from_numpy(img)
            shape = list(img.shape)
            shape_4d = shape[:2] + [1] * (4 - len(shape)) + shape[2:]
            img = img.view(shape_4d).permute(2, 3, 0, 1)  # hw(c) -> nchw
            _PIL_RESIZE_TO_INTERPOLATE_MODE = {
                Image.BILINEAR: "bilinear",
                Image.BICUBIC: "bicubic",
            }
            mode = _PIL_RESIZE_TO_INTERPOLATE_MODE[self.interp]
            img = F.interpolate(
                img, (self.scaled_h, self.scaled_w), mode=mode, align_corners=False
            )
            shape[:2] = (self.scaled_h, self.scaled_w)
            ret = img.permute(2, 3, 0, 1).view(shape).numpy()  # nchw -> hw(c)
            right = min(self.scaled_w, self.offset_x + self.target_size[1])
            lower = min(self.scaled_h, self.offset_y + self.target_size[0])
            if len(ret.shape) <= 3:
                ret = ret[self.offset_y : lower, self.offset_x : right]
            else:
                ret = ret[..., self.offset_y : lower, self.offset_x : right, :]
        return ret

    def apply_coords(self, coords):
        coords[:, 0] = coords[:, 0] * self.img_scale
        coords[:, 1] = coords[:, 1] * self.img_scale
        coords[:, 0] -= self.offset_x
        coords[:, 1] -= self.offset_y
        return coords

    def apply_segmentation(self, segmentation):
        segmentation = self.apply_image(segmentation, interp=Image.NEAREST)
        return segmentation

    def inverse(self):
        raise NotImplementedError

    def inverse_apply_coords(self, coords):
        coords[:, 0] += self.offset_x
        coords[:, 1] += self.offset_y
        coords[:, 0] = coords[:, 0] / self.img_scale
        coords[:, 1] = coords[:, 1] / self.img_scale
        return coords

    def inverse_apply_box(self, box: np.ndarray) -> np.ndarray:
        """ """
        idxs = np.array([(0, 1), (2, 1), (0, 3), (2, 3)]).flatten()
        coords = np.asarray(box).reshape(-1, 4)[:, idxs].reshape(-1, 2)
        coords = self.inverse_apply_coords(coords).reshape((-1, 4, 2))
        minxy = coords.min(axis=1)
        maxxy = coords.max(axis=1)
        trans_boxes = np.concatenate((minxy, maxxy), axis=1)
        return trans_boxes
