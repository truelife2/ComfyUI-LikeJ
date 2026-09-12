import os
import cv2
import json
import torch
import numpy as np
import subprocess
import torchaudio
import folder_paths
from server import PromptServer
from aiohttp import web

ENCODER_SESSIONS = {}


def get_unique_path(output_dir, filename_prefix, ext=".mp4"):
    base_path = os.path.join(output_dir, f"{filename_prefix}{ext}")
    if not os.path.exists(base_path) and not os.path.exists(base_path + ".temp.mp4"):
        return base_path

    counter = 1
    while True:
        candidate_name = f"{filename_prefix}_{counter:05d}{ext}"
        candidate_path = os.path.join(output_dir, candidate_name)
        if not os.path.exists(candidate_path) and not os.path.exists(candidate_path + ".temp.mp4"):
            return candidate_path
        counter += 1


def finalize_encoder_session(node_id):
    if node_id not in ENCODER_SESSIONS:
        return None

    session = ENCODER_SESSIONS.pop(node_id)
    proc = session["proc"]
    final_output_path = session["final_path"]
    temp_video_only = session["temp_video"]
    audio = session.get("audio")
    output_dir = session.get("output_dir")
    initial_start_frame = session.get("initial_start_frame", 0)
    fps = session.get("fps", 30.0)

    try:
        if proc.stdin and not proc.stdin.closed:
            proc.stdin.close()
        proc.wait()
    except Exception as e:
        print(f"[LikeJ Loop] Failed to close FFmpeg pipe: {e}")

    if audio is not None and "waveform" in audio and os.path.exists(temp_video_only):
        temp_audio_path = os.path.join(output_dir, f"likej_temp_audio_{node_id}.wav")
        try:
            waveform = audio["waveform"]
            sample_rate = audio.get("sample_rate", 44100)
            if waveform.ndim == 3:
                waveform = waveform.squeeze(0)
            torchaudio.save(temp_audio_path, waveform, sample_rate)

            start_time = initial_start_frame / fps if fps > 0 else 0.0

            cmd_audio = [
                "ffmpeg",
                "-y",
                "-i",
                temp_video_only,
                "-ss",
                f"{start_time:.4f}",
                "-i",
                temp_audio_path,
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                "-shortest",
                final_output_path,
            ]
            subprocess.run(cmd_audio, check=True)

            if os.path.exists(temp_video_only):
                os.remove(temp_video_only)
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)
        except Exception as e:
            print(f"[LikeJ Loop] Audio multiplexing failed: {e}")
            if os.path.exists(temp_video_only):
                os.rename(temp_video_only, final_output_path)
    else:
        if os.path.exists(temp_video_only):
            os.rename(temp_video_only, final_output_path)

    print(f"[LikeJ Loop] Video successfully finalized at: {final_output_path}")
    return final_output_path


# API 1: Instant video information fetch
@PromptServer.instance.routes.post("/likej/get_video_info")
async def get_video_info_api(request):
    try:
        data = await request.json()
        video_path = data.get("video_path", "")
        clean_path = video_path.strip().strip('"').strip("'")

        if not os.path.isabs(clean_path) or not os.path.exists(clean_path):
            input_dir_path = os.path.join(folder_paths.get_input_directory(), clean_path)
            if os.path.exists(input_dir_path):
                clean_path = input_dir_path

        if not clean_path or not os.path.exists(clean_path):
            return web.json_response({"status": "error", "message": "File not found"})

        cap = cv2.VideoCapture(clean_path)
        if not cap.isOpened():
            return web.json_response({"status": "error", "message": "Cannot open video"})

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()

        if total_frames <= 0 or fps <= 0 or np.isnan(fps):
            fps = 30.0

        duration = total_frames / fps if fps > 0 else 0.0

        return web.json_response({"status": "success", "total_frames": total_frames, "duration": float(duration), "fps": float(fps)})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)})


# API 2: Force finish session in idle state
@PromptServer.instance.routes.post("/likej/force_finish_idle")
async def force_finish_idle_api(request):
    data = await request.json()
    node_id = str(data.get("node_id"))

    target_node_id = None
    if node_id in ENCODER_SESSIONS:
        target_node_id = node_id
    elif node_id.isdigit() and int(node_id) in ENCODER_SESSIONS:
        target_node_id = int(node_id)

    if target_node_id is not None:
        final_path = finalize_encoder_session(target_node_id)
        return web.json_response({"status": "success", "final_path": final_path})

    return web.json_response({"status": "no_session", "message": "No unfinished encoding session found"})


