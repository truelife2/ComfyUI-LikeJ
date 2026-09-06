import os
import torch
import folder_paths

class AnyType(str):
    def __eq__(self, __value: object) -> bool:
        return True
    def __ne__(self, __value: object) -> bool:
        return False

ANY = AnyType("*")

# 指定儲存目錄：ComfyUI/output/LikeJNodeRepo
REPO_DIR = os.path.join(folder_paths.get_output_directory(), "LikeJNodeRepo")
os.makedirs(REPO_DIR, exist_ok=True)


def get_saved_files():
    """動態取得已儲存的檔案列表（始終包含 None 選項）"""
    if not os.path.exists(REPO_DIR):
        return ["None"]
    files = [f for f in os.listdir(REPO_DIR) if os.path.isfile(os.path.join(REPO_DIR, f)) and not f.startswith('.')]
    return ["None"] + sorted(files)  # 加上 ["None"] + ，確保 "None" 永遠在選單清單中


def detect_extension(data) -> str:
    """根據輸入資料結構自動判斷對應的副檔名"""
    if data is None:
        return ".data"
    
    # 1. Latent
    if isinstance(data, dict) and "samples" in data:
        return ".latent"
    
    # 2. Image 或 Mask (PyTorch Tensor)
    elif isinstance(data, torch.Tensor):
        if data.ndim == 4:
            return ".image"
        elif data.ndim in (2, 3):
            return ".mask"
        return ".tensor"
    
    # 3. Conditioning
    elif isinstance(data, list) and len(data) > 0:
        if isinstance(data[0], (list, tuple)) and len(data[0]) == 2 and isinstance(data[0][0], torch.Tensor):
            return ".condition"
        return ".list"
    
    # 4. Model / ModelPatcher
    elif "ModelPatcher" in type(data).__name__ or hasattr(data, "model"):
        return ".model"
    
    # 5. CLIP
    elif "CLIP" in type(data).__name__:
        return ".clip"
    
    # 6. VAE
    elif "VAE" in type(data).__name__:
        return ".vae"
    
    # 7. 基本純值 (int, float, str, bool)
    elif isinstance(data, (int, float, str, bool)):
        return f".{type(data).__name__}"
    
    # 預設後備副檔名
    cls_name = type(data).__name__.lower()
    return f".{cls_name}" if cls_name != "object" else ".data"


class LikeJNodeRepo:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        saved_files = get_saved_files()
        return {
            "required": {
                "mode": (["Save & Output", "Load Selected File", "Passthrough Only"], {"default": "Save & Output"}),
                "save_name": ("STRING", {"default": "my_node_data"}),
                "selected_file": (saved_files, ),
            },
            "optional": {
                "input_data": (ANY, ),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output_data",)
    FUNCTION = "execute"
    CATEGORY = "LikeJ"
    OUTPUT_NODE = True

    def execute(self, mode, save_name, selected_file, input_data=None):
        os.makedirs(REPO_DIR, exist_ok=True)

        # 模式 1：儲存並輸出連入節點
        if mode == "Save & Output":
            if input_data is None:
                print("[LikeJNodeRepo] 警告: 未連接 input_data，無法儲存。")
                return (None,)

            # 自動偵測副檔名
            ext = detect_extension(input_data)
            filename = save_name.strip()
            
            # 若輸入的檔名尾端沒有對應副檔名，則自動補上
            if not filename.endswith(ext):
                filename = f"{filename}{ext}"

            filepath = os.path.join(REPO_DIR, filename)
            try:
                torch.save(input_data, filepath)
                print(f"[LikeJNodeRepo] 自動辨識型態為 [{ext}]，成功儲存至: {filepath}")
            except Exception as e:
                print(f"[LikeJNodeRepo] 儲存失敗: {e}")

            return (input_data,)

        # 模式 2：讀取選取的檔案並輸出
        elif mode == "Load Selected File":
            if selected_file == "None" or not selected_file:
                print("[LikeJNodeRepo] 警告: 未選取有效的儲存檔案。")
                return (None,)

            filepath = os.path.join(REPO_DIR, selected_file)
            if os.path.exists(filepath):
                try:
                    loaded_data = torch.load(filepath, map_location="cpu")
                    print(f"[LikeJNodeRepo] 已成功載入資料: {filepath}")
                    return (loaded_data,)
                except Exception as e:
                    print(f"[LikeJNodeRepo] 載入失敗 ({filepath}): {e}")
                    return (None,)
            else:
                print(f"[LikeJNodeRepo] 找不到檔案: {filepath}")
                return (None,)

        # 模式 3：僅直通
        else:
            return (input_data,)