from pypinyin import Style, lazy_pinyin, pinyin


class LikeJAllPinyin:

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"default": "", "multiline": True}),
                "style": (
                    [
                        "TONE (pīn yīn)",  # 標準帶調拼音
                        "TONE3 (pin1 yin1)",  # 數字聲調
                        "NORMAL (pin yin)",  # 無聲調
                    ],
                    {"default": "TONE (pīn yīn)"},
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("pinyin_text",)
    OUTPUT_NODE = True
    FUNCTION = "process_pinyin"
    CATEGORY = "LikeJ/Text"

    def process_pinyin(self, text, style):
        style_map = {
            "TONE (pīn yīn)": Style.TONE,
            "TONE3 (pin1 yin1)": Style.TONE3,
            "NORMAL (pin yin)": Style.NORMAL,
        }
        selected_style = style_map.get(style, Style.TONE)

        # 1. 輸出點使用的預設單一拼音字串
        default_pinyin_list = lazy_pinyin(text, style=selected_style)
        output_pinyin_str = " ".join(default_pinyin_list)

        # 2. 組合多音字清單
        seen_chars = set()
        ui_lines = []

        for char in text:
            if char.isspace():
                continue

            if char in seen_chars:
                continue
            seen_chars.add(char)

            raw_pinyins = pinyin(char, style=selected_style, heteronym=True)

            if raw_pinyins and raw_pinyins[0]:
                unique_pinyins = list(dict.fromkeys(raw_pinyins[0]))
                pinyin_formatted = " / ".join(unique_pinyins)
                ui_lines.append(f"{char} = {pinyin_formatted}")
            else:
                ui_lines.append(f"{char} = {char}")

        joined_ui_text = "\n".join(ui_lines)

        # 傳回給前端 JS 渲染
        return {"ui": {"pinyin_list": [joined_ui_text]}, "result": (output_pinyin_str,)}

