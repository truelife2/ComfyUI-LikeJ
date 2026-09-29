import logging

try:
    from execution import ExecutionBlocker
except ImportError:
    try:
        from comfy_execution.graph import ExecutionBlocker
    except ImportError:
        class ExecutionBlocker:
            def __init__(self, value=None):
                self.value = value


class LikeJLazyFloatSwitch:
    """
    Float Lazy Switch: Compares condition_value against threshold.
    Only pulls upstream 'input_data' if condition_value >= threshold.
    """
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "condition_value": ("FLOAT", {
                    "default": 1.0, 
                    "min": -999999.0, 
                    "max": 999999.0, 
                    "step": 0.01,
                    "tooltip": "Input float value to evaluate against threshold."
                }),
                "threshold": ("FLOAT", {
                    "default": 1.0, 
                    "min": -999999.0, 
                    "max": 999999.0, 
                    "step": 0.01,
                    "tooltip": "Activation threshold. Gate opens if condition_value >= threshold."
                }),
            },
            "optional": {
                "input_data": ("*", {
                    "lazy": True,
                    "tooltip": "Upstream data stream evaluated lazily."
                }),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output_data",)
    FUNCTION = "process"
    CATEGORY = "LikeJ/Logic"

    @classmethod
    def IS_CHANGED(s, condition_value, threshold, **kwargs):
        return (condition_value, threshold)

    def check_lazy_status(self, condition_value=None, threshold=None, **kwargs):
        if condition_value is None or threshold is None:
            return ["condition_value", "threshold"]

        if condition_value >= threshold:
            return ["input_data"]
        
        return []

    def process(self, condition_value=None, threshold=None, **kwargs):
        if condition_value is None or threshold is None:
            logging.warning("[LikeJLazyFloatSwitch] Condition inputs are None. Blocking downstream.")
            return (ExecutionBlocker(None),)

        if condition_value >= threshold and kwargs.get("input_data") is not None:
            return (kwargs["input_data"],)
        
        logging.info("[LikeJLazyFloatSwitch] Condition not met. Blocking downstream execution.")
        return (ExecutionBlocker(None),)


class LikeJLazyBoolSwitch:
    """
    Boolean Lazy Switch (If-Else MUX): 
    Evaluates boolean_state and lazily pulls ONLY 'true_input' or 'false_input'.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "boolean_state": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "If True, lazily evaluates true_input. If False, lazily evaluates false_input."
                }),
            },
            "optional": {
                "true_input": ("*", {
                    "lazy": True,
                    "tooltip": "Upstream data stream evaluated lazily when boolean_state is True."
                }),
                "false_input": ("*", {
                    "lazy": True,
                    "tooltip": "Upstream data stream evaluated lazily when boolean_state is False."
                }),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output_data",)
    FUNCTION = "process"
    CATEGORY = "LikeJ/Logic"

    @classmethod
    def IS_CHANGED(s, boolean_state, **kwargs):
        return boolean_state

    def check_lazy_status(self, boolean_state=None, **kwargs):
        # 階段 1：若 boolean_state 尚未計算，要求引擎評估 boolean_state
        if boolean_state is None:
            return ["boolean_state"]

        # 階段 2：若 boolean_state 算出來是明確的 True/False，才拉取單一分支
        if boolean_state is True or boolean_state == 1:
            return ["true_input"]
        elif boolean_state is False or boolean_state == 0:
            return ["false_input"]

        # 階段 3：若上游傳來的開關結果依然是 None/無效，兩條分支都不拉取！
        return []

    def process(self, boolean_state=None, **kwargs):
        # 無效開關訊號，直接 Block 下游
        if boolean_state is None:
            logging.warning("[LikeJLazyBoolSwitch] boolean_state is None. Blocking downstream execution.")
            return (ExecutionBlocker(None),)

        if boolean_state:
            if kwargs.get("true_input") is not None:
                return (kwargs["true_input"],)
            return (ExecutionBlocker(None),)
        else:
            if kwargs.get("false_input") is not None:
                return (kwargs["false_input"],)
            return (ExecutionBlocker(None),)
