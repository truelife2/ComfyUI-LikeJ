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
    
    # Declare images and audios as LIST outputs
    OUTPUT_IS_LIST = (True, True, False, False, False)
    
    FUNCTION = "process"
    CATEGORY = "LikeJ/Video"

    def _parse_value(self, val_str, val_type):
        """Parse value based on specified type, compatible with STRING, INT, FLOAT, BOOLEAN, ANY"""
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

        else:  # STRING
            if isinstance(val_str, (dict, list)):
                return json.dumps(val_str, ensure_ascii=False)
            return str(val_str)

    def _load_images_batch(self, image_list):
        # 1. No image configured: return [None]
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
            
            # 2. Configured but file missing: raise FileNotFoundError
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
        # 1. No audio configured: return [None]
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

            # 2. Configured but file missing: raise FileNotFoundError
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

        # 1. Get current clip (selected == True)
        selected_scene = next((s for s in scenes if s.get("selected")), scenes[0])

        # 2. Extract basic info
        duration = float(selected_scene.get("duration", 3.0))
        prompt = str(selected_scene.get("prompt", ""))

        # 3. Process and merge Dict parameters
        final_dict = {}

        # (A) Global defaults
        for g_item in global_defs:
            k = g_item.get("key")
            if not k:
                continue
            k_type = g_item.get("type", "STRING")
            k_default = g_item.get("default", "")
            final_dict[k] = self._parse_value(k_default, k_type)

        # (B) Clip specific overrides
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

        # 4. Load media files (raises Exception if configured files are missing)
        images_list = selected_scene.get("images", [])
        images_tensor_list = self._load_images_batch(images_list)

        audios_list = selected_scene.get("audios", [])
        audio_tensor_list = self._load_audio_data(audios_list)

        print(f"[LikeJVideoDirector] Current Clip Output -> Images: {len(images_tensor_list)}, Audios: {len(audio_tensor_list)}, Dict: {final_dict}, Duration: {duration}s")

        return (images_tensor_list, audio_tensor_list, prompt, final_dict, duration)