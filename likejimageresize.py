import torch
import torch.nn.functional as F
import comfy.utils

class LikeJImageResize:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "width": ("INT", {"default": 512, "min": 1, "max": 16384, "step": 1}),
                "height": ("INT", {"default": 512, "min": 1, "max": 16384, "step": 1}),
                "interpolation": (
                    ["bicubic", "bilinear", "nearest-exact", "area", "lanczos"],
                    {"default": "bicubic"}
                ),
                "resize_mode": (
                    ["disabled", "crop", "pad (color)", "pad (edge)", "pad (reflect)"],
                    {"default": "disabled"}
                ),
                "position": (
                    [
                        "center",
                        "top-left", "top-center", "top-right",
                        "center-left", "center-right",
                        "bottom-left", "bottom-center", "bottom-right"
                    ],
                    {"default": "center"}
                ),
                "pad_top": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "pad_bottom": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "pad_left": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "pad_right": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "pad_color": ("STRING", {"default": "#000000"}),
            },
            "optional": {
                "mask": ("MASK",),
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
        """改用 ComfyUI 內建 common_upscale 處理，支援包含 Lanczos 在內的所有模式"""
        # tensor 格式為 [B, C, H, W]
        return comfy.utils.common_upscale(tensor, target_w, target_h, upscale_method=mode, crop="disabled")

    def _pad_tensor(self, tensor, p_left, p_right, p_top, p_bottom, pad_type, color_tensor=None, is_mask=False):
        if p_left == 0 and p_right == 0 and p_top == 0 and p_bottom == 0:
            return tensor

        if is_mask:
            return F.pad(tensor, (p_left, p_right, p_top, p_bottom), mode="constant", value=1.0)

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

        if resize_mode == "disabled":
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

            return self._pad_tensor(resized, p_left, p_right, p_top, p_bottom, pad_type, color_tensor, is_mask)

        return tensor

    def execute(self, image, width, height, interpolation, resize_mode, position,
                pad_top, pad_bottom, pad_left, pad_right, pad_color="#000000", mask=None):

        B, H, W, C = image.shape

        if mask is None:
            mask = torch.zeros((B, H, W), dtype=image.dtype, device=image.device)
        elif mask.dim() == 2:
            mask = mask.unsqueeze(0).repeat(B, 1, 1)

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

        if pad_top > 0 or pad_bottom > 0 or pad_left > 0 or pad_right > 0:
            img_tensor = self._pad_tensor(img_tensor, pad_left, pad_right, pad_top, pad_bottom, pre_pad_type, color_tensor, is_mask=False)
            mask_tensor = self._pad_tensor(mask_tensor, pad_left, pad_right, pad_top, pad_bottom, pre_pad_type, color_tensor, is_mask=True)

        out_img = self._apply_crop_and_resize(
            tensor=img_tensor,
            target_w=width,
            target_h=height,
            resize_mode=resize_mode,
            position=position,
            interpolation=interpolation,
            color_tensor=color_tensor,
            is_mask=False
        )
        out_mask = self._apply_crop_and_resize(
            tensor=mask_tensor,
            target_w=width,
            target_h=height,
            resize_mode=resize_mode,
            position=position,
            interpolation=interpolation,
            color_tensor=color_tensor,
            is_mask=True
        )

        out_img = out_img.permute(0, 2, 3, 1)
        out_mask = out_mask.squeeze(1)

        return (out_img, out_mask)
