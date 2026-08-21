import torch
import numpy as np
from PIL import Image
import base64
import io

class LikeJPose3d:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "width": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 8}),
                "height": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 8}),
            },
            "hidden": {
                "pose_b64": "STRING",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("pose_image",)
    FUNCTION = "generate_pose"
    CATEGORY = "LikeJ"

    def generate_pose(self, width, height, pose_b64=""):
        if not pose_b64 or pose_b64.strip() == "":
            empty_image = np.zeros((height, width, 3), dtype=np.float32)
            return (torch.from_numpy(empty_image).unsqueeze(0),)

        if pose_b64.startswith("data:image"):
            pose_b64 = pose_b64.split(",")[1]
            
        image_data = base64.b64decode(pose_b64)
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        image = image.resize((width, height), Image.LANCZOS)
        
        image_np = np.array(image).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np).unsqueeze(0)
        
        return (image_tensor,)