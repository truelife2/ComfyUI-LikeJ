import torch
import numpy as np
import base64
import io
import os
import json
from PIL import Image
from server import PromptServer
from aiohttp import web
import json
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

    # 將擴展名改為 .json，如 default.glb -> female_body_base.json
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


@PromptServer.instance.routes.post("/likejpose3d/save_custom_pose")
async def save_custom_pose(request):
    try:
        data = await request.json()
        model_filename = data.get("model_filename", "")  # 例如 default.glb
        pose_name = data.get("pose_name", "").strip()  # 姿態檔名稱 (不含副檔名)
        is_default = data.get("is_default", False)
        config_data = data.get("config", {})
        preview_b64 = data.get("preview_b64", "")  # Base64 圖片數據

        if not model_filename or not pose_name:
            return web.json_response({"success": False, "error": "Missing model_filename or pose_name"}, status=400)

        # 1. 取得模型基礎名稱 (作為子目錄名稱，如 "female_body_base")
        model_folder_name = os.path.splitext(model_filename)[0]

        # 2. 定義姿態儲存根目錄
        base_dir = DEFAULT_MODELS_DIR if is_default else MODELS_DIR
        target_dir = os.path.join(base_dir, model_folder_name)

        # 自動創建以模型名稱為名的目錄
        if not os.path.exists(target_dir):
            os.makedirs(target_dir, exist_ok=True)

        # 3. 儲存 .json 檔案
        json_path = os.path.join(target_dir, f"{pose_name}.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(config_data, f, ensure_ascii=False, indent=2)

        # 4. 儲存 .png 預覽圖
        if preview_b64:
            if "," in preview_b64:
                preview_b64 = preview_b64.split(",")[1]
            img_bytes = base64.b64decode(preview_b64)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

            png_path = os.path.join(target_dir, f"{pose_name}.png")
            img.save(png_path, format="PNG")

        return web.json_response({"success": True, "pose_name": pose_name, "folder": model_folder_name})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/likejpose3d/list_saved_poses")
async def list_saved_poses(request):
    """搜尋 models 目錄下所有以模型命名的子資料夾，收集裡面的姿態配置與圖片"""
    try:
        poses = []
        search_dirs = [("default", DEFAULT_MODELS_DIR), ("custom", MODELS_DIR)]

        for dir_type, base_dir in search_dirs:
            if not os.path.exists(base_dir):
                continue

            # 遍歷模型子資料夾
            for folder_name in os.listdir(base_dir):
                folder_path = os.path.join(base_dir, folder_name)
                if os.path.isdir(folder_path):
                    # 搜尋裡面的 .json 姿態檔
                    for file_name in os.listdir(folder_path):
                        if file_name.endswith(".json") and not file_name.endswith("_default.json"):
                            pose_id = os.path.splitext(file_name)[0]
                            png_name = f"{pose_id}.png"
                            has_preview = os.path.exists(os.path.join(folder_path, png_name))

                            poses.append(
                                {
                                    "model_folder": folder_name,
                                    "pose_name": pose_id,
                                    "is_default": (dir_type == "default"),
                                    "json_file": file_name,
                                    "has_preview": has_preview,
                                    "preview_url": f"/likejpose3d/get_pose_file?folder={folder_name}&file={png_name}&is_default={str(dir_type == 'default').lower()}" if has_preview else None,
                                    "json_url": f"/likejpose3d/get_pose_file?folder={folder_name}&file={file_name}&is_default={str(dir_type == 'default').lower()}",
                                }
                            )

        return web.json_response({"success": True, "poses": poses})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/likejpose3d/get_pose_file")
async def get_pose_file(request):
    """獲取特定姿態的 json 或 png 檔案"""
    try:
        folder = request.query.get("folder", "")
        file_name = request.query.get("file", "")
        is_default = request.query.get("is_default", "false").lower() == "true"

        base_dir = DEFAULT_MODELS_DIR if is_default else MODELS_DIR
        file_path = os.path.join(base_dir, folder, file_name)

        if not os.path.exists(file_path):
            return web.Response(status=404)

        return web.FileResponse(file_path)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.post("/likejpose3d/delete_pose")
async def delete_pose(request):
    """刪除指定的姿態 .json 檔與對應的 .png 預覽圖"""
    try:
        data = await request.json()
        folder = data.get("folder", "")
        pose_name = data.get("pose_name", "")
        is_default = data.get("is_default", False)

        if not folder or not pose_name:
            return web.json_response({"success": False, "error": "Missing folder or pose_name"}, status=400)

        base_dir = DEFAULT_MODELS_DIR if is_default else MODELS_DIR
        target_dir = os.path.realpath(os.path.join(base_dir, folder))
        real_base_dir = os.path.realpath(base_dir)

        # 安全檢查：確保路徑不會超出目標目錄
        if not target_dir.startswith(real_base_dir):
            return web.json_response({"success": False, "error": "Forbidden path"}, status=403)

        json_path = os.path.join(target_dir, f"{pose_name}.json")
        png_path = os.path.join(target_dir, f"{pose_name}.png")

        deleted = False
        if os.path.exists(json_path):
            os.remove(json_path)
            deleted = True
        if os.path.exists(png_path):
            os.remove(png_path)

        if deleted:
            return web.json_response({"success": True, "pose_name": pose_name})
        else:
            return web.json_response({"success": False, "error": "Pose file not found"}, status=404)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


import shutil  # 請確保檔案頂部有匯入 shutil


@PromptServer.instance.routes.post("/likejpose3d/delete_model")
async def delete_model(request):
    """刪除自訂模型檔 (.glb/.gltf)、初始姿態檔 (.json) 以及同名的姿態資料夾與檔案"""
    try:
        data = await request.json()
        filename = data.get("filename", "")
        is_default = data.get("is_default", False)

        if not filename:
            return web.json_response({"success": False, "error": "No filename provided"}, status=400)

        # 1. 安全檢查：預設模型禁止刪除
        if is_default:
            return web.json_response({"success": False, "error": "Cannot delete default model"}, status=403)

        real_models_dir = os.path.realpath(MODELS_DIR)
        target_path = os.path.realpath(os.path.join(MODELS_DIR, filename))

        # 路徑與權限檢查
        if not target_path.startswith(real_models_dir) or not os.path.exists(target_path):
            return web.json_response({"success": False, "error": "File not found or access denied"}, status=404)

        base_name = os.path.splitext(filename)[0]

        # 2. 刪除模型主檔 (.glb / .gltf)
        os.remove(target_path)

        # 3. 刪除模型對應的初始姿態 JSON 檔 (例如 filename.json)
        default_json_path = os.path.join(MODELS_DIR, f"{base_name}.json")
        if os.path.exists(default_json_path):
            os.remove(default_json_path)

        # 4. 刪除模型專屬的姿態資料夾及其內部所有檔案 (例如 /models/filename/)
        pose_folder_path = os.path.join(MODELS_DIR, base_name)
        if os.path.exists(pose_folder_path) and os.path.isdir(pose_folder_path):
            shutil.rmtree(pose_folder_path)

        return web.json_response({"success": True, "filename": filename})
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
