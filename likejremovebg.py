import os
import uuid
import torch
import numpy as np
from PIL import Image
import folder_paths
import torchvision.transforms.functional as F

class LikeJRemoveBg:
    @classmethod
    def INPUT_TYPES(s):
        model_list = folder_paths.get_filename_list("background_removal")
        if not model_list:
            model_list = ["No models found in models/background_removal"]

        return {
            "required": {
                "image": ("IMAGE", {
                    "tooltip": "Input image tensor (RGB or RGBA)."
                }),
                "model_name": (model_list, {
                    "tooltip": "Select background removal model from models/background_removal."
                }),
                "expand_mask": ("INT", {
                    "default": 0,
                    "min": -1024,
                    "max": 1024,
                    "step": 1,
                    "display": "number",
                    "tooltip": "Expand (positive) or contract (negative) mask boundaries in pixels."
                }),
                "invert_mask": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Invert mask output (keep background instead of foreground)."
                }),
                "sensitivity": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 3.0,
                    "step": 0.1,
                    "display": "number",
                    "tooltip": "Adjust model detection sensitivity. Values > 1.0 enhance fine details; values < 1.0 reduce noise."
                }),
                "threshold": ("FLOAT", {
                    "default": 0.0,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01,
                    "display": "number",
                    "tooltip": "Binarize mask into hard edges. 0.0 disables binarization (e.g., 0.5 for crisp cuts)."
                }),
                "blur_radius": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 100,
                    "step": 1,
                    "display": "number",
                    "tooltip": "Soften mask edges with Gaussian blur. 0 disables blurring."
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    OUTPUT_NODE = True
    FUNCTION = "remove_background"
    CATEGORY = "LikeJ"

    def _adjust_mask(self, mask, expand):
        if expand == 0:
            return mask

        orig_shape = mask.shape
        x = mask.unsqueeze(0).unsqueeze(0)

        kernel_size = abs(expand) * 2 + 1
        padding = abs(expand)

        if expand > 0:
            out = torch.nn.functional.max_pool2d(x, kernel_size=kernel_size, stride=1, padding=padding)
        else:
            out = -torch.nn.functional.max_pool2d(-x, kernel_size=kernel_size, stride=1, padding=padding)

        return out.reshape(orig_shape)

    def _apply_threshold(self, mask, threshold):
        if threshold <= 0.0:
            return mask
        return (mask >= threshold).float()

    def _apply_blur(self, mask, blur_radius):
        if blur_radius <= 0:
            return mask
        
        kernel_size = blur_radius * 2 + 1
        sigma = blur_radius / 3.0
        
        orig_shape = mask.shape
        x = mask.unsqueeze(0).unsqueeze(0)
        blurred = F.gaussian_blur(x, kernel_size=[kernel_size, kernel_size], sigma=[sigma, sigma])
        return blurred.reshape(orig_shape)

    def _generate_ui_preview(self, rgba_images):
        output_dir = folder_paths.get_temp_directory()
        ui_images = []
        batch_id = uuid.uuid4().hex[:8]

        for i, img_tensor in enumerate(rgba_images):
            array = (img_tensor.cpu().numpy() * 255.0).astype(np.uint8)
            img = Image.fromarray(array, mode="RGBA")
            
            filename = f"likej_preview_{batch_id}_{i:02d}.png"
            filepath = os.path.join(output_dir, filename)
            img.save(filepath, format="PNG")

            ui_images.append({
                "filename": filename,
                "subfolder": "",
                "type": "temp"
            })

        return ui_images

    def remove_background(self, image, model_name, expand_mask=0, invert_mask=False, sensitivity=1.0, threshold=0.0, blur_radius=0):
        model_path = folder_paths.get_full_path("background_removal", model_name)
        if not model_path or not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_name}")

        ext = os.path.splitext(model_path)[1].lower()

        if ext == ".onnx":
            out_images, out_masks = self._process_onnx(image, model_path, sensitivity, expand_mask, invert_mask, threshold, blur_radius)
        elif ext in [".safetensors", ".pth", ".pt"]:
            out_images, out_masks = self._process_pytorch(image, model_path, sensitivity, expand_mask, invert_mask, threshold, blur_radius)
        else:
            raise ValueError(f"Unsupported model format: {ext}")

        ui_preview = self._generate_ui_preview(out_images)

        return {
            "ui": {"images": ui_preview},
            "result": (out_images, out_masks)
        }

    def _process_onnx(self, image, model_path, sensitivity, expand_mask, invert_mask, threshold, blur_radius):
        import onnxruntime as ort

        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        session = ort.InferenceSession(model_path, providers=providers)
        input_name = session.get_inputs()[0].name

        out_images, out_masks = [], []

        for i in range(image.shape[0]):
            img_tensor = image[i][..., :3]
            orig_h, orig_w, _ = img_tensor.shape

            img_input = img_tensor.permute(2, 0, 1).unsqueeze(0).numpy()
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)
            norm_input = (img_input - mean) / std

            outputs = session.run(None, {input_name: norm_input})
            output_mask = outputs[0]

            mask_tensor = torch.from_numpy(output_mask).squeeze()
            
            if sensitivity != 1.0:
                mask_tensor = mask_tensor * sensitivity

            if mask_tensor.max() > 1.0 or mask_tensor.min() < 0.0:
                mask_tensor = torch.sigmoid(mask_tensor)

            if mask_tensor.shape != (orig_h, orig_w):
                mask_tensor = mask_tensor.unsqueeze(0).unsqueeze(0)
                mask_tensor = torch.nn.functional.interpolate(
                    mask_tensor, size=(orig_h, orig_w), mode="bilinear", align_corners=False
                ).squeeze()

            mask_tensor = torch.clamp(mask_tensor, 0.0, 1.0)

            if expand_mask != 0:
                mask_tensor = self._adjust_mask(mask_tensor, expand_mask)
            if threshold > 0.0:
                mask_tensor = self._apply_threshold(mask_tensor, threshold)
            if blur_radius > 0:
                mask_tensor = self._apply_blur(mask_tensor, blur_radius)
            if invert_mask:
                mask_tensor = 1.0 - mask_tensor

            mask_tensor = torch.clamp(mask_tensor, 0.0, 1.0)
            rgba_output = torch.cat([img_tensor, mask_tensor.unsqueeze(-1)], dim=-1)

            out_images.append(rgba_output)
            out_masks.append(mask_tensor)

        return torch.stack(out_images, dim=0), torch.stack(out_masks, dim=0)

    def _process_pytorch(self, image, model_path, sensitivity, expand_mask, invert_mask, threshold, blur_radius):
        from safetensors.torch import load_file
        from transformers import AutoConfig, AutoModelForImageSegmentation
        from torchvision import transforms

        device = "cuda" if torch.cuda.is_available() else "cpu"
        folder_path = os.path.dirname(model_path)

        config_path = os.path.join(folder_path, "config.json")
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Missing required model files ('config.json' or '.py' scripts) in directory: {folder_path}")

        config = AutoConfig.from_pretrained(folder_path, trust_remote_code=True, local_files_only=True)
        model = AutoModelForImageSegmentation.from_config(config, trust_remote_code=True)

        state_dict = load_file(model_path)
        model.load_state_dict(state_dict, strict=False)

        model.to(device)
        model.eval()

        out_images, out_masks = [], []
        transform_image = transforms.Compose([
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

        for i in range(image.shape[0]):
            img_tensor = image[i][..., :3]
            orig_h, orig_w, _ = img_tensor.shape

            pil_img = Image.fromarray((img_tensor.cpu().numpy() * 255.0).astype(np.uint8))
            input_tensor = transform_image(pil_img).unsqueeze(0).to(device)

            with torch.no_grad():
                preds = model(input_tensor)
                if isinstance(preds, (list, tuple)):
                    preds = preds[-1]
                
                if sensitivity != 1.0:
                    preds = preds * sensitivity
                    
                preds = torch.sigmoid(preds)

            mask_tensor = torch.nn.functional.interpolate(
                preds, size=(orig_h, orig_w), mode="bilinear", align_corners=False
            ).squeeze()

            mask_tensor = mask_tensor.clamp(0.0, 1.0).cpu()

            if expand_mask != 0:
                mask_tensor = self._adjust_mask(mask_tensor, expand_mask)
            if threshold > 0.0:
                mask_tensor = self._apply_threshold(mask_tensor, threshold)
            if blur_radius > 0:
                mask_tensor = self._apply_blur(mask_tensor, blur_radius)
            if invert_mask:
                mask_tensor = 1.0 - mask_tensor

            mask_tensor = torch.clamp(mask_tensor, 0.0, 1.0)
            rgba_output = torch.cat([img_tensor, mask_tensor.unsqueeze(-1)], dim=-1)

            out_images.append(rgba_output)
            out_masks.append(mask_tensor)

        return torch.stack(out_images, dim=0), torch.stack(out_masks, dim=0)

