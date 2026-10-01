import torch

class LikeJListUnpacker:
    MAX_OUTPUTS = 32
    INPUT_IS_LIST = True  # 宣告接收 List 輸入

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "input_list": ("*", {"forceInput": True, "tooltip": "Input list to unpack"}),
            },
        }

    RETURN_TYPES = tuple(["*"] * MAX_OUTPUTS)
    RETURN_NAMES = tuple([f"out_{i}" for i in range(MAX_OUTPUTS)])
    FUNCTION = "unpack"
    CATEGORY = "LikeJ"

    def unpack(self, input_list):
        items = []
        for item in input_list:
            if isinstance(item, list):
                items.extend(item)
            else:
                items.append(item)

        res = []
        for i in range(self.MAX_OUTPUTS):
            if i < len(items):
                res.append(items[i])
            else:
                res.append(None)
        return tuple(res)


class LikeJImageUnpacker:
    MAX_OUTPUTS = 32
    INPUT_IS_LIST = True  # 宣告接收 List 輸入

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "Input image list or batch tensor"}),
            },
        }

    RETURN_TYPES = tuple(["IMAGE"] * MAX_OUTPUTS)
    RETURN_NAMES = tuple([f"image_{i}" for i in range(MAX_OUTPUTS)])
    FUNCTION = "unpack"
    CATEGORY = "LikeJ"

    def unpack(self, images):
        img_list = []
        for item in images:
            if item is None:
                continue
            elif isinstance(item, list):
                for sub_item in item:
                    if sub_item is None:
                        continue
                    if isinstance(sub_item, torch.Tensor):
                        if len(sub_item.shape) == 4 and sub_item.shape[0] > 1:
                            for i in range(sub_item.shape[0]):
                                img_list.append(sub_item[i:i+1])
                        else:
                            img_list.append(sub_item)
            elif isinstance(item, torch.Tensor):
                if len(item.shape) == 4 and item.shape[0] > 1:
                    for i in range(item.shape[0]):
                        img_list.append(item[i:i+1])
                else:
                    img_list.append(item)

        res = []
        for i in range(self.MAX_OUTPUTS):
            if i < len(img_list):
                res.append(img_list[i])
            else:
                res.append(None)
        return tuple(res)


class LikeJAudioUnpacker:
    MAX_OUTPUTS = 32
    INPUT_IS_LIST = True  # 宣告接收 List 輸入

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audios": ("AUDIO", {"tooltip": "Input audio list or single audio dict"}),
            },
        }

    RETURN_TYPES = tuple(["AUDIO"] * MAX_OUTPUTS)
    RETURN_NAMES = tuple([f"audio_{i}" for i in range(MAX_OUTPUTS)])
    FUNCTION = "unpack"
    Category = "LikeJ"

    def unpack(self, audios):
        audio_list = []
        for item in audios:
            if item is None:
                continue
            elif isinstance(item, list):
                for sub_item in item:
                    if sub_item is not None:
                        audio_list.append(sub_item)
            else:
                audio_list.append(item)

        res = []
        for i in range(self.MAX_OUTPUTS):
            if i < len(audio_list):
                res.append(audio_list[i])
            else:
                res.append(None)
        return tuple(res)