import os
import io
import gc
import base64
import torch
import numpy as np
import folder_paths
from PIL import Image
from server import PromptServer
from aiohttp import web

WEB_DIRECTORY = "./js"

NODE_DIR = os.path.dirname(os.path.abspath(__file__))
LAYOUT_LLMS_DIR = os.path.join(NODE_DIR, "layout_llms")

if "LLM" not in folder_paths.folder_names_and_paths:
    folder_paths.add_model_folder_path("LLM", os.path.join(folder_paths.models_dir, "LLM"))

def get_instruction_files():
    """Scan layout_llms directory for .md and .txt files.
    Only create default.md when the directory is completely empty.
    """
    if not os.path.exists(LAYOUT_LLMS_DIR):
        os.makedirs(LAYOUT_LLMS_DIR, exist_ok=True)
    
    files = [f for f in os.listdir(LAYOUT_LLMS_DIR) if f.lower().endswith((".md", ".txt"))]
    
    if not files:
        default_file = os.path.join(LAYOUT_LLMS_DIR, "default.md")
        default_content = (
            "# Role and Purpose\n"
            "You are an expert AI Prompt Engineer specialized in crafting highly optimized prose prompts for the Krea 2 (Flux) image generation model. Your sole task is to take a user's rough, simple, or keyword-based image description and expand it into a rich, immersive, and flowing natural language paragraph.\n\n"
            "# Output Language Control\n"
            "1. **Default Language**: By default, your final prompt **MUST be generated in English**, as Krea 2's underlying text encoder (Qwen3-VL/T5) performs with the highest quality and accuracy using English descriptions.\n"
            "2. **User Override**: If the user explicitly requests a specific target language (e.g., \"Output in Traditional Chinese\", \"用繁體中文輸出\", \"日本語で\"), you MUST generate the final expanded prompt in that requested language.\n"
            "3. **Input Translation**: Unless specified otherwise by the user, automatically interpret any non-English user inputs (such as Chinese keywords) and translate the visual concepts into the target output language.\n\n"
            "# Krea 2 Core Prompting Rules\n"
            "1. **Use Natural Prose**: Never output comma-separated tags, keyword lists, or brackets. Write in fluid, descriptive sentences.\n"
            "2. **Subject First**: Always place the main subject or core action in the very first sentence to capture the encoder's front-loaded attention.\n"
            "3. **Target Length**: The final prompt must be a single, dense paragraph of roughly 180 to 250 words.\n"
            "4. **No Weighting Syntax**: Do not use traditional weights like `(word:1.2)` or `+++`. Instead, use precise, evocative adjectives (e.g., use \"oxblood red\" or \"crimson\" instead of \"red\").\n\n"
            "# Prompt Structure Breakdown\n"
            "Every optimized prompt you generate must seamlessly weave the following elements into a single paragraph:\n"
            "- **Core Subject**: Detailed description of the character, object, clothing, textures, and emotional expression.\n"
            "- **Action & Dynamics**: The motion, pose, or state of the subject.\n"
            "- **Environment & Composition**: Foreground, midground, background relationships, and camera angle/framing (e.g., close-up, dramatic low angle).\n"
            "- **Lighting & Atmosphere**: Direction, quality, color, and intensity of light (e.g., volumetric light, cinematic chiaroscuro).\n"
            "- **Medium & Style**: The artistic medium (e.g., professional dynamic action photography, 8k 3D render, oil painting texture).\n\n"
            "# Constraints\n"
            "- Do not include any conversational filler or introductory phrases (e.g., \"Here is your prompt:\", \"Sure!\").\n"
            "- Do not output markdown code blocks, titles, or headers around the text.\n"
            "- **Output ONLY the raw final prompt paragraph** so it can be passed directly into the image generation node."
        )
        try:
            with open(default_file, "w", encoding="utf-8") as f:
                f.write(default_content)
            files = ["default.md"]
        except Exception as e:
            print(f"[LikeJPromptGenerator Warning] Failed to create default instruction file: {e}")

    files.sort()
    return files if files else ["None"]

