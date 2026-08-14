import os
import re
import torch
import numpy as np
from PIL import Image, ImageOps

class LikeJLoadImages:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "directory": ("STRING", {
                    "default": "", 
                    "multiline": False,
                    "placeholder": "Absolute directory path"
                }),
                "files_output_mode": (["filename", "filename.ext", "path"], {
                    "default": "filename"
                }),
            },
            "optional": {
                "regex": ("STRING", {
                    "default": "", 
                    "multiline": False,
                    "placeholder": "(e.g., ^img_.*)"
                }),
                "skip_first": ("INT", {"default": 0, "min": 0, "max": 10000, "step": 1}),
                "load_cap": ("INT", {
                    "default": 0, 
                    "min": 0, 
                    "max": 10000, 
                    "step": 1, 
                    "tooltip": "Limit max images to load. Set to 0 for unlimited."
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "INT")
    RETURN_NAMES = ("images", "masks", "files", "count")
    OUTPUT_IS_LIST = (True, True, True, False)
    FUNCTION = "load_images"
    CATEGORY = "LikeJ"

    def load_images(self, directory: str, files_output_mode: str, regex: str = "", skip_first: int = 0, load_cap: int = 0):
        if not os.path.isdir(directory):
            raise ValueError(f"[LikeJLoadImages] Directory not found: {directory}")

        valid_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}
        all_files = sorted(os.listdir(directory))
        image_files = [f for f in all_files if os.path.splitext(f)[1].lower() in valid_extensions]

        # 套用不區分大小寫的 Regex 篩選
        if regex.strip():
            try:
                pattern = re.compile(regex, re.IGNORECASE)
                image_files = [f for f in image_files if pattern.search(f)]
            except re.error as e:
                raise ValueError(f"[LikeJLoadImages] Invalid Regex pattern '{regex}': {str(e)}")

        if skip_first > 0:
            image_files = image_files[skip_first:]
        if load_cap > 0:
            image_files = image_files[:load_cap]

        if not image_files:
            raise RuntimeError(f"[LikeJLoadImages] No matching valid images found in directory: {directory}")

        count = len(image_files)

        images = []
        masks = []
        files = []

        for filename in image_files:
            full_path = os.path.join(directory, filename)

            if files_output_mode == "filename":
                file_info = os.path.splitext(filename)[0]
            elif files_output_mode == "filename.ext":
                file_info = filename
            elif files_output_mode == "path":
                file_info = os.path.abspath(full_path)
            else:
                file_info = filename

            files.append(file_info)

            img = Image.open(full_path)
            img = ImageOps.exif_transpose(img)

            image_rgb = img.convert("RGB")
            image_np = np.array(image_rgb).astype(np.float32) / 255.0
            image_tensor = torch.from_numpy(image_np).unsqueeze(0)
            images.append(image_tensor)

            if "A" in img.getbands():
                alpha = img.getchannel("A")
                mask_np = np.array(alpha).astype(np.float32) / 255.0
                mask_np = 1.0 - mask_np
            else:
                mask_np = np.zeros((img.height, img.width), dtype=np.float32)

            mask_tensor = torch.from_numpy(mask_np).unsqueeze(0)
            masks.append(mask_tensor)

        return (images, masks, files, count)


NODE_CLASS_MAPPINGS = {
    "LikeJLoadImages": LikeJLoadImages
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LikeJLoadImages": "LikeJ Load Images From Directory"
}