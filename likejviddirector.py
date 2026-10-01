import os
import json
import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths

try:
    import torchaudio
    HAS_TORCHAUDIO = True
except ImportError:
    HAS_TORCHAUDIO = False

class LikeJVideoDirector:
    """
    ComfyUI Video Director Node (無 Input 腳位，純 Hidden extra_info 驅動)
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            # 100% 零 Input 腳位，不建立任何輸入連線點
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "STRING", "STRING", "FLOAT")
    RETURN_NAMES = ("images", "audios", "prompt", "dict_params", "duration")
    FUNCTION = "process"
    CATEGORY = "LikeJ/Video"

    def _parse_value(self, val_str, val_type):
        """根據指定型態進行轉型"""
        if val_type == "number":
            try:
                num = float(val_str)
                return int(num) if num.is_integer() else num
            except (ValueError, TypeError):
                return 0
        elif val_type == "boolean":
            if isinstance(val_str, bool):
                return val_str
            return str(val_str).lower() in ("true", "1", "yes")
        elif val_type == "json":
            if isinstance(val_str, (dict, list)):
                return val_str
            try:
                return json.loads(val_str)
            except Exception:
                return {}
        else: # string
            return str(val_str) if val_str is not None else ""

    def _load_images_batch(self, image_list):
        if not image_list or not isinstance(image_list, list) or len(image_list) == 0:
            return None

        tensors = []
        for item in image_list:
            if not item:
                continue
            try:
                fname = item.get("name") if isinstance(item, dict) else item
                subfolder = item.get("subfolder", "") if isinstance(item, dict) else ""
                
                if subfolder:
                    fname = os.path.join(subfolder, fname)

                filepath = folder_paths.get_annotated_filepath(fname)
                if os.path.exists(filepath):
                    img = Image.open(filepath)
                    img = ImageOps.exif_transpose(img).convert("RGB")
                    img_arr = np.array(img).astype(np.float32) / 255.0
                    tensors.append(torch.from_numpy(img_arr)[None, ...])
                else:
                    print(f"[LikeJVideoDirector] 找不到圖像檔案: {filepath}")
            except Exception as e:
                print(f"[LikeJVideoDirector] 加載圖像發生錯誤: {e}")

        if tensors:
            try:
                return torch.cat(tensors, dim=0)
            except Exception:
                return tensors[0]
        else:
            return None

    def _load_audio_data(self, audio_list):
        if not audio_list or not isinstance(audio_list, list) or len(audio_list) == 0:
            return None
            
        audio_results = []
        for item in audio_list:
            if not item:
                continue
            try:
                fname = item.get("name") if isinstance(item, dict) else item
                subfolder = item.get("subfolder", "") if isinstance(item, dict) else ""
                
                if subfolder:
                    fname = os.path.join(subfolder, fname)

                filepath = folder_paths.get_annotated_filepath(fname)
                if os.path.exists(filepath) and HAS_TORCHAUDIO:
                    waveform, sample_rate = torchaudio.load(filepath)
                    if waveform.ndim == 2:
                        waveform = waveform.unsqueeze(0)
                    
                    audio_results.append({
                        "waveform": waveform,
                        "sample_rate": sample_rate
                    })
                else:
                    print(f"[LikeJVideoDirector] 找不到音訊檔案或未安裝 torchaudio: {filepath}")
            except Exception as e:
                print(f"[LikeJVideoDirector] 加載音訊發生錯誤: {e}")

        if audio_results:
            return audio_results[0]
        else:
            return None

    def process(self, unique_id=None, extra_pnginfo=None):
        # 從 ComfyUI 隱藏傳入的 extra_pnginfo 提取 Workflow 中該節點的 node.extra_info
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
            print(f"[LikeJVideoDirector] 解析 scenes_json 失敗: {e}")
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

        # 1. 取得當前選取的 Clip (selected == True)
        selected_scene = next((s for s in scenes if s.get("selected")), scenes[0])

        # 2. 提取基本資訊
        duration = float(selected_scene.get("duration", 3.0))
        prompt = str(selected_scene.get("prompt", ""))

        # 3. 處理與合併 Dict 參數
        final_dict = {}

        # (A) 填入全域預設值
        for g_item in global_defs:
            k = g_item.get("key")
            if not k:
                continue
            k_type = g_item.get("type", "string")
            k_default = g_item.get("default", "")
            final_dict[k] = self._parse_value(k_default, k_type)

        # (B) 合併 Clip 的專屬覆蓋值
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
                        val_type = g_item.get("type", "string")
                        final_dict[k] = self._parse_value(val, val_type)
                else:
                    final_dict[k] = param_obj

        dict_params_str = json.dumps(final_dict, ensure_ascii=False)

        # 4. 載入媒體檔案
        images_list = selected_scene.get("images", [])
        images_tensor = self._load_images_batch(images_list)

        audios_list = selected_scene.get("audios", [])
        audio_data = self._load_audio_data(audios_list)

        print(f"[LikeJVideoDirector] 當前 Clip 輸出 -> 圖片數: {len(images_list)}, 音訊數: {len(audios_list)}, Dict: {dict_params_str}, 時長: {duration}s")

        return (images_tensor, audio_data, prompt, dict_params_str, duration)