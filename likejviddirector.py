import os
import json
import shutil
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths
from server import PromptServer
from aiohttp import web
import cv2

try:
    import torchaudio
    HAS_TORCHAUDIO = True
except ImportError:
    HAS_TORCHAUDIO = False

# 設定記錄器與常數
PROJECTS_BASE_DIR = os.path.join(folder_paths.get_output_directory(), "likej_projects")
VIDEO_EXTENSIONS = ('.mp4', '.webm', '.mkv', '.mov', '.avi')


# ==========================================
# Item 路徑解析與格式化輔助函式
# ==========================================
def parse_item_info(file_item: Union[str, Dict[str, Any]], default_type: str = "input") -> Tuple[str, str, str]:
    """統一解析 item (支援字串或 Dict 格式)，回傳 (filename, subfolder, folder_type)"""
    if not file_item:
        return "", "", default_type
    
    if isinstance(file_item, str):
        return file_item, "", default_type

    filename = file_item.get("filename") or file_item.get("name") or ""
    subfolder = file_item.get("subfolder", "")
    folder_type = file_item.get("type", default_type)
    return filename, subfolder, folder_type


def make_item_dict(filename: str, subfolder: str = "", folder_type: str = "output") -> Dict[str, str]:
    """統一建立標準化 item 字典，同時包含 filename 與 name 以保證前後端相容"""
    return {
        "filename": filename,
        "name": filename,
        "subfolder": subfolder,
        "type": folder_type
    }


def resolve_source_filepath(file_item: Union[str, Dict[str, Any]], default_type: str = "input") -> Optional[str]:
    """解析檔案實體路徑 (支援字串或 Dict 格式，自動跨 input/output/temp 尋找)"""
    if not file_item:
        return None

    filename, subfolder, folder_type = parse_item_info(file_item, default_type=default_type)
    if not filename:
        return None

    if folder_type == "input":
        base_dir = folder_paths.get_input_directory()
    elif folder_type == "temp":
        base_dir = folder_paths.get_temp_directory()
    else:
        base_dir = folder_paths.get_output_directory()

    target_path = os.path.join(base_dir, subfolder, filename) if subfolder else os.path.join(base_dir, filename)
    if os.path.exists(target_path):
        return target_path

    # 備用檢索 (防止檔案類型標示不一致)
    for search_base in [folder_paths.get_input_directory(), folder_paths.get_output_directory(), folder_paths.get_temp_directory()]:
        test_p = os.path.join(search_base, subfolder, filename) if subfolder else os.path.join(search_base, filename)
        if os.path.exists(test_p):
            return test_p

    return None


# ==========================================
# API 1：掃描 input/output 目錄中的影片檔案
# ==========================================
@PromptServer.instance.routes.get("/likej/list_videos")
async def list_videos(request):
    folder_type = request.query.get("type", "output")
    if folder_type == "input":
        base_dir = folder_paths.get_input_directory()
    else:
        base_dir = folder_paths.get_output_directory()

    files_list = []

    if os.path.exists(base_dir):
        for root, _, files in os.walk(base_dir):
            for f in files:
                if f.lower().endswith(VIDEO_EXTENSIONS):
                    full_path = os.path.join(root, f)
                    rel_path = os.path.relpath(full_path, base_dir)
                    subfolder = os.path.dirname(rel_path)
                    filename = os.path.basename(rel_path)
                    mtime = os.path.getmtime(full_path)
                    item_dict = make_item_dict(
                        filename=filename,
                        subfolder="" if subfolder == "." else subfolder,
                        folder_type=folder_type
                    )
                    item_dict["mtime"] = mtime
                    files_list.append(item_dict)

    files_list.sort(key=lambda x: x["mtime"], reverse=True)
    return web.json_response(files_list)


