import os
import torch

# 嘗試動態匯入 ComfyUI 官方 VideoFromFile 類別
try:
    from comfy_api.latest._input_impl.video_types import VideoFromFile
    HAS_VIDEO_FROM_FILE = True
except ImportError:
    try:
        from comfy.inputs import VideoFromFile
        HAS_VIDEO_FROM_FILE = True
    except ImportError:
        VideoFromFile = None
        HAS_VIDEO_FROM_FILE = False


def to_video_object(item):
    """將輸入轉為標準 VideoFromFile 物件 (若本身已是物件/字典則直接保留，若為實體路徑則進行包裝)"""
    if item is None or item == "":
        return None

    # 如果已經是 VideoFromFile 物件或 Dict 字典，直接回傳
    if (HAS_VIDEO_FROM_FILE and VideoFromFile is not None and isinstance(item, VideoFromFile)) or isinstance(item, dict):
        return item

    # 如果是字串且實體檔案存在，包裝為 VideoFromFile 物件
    filepath = str(item).strip()
    if filepath and os.path.exists(filepath):
        if HAS_VIDEO_FROM_FILE and VideoFromFile is not None:
            try:
                return VideoFromFile(filepath)
            except Exception as e:
                print(f"[LikeJVideoUnpacker] 包裝 VideoFromFile 物件失敗: {e}")
                return filepath
        return filepath

    return item if item != "" else None


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
    CATEGORY = "LikeJ"

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


class LikeJVideoUnpacker:
    MAX_OUTPUTS = 32
    INPUT_IS_LIST = True  # 宣告接收 List 輸入

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "videos": ("VIDEO", {"forceInput": True, "tooltip": "Input VIDEO object or list of VIDEO objects"}),
            },
        }

    # 宣告腳位型別為 VIDEO
    RETURN_TYPES = tuple(["VIDEO"] * MAX_OUTPUTS)
    RETURN_NAMES = tuple([f"video_{i}" for i in range(MAX_OUTPUTS)])
    FUNCTION = "unpack"
    CATEGORY = "LikeJ"

    def unpack(self, videos):
        video_list = []
        for item in videos:
            if item is None or item == "":
                continue
            elif isinstance(item, list):
                for sub_item in item:
                    v_obj = to_video_object(sub_item)
                    if v_obj is not None:
                        video_list.append(v_obj)
            else:
                v_obj = to_video_object(item)
                if v_obj is not None:
                    video_list.append(v_obj)

        res = []
        for i in range(self.MAX_OUTPUTS):
            if i < len(video_list):
                res.append(video_list[i])
            else:
                res.append(None)
        return tuple(res)

