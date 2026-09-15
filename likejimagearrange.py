import os
import json
import torch
import numpy as np
from PIL import Image, ImageDraw
from aiohttp import web
from server import PromptServer

LAYOUT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), "layout_boxes")
os.makedirs(LAYOUT_DIR, exist_ok=True)

routes = PromptServer.instance.routes


@routes.get("/likej/layouts")
async def list_layouts(request):
    files = os.listdir(LAYOUT_DIR)
    json_files = [f for f in files if f.endswith(".json")]
    result = []
    for f in json_files:
        name = os.path.splitext(f)[0]
        preview_file = f"{name}.png"
        has_preview = preview_file in files
        result.append({"name": name, "json_file": f, "preview_url": f"/likej/preview/{preview_file}" if has_preview else None})
    return web.json_response(result)


@routes.get("/likej/preview/{filename}")
async def get_preview(request):
    filename = request.match_info["filename"]
    file_path = os.path.join(LAYOUT_DIR, filename)
    if os.path.exists(file_path):
        response = web.FileResponse(file_path)
        response.headers["Cache-Control"] = "no-cache"
        return response
    return web.Response(status=404)


@routes.post("/likej/save_layout")
async def save_layout_preset(request):
    try:
        data = await request.json()
        filename = data.get("filename", "").strip()
        layout_data = data.get("layout", {})

        if not filename:
            return web.json_response({"success": False, "error": "Filename cannot be empty"}, status=400)

        safe_name = "".join([c for c in filename if c.isalnum() or c in ("-", "_", " ")]).strip()
        if not safe_name:
            return web.json_response({"success": False, "error": "Invalid filename"}, status=400)

        json_path = os.path.join(LAYOUT_DIR, f"{safe_name}.json")
        png_path = os.path.join(LAYOUT_DIR, f"{safe_name}.png")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(layout_data, f, indent=2, ensure_ascii=False)

        cw = layout_data.get("width", 1920)
        ch = layout_data.get("height", 1080)
        boxes = layout_data.get("boxes", [])

        thumb_w = 320
        thumb_h = max(1, int(320 * ch / cw))
        thumb = Image.new("RGBA", (thumb_w, thumb_h), (30, 30, 30, 255))
        draw = ImageDraw.Draw(thumb)
        scale = thumb_w / cw

        for b in boxes:
            pad_t = b.get("pad_top", 0) * scale
            pad_b = b.get("pad_bottom", 0) * scale
            pad_l = b.get("pad_left", 0) * scale
            pad_r = b.get("pad_right", 0) * scale

            bx = b.get("x", 0) * scale + pad_l
            by = b.get("y", 0) * scale + pad_t
            bw = b.get("w", 100) * scale - pad_l - pad_r
            bh = b.get("h", 100) * scale - pad_t - pad_b
            order = b.get("order", b.get("id", 1))

            if bw > 0 and bh > 0:
                draw.rectangle([bx, by, bx + bw, by + bh], fill=(0, 150, 255, 90), outline=(0, 210, 255, 255), width=2)
                draw.text((bx + bw / 2 - 4, by + bh / 2 - 6), f"#{order}", fill=(255, 255, 255, 255))

        thumb.convert("RGB").save(png_path, "PNG")

        return web.json_response({"success": True, "name": safe_name})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@routes.post("/likej/delete_layout")
async def delete_layout_preset(request):
    try:
        data = await request.json()
        filename = data.get("filename", "").strip()

        if not filename:
            return web.json_response({"success": False, "error": "Filename cannot be empty"}, status=400)

        safe_name = "".join([c for c in filename if c.isalnum() or c in ("-", "_", " ")]).strip()
        json_path = os.path.join(LAYOUT_DIR, f"{safe_name}.json")
        png_path = os.path.join(LAYOUT_DIR, f"{safe_name}.png")

        deleted = False
        if os.path.exists(json_path):
            os.remove(json_path)
            deleted = True
        if os.path.exists(png_path):
            os.remove(png_path)
            deleted = True

        if deleted:
            return web.json_response({"success": True, "name": safe_name})
        else:
            return web.json_response({"success": False, "error": "Preset file not found"}, status=404)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


