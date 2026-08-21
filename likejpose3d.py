import torch
import numpy as np
import base64
import io
from PIL import Image

class LikeJPose3d:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
            },
            # 💡 官方隱藏傳輸機制，前端完全不會生成任何 DOM 欄位
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("IMAGE", "pose_config")
    FUNCTION = "generate"
    CATEGORY = "LikeJ"

    def generate(self, width, height, prompt=None, extra_pnginfo=None, unique_id=None):
        pose_b64 = ""
        pose_config = "{}"

        # 從工作流隱藏資訊中讀取前端寫入的 node.properties
        if extra_pnginfo and "workflow" in extra_pnginfo:
            nodes = extra_pnginfo["workflow"].get("nodes", [])
            for node in nodes:
                if str(node.get("id")) == str(unique_id):
                    props = node.get("properties", {})
                    pose_b64 = props.get("pose_b64", "")
                    pose_config = props.get("pose_config", "{}")
                    break

        # 解碼 Base64 圖片
        if pose_b64 and "," in pose_b64:
            pose_b64 = pose_b64.split(",")[1]

        if pose_b64:
            try:
                img_bytes = base64.b64decode(pose_b64)
                img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                img = img.resize((width, height), Image.Resampling.LANCZOS)
            except Exception as e:
                print(f"[LikeJPose3d] Base64 解碼失敗: {e}")
                img = Image.new("RGB", (width, height), (0, 0, 0))
        else:
            img = Image.new("RGB", (width, height), (0, 0, 0))

        img_np = np.array(img).astype(np.float32) / 255.0
        img_tensor = torch.from_numpy(img_np)[None, ...]

        return (img_tensor, pose_config)
