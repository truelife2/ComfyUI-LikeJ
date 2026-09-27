import os
import torch
import torchaudio
import folder_paths

class LikeJRecordAudio:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "target_sample_rate": ([44100, 48000, 32000, 24000, 16000, 8000], {
                    "default": 44100,
                    "tooltip": "Target sample rate for the audio output (Hz)"
                }),
                "channels": (["Stereo (2)", "Mono (1)"], {
                    "default": "Stereo (2)",
                    "tooltip": "Select audio channel mode"
                }),
            },
            "optional": {
                "trim_silence": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off"}),
                "silence_threshold_db": ("FLOAT", {
                    "default": -30.0,
                    "min": -60.0,
                    "max": -5.0,
                    "step": 1.0,
                    "tooltip": "Silence threshold in dB relative to peak volume."
                }),
                "normalize_audio": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off"}),
                "target_peak_db": ("FLOAT", {
                    "default": -1.0,
                    "min": -10.0,
                    "max": 0.0,
                    "step": 0.5,
                    "tooltip": "Target peak volume in dB. -1.0 dB leaves headroom to avoid digital clipping."
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "process_audio"
    CATEGORY = "LikeJ/Audio"

    def process_audio(self, target_sample_rate, channels, trim_silence=False, silence_threshold_db=-30.0, normalize_audio=True, target_peak_db=-1.0, unique_id=None, extra_pnginfo=None):
        recorded_file = ""

        # Retrieve recorded filename from node properties attached by frontend JS
        if extra_pnginfo and "workflow" in extra_pnginfo:
            nodes = extra_pnginfo["workflow"].get("nodes", [])
            for node in nodes:
                if str(node.get("id")) == str(unique_id):
                    recorded_file = node.get("properties", {}).get("recorded_file", "")
                    break

        if not recorded_file:
            raise ValueError("❌ No audio recorded. Please click 'Record' and 'Stop' on the node before executing.")

        # Locate temporary or input audio file
        temp_dir = folder_paths.get_temp_directory()
        input_dir = folder_paths.get_input_directory()

        audio_path = os.path.join(temp_dir, os.path.basename(recorded_file))
        if not os.path.exists(audio_path):
            audio_path = os.path.join(input_dir, os.path.basename(recorded_file))

        if not os.path.exists(audio_path):
            try:
                audio_path = folder_paths.get_annotated_filepath(recorded_file)
            except Exception:
                pass

        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"❌ Temporary audio file not found: {recorded_file}. Please record again.")

        # Load audio file
        waveform, sr = torchaudio.load(audio_path)

        # 1. Resample if necessary
        if sr != target_sample_rate:
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=target_sample_rate)
            waveform = resampler(waveform)
            sr = target_sample_rate

        # 2. Channel Conversion
        target_ch = 1 if "Mono" in channels else 2
        curr_ch = waveform.shape[0]

        if curr_ch != target_ch:
            if target_ch == 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)
            elif target_ch == 2:
                waveform = waveform.repeat(2, 1)

        # 3. Anti-Noise & Robust Silence Trimming
        if trim_silence and waveform.numel() > 0:
            # Step A: Remove DC Offset
            waveform = waveform - torch.mean(waveform, dim=-1, keepdim=True)

            # Step B: Normalize relative to peak volume for silence detection
            max_peak = torch.max(torch.abs(waveform))
            norm_waveform = waveform / max_peak if max_peak > 1e-6 else waveform

            # Step C: Convert relative dB threshold
            threshold_amp = 10.0 ** (silence_threshold_db / 20.0)

            # Step D: Calculate RMS energy (30ms frame, 10ms hop)
            frame_length = int(sr * 0.03)
            hop_length = int(sr * 0.01)

            if norm_waveform.shape[-1] > frame_length:
                mono = norm_waveform.mean(dim=0, keepdim=True)
                frames = mono.unfold(1, frame_length, hop_length)
                rms_energy = torch.sqrt(torch.mean(frames ** 2, dim=-1)).squeeze(0)

                # Step E: Filter out short pops (requires >= 3 consecutive frames / ~30ms of sound)
                is_active = (rms_energy > threshold_amp).float()
                
                if is_active.sum() > 0:
                    kernel = torch.ones(1, 1, 3, device=waveform.device)
                    padded = torch.nn.functional.pad(is_active.view(1, 1, -1), (2, 0))
                    consecutive_count = torch.nn.functional.conv1d(padded, kernel).squeeze()
                    
                    valid_active_mask = (consecutive_count >= 3)
                    non_silent_frames = torch.where(valid_active_mask)[0]

                    if len(non_silent_frames) > 0:
                        first_frame = max(0, non_silent_frames[0].item() - 2)
                        last_frame = non_silent_frames[-1].item()

                        start_sample = first_frame * hop_length
                        end_sample = min(waveform.shape[-1], last_frame * hop_length + frame_length)

                        # Step F: Add 50ms safety margin around speech
                        margin = int(sr * 0.05)
                        start_sample = max(0, start_sample - margin)
                        end_sample = min(waveform.shape[-1], end_sample + margin)

                        waveform = waveform[:, start_sample:end_sample]

        # 4. Peak Normalization (峰值歸一化)
        if normalize_audio and waveform.numel() > 0:
            current_max = torch.max(torch.abs(waveform))
            if current_max > 1e-6:
                target_amp = 10.0 ** (target_peak_db / 20.0)
                waveform = (waveform / current_max) * target_amp

        # ComfyUI AUDIO tensor format: [batch, channels, samples]
        if waveform.ndim == 2:
            waveform = waveform.unsqueeze(0)

        audio_output = {
            "waveform": waveform,
            "sample_rate": sr
        }

        return (audio_output,)