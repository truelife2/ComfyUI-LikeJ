import json

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

ANY_TYPE = AnyType("*")

class LikeJPreviewer:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "anything": (ANY_TYPE, {}),
            },
        }

    RETURN_TYPES = (ANY_TYPE,)
    RETURN_NAMES = ("output",)
    OUTPUT_NODE = True
    FUNCTION = "preview_data"
    CATEGORY = "LikeJ"

    def preview_data(self, anything):
        try:
            if isinstance(anything, (dict, list)):
                text_val = json.dumps(anything, ensure_ascii=False, indent=2)
            else:
                text_val = str(anything)
        except Exception as e:
            text_val = f"<ex: {str(e)}>"

        # 將資料透過 UI WebSocket 傳給前端，同時原樣輸出傳給下一個節點
        return {"ui": {"text": [text_val]}, "result": (anything,)}