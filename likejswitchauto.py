class LikeJSwitchAuto:
    """
    Auto Switch: Scans inputs sequentially (input_1, input_2, ...) 
    and automatically outputs the first non-None value.
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "input_1": ("*", {"tooltip": "Primary input stream."}),
                "input_2": ("*", {"tooltip": "Secondary fallback stream if input_1 is None."}),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch_first_valid"
    CATEGORY = "LikeJ/Logic"

    @classmethod
    def VALIDATE_INPUTS(s, **kwargs):
        return True

    def switch_first_valid(self, **kwargs):
        def extract_index(key):
            try:
                return int(key.split('_')[1])
            except (IndexError, ValueError):
                return 999

        # 按 input_1, input_2, input_3... 順序排序
        input_keys = sorted([k for k in kwargs.keys() if k.startswith("input_")], key=extract_index)

        for key in input_keys:
            val = kwargs[key]
            if val is not None:
                return {"ui": {"text": [f"Selected: {key}"]}, "result": (val,)}

        return {"ui": {"text": ["Selected: None"]}, "result": (None,)}
