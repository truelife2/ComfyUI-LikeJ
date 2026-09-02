class LikeJOutputTrigger:
    """
    LikeJOutputTrigger
    終端同步觸發節點：匯集多個上游節點並同時觸發執行，無後續輸出。
    """

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "input_1": ("*",),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ()
    FUNCTION = "sync_and_trigger"
    OUTPUT_NODE = True
    CATEGORY = "LikeJ"

    def sync_and_trigger(self, **kwargs):
        return ()