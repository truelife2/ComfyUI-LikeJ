import torch
import numpy as np
import base64
import io
import os
import json
from PIL import Image
from server import PromptServer
from aiohttp import web

# 💡 自動定位至 ComfyUI_VNCCS_Utils/PoseLibrary 資料夾
CURRENT_NODE_DIR = os.path.dirname(os.path.realpath(__file__))
CUSTOM_NODES_DIR = os.path.abspath(os.path.join(CURRENT_NODE_DIR, ".."))
POSES_DIR = os.path.join(CUSTOM_NODES_DIR, "ComfyUI_VNCCS_Utils", "PoseLibrary")

# 1. 遞迴掃描 VNCCS 姿態庫所有圖文配對
@PromptServer.instance.routes.get("/likejpose3d/get_library")
async def get_library(request):
    items = []
    if not os.path.exists(POSES_DIR):
        return web.json_response(items)

    for root, dirs, files in os.walk(POSES_DIR):
        json_files = [f for f in files if f.endswith('.json') and f != "repositories.user.json"]
        for jf in json_files:
            base_name = os.path.splitext(jf)[0]
            
            img_file = None
            for ext in ['.webp', '.png', '.jpg', '.jpeg']:
                if f"{base_name}{ext}" in files:
                    img_file = f"{base_name}{ext}"
                    break
            
            rel_root = os.path.relpath(root, POSES_DIR)
            folder_tag = rel_root if rel_root != "." else "根目錄"
            
            items.append({
                "title": base_name,
                "folder": folder_tag,
                "json_path": os.path.relpath(os.path.join(root, jf), POSES_DIR),
                "img_path": os.path.relpath(os.path.join(root, img_file), POSES_DIR) if img_file else None
            })
    return web.json_response(items)

# 2. 讀取縮圖串流
@PromptServer.instance.routes.get("/likejpose3d/get_image")
async def get_image(request):
    rel_path = request.query.get("path", "")
    full_path = os.path.abspath(os.path.join(POSES_DIR, rel_path))
    if full_path.startswith(POSES_DIR) and os.path.exists(full_path):
        return web.FileResponse(full_path)
    return web.Response(status=404)

# 3. 讀取姿態 JSON 內容
@PromptServer.instance.routes.get("/likejpose3d/get_json")
async def get_json(request):
    rel_path = request.query.get("path", "")
    full_path = os.path.abspath(os.path.join(POSES_DIR, rel_path))
    if full_path.startswith(POSES_DIR) and os.path.exists(full_path):
        with open(full_path, "r", encoding="utf-8") as f:
            return web.json_response(json.load(f))
    return web.Response(status=404)


class LikeJPose3d:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
            },
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

        if extra_pnginfo and "workflow" in extra_pnginfo:
            nodes = extra_pnginfo["workflow"].get("nodes", [])
            for node in nodes:
                if str(node.get("id")) == str(unique_id):
                    props = node.get("properties", {})
                    pose_b64 = props.get("pose_b64", "")
                    pose_config = props.get("pose_config", "{}")
                    break

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