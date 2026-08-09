class LikeJMultiGroupsBypasser:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "hidden": {
                "groups_data": ("STRING", {"default": "[]"}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "switch_groups"
    CATEGORY = "LikeJ"
    OUTPUT_NODE = True

    def switch_groups(self, groups_data):
        return {}