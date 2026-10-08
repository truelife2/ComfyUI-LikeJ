class LikeJVideoDemuxing:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "video": ("VIDEO"),
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT")
    RETURN_NAMES = ("images", "audio", "fps")
    FUNCTION = "demux"
    CATEGORY = "LikeJ/Video"

    def demux(self, video=None):
        if video is None:
            return (None, None, 0.0)

        # https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api/latest/_input_impl/video_types.py
        video_components = video.get_components()
        
        if video_components is None:
            print(f"[LikeJVideoDemuxing] 無法獲取影片元件: {video}")
            return (None, None, 0.0)

        return (video_components.images, video_components.audio, video_components.frame_rate)
