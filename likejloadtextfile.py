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


# API：儲存修改後的檔案內容
@PromptServer.instance.routes.post("/likej/save_file_content")
async def save_file_content(request):
    try:
        data = await request.json()
        raw_path = data.get("path", "")
        content = data.get("content", "")
        encoding = data.get("encoding", "auto")

        file_path = resolve_target_path(raw_path)

        if not file_path:
            cleaned = re.sub(r'[\u200e\u200f\u200b-\u200d\ufeff]', '', str(raw_path)).strip()
            if cleaned:
                if os.path.isabs(cleaned):
                    file_path = cleaned
                else:
                    file_path = os.path.join(folder_paths.get_input_directory(), cleaned)

        if not file_path:
            return web.json_response({"success": False, "error": "找不到指定路徑的檔案。"})

        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        target_encoding = "utf-8" if encoding == "auto" else encoding

        with open(file_path, "w", encoding=target_encoding, errors="replace") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())

        return web.json_response({"success": True, "path": file_path})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


# API：取得指定目錄下的所有文本檔案
@PromptServer.instance.routes.post("/likej/list_dir_files")
async def list_dir_files(request):
    try:
        data = await request.json()
        raw_dir = data.get("directory", "").strip()

        if not raw_dir:
            return web.json_response({"files": []})

        dir_path = os.path.normpath(raw_dir)
        if not os.path.isabs(dir_path):
            dir_path = os.path.join(folder_paths.get_input_directory(), dir_path)

        if not os.path.exists(dir_path) or not os.path.isdir(dir_path):
            return web.json_response({"files": [], "error": "Directory does not exist."})

        valid_exts = ('.txt', '.json', '.csv', '.md', '.log', '.yaml', '.yml', '.prompt')
        files = []
        for f in os.listdir(dir_path):
            full_p = os.path.join(dir_path, f)
            if os.path.isfile(full_p) and f.lower().endswith(valid_exts):
                files.append(f)

        files.sort()
        return web.json_response({"files": files})
    except Exception as e:
        return web.json_response({"files": [], "error": str(e)})


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
                "directory": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "placeholder": "Folder path (Optional, e.g. C:/prompts)"
                }),
            }
        }

    # ⚠️ 這裡必須保持與 INPUT_TYPES 同階級縮進！
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_NODE = True
    FUNCTION = "load_text"
    CATEGORY = "LikeJ"

    def load_text(self, directory, path, encoding):
        file_path = resolve_target_path(path)

        if not file_path and directory and path:
            dir_path = os.path.normpath(directory.strip())
            if not os.path.isabs(dir_path):
                dir_path = os.path.join(folder_paths.get_input_directory(), dir_path)
            candidate = os.path.join(dir_path, os.path.basename(path.strip()))
            file_path = resolve_target_path(candidate)

        if not file_path:
            print(f"[LikeJLoadTextFile] Warning: File not found for input (path: {path}, dir: {directory}), returning empty string.")
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