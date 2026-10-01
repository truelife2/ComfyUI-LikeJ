import torch

class LikeJListUnpacker:
    MAX_OUTPUTS = 32

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
        if not isinstance(input_list, (list, tuple)):
            items = [input_list]
        else:
            items = list(input_list)

        res = []
        for i in range(self.MAX_OUTPUTS):
            if i < len(items):
                res.append(items[i])
            else:
                res.append(None)
        return tuple(res)


class LikeJImageUnpacker:
    MAX_OUTPUTS = 32

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
        if isinstance(images, list):
            img_list = images
        elif isinstance(images, torch.Tensor):
            if len(images.shape) == 4 and images.shape[0] > 1:
                img_list = [images[i:i+1] for i in range(images.shape[0])]
            else:
                img_list = [images]
        else:
            img_list = [images]

        res = []
        for i in range(self.MAX_OUTPUTS):
            if i < len(img_list):
                res.append(img_list[i])
            else:
                res.append(None)
        return tuple(res)


class LikeJAudioUnpacker:
    MAX_OUTPUTS = 32

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
    CATEGORY = "LikeJ"

    def unpack(self, audios):
        audio_list = []
        if isinstance(audios, list):
            audio_list = audios
        else:
            audio_list = [audios]

        res = []
        for i in range(self.MAX_OUTPUTS):
            if i < len(audio_list):
                res.append(audio_list[i])
            else:
                res.append(None)
        return tuple(res)

