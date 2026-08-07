import os
import torch
import torchaudio
import folder_paths
import comfy.model_management as mm
from transformers import AutoProcessor, WhisperForConditionalGeneration
from transformers.models.whisper.tokenization_whisper import TO_LANGUAGE_CODE

WHISPER_LANGUAGES = ["auto"] + sorted(list(TO_LANGUAGE_CODE.keys()))

TASK_MAP = {
    "transcribe": "transcribe",
    "translate(English)": "translate"
}

def get_audio_encoder_models():
    base_dir = os.path.join(folder_paths.models_dir, "audio_encoders")
    if os.path.exists(base_dir):
        folders = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
        if folders:
            return sorted(folders)
    return ["openai_whisper-large-v3"]

class LikeJWhisper:
    def __init__(self):
        self.processor = None
        self.model = None
        self.current_model_name = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO", ),
                "model_name": (get_audio_encoder_models(), ),
                "language": (WHISPER_LANGUAGES, {"default": "auto"}),
                "task": (list(TASK_MAP.keys()), {"default": "transcribe"}),
                "beam_size": ("INT", {"default": 5, "min": 1, "max": 20, "step": 1}),
                "temperature": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.1}),
                "repetition_penalty": ("FLOAT", {"default": 1.0, "min": 1.0, "max": 2.0, "step": 0.1}),
                "initial_prompt": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "transcribe"
    CATEGORY = "LikeJ"

    def load_model(self, model_name):
        model_path = os.path.join(folder_paths.models_dir, "audio_encoders", model_name)

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model directory not found. Please check if the path exists: {model_path}")
        
        if self.model is None or self.current_model_name != model_name:
            print(f"Loading Whisper model from: {model_path}")
            self.processor = AutoProcessor.from_pretrained(model_path)
            self.model = WhisperForConditionalGeneration.from_pretrained(
                model_path,
                torch_dtype=torch.float16
            )
            device = mm.get_torch_device()
            self.model.to(device)
            self.current_model_name = model_name
            print(f"Whisper model [{model_name}] loaded successfully.")
            
        return self.processor, self.model

    def transcribe(self, audio, model_name, language, task, beam_size, temperature, repetition_penalty, initial_prompt):
        processor, model = self.load_model(model_name)

        waveform = audio["waveform"][0]
        orig_sr = audio["sample_rate"]

        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        TARGET_SR = 16000
        if orig_sr != TARGET_SR:
            resampler = torchaudio.transforms.Resample(orig_freq=orig_sr, new_freq=TARGET_SR)
            waveform = resampler(waveform)

        audio_array = waveform.squeeze().numpy()
        device = model.device

        inputs = processor(
            audio_array,
            sampling_rate=TARGET_SR,
            return_tensors="pt"
        )

        input_features = inputs.input_features.to(device, dtype=torch.float16)

        gen_kwargs = {
            "input_features": input_features,
            "task": TASK_MAP[task],
            "num_beams": beam_size,
        }

        # 1. 帶入 Prompt
        if initial_prompt.strip():
            prompt_ids = processor.get_prompt_ids(initial_prompt, return_tensors="pt").to(device)
            gen_kwargs["prompt_ids"] = prompt_ids

        # 2. 帶入 Repetition Penalty
        if repetition_penalty > 1.0:
            gen_kwargs["repetition_penalty"] = repetition_penalty

        # 3. 帶入 Temperature
        if temperature > 0.0:
            gen_kwargs["temperature"] = temperature
            gen_kwargs["do_sample"] = True

        if language != "auto":
            gen_kwargs["language"] = language

        with torch.no_grad():
            predicted_ids = model.generate(**gen_kwargs)

        transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]

        return (transcription.strip(), )