# --- API Routes ---
@PromptServer.instance.routes.get("/likej/get_instruction")
async def api_get_instruction(request):
    filename = request.query.get("filename")
    if not filename or filename == "None":
        return web.json_response({"error": "Missing filename"}, status=400)
    
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(LAYOUT_LLMS_DIR, safe_filename)
    
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            return web.json_response({"content": content})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
    return web.json_response({"error": "File not found"}, status=404)

@PromptServer.instance.routes.post("/likej/save_instruction")
async def api_save_instruction(request):
    data = await request.json()
    filename = data.get("filename", "").strip()
    content = data.get("content", "")

    if not filename:
        return web.json_response({"error": "Filename cannot be empty"}, status=400)

    if not (filename.endswith(".md") or filename.endswith(".txt")):
        filename += ".md"

    safe_filename = os.path.basename(filename)
    filepath = os.path.join(LAYOUT_LLMS_DIR, safe_filename)

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        updated_files = get_instruction_files()
        return web.json_response({"success": True, "filename": safe_filename, "files": updated_files})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/likej/delete_instruction")
async def api_delete_instruction(request):
    data = await request.json()
    filename = data.get("filename", "").strip()
    if not filename or filename == "None":
        return web.json_response({"error": "Invalid filename"}, status=400)

    safe_filename = os.path.basename(filename)
    filepath = os.path.join(LAYOUT_LLMS_DIR, safe_filename)

    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            updated_files = get_instruction_files()
            return web.json_response({"success": True, "files": updated_files})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
    return web.json_response({"error": "File not found"}, status=404)

def get_all_gguf_files():
    gguf_files = []
    search_dirs = []
    
    for folder in ["text_encoders", "LLM", "clip"]:
        try:
            paths = folder_paths.get_folder_paths(folder)
            search_dirs.extend(paths)
        except Exception:
            pass

    search_dirs = list(set(search_dirs))
    for base_dir in search_dirs:
        if os.path.exists(base_dir):
            for root, dirs, files in os.walk(base_dir):
                for file in files:
                    if file.lower().endswith(".gguf") and not file.lower().startswith("mmproj"):
                        rel_path = os.path.relpath(os.path.join(root, file), base_dir)
                        rel_path = rel_path.replace("\\", "/")
                        gguf_files.append(rel_path)

    return sorted(list(set(gguf_files))) if gguf_files else ["No .gguf models found"]

def resolve_full_path(rel_path):
    for folder in ["text_encoders", "LLM", "clip"]:
        try:
            base_paths = folder_paths.get_folder_paths(folder)
            for base in base_paths:
                full_path = os.path.join(base, rel_path)
                if os.path.exists(full_path):
                    return full_path
        except Exception:
            pass
    return None

def process_mask_crop(pil_img, mask_tensor, mode, padding):
    """根據 Mask 模式對 PIL 圖片進行 Bounding Box 裁切或遮罩處理"""
    mask_np = mask_tensor[0].cpu().numpy()
    
    if mask_np.shape[0] != pil_img.height or mask_np.shape[1] != pil_img.width:
        mask_pil = Image.fromarray((mask_np * 255).astype("uint8")).resize(pil_img.size, Image.Resampling.NEAREST)
        mask_np = np.array(mask_pil) / 255.0

    binary_mask = mask_np > 0.5
    if not np.any(binary_mask):
        return pil_img

    if mode == "Alpha Mask Black":
        img_np = np.array(pil_img)
        img_np[~binary_mask] = 0
        return Image.fromarray(img_np)

    rows = np.any(binary_mask, axis=1)
    cols = np.any(binary_mask, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]

    ymin = max(0, rmin - padding)
    ymax = min(pil_img.height, rmax + 1 + padding)
    xmin = max(0, cmin - padding)
    xmax = min(pil_img.width, cmax + 1 + padding)

    cropped_img = pil_img.crop((xmin, ymin, xmax, ymax))

    if mode == "Crop Strict Mask":
        cropped_mask = binary_mask[ymin:ymax, xmin:xmax]
        cropped_np = np.array(cropped_img)
        cropped_np[~cropped_mask] = 0
        cropped_img = Image.fromarray(cropped_np)

    return cropped_img

