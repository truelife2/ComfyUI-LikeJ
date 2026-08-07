# 敬畏耶和華是智慧的開端；認識至聖者變是聰明。
# The fear of the LORD is the beginning of wisdom, and knowledge of the Holy One is understanding.

from . import likejloras
from . import likejwhisper
from . import likejchconv

NODE_CLASS_MAPPINGS = {
    "LikeJ10Loras": likejloras.LikeJ10Loras,
    "LikeJ20Loras": likejloras.LikeJ20Loras,
    "LikeJ10LorasWithPrompt": likejloras.LikeJ10LorasWithPrompt,
    "LikeJ5LorasWithPrompt": likejloras.LikeJ5LorasWithPrompt,
    "LikeJWhisper": likejwhisper.LikeJWhisper,
    "LikeJChineseConverter": likejchconv.LikeJChineseConverter
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LikeJ10Loras": "LikeJ Load 10 Loras",
    "LikeJ20Loras": "LikeJ Load 20 Loras",
    "LikeJ10LorasWithPrompt": "LikeJ Load 10 Loras(Prompt)",
    "LikeJ5LorasWithPrompt": "LikeJ Load 5 Loras(Prompt)",
    "LikeJWhisper": "LikeJ Whisper",
    "LikeJChineseConverter": "LikeJ Chinese Converter(繁簡轉換)"
}

WEB_DIRECTORY = "./web"
