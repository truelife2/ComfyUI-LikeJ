import os
import json
import torch
import numpy as np
from PIL import Image, ImageOps, ImageDraw, ImageColor
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
        result.append({
            "name": name,
            "json_file": f,
            "preview_url": f"/likej/preview/{preview_file}" if has_preview else None
        })
    return web.json_response(result)

@routes.get("/likej/preview/{filename}")
async def get_preview(request):
    filename = request.match_info["filename"]
    file_path = os.path.join(LAYOUT_DIR, filename)
    if os.path.exists(file_path):
        return web.FileResponse(file_path)
    return web.Response(status=404)

@routes.post("/likej/save_layout")
async def save_layout_preset(request):
    try:
        data = await request.json()
        filename = data.get("filename", "").strip()
        layout_data = data.get("layout", {})

        if not filename:
            return web.json_response({"success": False, "error": "Filename cannot be empty"}, status=400)

        safe_name = "".join([c for c in filename if c.isalnum() or c in ('-', '_', ' ')]).strip()
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
        thumb_h = int(320 * ch / cw)
        thumb = Image.new("RGBA", (thumb_w, thumb_h), (30, 30, 30, 255))
        draw = ImageDraw.Draw(thumb)
        scale = thumb_w / cw

        for b in boxes:
            bx = b.get("x", 0) * scale
            by = b.get("y", 0) * scale
            bw = b.get("w", 100) * scale
            bh = b.get("h", 100) * scale
            order = b.get("order", b.get("id", 1))

            draw.rectangle([bx, by, bx + bw, by + bh], fill=(0, 150, 255, 90), outline=(0, 210, 255, 255), width=2)
            draw.text((bx + bw/2 - 4, by + bh/2 - 6), f"#{order}", fill=(255, 255, 255, 255))

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

        safe_name = "".join([c for c in filename if c.isalnum() or c in ('-', '_', ' ')]).strip()
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
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "fit_mode": (["Cover", "Contain", "Fill"], {"default": "Cover"}),
                "bg_color": ("STRING", {"default": "#FFFFFF"}),
            },
            # 移除 layout_json 欄位，改用系統內建隱藏傳遞機制
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("composed_image",)
    FUNCTION = "composite"
    CATEGORY = "LikeJ"

    def composite(self, images, fit_mode, bg_color, unique_id=None, extra_pnginfo=None):
        # 從工作流的 node.properties 中讀取序列化的 layout 設定
        layout_data = {}
        if extra_pnginfo and "workflow" in extra_pnginfo:
            nodes = extra_pnginfo["workflow"].get("nodes", [])
            for node in nodes:
                if str(node.get("id")) == str(unique_id):
                    layout_data = node.get("properties", {}).get("layout", {})
                    break

        canvas_w = int(layout_data.get("width", 1920))
        canvas_h = int(layout_data.get("height", 1080))
        boxes = layout_data.get("boxes", [])

        try:
            bg_rgb = ImageColor.getrgb(bg_color)
        except Exception:
            bg_rgb = (255, 255, 255)

        canvas_img = Image.new("RGBA", (canvas_w, canvas_h), bg_rgb + (255,))

        pil_images = []
        for i in range(images.shape[0]):
            img_np = (images[i].cpu().numpy() * 255).astype(np.uint8)
            if img_np.shape[2] == 4:
                pil_images.append(Image.fromarray(img_np, mode="RGBA"))
            else:
                pil_images.append(Image.fromarray(img_np, mode="RGB"))

        if not pil_images:
            out_np = np.array(canvas_img.convert("RGB")).astype(np.float32) / 255.0
            return (torch.from_numpy(out_np).unsqueeze(0),)

        boxes_sorted = sorted(boxes, key=lambda b: b.get("order", 0))
        num_to_draw = min(len(pil_images), len(boxes_sorted))

        for idx in range(num_to_draw):
            box = boxes_sorted[idx]
            src_img = pil_images[idx]

            box_x = int(box.get("x", 0))
            box_y = int(box.get("y", 0))
            box_w = int(box.get("w", 100))
            box_h = int(box.get("h", 100))

            if box_w <= 0 or box_h <= 0:
                continue

            if fit_mode == "Cover":
                resized_img = ImageOps.fit(src_img, (box_w, box_h), Image.Resampling.LANCZOS)
            elif fit_mode == "Contain":
                src_ratio = src_img.width / src_img.height
                box_ratio = box_w / box_h
                if src_ratio > box_ratio:
                    nw = box_w
                    nh = max(1, int(box_w / src_ratio))
                else:
                    nh = box_h
                    nw = max(1, int(box_h * src_ratio))
                resized_tmp = src_img.resize((nw, nh), Image.Resampling.LANCZOS)
                
                bg_mode = "RGBA" if src_img.mode == "RGBA" else "RGB"
                resized_img = Image.new(bg_mode, (box_w, box_h), bg_rgb if bg_mode == "RGB" else bg_rgb + (255,))
                paste_x = (box_w - nw) // 2
                paste_y = (box_h - nh) // 2
                
                if resized_tmp.mode == "RGBA":
                    resized_img.paste(resized_tmp, (paste_x, paste_y), mask=resized_tmp)
                else:
                    resized_img.paste(resized_tmp, (paste_x, paste_y))
            else:  # Fill
                resized_img = src_img.resize((box_w, box_h), Image.Resampling.LANCZOS)

            if resized_img.mode == "RGBA":
                canvas_img.paste(resized_img, (box_x, box_y), mask=resized_img)
            else:
                canvas_img.paste(resized_img, (box_x, box_y))

        final_img = canvas_img.convert("RGB")
        out_np = np.array(final_img).astype(np.float32) / 255.0
        out_tensor = torch.from_numpy(out_np).unsqueeze(0)

        return (out_tensor,)