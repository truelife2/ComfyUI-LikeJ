import os
import json
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

    video_extensions = ('.mp4', '.webm', '.mkv', '.mov', '.avi')
    files_list = []

    if os.path.exists(base_dir):
        for root, _, files in os.walk(base_dir):
            for f in files:
                if f.lower().endswith(video_extensions):
                    full_path = os.path.join(root, f)
                    rel_path = os.path.relpath(full_path, base_dir)
                    subfolder = os.path.dirname(rel_path)
                    filename = os.path.basename(rel_path)
                    mtime = os.path.getmtime(full_path)
                    files_list.append({
                        "filename": filename,
                        "subfolder": "" if subfolder == "." else subfolder,
                        "type": folder_type,
                        "mtime": mtime
                    })

    # 依修改時間倒序排列（最新的在最前）
    files_list.sort(key=lambda x: x["mtime"], reverse=True)
    return web.json_response(files_list)


# ==========================================
# API 2：從指定影片中擷取首幀 (first) 或尾幀 (last)
# ==========================================
@PromptServer.instance.routes.post("/likej/extract_frame")
async def extract_frame(request):
    try:
        data = await request.json()
        filename = data.get("filename", "")
        subfolder = data.get("subfolder", "")
        folder_type = data.get("type", "output")
        position = data.get("position", "last")  # "first" 或 "last"

        if folder_type == "input":
            base_dir = folder_paths.get_input_directory()
        else:
            base_dir = folder_paths.get_output_directory()

        video_path = os.path.join(base_dir, subfolder, filename) if subfolder else os.path.join(base_dir, filename)

        if not os.path.exists(video_path):
            return web.json_response({"success": False, "error": f"影片檔案不存在: {video_path}"}, status=400)

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return web.json_response({"success": False, "error": "無法開啟並讀取影片檔案"}, status=400)

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            return web.json_response({"success": False, "error": "影片總幀數無效或為 0"}, status=400)

        # 決定讀取幀的索引位置
        target_frame = total_frames - 1 if position == "last" else 0
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            return web.json_response({"success": False, "error": f"無法擷取影片第 {target_frame} 幀"}, status=400)

        # 儲存擷取的畫面至 input 資料夾
        input_dir = folder_paths.get_input_directory()
        clean_name = os.path.splitext(os.path.basename(filename))[0]
        out_filename = f"frame_{clean_name}_{position}_{target_frame}.png"
        out_filepath = os.path.join(input_dir, out_filename)

        # BGR 轉 RGB 並儲存為 PNG
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(frame_rgb)
        img.save(out_filepath)

        return web.json_response({
            "success": True,
            "image": {
                "name": out_filename,
                "subfolder": "",
                "type": "input"
            }
        })
    except Exception as e:
        print(f"[LikeJVideoDirector] 抽幀 API 處理失敗: {e}")
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

    def _load_images_batch(self, image_list):
        if not image_list or not isinstance(image_list, list) or len(image_list) == 0:
            return [None]

        tensors = []
        for item in image_list:
            if not item:
                continue

            fname = item.get("name") if isinstance(item, dict) else item
            subfolder = item.get("subfolder", "") if isinstance(item, dict) else ""

            if subfolder:
                fname = os.path.join(subfolder, fname)

            filepath = folder_paths.get_annotated_filepath(fname)

            if not os.path.exists(filepath):
                raise FileNotFoundError(f"[LikeJVideoDirector] Image file not found: {filepath}")

            try:
                img = Image.open(filepath)
                img = ImageOps.exif_transpose(img).convert("RGB")
                img_arr = np.array(img).astype(np.float32) / 255.0
                tensors.append(torch.from_numpy(img_arr)[None, ...])
            except Exception as e:
                raise RuntimeError(f"[LikeJVideoDirector] Failed to load image file ({filepath}): {str(e)}")

        return tensors if len(tensors) > 0 else [None]

    def _load_audio_data(self, audio_list):
        if not audio_list or not isinstance(audio_list, list) or len(audio_list) == 0:
            return [None]

        audio_results = []
        for item in audio_list:
            if not item:
                continue

            if not HAS_TORCHAUDIO:
                raise RuntimeError("[LikeJVideoDirector] Audio configured, but torchaudio module is not installed!")

            fname = item.get("name") if isinstance(item, dict) else item
            subfolder = item.get("subfolder", "") if isinstance(item, dict) else ""

            if subfolder:
                fname = os.path.join(subfolder, fname)

            filepath = folder_paths.get_annotated_filepath(fname)

            if not os.path.exists(filepath):
                raise FileNotFoundError(f"[LikeJVideoDirector] Audio file not found: {filepath}")

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

        # 1. 取得當前 Clip
        selected_scene = next((s for s in scenes if s.get("selected")), scenes[0])

        # 2. 基礎資訊
        duration = float(selected_scene.get("duration", 3.0))
        prompt = str(selected_scene.get("prompt", ""))

        # 3. 解析與合併 Dict 參數
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

        # 4. 解析選取的影片路徑並注入 final_dict (支援獨立影片清單)
        videos_list = selected_scene.get("videos", [])
        video_info = None

        if isinstance(videos_list, list) and len(videos_list) > 0:
            sel_idx = selected_scene.get("selected_video_idx", 0)
            if 0 <= sel_idx < len(videos_list):
                video_info = videos_list[sel_idx]
            else:
                video_info = videos_list[0]
        
        # 舊格式降級備用
        if not video_info:
            video_info = selected_scene.get("video")

        video_path = ""
        if video_info:
            if isinstance(video_info, dict):
                fname = video_info.get("filename", "")
                subfolder = video_info.get("subfolder", "")
                vtype = video_info.get("type", "output")
                base_dir = folder_paths.get_input_directory() if vtype == "input" else folder_paths.get_output_directory()
                video_path = os.path.join(base_dir, subfolder, fname) if subfolder else os.path.join(base_dir, fname)
            elif isinstance(video_info, str):
                video_path = video_info

        final_dict["video_path"] = video_path

        # 5. 載入媒體資源
        images_list = selected_scene.get("images", [])
        images_tensor_list = self._load_images_batch(images_list)

        audios_list = selected_scene.get("audios", [])
        audio_tensor_list = self._load_audio_data(audios_list)

        print(f"[LikeJVideoDirector] Current Clip Output -> Video: {video_path or 'None'}, Images: {len(images_tensor_list)}, Audios: {len(audio_tensor_list)}, Duration: {duration}s")

        return (images_tensor_list, audio_tensor_list, prompt, final_dict, duration)