import os
import json
import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths

# 嘗試載入 torchaudio 以讀取標準 ComfyUI 音訊格式
try:
    import torchaudio
    HAS_TORCHAUDIO = True
except ImportError:
    HAS_TORCHAUDIO = False

class LikeJVideoDirector:
    """
    ComfyUI Video Director Node
    輸出當前選取 (selected: true) 片段的完整多筆數據：
    - images: Tensor Batch [B, H, W, C]
    - audios: ComfyUI 音訊格式 Dict/List
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "scenes_json": ("STRING", {"default": "[]", "multiline": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "STRING", "STRING", "FLOAT")
    RETURN_NAMES = ("images", "audios", "prompt", "dict_params", "duration")
    FUNCTION = "process"
    CATEGORY = "LikeJ/Video"

    def _load_images_batch(self, image_list):
        """將列表中的多張圖片載入並合併為 Tensor Batch [B, H, W, C]，若無則回傳 None"""
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
        """將列表中的音訊檔案載入為 ComfyUI 標準 AUDIO 格式，若無則回傳 None"""
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
                    # ComfyUI AUDIO 標準格式為 [Batch, Channels, Samples]
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

        # 如果有載入成功則回傳第一個（或根據需求回傳），沒有的話回傳 None
        if audio_results:
            return audio_results[0]
        else:
            return None

    def process(self, scenes_json="[]", unique_id=None):
        try:
            scenes = json.loads(scenes_json) if isinstance(scenes_json, str) else scenes_json
        except Exception as e:
            print(f"[LikeJVideoDirector] 解析 scenes_json 失敗: {e}")
            scenes = []

        if not isinstance(scenes, list) or len(scenes) == 0:
            scenes = [{}]

        # 1. 取得當前選取的 Clip (selected == True)
        selected_scene = next((s for s in scenes if s.get("selected")), scenes[0])

        # 2. 提取選取 Clip 的基本資訊
        duration = float(selected_scene.get("duration", 3.0))
        prompt = str(selected_scene.get("prompt", ""))
        
        # 處理 dict_params
        dict_params_raw = selected_scene.get("dict_params", {})
        if isinstance(dict_params_raw, dict):
            dict_params_str = json.dumps(dict_params_raw, ensure_ascii=False)
        else:
            dict_params_str = str(dict_params_raw)

        # 3. 載入該 Clip 內【所有】參考圖片 (Tensor Batch)
        images_list = selected_scene.get("images", [])
        images_tensor = self._load_images_batch(images_list)

        # 4. 載入該 Clip 內【所有】參考音訊 (AUDIO Dict)
        audios_list = selected_scene.get("audios", [])
        audio_data = self._load_audio_data(audios_list)

        print(f"[LikeJVideoDirector] 當前 Clip 輸出 -> 圖片數: {len(images_list)}, 音訊數: {len(audios_list)}, 時長: {duration}s")

        return (images_tensor, audio_data, prompt, dict_params_str, duration)
