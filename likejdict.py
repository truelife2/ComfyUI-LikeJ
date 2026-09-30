import json

def parse_and_validate_value(val, val_type, key_name="", node_name="LikeJDictionary"):
    # Allow None and empty strings (empty strings are treated as None for non-STRING/ANY types)
    if val is None or (isinstance(val, str) and val.strip() == "" and val_type not in ("STRING", "ANY")):
        return None

    if val_type == "INT":
        try:
            if isinstance(val, bool):
                return int(val)
            elif isinstance(val, (int, float)):
                return int(val)
            else:
                try:
                    return int(val)
                except ValueError:
                    return int(float(val))
        except (ValueError, TypeError):
            raise ValueError(f"[{node_name}] Key '{key_name}' value '{val}' cannot be converted to INT!")

    elif val_type == "FLOAT":
        try:
            return float(val)
        except (ValueError, TypeError):
            raise ValueError(f"[{node_name}] Key '{key_name}' value '{val}' cannot be converted to FLOAT!")

    elif val_type == "BOOLEAN":
        if isinstance(val, bool):
            return val
        elif isinstance(val, (int, float)):
            return bool(val)
        elif isinstance(val, str):
            s_val = val.strip().lower()
            if s_val in ("true", "1", "t", "yes"):
                return True
            elif s_val in ("false", "0", "f", "no"):
                return False
            else:
                raise ValueError(f"[{node_name}] Key '{key_name}' value '{val}' cannot be converted to BOOLEAN!")
        else:
            raise ValueError(f"[{node_name}] Key '{key_name}' value '{val}' cannot be converted to BOOLEAN!")

    elif val_type == "ANY":
        # 如果是字串格式且有內容，嘗試看看能不能解析 JSON，不行就直接回傳原始值或物件
        if isinstance(val, str) and val.strip() != "":
            try:
                return json.loads(val)
            except:
                return val
        else:
            return val

    else:  # STRING
        if isinstance(val, (dict, list)):
            return json.dumps(val, ensure_ascii=False)
        return str(val) if val is not None else None


class LikeJDictionary:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "override_from_input": ("BOOLEAN", {"default": False, "label_on": "true", "label_off": "false"}),
            },
            "optional": {
                "dictionary": ("DICT",),
            },
            "hidden": {
                "kv_json": ("STRING", "[]"),
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("DICT",)
    RETURN_NAMES = ("dict",)
    FUNCTION = "create_dict"
    CATEGORY = "LikeJ"

    @classmethod
    def IS_CHANGED(s, override_from_input=False, kv_json="[]", dictionary=None, extra_pnginfo=None, unique_id=None, **kwargs):
        return kv_json

    def create_dict(self, override_from_input=False, kv_json="[]", dictionary=None, extra_pnginfo=None, unique_id=None, **kwargs):
        in_dict = dictionary.copy() if isinstance(dictionary, dict) else {}
        ui_dict = {}

        data = []
        try:
            if isinstance(kv_json, str):
                data = json.loads(kv_json)
            elif isinstance(kv_json, (list, dict)):
                data = kv_json
        except:
            data = []

        if isinstance(data, list):
            for item in data:
                if not isinstance(item, dict):
                    continue

                key = str(item.get("key", "")).strip()
                val = item.get("value", None)
                val_type = item.get("type", "STRING")

                if not key:
                    continue

                ui_dict[key] = parse_and_validate_value(val, val_type, key_name=key, node_name="LikeJDictionary")

        elif isinstance(data, dict):
            ui_dict.update(data)

        if override_from_input:
            res_dict = ui_dict
            res_dict.update(in_dict)
        else:
            res_dict = in_dict
            res_dict.update(ui_dict)

        return (res_dict,)


class LikeJDictionaryGet:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "dictionary": ("DICT",),
                "key": ("STRING", {"default": ""}),
                "type": (["STRING", "INT", "FLOAT", "BOOLEAN", "ANY"], {"default": "STRING"}),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("val",)
    FUNCTION = "get_value"
    CATEGORY = "LikeJ"

    @classmethod
    def IS_CHANGED(s, dictionary, key, type):
        return f"{key}_{type}_{float('nan')}"

    def get_value(self, dictionary, key, type):
        if dictionary is None:
            dict_obj = {}
        elif isinstance(dictionary, dict):
            dict_obj = dictionary
        elif isinstance(dictionary, str):
            try:
                dict_obj = json.loads(dictionary)
                if not isinstance(dict_obj, dict):
                    dict_obj = {}
            except:
                dict_obj = {}
        else:
            dict_obj = {}

        target_key = str(key).strip()

        if not target_key:
            raise ValueError("[LikeJDictionaryGet] Target 'key' cannot be empty!")

        if target_key not in dict_obj:
            found_key = None
            for k in dict_obj.keys():
                if str(k).strip() == target_key:
                    found_key = k
                    break
            
            if found_key is not None:
                target_key = found_key
            else:
                available_keys = list(dict_obj.keys())
                raise KeyError(f"[LikeJDictionaryGet] Key '{target_key}' not found in dictionary! Current available keys in dict: {available_keys}")

        val = dict_obj[target_key]
        res = parse_and_validate_value(val, type, key_name=target_key, node_name="LikeJDictionaryGet")

        return (res,)
