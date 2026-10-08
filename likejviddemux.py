import os
import cv2
import torch
import numpy as np
import folder_paths

try:
    import torchaudio
    HAS_TORCHAUDIO = True
except ImportError:
    HAS_TORCHAUDIO = False


class LikeJVideoDemuxing:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "video": ("VIDEO", {"tooltip": "Input ComfyUI VIDEO object, dictionary, or file path"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT")
    RETURN_NAMES = ("images", "audio", "fps")
    FUNCTION = "demux"
    CATEGORY = "LikeJ/Video"

    def demux(self, video=None):
        if video is None:
            return (None, None, 0.0)

        video_path = None

        # 針對標準 ComfyUI VIDEO 物件或字典進行屬性解析
        if hasattr(video, "get_filepath") and callable(getattr(video, "get_filepath")):
            video_path = video.get_filepath()
        elif hasattr(video, "file_path"):
            video_path = getattr(video, "file_path")
        elif hasattr(video, "path"):
            video_path = getattr(video, "path")
        elif isinstance(video, dict):
            video_path = video.get("full_path") or video.get("path") or video.get("filename")
        elif isinstance(video, str):
            video_path = video

        # 如果抓到的路徑是相對路徑或不合法，直接強制轉換字串嘗試
        if not video_path:
            video_path = str(video)

        if not os.path.exists(str(video_path)):
            print(f"[LikeJVideoDemuxing] 找不到影片檔案路徑: {video_path}")
            return (None, None, 0.0)

        video_path = str(video_path)

        # 使用 OpenCV 讀取影格
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"[LikeJVideoDemuxing] 無法開啟影片: {video_path}")
            return (None, None, 0.0)

        fps = float(cap.get(cv2.CAP_PROP_FPS))
        if np.isnan(fps) or fps <= 0:
            fps = 30.0

        frames = []
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(frame_rgb)

        cap.release()

        images_tensor = None
        if frames:
            images_np = np.stack(frames, axis=0).astype(np.float32) / 255.0
            images_tensor = torch.from_numpy(images_np)

        # 提取音訊
        audio_dict = None
        if HAS_TORCHAUDIO:
            try:
                waveform, sample_rate = torchaudio.load(video_path)
                if waveform.ndim == 2:
                    waveform = waveform.unsqueeze(0)

                if waveform.numel() > 0:
                    audio_dict = {
                        "waveform": waveform,
                        "sample_rate": sample_rate
                    }
            except Exception as e:
                print(f"[LikeJVideoDemuxing] 無音軌或提取失敗: {e}")
                audio_dict = None

        return (images_tensor, audio_dict, fps)

