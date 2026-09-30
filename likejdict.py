import json

def parse_and_validate_value(val, val_type, key_name="", node_name="LikeJDictionary"):
    # Allow None and empty strings (empty strings are treated as None for non-STRING/RAW types)
    if val is None or (isinstance(val, str) and val.strip() == "" and val_type not in ("STRING", "RAW")):
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

    elif val_type == "RAW":
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
            "required": {},
            "optional": {
                "dictionary": ("DICT",),
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("DICT",)
    RETURN_NAMES = ("dict",)
    FUNCTION = "create_dict"
    CATEGORY = "LikeJ"

    # 動態監聽 extra_pnginfo 中的 kv_data 變更，完美解決快取未更新問題且不顯現 UI 框
    @classmethod
    def IS_CHANGED(s, dictionary=None, extra_pnginfo=None, unique_id=None, **kwargs):
        if extra_pnginfo and isinstance(extra_pnginfo, dict) and "workflow" in extra_pnginfo:
            workflow = extra_pnginfo.get("workflow", {})
            nodes = workflow.get("nodes", [])
            for node in nodes:
                if str(node.get("id")) == str(unique_id):
                    kv_data = node.get("extra", {}).get("kv_data") or node.get("properties", {}).get("kv_data")
                    return str(kv_data)
        return float("nan")

    def create_dict(self, dictionary=None, extra_pnginfo=None, unique_id=None, **kwargs):
        out_dict = dictionary.copy() if isinstance(dictionary, dict) else {}
        raw_kv_data = None

        if extra_pnginfo and isinstance(extra_pnginfo, dict) and "workflow" in extra_pnginfo:
            workflow = extra_pnginfo.get("workflow", {})
            nodes = workflow.get("nodes", [])
            for node in nodes:
                if str(node.get("id")) == str(unique_id):
                    if "extra" in node and "kv_data" in node["extra"]:
                        raw_kv_data = node["extra"]["kv_data"]
                    elif "properties" in node and "kv_data" in node["properties"]:
                        raw_kv_data = node["properties"]["kv_data"]
                    break

        if isinstance(raw_kv_data, str):
            try:
                data = json.loads(raw_kv_data)
            except:
                data = []
        elif isinstance(raw_kv_data, (list, dict)):
            data = raw_kv_data
        else:
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

                out_dict[key] = parse_and_validate_value(val, val_type, key_name=key, node_name="LikeJDictionary")

        elif isinstance(data, dict):
            out_dict.update(data)

        return (out_dict,)


class LikeJDictionaryGet:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "dictionary": ("DICT",),
                "key": ("STRING", {"default": ""}),
                "type": (["STRING", "INT", "FLOAT", "BOOLEAN", "RAW"], {"default": "STRING"}),
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
        if not isinstance(dictionary, dict):
            raise TypeError("[LikeJDictionaryGet] Invalid input dictionary format!")

        target_key = str(key).strip()

        if target_key not in dictionary:
            found_key = None
            for k in dictionary.keys():
                if str(k).strip() == target_key:
                    found_key = k
                    break
            
            if found_key is not None:
                target_key = found_key
            else:
                raise KeyError(f"[LikeJDictionaryGet] Key '{target_key}' not found in dictionary! Available keys: {list(dictionary.keys())}")

        val = dictionary[target_key]
        res = parse_and_validate_value(val, type, key_name=target_key, node_name="LikeJDictionaryGet")

        return (res,)
