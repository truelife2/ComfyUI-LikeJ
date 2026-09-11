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
        lines = []
        
        # 確保為 list 結構處理
        items = anything if isinstance(anything, list) else [anything]
        count = len(items)

        # 1 筆以上（多於 1 筆）時才在首行加入 Count 標示
        if count > 1:
            lines.append(f"[Count: {count}]")

        for item in items:
            try:
                if isinstance(item, (dict, list)):
                    # 特殊物件（dict/list）轉為單行 JSON 格式，確保維持一行文本
                    lines.append(json.dumps(item, ensure_ascii=False))
                else:
                    lines.append(str(item))
            except Exception as e:
                lines.append(f"<ex: {str(e)}>")

        text_val = "\n".join(lines)

        # 將格式化後的字串傳給前端預覽 Widget，並將原始 list 原封不動傳給下個節點
        return {"ui": {"text": [text_val]}, "result": (anything,)}