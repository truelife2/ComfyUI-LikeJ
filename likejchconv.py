import opencc

CONVERT_MODES = {
    "None": "none",
    "簡體 -> 台灣繁體 (s2tw)": "s2tw",
    "台灣繁體 -> 簡體 (tw2s)": "tw2s",
    "簡體 -> 標準繁體 (s2t)": "s2t",
    "標準繁體 -> 簡體 (t2s)": "t2s",
    "簡體 -> 香港繁體 (s2hk)": "s2hk",
}

class LikeJChineseConverter:
    def __init__(self):
        self.converters = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": "", "dynamicPrompts": False}),
                "mode": (list(CONVERT_MODES.keys()), {"default": "台灣繁體 -> 簡體 (tw2s)"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "convert"
    CATEGORY = "LikeJ"

    def convert(self, text, mode):
        if not text or not str(text).strip():
            return ("", )

        config_name = CONVERT_MODES.get(mode, "tw2s")

        if config_name == "none":
            return (str(text), )

        if config_name not in self.converters:
            self.converters[config_name] = opencc.OpenCC(config_name)

        converter = self.converters[config_name]
        result = converter.convert(str(text))

        return (result, )