class LikeJVideoLoopLoad:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "video_path": (
                    "STRING",
                    {
                        "default": "",
                        "tooltip": "Path to the video file. Can be relative to ComfyUI's input directory or an absolute path.",
                    },
                ),
                "start_frame": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 999999,
                        "tooltip": "The initial frame index to start reading the video.",
                    },
                ),
                "chunk_size": (
                    "INT",
                    {
                        "default": 30,
                        "min": 1,
                        "max": 1000,
                        "tooltip": "Number of frames to load and process in each iteration chunk.",
                    },
                ),
                "overlap_padding": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 100,
                    },
                ),
                "looping_frame": (
                    "INT",
                    {
                        "default": -1,
                        "min": -1,
                        "max": 999999,
                        "tooltip": "Internal iteration state tracker. Set to -1 to reset and restart processing from the beginning.",
                    },
                ),
            },
            "hidden": {"node_id": "UNIQUE_ID"},
        }

    @classmethod
    def IS_CHANGED(s, video_path, start_frame, chunk_size, overlap_padding=0, looping_frame=-1, node_id=None):
        return float("NaN")

    RETURN_TYPES = ("LOOP_FLOW", "IMAGE", "AUDIO", "FLOAT", "STRING", "INT", "IMAGE")
    RETURN_NAMES = ("loop_flow", "images", "audio", "fps", "filename", "total_frames", "last_image")
    FUNCTION = "load_chunk"
    CATEGORY = "LikeJ/Video"

    def load_chunk(self, video_path, start_frame, chunk_size, overlap_padding=0, looping_frame=-1, node_id=None):
        clean_path = video_path.strip().strip('"').strip("'")

        if not os.path.isabs(clean_path) or not os.path.exists(clean_path):
            input_dir_path = os.path.join(folder_paths.get_input_directory(), clean_path)
            if os.path.exists(input_dir_path):
                clean_path = input_dir_path

        if not clean_path or not os.path.exists(clean_path):
            raise FileNotFoundError(f"[LikeJ Loop] Video file not found: {clean_path}")

        base_name = os.path.basename(clean_path)
        filename_without_ext = os.path.splitext(base_name)[0]

        cap = cv2.VideoCapture(clean_path)
        if not cap.isOpened():
            raise ValueError(f"[LikeJ Loop] Unable to open video file: {clean_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            raise ValueError(f"[LikeJ Loop] Failed to retrieve total frame count: {clean_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or np.isnan(fps):
            fps = 30.0

        is_first_chunk = looping_frame < 0
        effective_start = looping_frame if looping_frame >= 0 else start_frame

        if effective_start >= total_frames:
            cap.release()
            raise ValueError(f"[LikeJ Loop] Start frame position ({effective_start}) exceeds total frame count ({total_frames})")

        actual_start = max(0, effective_start - overlap_padding)
        crop_offset = effective_start - actual_start
        read_count = crop_offset + chunk_size

        cap.set(cv2.CAP_PROP_POS_FRAMES, actual_start)

        frames = []
        for _ in range(read_count):
            ret, frame = cap.read()
            if not ret:
                break
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_tensor = torch.from_numpy(frame_rgb).float() / 255.0
            frames.append(frame_tensor)

        cap.release()

        if len(frames) == 0:
            raise ValueError(f"[LikeJ Loop] Read 0 frames. Please reset looping_frame to -1 (position: {actual_start})")

        out_tensor = torch.stack(frames)
        next_start = effective_start + chunk_size
        is_finished = (next_start >= total_frames) or (len(frames) < read_count)

        audio_data = self._extract_audio(clean_path)
        duration = total_frames / fps if fps > 0 else 0.0

        loop_flow = {
            "crop_offset": crop_offset,
            "is_finished": is_finished,
            "next_start_frame": next_start,
            "load_node_id": node_id,
            "is_first_chunk": is_first_chunk,
            "effective_start": effective_start,
            "total_frames": total_frames,
            "fps": fps,
        }

        if node_id is not None:
            PromptServer.instance.send_sync("likej_video_info", {"load_node_id": node_id, "total_frames": total_frames, "duration": duration, "fps": float(fps)})

        last_image = out_tensor[-1:]

        return {
            "ui": {"images": self._tensor_to_preview(out_tensor[0:1]), "video_info": [{"total_frames": total_frames, "duration": float(duration), "fps": float(fps)}]},
            "result": (loop_flow, out_tensor, audio_data, float(fps), filename_without_ext, total_frames, last_image),
        }

    def _extract_audio(self, video_path):
        try:
            waveform, sample_rate = torchaudio.load(video_path)
            if waveform.ndim == 2:
                waveform = waveform.unsqueeze(0)
            return {"waveform": waveform, "sample_rate": sample_rate}
        except Exception:
            temp_wav = os.path.join(folder_paths.get_temp_directory(), "likej_temp_audio.wav")
            try:
                cmd = ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", temp_wav]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                waveform, sample_rate = torchaudio.load(temp_wav)
                if waveform.ndim == 2:
                    waveform = waveform.unsqueeze(0)
                if os.path.exists(temp_wav):
                    os.remove(temp_wav)
                return {"waveform": waveform, "sample_rate": sample_rate}
            except Exception as e:
                print(f"[LikeJ Loop] Audio extraction failed, fallback to silent audio track: {e}")
                dummy_waveform = torch.zeros((1, 2, 44100), dtype=torch.float32)
                return {"waveform": dummy_waveform, "sample_rate": 44100}

    def _tensor_to_preview(self, tensor):
        from PIL import Image

        img_np = (tensor[0].numpy() * 255).astype(np.uint8)
        img = Image.fromarray(img_np)

        subfolder = "likej_preview"
        full_output_folder = os.path.join(folder_paths.get_temp_directory(), subfolder)
        os.makedirs(full_output_folder, exist_ok=True)

        file_name = "preview_first_frame.png"
        img.save(os.path.join(full_output_folder, file_name))
        return [{"filename": file_name, "subfolder": subfolder, "type": "temp"}]


class LikeJVideoLoopSave:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "loop_flow": (
                    "LOOP_FLOW",
                    {
                        "tooltip": "Loop control state flow connected directly from the LikeJVideoLoopLoad node.",
                    },
                ),
                "images": (
                    "IMAGE",
                    {
                        "tooltip": "Image frame tensors to encode into the target video.",
                    },
                ),
                "fps": (
                    "FLOAT",
                    {
                        "default": 30.0,
                        "min": 1.0,
                        "max": 120.0,
                        "step": 0.01,
                        "tooltip": "Frame rate (FPS) for the rendered video output.",
                    },
                ),
                "crf": (
                    "INT",
                    {
                        "default": 17,
                        "min": 0,
                        "max": 51,
                        "step": 1,
                        "tooltip": "Constant Rate Factor (CRF) for H.264 compression (0 = lossless, 17-23 = visually lossless/high quality, 51 = lowest quality).",
                    },
                ),
                "preset": (
                    [
                        "ultrafast",
                        "superfast",
                        "veryfast",
                        "faster",
                        "fast",
                        "medium",
                        "slow",
                        "slower",
                        "veryslow",
                    ],
                    {
                        "default": "slow",
                        "tooltip": "FFmpeg encoding preset balancing compression efficiency and CPU speed. 'slow' provides higher compression ratio with lossless visual quality.",
                    },
                ),
                "directory": (
                    "STRING",
                    {
                        "default": "",
                        "tooltip": "Optional subfolder path relative to ComfyUI's default output directory.",
                    },
                ),
                "output_filename": (
                    "STRING",
                    {
                        "default": "likej_output",
                        "tooltip": "Base filename prefix for the saved MP4 video.",
                    },
                ),
                "embed_workflow": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "Embed the complete ComfyUI prompt workflow JSON metadata into the video MP4 file header.",
                    },
                ),
                "auto_queue": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "Automatically queue the next loop iteration prompt until the entire video is processed.",
                    },
                ),
                "force_finish": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Instantly force terminate and finalize the current video encoding session.",
                    },
                ),
            },
            "optional": {
                "audio": (
                    "AUDIO",
                    {
                        "tooltip": "Optional audio track to multiplex and encode into the finalized output video.",
                    },
                ),
            },
            "hidden": {"node_id": "UNIQUE_ID", "prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("STRING", "IMAGE", "IMAGE")
    RETURN_NAMES = ("output_path", "last_image", "loop_images")
    OUTPUT_NODE = True
    FUNCTION = "save_chunk"
    CATEGORY = "LikeJ/Video"

    def save_chunk(self, loop_flow, images, fps, crf, preset, directory, output_filename, embed_workflow=True, auto_queue=True, force_finish=False, audio=None, node_id=None, prompt=None, extra_pnginfo=None):
        crop_offset = loop_flow["crop_offset"]
        is_finished = loop_flow["is_finished"] or force_finish
        next_start_frame = loop_flow["next_start_frame"]
        load_node_id = loop_flow["load_node_id"]
        is_first_chunk = loop_flow.get("is_first_chunk", False)
        total_frames = loop_flow.get("total_frames", 0)

        # Handle output subfolder path
        base_output_dir = folder_paths.get_output_directory()
        clean_dir = directory.strip().strip('"').strip("'")
        if clean_dir:
            output_dir = os.path.join(base_output_dir, clean_dir)
        else:
            output_dir = base_output_dir
        os.makedirs(output_dir, exist_ok=True)

        clean_name = output_filename.strip().strip('"').strip("'")
        if clean_name.lower().endswith(".mp4"):
            clean_name = clean_name[:-4]

        valid_images = images[crop_offset:]
        images_np = (valid_images.cpu().numpy() * 255.0).astype(np.uint8)
        h, w, _ = images_np[0].shape

        if is_first_chunk and node_id in ENCODER_SESSIONS:
            old_proc = ENCODER_SESSIONS[node_id].get("proc")
            if old_proc and old_proc.poll() is None:
                try:
                    old_proc.kill()
                except Exception:
                    pass
            del ENCODER_SESSIONS[node_id]

        if node_id not in ENCODER_SESSIONS or ENCODER_SESSIONS[node_id]["proc"].poll() is not None:
            final_output_path = get_unique_path(output_dir, clean_name, ".mp4")
            temp_video_only = final_output_path + ".temp.mp4"

            cmd = [
                "ffmpeg",
                "-y",
                "-f",
                "rawvideo",
                "-vcodec",
                "rawvideo",
                "-s",
                f"{w}x{h}",
                "-pix_fmt",
                "bgr24",
                "-r",
                str(fps),
                "-i",
                "-",
                "-c:v",
                "libx264",
                "-crf",
                str(crf),
                "-preset",
                str(preset),
                "-r",
                str(fps),
                "-movflags",
                "frag_keyframe+empty_moov",
                "-pix_fmt",
                "yuv420p",
            ]

            # Embed Workflow metadata into MP4 comment tag
            if embed_workflow:
                workflow_data = {}
                if extra_pnginfo is not None and "workflow" in extra_pnginfo:
                    workflow_data["workflow"] = extra_pnginfo["workflow"]
                if prompt is not None:
                    workflow_data["prompt"] = prompt
                if workflow_data:
                    cmd.extend(["-metadata", f"comment={json.dumps(workflow_data)}"])

            cmd.append(temp_video_only)

            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            ENCODER_SESSIONS[node_id] = {
                "proc": proc,
                "final_path": final_output_path,
                "temp_video": temp_video_only,
                "audio": audio,
                "output_dir": output_dir,
                "initial_start_frame": loop_flow.get("effective_start", 0),
                "fps": fps,
            }
        else:
            ENCODER_SESSIONS[node_id]["audio"] = audio

        session = ENCODER_SESSIONS[node_id]
        proc = session["proc"]

        raw_bytes = bytearray()
        for frame in images_np:
            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            raw_bytes.extend(frame_bgr.tobytes())

        try:
            proc.stdin.write(bytes(raw_bytes))
            proc.stdin.flush()
        except Exception as e:
            print(f"[LikeJ Loop] FFmpeg pipe write failed: {e}")

        processed_frames = min(next_start_frame, total_frames) if total_frames > 0 else next_start_frame

        if node_id is not None:
            PromptServer.instance.send_sync("likej_save_info", {"save_node_id": node_id, "processed_frames": processed_frames, "total_frames": total_frames, "fps": float(fps)})

        final_path = ""
        if is_finished:
            final_path = finalize_encoder_session(node_id) or session["final_path"]

        PromptServer.instance.send_sync(
            "likej_loop_next", {"load_node_id": load_node_id, "save_node_id": node_id, "next_start_frame": next_start_frame, "is_finished": is_finished, "auto_queue": auto_queue}
        )

        last_image = valid_images[-1:]

        return {
            "ui": {"images": self._tensor_to_preview(valid_images[-1:]), "save_info": [{"processed_frames": processed_frames, "total_frames": total_frames, "fps": float(fps)}]},
            "result": (final_path or session["final_path"], last_image, valid_images),
        }

    def _tensor_to_preview(self, tensor):
        from PIL import Image

        img_np = (tensor[0].numpy() * 255).astype(np.uint8)
        img = Image.fromarray(img_np)

        subfolder = "likej_preview"
        full_output_folder = os.path.join(folder_paths.get_temp_directory(), subfolder)
        os.makedirs(full_output_folder, exist_ok=True)

        file_name = "preview_last_frame.png"
        img.save(os.path.join(full_output_folder, file_name))
        return [{"filename": file_name, "subfolder": subfolder, "type": "temp"}]