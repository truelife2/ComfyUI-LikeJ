import os
import cv2
import numpy as np
import torch
from aiohttp import web
from server import PromptServer
import folder_paths

def clean_path(p: str) -> str:
    if not p:
        return ""
    return p.strip().strip('"').strip("'").strip()

# ------------------------------------------------------------------
# 1. API Route Registration
# ------------------------------------------------------------------
@PromptServer.instance.routes.get("/likej/view_video")
async def view_video(request):
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

@PromptServer.instance.routes.get("/likej/video_info")
async def video_info(request):
    raw_path = request.query.get("path", "")
    video_path = clean_path(raw_path)

    if not video_path:
        return web.json_response({"error": "Missing video path"}, status=400)

    if not os.path.isabs(video_path):
        input_dir = folder_paths.get_input_directory()
        video_path = os.path.join(input_dir, video_path)

    if not os.path.exists(video_path):
        return web.json_response({"error": "File not found"}, status=404)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return web.json_response({"error": "Failed to open video"}, status=400)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(cap.get(cv2.CAP_PROP_FPS))
    cap.release()

    return web.json_response({
        "fps": fps if fps > 0 else 30.0,
        "total_frames": total_frames
    })

# ------------------------------------------------------------------
# 2. ComfyUI Custom Node Logic (IMAGE + frame_index)
# ------------------------------------------------------------------
class LikeJVideoSnapshot:
    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = []
        if os.path.exists(input_dir):
            files = [f for f in os.listdir(input_dir) if f.lower().endswith(('.mp4', '.mov', '.avi', '.mkv', '.webm'))]
        
        return {
            "required": {
                "video_path": ("STRING", {
                    "default": "", 
                    "multiline": False, 
                    "placeholder": "Enter video path (e.g. \"D:/video.mp4\" or sample.mp4)"
                }),
                "frame_number": ("INT", {"default": 0, "min": 0, "max": 999999, "step": 1}),
            },
            "optional": {
                "select_from_input": ([""] + sorted(files), ),
            }
        }

    # 保留影像輸出與使用的幀數 index
    RETURN_TYPES = ("IMAGE", "INT")
    RETURN_NAMES = ("IMAGE", "frame_index")
    FUNCTION = "extract_frame"
    CATEGORY = "LikeJ/Video"

    def extract_frame(self, video_path, frame_number, select_from_input=""):
        path = clean_path(video_path)
        
        if not path and select_from_input:
            path = clean_path(select_from_input)

        if not path:
            raise ValueError("[LikeJVideoSnapshot] Please provide a video path or select a file.")

        resolved_path = ""
        if os.path.isabs(path) and os.path.exists(path):
            resolved_path = path
        else:
            input_dir = folder_paths.get_input_directory()
            test_path = os.path.join(input_dir, path)
            if os.path.exists(test_path):
                resolved_path = test_path
            elif os.path.exists(path):
                resolved_path = path

        if not resolved_path or not os.path.exists(resolved_path):
            raise FileNotFoundError(f"[LikeJVideoSnapshot] Video file not found: {path}")

        cap = cv2.VideoCapture(resolved_path)
        if not cap.isOpened():
            raise ValueError(f"[LikeJVideoSnapshot] Failed to open video file: {resolved_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if total_frames <= 0:
            cap.release()
            raise ValueError("[LikeJVideoSnapshot] Invalid total frames or corrupted video file.")

        target_frame = max(0, min(frame_number, total_frames - 1))

        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            raise RuntimeError(f"[LikeJVideoSnapshot] Failed to extract frame {target_frame}.")

        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image_np = frame.astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np).unsqueeze(0)

        # 輸出 影像 Tensor 與 實際採樣的幀號 (target_frame)
        return (image_tensor, target_frame)
