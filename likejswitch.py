import logging

# Attempt to import ExecutionBlocker from ComfyUI execution engine
try:
    from execution import ExecutionBlocker
except ImportError:
    try:
        from comfy_execution.graph import ExecutionBlocker
    except ImportError:
        # Compatibility fallback for older engine versions
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
                    "tooltip": "Input float value to evaluate against the threshold."
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
                    "tooltip": "Upstream data stream (IMAGE, LATENT, MODEL, etc.) evaluated lazily."
                }),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output_data",)
    FUNCTION = "process"
    CATEGORY = "LikeJ/Logic"

    def check_lazy_status(self, condition_value, threshold, input_data=None):
        if condition_value >= threshold:
            return ["input_data"]
        return []

    def process(self, condition_value, threshold, input_data=None):
        if condition_value >= threshold and input_data is not None:
            return (input_data,)
        
        logging.info("[LikeJLazyFloatSwitch] Condition not met or no input. Skipped upstream Group and blocked downstream nodes.")
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
                    "tooltip": "If True, evaluates and outputs true_input. If False, evaluates and outputs false_input."
                }),
            },
            "optional": {
                "true_input": ("*", {
                    "tooltip": "Upstream data evaluated lazily when boolean_state is True."
                }),
                "false_input": ("*", {
                    "tooltip": "Upstream data evaluated lazily when boolean_state is False."
                }),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output_data",)
    FUNCTION = "process"
    CATEGORY = "LikeJ/Logic"

    def check_lazy_status(self, boolean_state, true_input=None, false_input=None):
        # Lazily request ONLY the active branch
        if boolean_state:
            return ["true_input"]
        return ["false_input"]

    def process(self, boolean_state, true_input=None, false_input=None):
        if boolean_state:
            if true_input is not None:
                return (true_input,)
            logging.info("[LikeJLazyBoolSwitch] State is True, but 'true_input' is not provided.")
            return (ExecutionBlocker(None),)
        else:
            if false_input is None:
                logging.info("[LikeJLazyBoolSwitch] State is False, but 'false_input' is not provided.")
                return (ExecutionBlocker(None),)
            return (false_input,)