# ==========================================
# API 2：從指定影片中擷取首幀 (first) 或尾幀 (last)
# ==========================================
@PromptServer.instance.routes.post("/likej/extract_frame")
async def extract_frame(request):
    try:
        data = await request.json()
        position = data.get("position", "last")
        filename, subfolder, folder_type = parse_item_info(data, default_type="output")

        video_path = resolve_source_filepath(data, default_type=folder_type)

        if not video_path or not os.path.exists(video_path):
            return web.json_response({"success": False, "error": f"影片檔案不存在: {filename}"}, status=400)

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return web.json_response({"success": False, "error": "無法開啟並讀取影片檔案"}, status=400)

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            return web.json_response({"success": False, "error": "影片總幀數無效或為 0"}, status=400)

        target_frame = total_frames - 1 if position == "last" else 0
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            return web.json_response({"success": False, "error": f"無法擷取影片第 {target_frame} 幀"}, status=400)

        input_dir = folder_paths.get_input_directory()
        clean_name = os.path.splitext(os.path.basename(filename))[0]
        out_filename = f"frame_{clean_name}_{position}_{target_frame}.png"
        out_filepath = os.path.join(input_dir, out_filename)

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(frame_rgb)
        img.save(out_filepath)

        return web.json_response({
            "success": True,
            "image": make_item_dict(out_filename, subfolder="", folder_type="input")
        })
    except Exception as e:
        print(f"[LikeJVideoDirector] 抽幀 API 處理失敗: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)


# ==========================================
# API 3：取得專案列表
# ==========================================
@PromptServer.instance.routes.get("/likej/list_projects")
async def list_projects(request):
    os.makedirs(PROJECTS_BASE_DIR, exist_ok=True)
    proj_list = []
    
    for item in os.listdir(PROJECTS_BASE_DIR):
        item_path = os.path.join(PROJECTS_BASE_DIR, item)
        json_path = os.path.join(item_path, "project.json")
        if os.path.isdir(item_path) and os.path.exists(json_path):
            mtime = os.path.getmtime(json_path)
            proj_list.append({
                "name": item,
                "mtime": mtime
            })

    proj_list.sort(key=lambda x: x["mtime"], reverse=True)
    return web.json_response(proj_list)


# ==========================================
# API 4：匯出專案 (複製所有圖片/音訊/影片並儲存 JSON)
# ==========================================
@PromptServer.instance.routes.post("/likej/export_project")
async def export_project(request):
    try:
        data = await request.json()
        proj_name = data.get("project_name", "").strip()
        scenes_data = data.get("scenes_data", {})

        if not proj_name:
            return web.json_response({"success": False, "error": "專案名稱不可為空"}, status=400)

        # 清理不合法檔名字元
        clean_proj_name = "".join(c for c in proj_name if c.isalnum() or c in ('_', '-', ' ')).strip()
        if not clean_proj_name:
            return web.json_response({"success": False, "error": "專案名稱包含不合法字元"}, status=400)

        proj_dir = os.path.join(PROJECTS_BASE_DIR, clean_proj_name)
        img_dir = os.path.join(proj_dir, "images")
        audio_dir = os.path.join(proj_dir, "audios")
        video_dir = os.path.join(proj_dir, "videos")

        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(audio_dir, exist_ok=True)
        os.makedirs(video_dir, exist_ok=True)

        subfolder_rel = f"likej_projects/{clean_proj_name}"

        scenes = scenes_data.get("scenes", [])
        for scene in scenes:
            # 1. 複製圖片
            new_images = []
            for img_item in scene.get("images", []):
                src_p = resolve_source_filepath(img_item, default_type="output")
                fname, _, _ = parse_item_info(img_item)
                if src_p and os.path.exists(src_p):
                    fname = os.path.basename(src_p)
                    dest_p = os.path.join(img_dir, fname)
                    if os.path.abspath(src_p) != os.path.abspath(dest_p):
                        shutil.copy2(src_p, dest_p)
                
                if fname:
                    new_images.append(make_item_dict(fname, f"{subfolder_rel}/images", "output"))
            scene["images"] = new_images

            # 2. 複製音訊
            new_audios = []
            for audio_item in scene.get("audios", []):
                src_p = resolve_source_filepath(audio_item, default_type="output")
                fname, _, _ = parse_item_info(audio_item)
                if src_p and os.path.exists(src_p):
                    fname = os.path.basename(src_p)
                    dest_p = os.path.join(audio_dir, fname)
                    if os.path.abspath(src_p) != os.path.abspath(dest_p):
                        shutil.copy2(src_p, dest_p)

                if fname:
                    new_audios.append(make_item_dict(fname, f"{subfolder_rel}/audios", "output"))
            scene["audios"] = new_audios

            # 3. 複製影片
            new_videos = []
            for vid_item in scene.get("videos", []):
                src_p = resolve_source_filepath(vid_item, default_type="output")
                fname, _, _ = parse_item_info(vid_item)
                if src_p and os.path.exists(src_p):
                    fname = os.path.basename(src_p)
                    dest_p = os.path.join(video_dir, fname)
                    if os.path.abspath(src_p) != os.path.abspath(dest_p):
                        shutil.copy2(src_p, dest_p)

                if fname:
                    new_videos.append(make_item_dict(fname, f"{subfolder_rel}/videos", "output"))
            scene["videos"] = new_videos

            if scene.get("video"):
                sel_idx = scene.get("selected_video_idx", 0)
                if 0 <= sel_idx < len(scene["videos"]):
                    scene["video"] = scene["videos"][sel_idx]
                elif len(scene["videos"]) > 0:
                    scene["video"] = scene["videos"][0]
                else:
                    scene["video"] = None

        # 儲存 project.json
        project_json_path = os.path.join(proj_dir, "project.json")
        with open(project_json_path, "w", encoding="utf-8") as f:
            json.dump(scenes_data, f, ensure_ascii=False, indent=2)

        return web.json_response({
            "success": True,
            "project_name": clean_proj_name,
            "scenes_data": scenes_data
        })

    except Exception as e:
        print(f"[LikeJVideoDirector] 匯出專案失敗: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)


# ==========================================
# API 5：載入指定專案 JSON
# ==========================================
@PromptServer.instance.routes.get("/likej/load_project")
async def load_project(request):
    try:
        proj_name = request.query.get("project_name", "").strip()
        if not proj_name:
            return web.json_response({"success": False, "error": "未提供專案名稱"}, status=400)

        project_json_path = os.path.join(PROJECTS_BASE_DIR, proj_name, "project.json")
        if not os.path.exists(project_json_path):
            return web.json_response({"success": False, "error": f"找不到專案檔案: {proj_name}"}, status=404)

        with open(project_json_path, "r", encoding="utf-8") as f:
            scenes_data = json.load(f)

        return web.json_response({
            "success": True,
            "project_name": proj_name,
            "scenes_data": scenes_data
        })
    except Exception as e:
        print(f"[LikeJVideoDirector] 載入專案失敗: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)


class LikeJVideoDirector:
    """
    ComfyUI Video Director Node (No inputs, driven by hidden extra_info)
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "STRING", "DICT", "FLOAT")
    RETURN_NAMES = ("images", "audios", "prompt", "dict_params", "duration")

    OUTPUT_IS_LIST = (True, True, False, False, False)

    FUNCTION = "process"
    CATEGORY = "LikeJ/Video"

    def _parse_value(self, val_str, val_type):
        if val_str is None:
            return None

        v_type = str(val_type).upper() if val_type else "STRING"

        if v_type == "INT":
            try:
                if isinstance(val_str, bool):
                    return int(val_str)
                return int(float(val_str))
            except (ValueError, TypeError):
                return 0

        elif v_type in ("FLOAT", "NUMBER"):
            try:
                num = float(val_str)
                return int(num) if v_type == "NUMBER" and num.is_integer() else num
            except (ValueError, TypeError):
                return 0.0

        elif v_type == "BOOLEAN":
            if isinstance(val_str, bool):
                return val_str
            return str(val_str).strip().lower() in ("true", "1", "yes", "t")

        elif v_type in ("ANY", "JSON"):
            if isinstance(val_str, (dict, list)):
                return val_str
            if isinstance(val_str, str) and val_str.strip() != "":
                try:
                    return json.loads(val_str)
                except Exception:
                    return val_str
            return val_str

        else:
            if isinstance(val_str, (dict, list)):
                return json.dumps(val_str, ensure_ascii=False)
            return str(val_str)

    def _load_images_batch(self, image_list: List[Any]) -> List[torch.Tensor]:
        if not image_list or not isinstance(image_list, list) or len(image_list) == 0:
            return [None]

        tensors = []
        for item in image_list:
            if not item:
                continue

            filepath = resolve_source_filepath(item, default_type="output")

            if not filepath or not os.path.exists(filepath):
                fname, _, _ = parse_item_info(item)
                raise FileNotFoundError(f"[LikeJVideoDirector] Image file not found: {fname or item}")

            try:
                with Image.open(filepath) as img:
                    img = ImageOps.exif_transpose(img).convert("RGB")
                    img_arr = np.array(img).astype(np.float32) / 255.0
                    tensors.append(torch.from_numpy(img_arr)[None, ...])
            except Exception as e:
                raise RuntimeError(f"[LikeJVideoDirector] Failed to load image file ({filepath}): {str(e)}")

        return tensors if len(tensors) > 0 else [None]

    def _load_audio_data(self, audio_list: List[Any]) -> List[Optional[Dict[str, Any]]]:
        if not audio_list or not isinstance(audio_list, list) or len(audio_list) == 0:
            return [None]

        audio_results = []
        for item in audio_list:
            if not item:
                continue

            if not HAS_TORCHAUDIO:
                raise RuntimeError("[LikeJVideoDirector] Audio configured, but torchaudio module is not installed!")

            filepath = resolve_source_filepath(item, default_type="output")

            if not filepath or not os.path.exists(filepath):
                fname, _, _ = parse_item_info(item)
                raise FileNotFoundError(f"[LikeJVideoDirector] Audio file not found: {fname or item}")

            try:
                waveform, sample_rate = torchaudio.load(filepath)
                if waveform.ndim == 2:
                    waveform = waveform.unsqueeze(0)

                audio_results.append({
                    "waveform": waveform,
                    "sample_rate": sample_rate
                })
            except Exception as e:
                raise RuntimeError(f"[LikeJVideoDirector] Failed to load audio file ({filepath}): {str(e)}")

        return audio_results if len(audio_results) > 0 else [None]

    def process(self, unique_id=None, extra_pnginfo=None):
        scenes_json = "{}"
        if extra_pnginfo and isinstance(extra_pnginfo, dict):
            workflow = extra_pnginfo.get("workflow", {})
            nodes = workflow.get("nodes", [])
            for n in nodes:
                if str(n.get("id")) == str(unique_id):
                    extra_info = n.get("extra_info", {})
                    properties = n.get("properties", {})
                    scenes_json = extra_info.get("scenes_json") or properties.get("scenes_json") or "{}"
                    break

        try:
            raw_data = json.loads(scenes_json) if isinstance(scenes_json, str) else scenes_json
        except Exception as e:
            print(f"[LikeJVideoDirector] Failed to parse scenes_json: {e}")
            raw_data = {}

        if isinstance(raw_data, list):
            global_defs = []
            scenes = raw_data
        elif isinstance(raw_data, dict):
            global_defs = raw_data.get("global_dict", [])
            scenes = raw_data.get("scenes", [])
        else:
            global_defs = []
            scenes = [{}]

        if not isinstance(scenes, list) or len(scenes) == 0:
            scenes = [{}]

        selected_scene = next((s for s in scenes if s.get("selected")), scenes[0])

        duration = float(selected_scene.get("duration", 3.0))
        prompt = str(selected_scene.get("prompt", ""))

        final_dict = {}

        for g_item in global_defs:
            k = g_item.get("key")
            if not k:
                continue
            k_type = g_item.get("type", "STRING")
            k_default = g_item.get("default", "")
            final_dict[k] = self._parse_value(k_default, k_type)

        clip_dict_raw = selected_scene.get("dict_params", {})
        if isinstance(clip_dict_raw, dict):
            for g_item in global_defs:
                k = g_item.get("key")
                if not k or k not in clip_dict_raw:
                    continue

                param_obj = clip_dict_raw[k]
                if isinstance(param_obj, dict):
                    use_default = param_obj.get("use_default", True)
                    if not use_default:
                        val = param_obj.get("value")
                        val_type = g_item.get("type", "STRING")
                        final_dict[k] = self._parse_value(val, val_type)
                else:
                    final_dict[k] = self._parse_value(param_obj, g_item.get("type", "STRING"))

        images_list = selected_scene.get("images", [])
        images_tensor_list = self._load_images_batch(images_list)

        audios_list = selected_scene.get("audios", [])
        audio_tensor_list = self._load_audio_data(audios_list)

        print(f"[LikeJVideoDirector] Current Clip Output -> Images: {len(images_tensor_list)}, Audios: {len(audio_tensor_list)}, Duration: {duration}s")

        return (images_tensor_list, audio_tensor_list, prompt, final_dict, duration)