class LikeJImageSlots:
    """
    動態槽位集線節點：支援按鈕動態增減槽位，
    並可設定是否略過未連接 Image 的空槽位 (skip_empty_slots)。
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "skip_empty_slots": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "image_1": ("IMAGE",),
                "mask_1": ("MASK",),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("images", "masks")
    OUTPUT_IS_LIST = (True, True)
    FUNCTION = "process_slots"
    CATEGORY = "LikeJ/Image"

    def process_slots(self, skip_empty_slots=False, **kwargs):
        # 掃描所有傳入的槽位編號
        slot_indices = set()
        for k in kwargs.keys():
            if k.startswith("image_") or k.startswith("mask_"):
                try:
                    slot_indices.add(int(k.split("_")[1]))
                except ValueError:
                    pass

        max_slot = max(slot_indices) if slot_indices else 1

        raw_images = []
        raw_masks = []
        for i in range(1, max_slot + 1):
            raw_images.append(kwargs.get(f"image_{i}", None))
            raw_masks.append(kwargs.get(f"mask_{i}", None))

        # 根據設定決定是否過濾未接 Image 的槽位
        if skip_empty_slots:
            images = []
            masks = []
            for img, msk in zip(raw_images, raw_masks):
                if img is not None:
                    images.append(img)
                    masks.append(msk)
        else:
            images = raw_images
            masks = raw_masks

        return (images, masks)