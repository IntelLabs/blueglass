# Copyright 2025 Intel Corporation
# SPDX: Apache-2.0

import nvtx
from typing import List, Dict, Any
import torch
from transformers import AutoProcessor, AutoModelForCausalLM
from transformers.image_utils import load_image
from blueglass.third_party.detectron2.structures import Instances, Boxes
from blueglass.structures.descriptions import Descriptions
from blueglass.configs import BLUEGLASSConf

from .base import HFModel


TOKEN_LIMIT = 1024


class Florence(HFModel):
    def __init__(self, conf: BLUEGLASSConf):
        super().__init__(conf)
        self.args = conf
        self.hf_id = "microsoft/Florence-2-base-ft"
        self.procr = AutoProcessor.from_pretrained(self.hf_id, trust_remote_code=True)
        self.model = (
            AutoModelForCausalLM.from_pretrained(
                self.hf_id, torch_dtype=torch.float32, trust_remote_code=True
            )
            .to(self.device)
            .eval()
        )
        self.use_nsight = conf.runner.use_nsight
        self.use_nsight = True
        self.task = "<OD>"
        self.prompt = self.task

    def preprocess(self, inputs: Dict[str, Any]):
        del inputs["image"]
        return load_image(inputs["file_name"])

    @torch.inference_mode()
    def forward(self, batched_inputs: List[Dict[str, Any]]):
        if self.use_nsight:
            return self.forward_with_profiling(batched_inputs)
        return self.forward_core(batched_inputs)

    @torch.inference_mode()
    def forward_core(self, batched_inputs: List[Dict[str, Any]]):
        assert len(batched_inputs) == 1, "HF models only support batch size 1."
        inputs = batched_inputs[0]
        im = self.preprocess(inputs)
        proc_input = self.procr(text=self.prompt, images=im, return_tensors="pt").to(
            device=self.device
        )

        batched_outputs = self.model.generate(
            **proc_input,
            max_new_tokens=TOKEN_LIMIT,
            do_sample=False,
            num_beams=3,
        )

        response = self.procr.batch_decode(
            batched_outputs, skip_special_tokens=False
        )[0]
        response = self.procr.post_process_generation(
            response, task=self.task, image_size=(inputs["width"], inputs["height"])
        )

        return [self.postprocess(inputs, response[self.task])]

    @torch.inference_mode()
    def forward_with_profiling(self, batched_inputs: List[Dict[str, Any]]):
        with nvtx.annotate("Florence/Forward", color="blue"):
            assert len(batched_inputs) == 1
            inputs = batched_inputs[0]

            with nvtx.annotate("Preprocessing"):
                im = self.preprocess(inputs)

            with nvtx.annotate("Processor Encoding"):
                proc_input = self.procr(text=self.prompt, images=im, return_tensors="pt").to(self.device)

            with nvtx.annotate("Model Generate"):
                batched_outputs = self.model.generate(
                    **proc_input,
                    max_new_tokens=TOKEN_LIMIT,
                    do_sample=False,
                    num_beams=3,
                    return_dict_in_generate=True,
                )

            with nvtx.annotate("Post Decode"):
                response = self.procr.batch_decode(batched_outputs.sequences, skip_special_tokens=False)[0]

            with nvtx.annotate("Post Process"):
                response = self.procr.post_process_generation(
                    response, task=self.task, image_size=(inputs["width"], inputs["height"])
                )

            with nvtx.annotate("Postprocessing Final"):
                return [self.postprocess(inputs, response[self.task])]
        
    def register_features(self, hidden_states):
        pass

    def postprocess(self, inputs: Dict[str, Any], response: Dict[str, Any]):
        im_h, im_w = inputs["height"], inputs["width"]

        boxes = Boxes(torch.tensor(response["bboxes"], device=self.device))
        clses = Descriptions(response["labels"])

        return {
            "instances": Instances(
                (im_h, im_w),
                pred_boxes=boxes,
                pred_object_descriptions=clses,
                scores=torch.ones(len(boxes), dtype=torch.float, device=self.device),
            )
        }
