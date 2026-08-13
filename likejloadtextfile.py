import os
import re
import folder_paths
from server import PromptServer
from aiohttp import web

def resolve_target_path(raw_input):
    if not raw_input:
        return ""

    cleaned = re.sub(r'[\u200e\u200f\u200b-\u200d\ufeff]', '', str(raw_input))

    cleaned = cleaned.strip().strip('"\'' + '“”‘’').strip()

    if not cleaned or cleaned.lower() == "none":
        return ""

    cleaned = os.path.normpath(cleaned)

    if os.path.isabs(cleaned):
        candidate = cleaned
    else:
        input_dir = folder_paths.get_input_directory()
        candidate = os.path.join(input_dir, cleaned)

    if os.path.exists(candidate) and os.path.isfile(candidate):
        return candidate

    if not candidate.endswith(".txt") and os.path.exists(candidate + ".txt"):
        return candidate + ".txt"

    return ""


# API：提供前端即時預覽
@PromptServer.instance.routes.post("/likej/read_file_content")
async def read_file_content(request):
    try:
        data = await request.json()
        raw_path = data.get("path", "")
        encoding = data.get("encoding", "auto")

        file_path = resolve_target_path(raw_path)

        if not file_path:
            return web.json_response({"content": ""})

        target_encoding = encoding
        if encoding == "auto":
            try:
                import chardet
                with open(file_path, "rb") as f:
                    raw_data = f.read(10000)
                    detected = chardet.detect(raw_data)
                    target_encoding = detected.get("encoding", "utf-8") or "utf-8"
            except ImportError:
                target_encoding = "utf-8"

        with open(file_path, "r", encoding=target_encoding, errors="replace") as f:
            content = f.read()

        return web.json_response({"content": content})
    except Exception as e:
        return web.json_response({"content": "", "error": str(e)})


class LikeJLoadTextFile:
    @classmethod
    def INPUT_TYPES(s):
        encodings = [
            "auto", "utf-8", "utf-8-sig", "big5", "gbk", 
            "gb18030", "shift_jis", "cp950", "ascii", "latin1"
        ]

        return {
            "required": {
                "path": ("STRING", {
                    "default": "", 
                    "multiline": False, 
                    "placeholder": "Paste absolute path or click 📂 to upload"
                }),
                "encoding": (encodings, {"default": "auto"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_NODE = True
    FUNCTION = "load_text"
    CATEGORY = "LikeJ"

    def load_text(self, path, encoding):
        file_path = resolve_target_path(path)

        if not file_path:
            print(f"[LikeJLoadTextFile] Warning: File not found for input ({path}), returning empty string.")
            return {"ui": {"text": [""]}, "result": ("",)}

        target_encoding = encoding
        if encoding == "auto":
            try:
                import chardet
                with open(file_path, "rb") as f:
                    raw_data = f.read(10000)
                    detected = chardet.detect(raw_data)
                    target_encoding = detected.get("encoding", "utf-8") or "utf-8"
            except ImportError:
                print("[LikeJLoadTextFile] 'chardet' library not found. Falling back to 'utf-8'.")
                target_encoding = "utf-8"

        try:
            with open(file_path, "r", encoding=target_encoding, errors="replace") as f:
                content = f.read()
        except Exception as e:
            print(f"[LikeJLoadTextFile] Error reading file {file_path}: {e}")
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

        return {"ui": {"text": [content]}, "result": (content,)}
