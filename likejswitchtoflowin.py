class LikeJSwitchToFlowIn:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {"input_1": ("*",)}
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch_first_valid"
    CATEGORY = "LikeJ"

    @classmethod
    def VALIDATE_INPUTS(s, **kwargs):
        return True

    def switch_first_valid(self, **kwargs):
        def extract_index(key):
            try:
                return int(key.split('_')[1])
            except (IndexError, ValueError):
                return 999

        input_keys = sorted([k for k in kwargs.keys() if k.startswith("input_")], key=extract_index)

        for key in input_keys:
            val = kwargs[key]
            if val is not None:
                return {"ui": {"text": [f"{key}"]}, "result": (val,)}

        return {"ui": {"text": ["None"]}, "result": (None,)}
