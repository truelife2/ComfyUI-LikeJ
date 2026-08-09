class LikeJGroupsBypasser:
    """
    A utility node to control ComfyUI canvas groups state.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pos_groups": ("STRING", {
                    "default": "",
                    "tooltip": "Target group titles (comma-separated)."
                }),
                "neg_groups": ("STRING", {
                    "default": "",
                    "tooltip": "Inverted group titles (comma-separated)."
                }),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "process"
    CATEGORY = "LikeJ"

    def process(self, pos_groups="", neg_groups=""):
        return ()