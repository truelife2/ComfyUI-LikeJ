import os
import uuid
import torch
import numpy as np
from PIL import Image
import folder_paths

class LikeJMaskFill:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE", {
                    "tooltip": "Input image to apply color fill or cutout."
                }),
                "mask": ("MASK", {
                    "tooltip": "Mask defining the region to fill or make transparent."
                }),
                "transparent": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If true, cutout the mask region to fully transparent instead of filling color."
                }),
                "hex_color": ("COLOR", {
                    "default": "#FFFFFF",
                    "tooltip": "Click to open the color picker window."
                }),
                "opacity": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                    "display": "number",
                    "tooltip": "Opacity of the filled color (0.0 is fully transparent, 1.0 is fully opaque)."
                }),
                "invert_mask": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If true, fill/cutout outside the mask (background) instead of inside."
                }),
                "remove_alpha": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If true, fills transparent areas with color and strips alpha channel (outputs 3-channel RGB)."
                }),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    OUTPUT_NODE = True
    FUNCTION = "fill_color"
    CATEGORY = "LikeJ"

    def _hex_to_rgb(self, hex_str):
        if not isinstance(hex_str, str):
            hex_str = "#FFFFFF"
        
        hex_str = hex_str.strip().lstrip('#')
        if len(hex_str) != 6:
            hex_str = "FFFFFF"
        
        r = int(hex_str[0:2], 16) / 255.0
        g = int(hex_str[2:4], 16) / 255.0
        b = int(hex_str[4:6], 16) / 255.0
        return r, g, b

    def _generate_ui_preview(self, images):
        output_dir = folder_paths.get_temp_directory()
        ui_images = []
        batch_id = uuid.uuid4().hex[:8]

        for i, img_tensor in enumerate(images):
            array = (img_tensor.cpu().numpy() * 255.0).astype(np.uint8)
            if array.shape[-1] == 3:
                img = Image.fromarray(array, mode="RGB")
            else:
                img = Image.fromarray(array, mode="RGBA")
            
            filename = f"likej_fill_preview_{batch_id}_{i:02d}.png"
            filepath = os.path.join(output_dir, filename)
            img.save(filepath, format="PNG")

            ui_images.append({
                "filename": filename,
                "subfolder": "",
                "type": "temp"
            })

        return ui_images

    def fill_color(self, image, mask, transparent, hex_color, opacity, invert_mask, remove_alpha=False):
        batch_size, h, w, c = image.shape
        device = image.device
        dtype = image.dtype

        if mask is None or mask.numel() == 0:
            ui_preview = self._generate_ui_preview(image)
            return {"ui": {"images": ui_preview}, "result": (image,)}

        if mask.ndim == 2:
            mask = mask.unsqueeze(0)
        
        mask_h, mask_w = mask.shape[1], mask.shape[2]
        if mask_h != h or mask_w != w:
            mask = mask.unsqueeze(1)
            mask = torch.nn.functional.interpolate(
                mask, size=(h, w), mode="bilinear", align_corners=False
            )
            mask = mask.squeeze(1)

        if invert_mask:
            mask = 1.0 - mask

        mask_expanded = mask.unsqueeze(-1).to(device, dtype=dtype)

        if transparent:
            # 挖空透明模式（強制保持 4 通道 RGBA）
            if c == 4:
                rgb = image[..., :3]
                alpha = image[..., 3:]
                filled_alpha = alpha * (1.0 - mask_expanded)
                out_image = torch.cat([rgb, filled_alpha], dim=-1)
            else:
                base_alpha = torch.ones((batch_size, h, w, 1), device=device, dtype=dtype)
                filled_alpha = base_alpha * (1.0 - mask_expanded)
                out_image = torch.cat([image, filled_alpha], dim=-1)
        else:
            # 一般填色模式
            r, g, b = self._hex_to_rgb(hex_color)
            fill_color_val = torch.tensor([r, g, b], device=device, dtype=dtype)
            fill_tensor = fill_color_val.view(1, 1, 1, 3).repeat(batch_size, h, w, 1)

            effective_mask = mask_expanded * opacity

            if c == 4:
                rgb = image[..., :3]
                alpha = image[..., 3:]

                if remove_alpha:
                    # 開啟 remove_alpha：將透明底填入顏色並壓平，強制轉為 3 通道 (RGB)
                    base_rgb = rgb * alpha + fill_tensor * (1.0 - alpha)
                    out_image = base_rgb * (1.0 - effective_mask) + fill_tensor * effective_mask
                else:
                    # 未開啟 remove_alpha：維持 4 通道 (RGBA)
                    filled_rgb = rgb * (1.0 - effective_mask) + fill_tensor * effective_mask
                    filled_alpha = alpha * (1.0 - effective_mask) + 1.0 * effective_mask
                    out_image = torch.cat([filled_rgb, filled_alpha], dim=-1)
            else:
                # 原圖本身即為 3 通道 (RGB)
                rgb = image[..., :3]
                out_image = rgb * (1.0 - effective_mask) + fill_tensor * effective_mask

        ui_preview = self._generate_ui_preview(out_image)

        return {
            "ui": {"images": ui_preview},
            "result": (out_image,)
        }