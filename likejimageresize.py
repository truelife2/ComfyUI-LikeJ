import torch
import torch.nn.functional as F
import comfy.utils

class LikeJImageResize:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE", {
                    "tooltip": "Input image to resize, pad, or outpaint."
                }),
                "width": ("INT", {
                    "default": 512, "min": 1, "max": 16384, "step": 1,
                    "tooltip": "Target output image width in pixels."
                }),
                "height": ("INT", {
                    "default": 512, "min": 1, "max": 16384, "step": 1,
                    "tooltip": "Target output image height in pixels."
                }),
                "interpolation": (
                    ["bicubic", "bilinear", "nearest-exact", "area", "lanczos"],
                    {
                        "default": "bicubic",
                        "tooltip": "Resampling algorithm for image scaling."
                    }
                ),
                "resize_mode": (
                    ["stretch", "crop", "pad (color)", "pad (edge)", "pad (reflect)"],
                    {
                        "default": "stretch",
                        "tooltip": "Fitting strategy: stretch to exact target size, crop to fill, or pad edges."
                    }
                ),
                "position": (
                    [
                        "center",
                        "top-left", "top-center", "top-right",
                        "center-left", "center-right",
                        "bottom-left", "bottom-center", "bottom-right"
                    ],
                    {
                        "default": "center",
                        "tooltip": "Alignment anchor when cropping or padding the image."
                    }
                ),
                "pad_top": ("INT", {
                    "default": 0, "min": 0, "max": 8192, "step": 1,
                    "tooltip": "Pixels to expand at the top boundary for outpainting."
                }),
                "pad_bottom": ("INT", {
                    "default": 0, "min": 0, "max": 8192, "step": 1,
                    "tooltip": "Pixels to expand at the bottom boundary for outpainting."
                }),
                "pad_left": ("INT", {
                    "default": 0, "min": 0, "max": 8192, "step": 1,
                    "tooltip": "Pixels to expand at the left boundary for outpainting."
                }),
                "pad_right": ("INT", {
                    "default": 0, "min": 0, "max": 8192, "step": 1,
                    "tooltip": "Pixels to expand at the right boundary for outpainting."
                }),
                "pad_color": ("STRING", {
                    "default": "#000000",
                    "tooltip": "HEX color code used when resize_mode or padding is set to color."
                }),
                "mask_grow": ("INT", {
                    "default": 8, "min": 0, "max": 256, "step": 1,
                    "tooltip": "Expands mask into original image edges (8px covers 1 VAE latent block to avoid seams)."
                }),
                "feather_radius": ("INT", {
                    "default": 16, "min": 0, "max": 256, "step": 1,
                    "tooltip": "Blurs mask edges for smooth inpaint blending. Set to 0 for exact binary mask."
                }),
                "invert_mask": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Inverts output mask values (1 becomes 0, 0 becomes 1)."
                }),
            },
            "optional": {
                "mask": ("MASK", {
                    "tooltip": "Optional existing mask to transform in sync with the image."
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "execute"
    CATEGORY = "LikeJ"

    def _hex_to_rgb(self, hex_str):
        hex_str = hex_str.lstrip('#')
        if len(hex_str) != 6:
            return (0.0, 0.0, 0.0)
        return tuple(int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4))

    def _get_align_offsets(self, position, total_diff_w, total_diff_h):
        if "left" in position:
            off_x = 0
        elif "right" in position:
            off_x = total_diff_w
        else:
            off_x = total_diff_w // 2

        if "top" in position:
            off_y = 0
        elif "bottom" in position:
            off_y = total_diff_h
        else:
            off_y = total_diff_h // 2

        return off_x, off_y

    def _interpolate_tensor(self, tensor, target_h, target_w, mode):
        return comfy.utils.common_upscale(tensor, target_w, target_h, upscale_method=mode, crop="disabled")

    def _pad_tensor(self, tensor, p_left, p_right, p_top, p_bottom, pad_type, color_tensor=None, is_mask=False, mask_pad_val=1.0):
        if p_left == 0 and p_right == 0 and p_top == 0 and p_bottom == 0:
            return tensor

        if is_mask:
            return F.pad(tensor, (p_left, p_right, p_top, p_bottom), mode="constant", value=mask_pad_val)

        if pad_type == "edge":
            return F.pad(tensor, (p_left, p_right, p_top, p_bottom), mode="replicate")
        elif pad_type == "reflect":
            try:
                return F.pad(tensor, (p_left, p_right, p_top, p_bottom), mode="reflect")
            except Exception:
                return F.pad(tensor, (p_left, p_right, p_top, p_bottom), mode="replicate")
        else:
            padded = F.pad(tensor, (p_left, p_right, p_top, p_bottom), mode="constant", value=0.0)
            pad_mask = torch.ones_like(padded)
            _, _, h_orig, w_orig = tensor.shape
            pad_mask[:, :, p_top:p_top+h_orig, p_left:p_left+w_orig] = 0.0
            return torch.where(pad_mask == 1.0, color_tensor, padded)

    def _apply_crop_and_resize(self, tensor, target_w, target_h, resize_mode, position, interpolation, color_tensor, is_mask=False):
        _, _, h, w = tensor.shape
        interp_mode = "nearest-exact" if (is_mask and interpolation == "nearest-exact") else interpolation
        if is_mask and interp_mode not in ["nearest-exact", "bilinear"]:
            interp_mode = "bilinear"

        if resize_mode == "stretch":
            return self._interpolate_tensor(tensor, target_h, target_w, interp_mode)

        elif resize_mode == "crop":
            scale = max(target_w / w, target_h / h)
            new_w, new_h = round(w * scale), round(h * scale)
            resized = self._interpolate_tensor(tensor, new_h, new_w, interp_mode)

            start_x, start_y = self._get_align_offsets(position, new_w - target_w, new_h - target_h)
            return resized[:, :, start_y:start_y + target_h, start_x:start_x + target_w]

        elif resize_mode.startswith("pad"):
            scale = min(target_w / w, target_h / h)
            new_w, new_h = round(w * scale), round(h * scale)
            resized = self._interpolate_tensor(tensor, new_h, new_w, interp_mode)

            pad_x = target_w - new_w
            pad_y = target_h - new_h
            p_left, p_top = self._get_align_offsets(position, pad_x, pad_y)
            p_right = pad_x - p_left
            p_bottom = pad_y - p_top

            if "edge" in resize_mode:
                pad_type = "edge"
            elif "reflect" in resize_mode:
                pad_type = "reflect"
            else:
                pad_type = "color"

            # 縮放引起的 letterbox 補邊，遮罩補邊使用邊界模式避免全白覆蓋
            mask_val = 1.0 if pad_type == "color" else 0.0
            return self._pad_tensor(resized, p_left, p_right, p_top, p_bottom, pad_type, color_tensor, is_mask, mask_pad_val=mask_val)

        return tensor

    def execute(self, image, width, height, interpolation, resize_mode, position,
                pad_top, pad_bottom, pad_left, pad_right, pad_color="#000000",
                mask_grow=8, feather_radius=16, invert_mask=False, mask=None):

        B, H, W, C = image.shape

        if mask is None:
            mask = torch.zeros((B, H, W), dtype=image.dtype, device=image.device)
        else:
            if mask.dim() == 2:
                mask = mask.unsqueeze(0)
            elif mask.dim() == 4:
                mask = mask.squeeze(1)

            if mask.shape[1] != H or mask.shape[2] != W:
                mask = F.interpolate(
                    mask.unsqueeze(1),
                    size=(H, W),
                    mode="bilinear",
                    align_corners=False
                ).squeeze(1)

            if mask.shape[0] != B:
                if mask.shape[0] == 1:
                    mask = mask.repeat(B, 1, 1)
                else:
                    mask = mask[:B]

        img_tensor = image.permute(0, 3, 1, 2)
        mask_tensor = mask.unsqueeze(1)

        r, g, b = self._hex_to_rgb(pad_color)
        color_tensor = torch.tensor([r, g, b] if C == 3 else [r, g, b, 1.0], device=image.device).view(1, C, 1, 1)

        if "edge" in resize_mode:
            pre_pad_type = "edge"
        elif "reflect" in resize_mode:
            pre_pad_type = "reflect"
        else:
            pre_pad_type = "color"

        # 1. 顯式 Outpaint Padding (主動擴展區為白色 1.0)
        if pad_top > 0 or pad_bottom > 0 or pad_left > 0 or pad_right > 0:
            img_tensor = self._pad_tensor(img_tensor, pad_left, pad_right, pad_top, pad_bottom, pre_pad_type, color_tensor, is_mask=False)
            mask_tensor = self._pad_tensor(mask_tensor, pad_left, pad_right, pad_top, pad_bottom, pre_pad_type, color_tensor, is_mask=True, mask_pad_val=1.0)

        # 2. Resize & Crop/Pad 處理
        out_img = self._apply_crop_and_resize(
            tensor=img_tensor, target_w=width, target_h=height,
            resize_mode=resize_mode, position=position,
            interpolation=interpolation, color_tensor=color_tensor, is_mask=False
        )
        out_mask = self._apply_crop_and_resize(
            tensor=mask_tensor, target_w=width, target_h=height,
            resize_mode=resize_mode, position=position,
            interpolation=interpolation, color_tensor=color_tensor, is_mask=True
        )

        # 3. 遮罩咬邊處理
        if mask_grow > 0:
            kernel_size = mask_grow * 2 + 1
            out_mask = F.max_pool2d(out_mask, kernel_size, stride=1, padding=mask_grow)

        # 4. 羽化或二值化切換
        if feather_radius > 0:
            kernel_size = feather_radius * 2 + 1
            out_mask = F.avg_pool2d(out_mask, kernel_size, stride=1, padding=feather_radius)
            out_mask = torch.clamp(out_mask, 0.0, 1.0)
        else:
            out_mask = (out_mask >= 0.5).float()

        # 5. 轉回 ComfyUI 標準格式與反轉處理
        out_img = out_img.permute(0, 2, 3, 1)
        out_mask = out_mask.squeeze(1)

        if invert_mask:
            out_mask = 1.0 - out_mask

        return (out_img, out_mask)

