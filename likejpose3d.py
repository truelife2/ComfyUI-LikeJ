import torch
import numpy as np
import base64
import io
import os
import json
from PIL import Image
from server import PromptServer
from aiohttp import web

CURRENT_NODE_DIR = os.path.dirname(os.path.realpath(__file__))
CUSTOM_NODES_DIR = os.path.abspath(os.path.join(CURRENT_NODE_DIR, ".."))

MODELS_DIR = os.path.join(CURRENT_NODE_DIR, "models")
if not os.path.exists(MODELS_DIR):
    os.makedirs(MODELS_DIR)

DEFAULT_MODELS_DIR = os.path.join(CURRENT_NODE_DIR, "web/models")


@PromptServer.instance.routes.get("/likejpose3d/get_models")
async def get_models(request):
    items = []

    # A. 掃描插件根目錄下的預設 GLB/GLTF（可放多個內建預設模型）
    if os.path.exists(DEFAULT_MODELS_DIR):
        default_files = [f for f in os.listdir(DEFAULT_MODELS_DIR) if f.endswith((".glb", ".gltf"))]
        for f in default_files:
            items.append({"name": f, "is_default": True, "label": f"[Default] {f}"})

    # B. 掃描 models 資料夾（支援 mklink）
    real_models_dir = os.path.realpath(MODELS_DIR)
    if os.path.exists(real_models_dir):
        user_files = [f for f in os.listdir(real_models_dir) if f.endswith((".glb", ".gltf"))]
        for f in user_files:
            items.append({"name": f, "is_default": False, "label": f})

    return web.json_response(items)


@PromptServer.instance.routes.post("/likejpose3d/upload_model")
async def upload_model(request):
    reader = await request.multipart()
    field = await reader.next()
    if field.name == "file":
        filename = field.filename
        file_path = os.path.join(MODELS_DIR, filename)
        with open(file_path, "wb") as f:
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                f.write(chunk)
        return web.json_response({"success": True, "filename": filename})
    return web.json_response({"success": False, "error": "No file uploaded"})


@PromptServer.instance.routes.get("/likejpose3d/get_model_file")
async def get_model_file(request):
    filename = request.query.get("filename", "")
    is_default = request.query.get("is_default", "false").lower() in ["true", "1"]

    if not filename:
        return web.Response(status=400)

    if is_default:
        target_path = os.path.join(DEFAULT_MODELS_DIR, filename)
    else:
        real_models_dir = os.path.realpath(MODELS_DIR)
        target_path = os.path.realpath(os.path.join(MODELS_DIR, filename))
        if not target_path.startswith(real_models_dir):
            return web.Response(status=403)

    if os.path.exists(target_path):
        return web.FileResponse(target_path)
    return web.Response(status=404)


@PromptServer.instance.routes.get("/likejpose3d/get_default_pose")
async def get_default_pose(request):
    filename = request.query.get("filename", "")
    is_default = request.query.get("is_default", "false").lower() in ["true", "1"]

    if not filename:
        return web.json_response({"success": False, "error": "No filename provided"}, status=400)

    # 將擴展名改為 .json，如 female_body_base.glb -> female_body_base.json
    base_name = os.path.splitext(filename)[0]
    json_filename = f"{base_name}.json"

    if is_default:
        target_path = os.path.join(DEFAULT_MODELS_DIR, json_filename)
    else:
        real_models_dir = os.path.realpath(MODELS_DIR)
        target_path = os.path.realpath(os.path.join(MODELS_DIR, json_filename))
        if not target_path.startswith(real_models_dir):
            return web.Response(status=403)

    if os.path.exists(target_path):
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return web.json_response({"success": True, "exists": True, "config": data})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    return web.json_response({"success": True, "exists": False})


@PromptServer.instance.routes.post("/likejpose3d/save_default_pose")
async def save_default_pose(request):
    try:
        data = await request.json()
        filename = data.get("filename", "")
        is_default = data.get("is_default", False)
        config_data = data.get("config", {})

        if not filename:
            return web.json_response({"success": False, "error": "No filename provided"}, status=400)

        base_name = os.path.splitext(filename)[0]
        json_filename = f"{base_name}.json"

        if is_default:
            target_path = os.path.join(DEFAULT_MODELS_DIR, json_filename)
        else:
            target_path = os.path.join(MODELS_DIR, json_filename)

        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(config_data, f, ensure_ascii=False, indent=2)

        return web.json_response({"success": True, "filename": json_filename})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


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
            },
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
                print(f"[LikeJPose3d] Failed to decode the Base64 data: {e}")
                img = Image.new("RGB", (width, height), (0, 0, 0))
        else:
            img = Image.new("RGB", (width, height), (0, 0, 0))

        img_np = np.array(img).astype(np.float32) / 255.0
        img_tensor = torch.from_numpy(img_np)[None, ...]

        return (img_tensor, pose_config)
