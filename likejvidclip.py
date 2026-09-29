import os
import cv2
import torch
import numpy as np
from aiohttp import web
from server import PromptServer
import folder_paths

def clean_path(path_str):
    if not path_str:
        return ""
    return path_str.strip('\'"')

# API endpoint: /likej/view_video_clip
@PromptServer.instance.routes.get("/likej/view_video_clip")
async def view_video_clip(request):
    raw_path = request.query.get("path", "")
    video_path = clean_path(raw_path)
    
    if not video_path:
        return web.Response(status=400, text="Missing video path parameter")

    if not os.path.isabs(video_path):
        input_dir = folder_paths.get_input_directory()
        video_path = os.path.join(input_dir, video_path)
        
    if not os.path.exists(video_path):
        return web.Response(status=404, text=f"Video file not found: {video_path}")
        
    return web.FileResponse(video_path)


class LikeJVideoClip:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "video_path": ("STRING", {
                    "default": "", 
                    "multiline": False, 
                    "placeholder": "Enter video path (e.g. clip.mp4 or C:/videos/clip.mp4)",
                    "tooltip": "Path to the video file to clip."
                }),
                "start_frame": ("INT", {
                    "default": 0, 
                    "min": 0, 
                    "max": 999999, 
                    "step": 1,
                    "tooltip": "Starting frame index for video clipping."
                }),
                "end_frame": ("INT", {
                    "default": -1, 
                    "min": -1, 
                    "max": 999999, 
                    "step": 1, 
                    "tooltip": "Ending frame index (-1 means clip until the end of the video)."
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT", "INT")
    RETURN_NAMES = ("IMAGE", "AUDIO", "fps", "total_frames")
    FUNCTION = "clip_video_components"
    CATEGORY = "LikeJ/Video"

    def clip_video_components(self, video_path, start_frame, end_frame):
        out_images = None
        out_audio = None
        fps = 24.0

        clean_p = clean_path(video_path)
        real_path = clean_p
        if clean_p and not os.path.isabs(clean_p):
            real_path = os.path.join(folder_paths.get_input_directory(), clean_p)

        # Load directly from video_path
        if real_path and os.path.exists(real_path) and os.path.isfile(real_path):
            cap = cv2.VideoCapture(real_path)
            detected_fps = cap.get(cv2.CAP_PROP_FPS)
            fps = detected_fps if detected_fps > 0 else 24.0
            total_file_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            actual_start = max(0, min(start_frame, total_file_frames - 1))
            actual_end = total_file_frames if (end_frame == -1 or end_frame >= total_file_frames) else max(actual_start + 1, end_frame)

            frames = []
            cap.set(cv2.CAP_PROP_POS_FRAMES, actual_start)
            current_frame = actual_start

            while cap.isOpened() and current_frame < actual_end:
                ret, frame = cap.read()
                if not ret:
                    break
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(frame_rgb)
                current_frame += 1
            cap.release()

            if len(frames) > 0:
                tensor_array = np.array(frames).astype(np.float32) / 255.0
                out_images = torch.from_numpy(tensor_array)

            try:
                import torchaudio
                waveform, sample_rate = torchaudio.load(real_path)
                time_start = actual_start / fps
                time_end = actual_end / fps
                sample_start = int(time_start * sample_rate)
                sample_end = int(time_end * sample_rate)
                out_audio = {
                    "waveform": waveform.unsqueeze(0)[..., sample_start:sample_end],
                    "sample_rate": sample_rate
                }
            except Exception:
                pass

        if out_images is None:
            raise ValueError(f"[LikeJVideoClip] Error: Unable to load video from path '{video_path}'. Please check if the path exists.")

        return (out_images, out_audio, fps, out_images.shape[0])