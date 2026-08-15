import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LikeJ.SwitchToFlowIn",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "LikeJSwitchToFlowIn") return;

        nodeType.prototype.ensureWidget = function () {
            let widget = this.widgets?.find(w => w.name === "active_status");

            this.properties = this.properties || {};
            if (this.properties.activeStatus === undefined) {
                this.properties.activeStatus = "-";
            }

            const currentText = this.properties.activeStatus;

            if (!widget) {
                if (typeof this.addDOMWidget === "function") {
                    const container = document.createElement("div");
                    container.className = "comfyuic-text-widget";
                    container.style.display = "flex";
                    container.style.width = "100%";
                    container.style.height = "22px";
                    container.style.alignItems = "center";
                    container.style.justifyContent = "center";
                    container.style.fontSize = "12px";

                    const valueSpan = document.createElement("span");
                    valueSpan.className = "value-text";
                    valueSpan.innerText = currentText;
                    container.appendChild(valueSpan);

                    widget = this.addDOMWidget("active_status", "Active Status", container, {
                        serialize: false,
                        hideLabel: false, 
                        computeSize: () => [180, 26]
                    });
                    widget.valueSpan = valueSpan;
                } else {
                    widget = {
                        name: "active_status",
                        type: "text",
                        value: currentText,
                        options: { serialize: false }
                    };
                    this.widgets.push(widget);
                }
            } else {
                if (widget.valueSpan) {
                    widget.valueSpan.innerText = currentText;
                }
                widget.value = currentText;
            }
            return widget;
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);
            this.ensureWidget();
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (o) {
            if (onConfigure) onConfigure.apply(this, arguments);
            console.log("onConfigure");
            console.log(o);
            console.log(o.outputs[0].value);
            if (o?.properties?.activeStatus !== undefined) {
                this.properties = this.properties || {};
                this.properties.activeStatus = o.properties.activeStatus;
            }
            
            // 確保設定讀進來後立即更新 DOM 顯示
            const w = this.ensureWidget();
            if (w && w.valueSpan) {
                w.valueSpan.innerText = this.properties.activeStatus;
            }
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (output) {
            if (onExecuted) onExecuted.apply(this, arguments);
            console.log("onExecuted");
            
            const textData = output?.text || (output?.ui && output.ui.text);
            if (textData && textData.length > 0) {
                const activeText = textData[0];
                
                this.properties = this.properties || {};
                this.properties.activeStatus = activeText;

                const w = this.ensureWidget();
                if (w) {
                    w.value = activeText;
                    if (w.valueSpan) {
                        w.valueSpan.innerText = activeText;
                    }
                    if (typeof this.setDirtyCanvas === "function") {
                        this.setDirtyCanvas(true, true);
                    }
                }
            }
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type) {
            if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
            if (type === 1) {
                setTimeout(() => {
                    this.manageDynamicInputs();
                }, 0);
            }
        };

        nodeType.prototype.manageDynamicInputs = function () {
            if (!this.inputs) return;

            let lockedType = "*";
            for (const input of this.inputs) {
                if (input.link !== null) {
                    const link = app.graph.links[input.link];
                    if (link?.type && link.type !== "*") {
                        lockedType = link.type;
                        break;
                    }
                }
            }

            const last = this.inputs[this.inputs.length - 1];
            if (last && last.link !== null) {
                this.addInput(`input_${this.inputs.length + 1}`, lockedType);
            }
            while (
                this.inputs.length > 1 &&
                this.inputs[this.inputs.length - 1].link === null &&
                this.inputs[this.inputs.length - 2].link === null
            ) {
                this.removeInput(this.inputs.length - 1);
            }

            for (const input of this.inputs) {
                if (input.link === null) {
                    input.type = "*"; 
                } else {
                    input.type = lockedType;
                }
            }
            if (this.outputs?.length > 0) {
                this.outputs[0].type = lockedType;
            }
        };
    }
});