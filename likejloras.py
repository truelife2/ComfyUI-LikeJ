import folder_paths
from nodes import LoraLoader

# ==========================================
# 0. 共用函式：取得排序後的 Lora 清單[cite: 1]
# ==========================================
def get_lora_list():
    raw_loras = folder_paths.get_filename_list("loras")
    return ['None'] + sorted(raw_loras, key=str.lower)


# ==========================================
# 1. 無 Prompt 版本
# ==========================================
class LikeJLoras:
    COUNT = 10
    CATEGORY = "loaders"
    RETURN_TYPES = ("MODEL", "CLIP")
    FUNCTION = "load_loras"

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "model": ("MODEL",),
            },
            "optional": {
                "clip": ("CLIP",),
            }
        }

        # 這裡直接呼叫共用函式[cite: 1]
        lora_list = get_lora_list()

        for i in range(1, cls.COUNT + 1):
            inputs["required"][f"enable_{i:02d}"] = ("BOOLEAN", {"default": True})
            inputs["required"][f"lora_{i:02d}"] = (lora_list,)
            inputs["required"][f"strength_{i:02d}"] = ("FLOAT", {
                "default": 1.0,
                "min": -9999.99,
                "max": 9999.99,
                "step": 0.01
            })

        return inputs

    def load_loras(self, model, clip=None, **kwargs):
        for i in range(1, self.COUNT + 1):
            enable = kwargs.get(f"enable_{i:02d}", True)
            lora_name = kwargs.get(f"lora_{i:02d}")
            strength = kwargs.get(f"strength_{i:02d}", 1.0)

            if enable and lora_name and lora_name != "None" and strength != 0:
                if clip is not None:
                    model, clip = LoraLoader().load_lora(model, clip, lora_name, strength, strength)
                else:
                    model, _ = LoraLoader().load_lora(model, None, lora_name, strength, 0.0)

        return (model, clip)


class LikeJ10Loras(LikeJLoras):
    COUNT = 10


class LikeJ20Loras(LikeJLoras):
    COUNT = 20


# ==========================================
# 2. 帶 Prompt 版本
# ==========================================
class LikeJLorasWithPrompt(LikeJLoras):
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "PROMPT")

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "model": ("MODEL",),
            },
            "optional": {
                "clip": ("CLIP",),
            }
        }

        # 同樣在這裡直接呼叫共用函式[cite: 1]
        lora_list = get_lora_list()

        for i in range(1, cls.COUNT + 1):
            inputs["required"][f"enable_{i:02d}"] = ("BOOLEAN", {"default": True})
            inputs["required"][f"lora_{i:02d}"] = (lora_list,)
            inputs["required"][f"strength_{i:02d}"] = ("FLOAT", {
                "default": 1.0,
                "min": -9999.99,
                "max": 9999.99,
                "step": 0.01
            })
            inputs["required"][f"prompt_{i:02d}"] = ("STRING", {
                "default": "",
                "multiline": False,
                "placeholder": f"prompt_{i:02d}"
            })

        return inputs

    def load_loras(self, model, clip=None, **kwargs):
        active_prompts = []
        for i in range(1, self.COUNT + 1):
            enable = kwargs.get(f"enable_{i:02d}", True)
            lora_name = kwargs.get(f"lora_{i:02d}")
            strength = kwargs.get(f"strength_{i:02d}", 1.0)
            prompt = kwargs.get(f"prompt_{i:02d}", "").strip()

            if enable and lora_name and lora_name != "None":
                if clip is not None:
                    model, clip = LoraLoader().load_lora(model, clip, lora_name, strength, strength)
                else:
                    model, _ = LoraLoader().load_lora(model, None, lora_name, strength, 0.0)
                
                if prompt:
                    active_prompts.append(prompt)

        combined_prompt = ", ".join(active_prompts)
        return (model, clip, combined_prompt)


class LikeJ10LorasWithPrompt(LikeJLorasWithPrompt):
    COUNT = 10


class LikeJ5LorasWithPrompt(LikeJLorasWithPrompt):
    COUNT = 5