from pathlib import Path

class LikeJPathParse:
    
    OUTPUT_MODES = [
        "filename.ext",
        "filename",
        "dir",
        "dirname",
        ".ext"
    ]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "output_mode": (s.OUTPUT_MODES, {"default": "filename.ext"}),
                "path_input": ("*", {"forceInput": True}),
            }
        }

    INPUT_IS_LIST = True

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("result",)
    
    OUTPUT_NODE = True

    FUNCTION = "process_path"
    CATEGORY = "LikeJ"

    def process_path(self, output_mode, path_input):
        mode = output_mode[0] if isinstance(output_mode, list) else output_mode

        # 展開輸入資料
        def flatten(lst):
            for item in lst:
                if isinstance(item, list):
                    yield from flatten(item)
                else:
                    yield item

        flattened_paths = list(flatten(path_input))
        results = []

        # 逐一解析路徑
        for p_val in flattened_paths:
            p = Path(str(p_val))
            if mode == "dir":
                results.append(str(p.parent))
            elif mode == "dirname":
                results.append(p.parent.name)
            elif mode == "filename.ext":
                results.append(p.name)
            elif mode == "filename":
                results.append(p.stem)
            elif mode == ".ext":
                results.append(p.suffix)

        display_text = "\n".join(results)

        return {"ui": {"text": (display_text,)}, "result": results}
