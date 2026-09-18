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
                "input_mask_mode": (["None", "Bounding Box", "Mask Clip"], {
                    "default": "Bounding Box",
                    "tooltip": "None: Ignore mask. Bounding Box: Crop mask area for local AI inference. Mask Clip: Full AI inference clipped by input mask."
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
                "feather_radius": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 100,
                    "step": 1,
                    "display": "number",
                    "tooltip": "Feather edge strength (pixel radius) for soft blending."
                }),
                "feather_depth": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 5.0,
                    "step": 0.1,
                    "display": "number",
                    "tooltip": "Feather depth & falloff curve. < 1.0 deepens edge opacity, > 1.0 steepens inner transparency."
                }),
                "blur_radius": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 100,
                    "step": 1,
                    "display": "number",
                    "tooltip": "Soften mask edges with Gaussian blur. 0 disables blurring."
                }),
                "crop_to_content": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Automatically crop output image and mask to the foreground object boundary."
                }),
                "crop_padding": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 1024,
                    "step": 1,
                    "display": "number",
                    "tooltip": "Padding in pixels around the cropped foreground boundary."
                }),
            },
            "optional": {
                "mask": ("MASK", {
                    "tooltip": "Optional preliminary input mask."
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    OUTPUT_NODE = True
    FUNCTION = "remove_background"
    CATEGORY = "LikeJ/Image"

    def _get_bbox(self, mask, threshold=0.05):
        nonzero = torch.nonzero(mask > threshold)
        if nonzero.numel() == 0:
            nonzero = torch.nonzero(mask > 0.001)
        if nonzero.numel() == 0:
            return None
        y_min = torch.min(nonzero[:, 0]).item()
        y_max = torch.max(nonzero[:, 0]).item()
        x_min = torch.min(nonzero[:, 1]).item()
        x_max = torch.max(nonzero[:, 1]).item()
        return y_min, y_max, x_min, x_max

    def _normalize_mask_tensor(self, mask):
        if mask is None or mask.numel() == 0:
            return None
        m_tensor = mask.clone()
        if m_tensor.dim() == 2:
            m_tensor = m_tensor.unsqueeze(0)
        elif m_tensor.dim() == 4:
            if m_tensor.shape[1] == 1:
                m_tensor = m_tensor.squeeze(1)
            elif m_tensor.shape[3] == 1:
                m_tensor = m_tensor.squeeze(3)
        return m_tensor

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

    def _apply_feather(self, mask, feather_radius, feather_depth):
        if feather_radius <= 0 and feather_depth == 1.0:
            return mask
        
        out = mask
        if feather_radius > 0:
            kernel_size = feather_radius * 2 + 1
            sigma = feather_radius / 3.0
            orig_shape = out.shape
            x = out.unsqueeze(0).unsqueeze(0)
            out = F.gaussian_blur(x, kernel_size=[kernel_size, kernel_size], sigma=[sigma, sigma]).reshape(orig_shape)

        if feather_depth != 1.0 and feather_depth > 0:
            out = torch.pow(out.clamp(0.0, 1.0), feather_depth)

        return out

    def _apply_blur(self, mask, blur_radius):
        if blur_radius <= 0:
            return mask
        kernel_size = blur_radius * 2 + 1
        sigma = blur_radius / 3.0
        orig_shape = mask.shape
        x = mask.unsqueeze(0).unsqueeze(0)
        blurred = F.gaussian_blur(x, kernel_size=[kernel_size, kernel_size], sigma=[sigma, sigma])
        return blurred.reshape(orig_shape)

    def _post_process_mask(self, mask, sensitivity, expand_mask, threshold, feather_radius, feather_depth, blur_radius, invert_mask):
        if sensitivity != 1.0:
            mask = mask * sensitivity
        mask = torch.clamp(mask, 0.0, 1.0)
        if expand_mask != 0:
            mask = self._adjust_mask(mask, expand_mask)
        if threshold > 0.0:
            mask = self._apply_threshold(mask, threshold)
        if feather_radius > 0 or feather_depth != 1.0:
            mask = self._apply_feather(mask, feather_radius, feather_depth)
        if blur_radius > 0:
            mask = self._apply_blur(mask, blur_radius)
        if invert_mask:
            mask = 1.0 - mask
        return torch.clamp(mask, 0.0, 1.0)

    def _crop_single(self, img, mask, padding):
        orig_h, orig_w = mask.shape
        bbox = self._get_bbox(mask)
        if bbox is None:
            return img, mask
        y_min, y_max, x_min, x_max = bbox
        y_min = max(0, y_min - padding)
        y_max = min(orig_h - 1, y_max + padding)
        x_min = max(0, x_min - padding)
        x_max = min(orig_w - 1, x_max + padding)
        return img[y_min:y_max+1, x_min:x_max+1], mask[y_min:y_max+1, x_min:x_max+1]

    def _stack_batch(self, out_images, out_masks):
        if len(out_images) == 0:
            return None, None
        if len(out_images) == 1:
            return torch.stack(out_images, dim=0), torch.stack(out_masks, dim=0)

        max_h = max(img.shape[0] for img in out_images)
        max_w = max(img.shape[1] for img in out_images)

        padded_imgs, padded_msks = [], []
        for img, msk in zip(out_images, out_masks):
            h, w = img.shape[0], img.shape[1]
            if h != max_h or w != max_w:
                pad_h = max_h - h
                pad_w = max_w - w
                img = torch.nn.functional.pad(img.permute(2, 0, 1), (0, pad_w, 0, pad_h), value=0.0).permute(1, 2, 0)
                msk = torch.nn.functional.pad(msk, (0, pad_w, 0, pad_h), value=0.0)
            padded_imgs.append(img)
            padded_msks.append(msk)

        return torch.stack(padded_imgs, dim=0), torch.stack(padded_msks, dim=0)

    def _generate_ui_preview(self, rgba_images):
        if rgba_images is None or len(rgba_images) == 0:
            return []
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

    def remove_background(
        self,
        image=None,
        model_name=None,
        input_mask_mode="None",
        expand_mask=0,
        invert_mask=False,
        sensitivity=1.0,
        threshold=0.0,
        feather_radius=0,
        feather_depth=1.0,
        blur_radius=0,
        crop_to_content=False,
        crop_padding=0,
        mask=None
    ):
        if image is None:
            return {
                "ui": {"images": []},
                "result": (None, None)
            }

        model_path = folder_paths.get_full_path("background_removal", model_name)
        if not model_path or not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_name}")

        ext = os.path.splitext(model_path)[1].lower()

        if ext == ".onnx":
            out_images, out_masks = self._process_onnx(
                image, model_path, input_mask_mode, sensitivity, expand_mask, invert_mask, threshold, feather_radius, feather_depth, blur_radius, crop_to_content, crop_padding, mask
            )
        elif ext in [".safetensors", ".pth", ".pt"]:
            out_images, out_masks = self._process_pytorch(
                image, model_path, input_mask_mode, sensitivity, expand_mask, invert_mask, threshold, feather_radius, feather_depth, blur_radius, crop_to_content, crop_padding, mask
            )
        else:
            raise ValueError(f"Unsupported model format: {ext}")

        ui_preview = self._generate_ui_preview(out_images)

        return {
            "ui": {"images": ui_preview},
            "result": (out_images, out_masks)
        }

    def _process_onnx(
        self, image, model_path, input_mask_mode, sensitivity, expand_mask, invert_mask, threshold, feather_radius, feather_depth, blur_radius, crop_to_content, crop_padding, input_mask_tensor
    ):
        session = None
        input_name = None

        input_masks = self._normalize_mask_tensor(input_mask_tensor)
        out_images, out_masks = [], []

        for i in range(image.shape[0]):
            if session is None:
                import onnxruntime as ort
                providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
                session = ort.InferenceSession(model_path, providers=providers)
                input_name = session.get_inputs()[0].name

            img_tensor = image[i][..., :3]
            orig_h, orig_w, _ = img_tensor.shape

            in_mask = None
            if input_mask_mode != "None" and input_masks is not None:
                idx = i if i < input_masks.shape[0] else 0
                in_mask = input_masks[idx]
                if in_mask.dim() == 3 and in_mask.shape[0] == 1:
                    in_mask = in_mask[0]
                if in_mask.shape != (orig_h, orig_w):
                    in_mask = torch.nn.functional.interpolate(
                        in_mask.unsqueeze(0).unsqueeze(0), size=(orig_h, orig_w), mode="bilinear", align_corners=False
                    ).squeeze()

                if torch.max(in_mask) <= 0.001:
                    in_mask = None

            bbox = None
            infer_img = img_tensor
            if in_mask is not None and input_mask_mode == "Bounding Box":
                bbox = self._get_bbox(in_mask)
                if bbox is not None:
                    y_min, y_max, x_min, x_max = bbox
                    infer_img = img_tensor[y_min:y_max+1, x_min:x_max+1]

            h_infer, w_infer, _ = infer_img.shape
            img_input = infer_img.permute(2, 0, 1).unsqueeze(0).numpy()
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)
            norm_input = (img_input - mean) / std

            outputs = session.run(None, {input_name: norm_input})
            output_mask = outputs[0]

            mask_tensor = torch.from_numpy(output_mask).squeeze()
            if mask_tensor.max().item() > 1.0 or mask_tensor.min().item() < 0.0:
                mask_tensor = torch.sigmoid(mask_tensor)

            if mask_tensor.shape != (h_infer, w_infer):
                mask_tensor = torch.nn.functional.interpolate(
                    mask_tensor.unsqueeze(0).unsqueeze(0), size=(h_infer, w_infer), mode="bilinear", align_corners=False
                ).squeeze()

            if in_mask is not None and input_mask_mode in ["Mask Clip", "Mask Intersect", "Intersect Mask"]:
                mask_tensor = mask_tensor * in_mask.cpu()

            processed_mask = self._post_process_mask(
                mask_tensor, sensitivity, expand_mask, threshold, feather_radius, feather_depth, blur_radius, invert_mask
            )

            if bbox is not None:
                y_min, y_max, x_min, x_max = bbox
                if not crop_to_content:
                    final_mask = torch.zeros((orig_h, orig_w), dtype=torch.float32)
                    final_mask[y_min:y_max+1, x_min:x_max+1] = processed_mask
                    final_rgba = torch.cat([img_tensor, final_mask.unsqueeze(-1)], dim=-1)
                else:
                    patch_rgba = torch.cat([infer_img, processed_mask.unsqueeze(-1)], dim=-1)
                    final_rgba, final_mask = self._crop_single(patch_rgba, processed_mask, crop_padding)
            else:
                final_rgba = torch.cat([infer_img, processed_mask.unsqueeze(-1)], dim=-1)
                final_mask = processed_mask
                if crop_to_content:
                    final_rgba, final_mask = self._crop_single(final_rgba, final_mask, crop_padding)

            out_images.append(final_rgba)
            out_masks.append(final_mask)

        return self._stack_batch(out_images, out_masks)

    def _process_pytorch(
        self, image, model_path, input_mask_mode, sensitivity, expand_mask, invert_mask, threshold, feather_radius, feather_depth, blur_radius, crop_to_content, crop_padding, input_mask_tensor
    ):
        model = None
        device = "cuda" if torch.cuda.is_available() else "cpu"
        transform_image = None

        input_masks = self._normalize_mask_tensor(input_mask_tensor)
        out_images, out_masks = [], []

        for i in range(image.shape[0]):
            if model is None:
                from safetensors.torch import load_file
                from transformers import AutoConfig, AutoModelForImageSegmentation
                from torchvision import transforms

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

                transform_image = transforms.Compose([
                    transforms.Resize((1024, 1024)),
                    transforms.ToTensor(),
                    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
                ])

            img_tensor = image[i][..., :3]
            orig_h, orig_w, _ = img_tensor.shape

            in_mask = None
            if input_mask_mode != "None" and input_masks is not None:
                idx = i if i < input_masks.shape[0] else 0
                in_mask = input_masks[idx]
                if in_mask.dim() == 3 and in_mask.shape[0] == 1:
                    in_mask = in_mask[0]
                if in_mask.shape != (orig_h, orig_w):
                    in_mask = torch.nn.functional.interpolate(
                        in_mask.unsqueeze(0).unsqueeze(0), size=(orig_h, orig_w), mode="bilinear", align_corners=False
                    ).squeeze()

                if torch.max(in_mask) <= 0.001:
                    in_mask = None

            bbox = None
            infer_img = img_tensor
            if in_mask is not None and input_mask_mode == "Bounding Box":
                bbox = self._get_bbox(in_mask)
                if bbox is not None:
                    y_min, y_max, x_min, x_max = bbox
                    infer_img = img_tensor[y_min:y_max+1, x_min:x_max+1]

            h_infer, w_infer, _ = infer_img.shape
            pil_img = Image.fromarray((infer_img.cpu().numpy() * 255.0).astype(np.uint8))
            input_tensor = transform_image(pil_img).unsqueeze(0).to(device)

            with torch.no_grad():
                preds = model(input_tensor)
                if isinstance(preds, (list, tuple)):
                    preds = preds[-1]
                preds = torch.sigmoid(preds)

            mask_tensor = torch.nn.functional.interpolate(
                preds, size=(h_infer, w_infer), mode="bilinear", align_corners=False
            ).squeeze().clamp(0.0, 1.0).cpu()

            if in_mask is not None and input_mask_mode in ["Mask Clip", "Mask Intersect", "Intersect Mask"]:
                mask_tensor = mask_tensor * in_mask.cpu()

            processed_mask = self._post_process_mask(
                mask_tensor, sensitivity, expand_mask, threshold, feather_radius, feather_depth, blur_radius, invert_mask
            )

            if bbox is not None:
                y_min, y_max, x_min, x_max = bbox
                if not crop_to_content:
                    final_mask = torch.zeros((orig_h, orig_w), dtype=torch.float32)
                    final_mask[y_min:y_max+1, x_min:x_max+1] = processed_mask
                    final_rgba = torch.cat([img_tensor, final_mask.unsqueeze(-1)], dim=-1)
                else:
                    patch_rgba = torch.cat([infer_img, processed_mask.unsqueeze(-1)], dim=-1)
                    final_rgba, final_mask = self._crop_single(patch_rgba, processed_mask, crop_padding)
            else:
                final_rgba = torch.cat([infer_img, processed_mask.unsqueeze(-1)], dim=-1)
                final_mask = processed_mask
                if crop_to_content:
                    final_rgba, final_mask = self._crop_single(final_rgba, final_mask, crop_padding)

            out_images.append(final_rgba)
            out_masks.append(final_mask)

        return self._stack_batch(out_images, out_masks)