class LikeJPromptGenerator:
    _llm_instance = None
    _current_cache_key = None

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        all_gguf = get_all_gguf_files()
        instruction_files = get_instruction_files()

        return {
            "required": {
                "model_name": (all_gguf, ),
                "system_instruction_file": (instruction_files, ),
                "prompt": ("STRING", {
                    "multiline": True,
                    "default": "a dancing female",
                    "placeholder": "Enter simple prompt..."
                }),
                "n_gpu_layers": ("INT", {
                    "default": -1, 
                    "min": -1, 
                    "max": 128, 
                    "step": 1,
                    "tooltip": "-1 = Load all layers to GPU; 0 = CPU only"
                }),
                "n_ctx": ("INT", {
                    "default": 4096, 
                    "min": 512, 
                    "max": 32768, 
                    "step": 512,
                    "tooltip": "Context window size"
                }),
                "max_tokens": ("INT", {"default": 256, "min": 16, "max": 8192, "step": 16}),
                "temperature": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 2.0, "step": 0.05}),
                "top_p": ("FLOAT", {"default": 0.9, "min": 0.0, "max": 1.0, "step": 0.05, "tooltip": "Nucleus sampling probability threshold"}),
                "repeat_penalty": ("FLOAT", {"default": 1.1, "min": 1.0, "max": 2.0, "step": 0.05, "tooltip": "Penalty for repeating tokens"}),
                "image_target_size": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 128, "tooltip": "Resize max dimension of vision input to save VRAM and speed up"}),
                "mask_mode": ([
                    "Crop Bounding Box", 
                    "Crop Strict Mask", 
                    "Alpha Mask Black"
                ], {"default": "Crop Bounding Box", "tooltip": "Bounding Box: crop ROI with padding; Alpha Mask Black: black out non-mask area; Strict: crop ROI & black out non-mask"}),
                "mask_padding": ("INT", {"default": 0, "min": 0, "max": 256, "step": 8, "tooltip": "Extra padding pixels for Crop Bounding Box"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            },
            "optional": {
                "image1": ("IMAGE",),
                "mask1": ("MASK",),
                "image2": ("IMAGE",),
                "mask2": ("MASK",),
                "image3": ("IMAGE",),
                "mask3": ("MASK",),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("optimized_prompt",)
    FUNCTION = "generate_prompt"
    CATEGORY = "LikeJ/Prompt"

    def generate_prompt(self, model_name, system_instruction_file, prompt, n_gpu_layers=-1, n_ctx=4096, max_tokens=256, temperature=0.7, top_p=0.9, repeat_penalty=1.1, image_target_size=1024, mask_mode="Crop Bounding Box", mask_padding=32, seed=0, image1=None, mask1=None, image2=None, mask2=None, image3=None, mask3=None):
        try:
            from llama_cpp import Llama
        except ImportError:
            raise RuntimeError("[LikeJPromptGenerator Error] Missing 'llama-cpp-python' library!")

        instructions = ""
        if system_instruction_file and system_instruction_file != "None":
            instruction_path = os.path.join(LAYOUT_LLMS_DIR, system_instruction_file)
            if os.path.exists(instruction_path):
                try:
                    with open(instruction_path, "r", encoding="utf-8") as f:
                        instructions = f.read().strip()
                except Exception as e:
                    print(f"[LikeJPromptGenerator Error] Read instruction file failed: {e}")

        model_path = resolve_full_path(model_name)
        if not model_path or not os.path.exists(model_path):
            raise RuntimeError(f"[LikeJPromptGenerator] Model path not found: {model_name}")

        model_dir = os.path.dirname(model_path)
        
        # 收集有效的 (標籤, 圖片, 對應遮罩) 資料集
        valid_inputs = []
        if image1 is not None: valid_inputs.append(("Image 1", image1, mask1))
        if image2 is not None: valid_inputs.append(("Image 2", image2, mask2))
        if image3 is not None: valid_inputs.append(("Image 3", image3, mask3))

        mmproj_path = None
        if len(valid_inputs) > 0:
            for f in os.listdir(model_dir):
                if f.lower().startswith("mmproj") and f.lower().endswith(".gguf"):
                    mmproj_path = os.path.join(model_dir, f)
                    break

        cache_key = f"{model_path}_{n_gpu_layers}_{n_ctx}_{mmproj_path}"
        
        if LikeJPromptGenerator._current_cache_key != cache_key or LikeJPromptGenerator._llm_instance is None:
            print(f"[LikeJPromptGenerator] Loading GGUF model: {model_name}")

            if LikeJPromptGenerator._llm_instance is not None:
                del LikeJPromptGenerator._llm_instance
                LikeJPromptGenerator._llm_instance = None
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

            chat_handler = None
            if mmproj_path:
                try:
                    from llama_cpp.llama_chat_format import Llava16ChatHandler
                    print(f"[LikeJPromptGenerator] Loading Vision Projector: {os.path.basename(mmproj_path)}")
                    chat_handler = Llava16ChatHandler(clip_model_path=mmproj_path)
                except Exception as e:
                    print(f"[LikeJPromptGenerator Warning] Vision handler init failed: {e}")
                    chat_handler = None

            LikeJPromptGenerator._llm_instance = Llama(
                model_path=model_path,
                chat_handler=chat_handler,
                n_gpu_layers=int(n_gpu_layers),
                n_ctx=int(n_ctx),
                verbose=False
            )
            LikeJPromptGenerator._current_cache_key = cache_key

        llm = LikeJPromptGenerator._llm_instance

        # 處理多圖與獨立 Mask 裁切
        user_content = prompt
        if len(valid_inputs) > 0 and mmproj_path:
            content_list = [{"type": "text", "text": prompt}]

            for label, img_tensor, mask_tensor in valid_inputs:
                img_np = (img_tensor[0].cpu().numpy() * 255).astype("uint8")
                pil_img = Image.fromarray(img_np)

                # 當該張圖片有對應連接的 mask 時進行獨立裁切
                if mask_tensor is not None:
                    pil_img = process_mask_crop(pil_img, mask_tensor, mask_mode, mask_padding)

                # 智慧等比例縮放
                if max(pil_img.size) > image_target_size:
                    pil_img.thumbnail((image_target_size, image_target_size), Image.Resampling.LANCZOS)

                buffered = io.BytesIO()
                pil_img.save(buffered, format="JPEG", quality=90)
                base64_img = base64.b64encode(buffered.getvalue()).decode("utf-8")
                image_url = f"data:image/jpeg;base64,{base64_img}"

                content_list.append({"type": "text", "text": f"\n[{label}]:"})
                content_list.append({"type": "image_url", "image_url": {"url": image_url}})

            user_content = content_list

        messages = []
        if instructions:
            messages.append({"role": "system", "content": instructions})
        messages.append({"role": "user", "content": user_content})

        stop_tokens = [
            "<end_of_turn>", "<|im_end|>", "<|eot_id|>", "</s>",
            "<|end_of_text|>", "<|endoftext|>", "USER:", "ASSISTANT:"
        ]

        response = llm.create_chat_completion(
            messages=messages,
            max_tokens=int(max_tokens),
            temperature=float(temperature),
            top_p=float(top_p),
            repeat_penalty=float(repeat_penalty),
            seed=int(seed),
            stop=stop_tokens
        )

        optimized_prompt = response["choices"][0]["message"]["content"].strip()
        return (optimized_prompt,)