class LikeJImageArrange:
    INPUT_IS_LIST = True

    RESAMPLE_METHODS = {
        "Lanczos": Image.Resampling.LANCZOS,
        "Bicubic": Image.Resampling.BICUBIC,
        "Bilinear": Image.Resampling.BILINEAR,
        "Nearest": Image.Resampling.NEAREST,
        "Box": Image.Resampling.BOX,
        "Hamming": Image.Resampling.HAMMING,
    }

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "fit_mode": (["Cover", "Contain", "Stretch"], {"default": "Cover"}),
                "resample_method": (["Lanczos", "Bicubic", "Bilinear", "Nearest", "Box", "Hamming"], {"default": "Lanczos"}),
                "bg_fit_mode": (["Cover", "Contain", "Stretch"], {"default": "Cover"}),
                "bg_resample_method": (["Lanczos", "Bicubic", "Bilinear", "Nearest", "Box", "Hamming"], {"default": "Lanczos"}),
                "mask_mode": (["Bounding Box", "Alpha Channel", "None"], {"default": "Bounding Box"}),
                "bg_color": ("STRING", {"default": "#FFFFFF"}),
            },
            "optional": {
                "masks": ("MASK",),
                "background_image": ("IMAGE",),
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("composed_image", "composed_mask")
    FUNCTION = "arrange_images"
    CATEGORY = "LikeJ/Image"

    def _hex_to_rgba(self, hex_str):
        hex_str = str(hex_str).lstrip("#")
        try:
            if len(hex_str) == 6:
                r, g, b = tuple(int(hex_str[i : i + 2], 16) for i in (0, 2, 4))
                return (r, g, b, 255)
            elif len(hex_str) == 8:
                return tuple(int(hex_str[i : i + 2], 16) for i in (0, 2, 4, 6))
        except Exception:
            pass
        return (255, 255, 255, 255)

    def _get_node_layout(self, extra_pnginfo, unique_id):
        try:
            info = extra_pnginfo
            if isinstance(info, list) and len(info) > 0:
                info = info[0]
            uid = unique_id
            if isinstance(uid, list) and len(uid) > 0:
                uid = uid[0]

            if info and "workflow" in info:
                nodes = info["workflow"].get("nodes", [])
                for node in nodes:
                    if str(node.get("id")) == str(uid):
                        props = node.get("properties", {})
                        if "layout" in props:
                            return props["layout"]
        except Exception:
            pass
        return {"width": 1920, "height": 1080, "boxes": []}

    def _fit_image(self, pil_img, target_w, target_h, mode, resample_method):
        img_w, img_h = pil_img.size
        if mode == "Stretch":
            return pil_img.resize((target_w, target_h), resample_method), 0, 0
        elif mode == "Contain":
            ratio = min(target_w / img_w, target_h / img_h)
            new_w, new_h = max(1, int(img_w * ratio)), max(1, int(img_h * ratio))
            resized = pil_img.resize((new_w, new_h), resample_method)
            offset_x = (target_w - new_w) // 2
            offset_y = (target_h - new_h) // 2
            return resized, offset_x, offset_y
        else:  # Cover
            ratio = max(target_w / img_w, target_h / img_h)
            new_w, new_h = max(1, int(img_w * ratio)), max(1, int(img_h * ratio))
            resized = pil_img.resize((new_w, new_h), resample_method)
            crop_x = (new_w - target_w) // 2
            crop_y = (new_h - target_h) // 2
            cropped = resized.crop((crop_x, crop_y, crop_x + target_w, crop_y + target_h))
            return cropped, 0, 0

    def _flatten_input(self, raw_data):
        flat = []
        if raw_data is None:
            return flat

        if isinstance(raw_data, list):
            for item in raw_data:
                flat.extend(self._flatten_input(item))
        elif isinstance(raw_data, torch.Tensor):
            if raw_data.dim() == 4:
                for b in range(raw_data.shape[0]):
                    flat.append(raw_data[b])
            elif raw_data.dim() == 3:
                if raw_data.shape[-1] in [1, 3, 4]:
                    flat.append(raw_data)
                else:
                    for b in range(raw_data.shape[0]):
                        flat.append(raw_data[b])
            elif raw_data.dim() == 2:
                flat.append(raw_data)
        else:
            flat.append(raw_data)
        return flat

    def arrange_images(
        self,
        images,
        fit_mode="Cover",
        resample_method="Lanczos",
        bg_fit_mode="Cover",
        bg_resample_method="Lanczos",
        mask_mode="Bounding Box",
        bg_color="#FFFFFF",
        masks=None,
        background_image=None,
        extra_pnginfo=None,
        prompt=None,
        unique_id=None,
    ):
        def unwrap(val, default):
            while isinstance(val, list):
                if len(val) > 0:
                    val = val[0]
                else:
                    return default
            return val if val is not None else default

        fit_mode_val = unwrap(fit_mode, "Cover")
        resample_method_val = unwrap(resample_method, "Lanczos")
        bg_fit_mode_val = unwrap(bg_fit_mode, "Cover")
        bg_resample_method_val = unwrap(bg_resample_method, "Lanczos")
        mask_mode_val = unwrap(mask_mode, "Bounding Box")
        bg_color_val = unwrap(bg_color, "#FFFFFF")

        resample_obj = self.RESAMPLE_METHODS.get(resample_method_val, Image.Resampling.LANCZOS)
        bg_resample_obj = self.RESAMPLE_METHODS.get(bg_resample_method_val, Image.Resampling.LANCZOS)

        layout = self._get_node_layout(extra_pnginfo, unique_id)
        canvas_w = int(layout.get("width", 1920))
        canvas_h = int(layout.get("height", 1080))
        boxes = layout.get("boxes", [])
        boxes = sorted(boxes, key=lambda b: b.get("order", 1))

        flat_images = self._flatten_input(images)
        flat_masks = self._flatten_input(masks) if masks is not None else []
        flat_bg = self._flatten_input(background_image) if background_image is not None else []

        bg_rgba = self._hex_to_rgba(bg_color_val)
        canvas_img = Image.new("RGBA", (canvas_w, canvas_h), bg_rgba)
        canvas_mask = Image.new("L", (canvas_w, canvas_h), 0)

        # 處理背景圖片
        if len(flat_bg) > 0 and flat_bg[0] is not None:
            bg_tensor = flat_bg[0]
            bg_np = (bg_tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)

            if bg_np.shape[-1] == 4:
                bg_pil = Image.fromarray(bg_np, mode="RGBA")
            else:
                bg_pil = Image.fromarray(bg_np, mode="RGB").convert("RGBA")

            fitted_bg, bg_off_x, bg_off_y = self._fit_image(bg_pil, canvas_w, canvas_h, bg_fit_mode_val, bg_resample_obj)
            canvas_img.alpha_composite(fitted_bg, (bg_off_x, bg_off_y))

        # 處理各排列框 (Boxes)
        for i, box in enumerate(boxes):
            if i >= len(flat_images):
                break

            img_tensor = flat_images[i]
            if img_tensor is None:
                continue

            img_np = (img_tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)

            if img_np.shape[-1] == 4:
                sub_pil = Image.fromarray(img_np, mode="RGBA")
            else:
                sub_pil = Image.fromarray(img_np, mode="RGB").convert("RGBA")

            if mask_mode_val != "None" and i < len(flat_masks) and flat_masks[i] is not None:
                m_tensor = flat_masks[i]
                if isinstance(m_tensor, torch.Tensor):
                    m_np = (m_tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
                    mask_pil = Image.fromarray(m_np, mode="L")

                    if mask_pil.size != sub_pil.size:
                        mask_pil = mask_pil.resize(sub_pil.size, resample_obj)

                    if m_np.max() > 0:
                        r, g, b, a = sub_pil.split()
                        combined_a = Image.fromarray(np.minimum(np.array(a), np.array(mask_pil)))
                        sub_pil.putalpha(combined_a)

            bx = int(box.get("x", 0))
            by = int(box.get("y", 0))
            bw = int(box.get("w", 100))
            bh = int(box.get("h", 100))

            p_top = int(box.get("pad_top", 0))
            p_bottom = int(box.get("pad_bottom", 0))
            p_left = int(box.get("pad_left", 0))
            p_right = int(box.get("pad_right", 0))

            tx = bx + p_left
            ty = by + p_top
            tw = max(1, bw - p_left - p_right)
            th = max(1, bh - p_top - p_bottom)

            fitted_sub, off_x, off_y = self._fit_image(sub_pil, tw, th, fit_mode_val, resample_obj)
            final_x = tx + off_x
            final_y = ty + off_y

            canvas_img.alpha_composite(fitted_sub, (final_x, final_y))

            sub_alpha = fitted_sub.split()[-1]
            canvas_mask.paste(sub_alpha, (final_x, final_y), fitted_sub)

        final_rgb = canvas_img.convert("RGB")
        out_img_np = np.array(final_rgb).astype(np.float32) / 255.0
        out_img_tensor = torch.from_numpy(out_img_np).unsqueeze(0)

        out_mask_np = np.array(canvas_mask).astype(np.float32) / 255.0
        out_mask_tensor = torch.from_numpy(out_mask_np).unsqueeze(0)

        return (out_img_tensor, out_mask_tensor)