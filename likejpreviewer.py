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

    INPUT_IS_LIST = True 
    RETURN_TYPES = (ANY_TYPE,)
    RETURN_NAMES = ("output",)
    OUTPUT_IS_LIST = (True,) 
    OUTPUT_NODE = True
    FUNCTION = "preview_data"
    CATEGORY = "LikeJ"

    def preview_data(self, anything):
        # 當 INPUT_IS_LIST = True 時，anything 會被 ComfyUI 自動包成一個 Python list
        # 例如：['file1', 'file2', 'file3']
        try:
            if isinstance(anything, (dict, list)):
                text_val = json.dumps(anything, ensure_ascii=False, indent=2)
            else:
                text_val = str(anything)
        except Exception as e:
            text_val = f"<ex: {str(e)}>"

        # 將完整包含所有項目的文字傳給前端預覽 Widget，並將原始 list 原封不動傳給下個節點
        return {"ui": {"text": [text_val]}, "result": (anything,)}

