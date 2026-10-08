import os
import cv2
import torch
import numpy as np
import folder_paths

try:
    from comfy_api.latest._input_impl.video_types import VideoFromFile
except ImportError:
    try:
        from comfy_api.latest import InputImpl
        VideoFromFile = InputImpl.VideoFromFile
    except ImportError:
        VideoFromFile = None

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

        video_path = video.get_stream_source()
        
        if not video_path or not os.path.exists(str(video_path)):
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

