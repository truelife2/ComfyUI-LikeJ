import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LikeJ.SwitchToFlowIn",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "LikeJSwitchToFlowIn") return;

        // 建立原生樣式的單行 Status Widget（不設定強制顏色，完美適應各種色系佈景主題）
        nodeType.prototype.ensureWidget = function () {
            let widget = this.widgets?.find(w => w.name === "active_status");

            if (widget && !widget.valueSpan) {
                const idx = this.widgets.indexOf(widget);
                if (idx !== -1) this.widgets.splice(idx, 1);
                widget = null;
            }

            if (!widget) {
                const container = document.createElement("div");
                container.className = "p-widget comfyuic-text-widget";
                container.style.display = "flex";
                container.style.width = "100%";
                container.style.height = "20px";
                container.style.lineHeight = "20px";
                container.style.fontSize = "12px";
                container.style.alignItems = "center";
                container.style.justifyContent = "center";
                container.style.pointerEvents = "none";
                container.style.padding = "0 8px";
                container.style.overflow = "hidden";
                container.style.textOverflow = "ellipsis";
                container.style.whiteSpace = "nowrap";

                const valueSpan = document.createElement("span");
                valueSpan.className = "value-text";
                valueSpan.innerText = "-";
                valueSpan.style.overflow = "hidden";
                valueSpan.style.textOverflow = "ellipsis";
                valueSpan.style.whiteSpace = "nowrap";
                valueSpan.style.textAlign = "center";

                container.appendChild(valueSpan);

                widget = this.addCustomWidget({
                    name: "active_status",
                    type: "custom",
                    element: container,
                    value: "-",
                    computeSize() {
                        return [120, 20];
                    }
                });
                
                widget.valueSpan = valueSpan;
            }
            return widget;
        };

        nodeType.prototype.updateActiveStatus = function () {
            const w = this.ensureWidget();
            if (!w || !w.valueSpan) return;

            let activeText = "-";
            if (this.inputs) {
                for (const input of this.inputs) {
                    if (input.link != null) {
                        const linkId = typeof input.link === 'object' ? input.link.id : input.link;
                        const link = app.graph.links?.[linkId];
                        if (link) {
                            const originNode = app.graph.getNodeById(link.origin_id);
                            if (originNode) {
                                const nodeTitle = originNode.title || originNode.type;
                                activeText = `${input.name}: ${nodeTitle}`;
                                break;
                            }
                        }
                    }
                }
            }

            w.value = activeText;
            w.valueSpan.innerText = activeText;
            this.setSize(this.computeSize());
            app.graph.setDirtyCanvas(true, true);
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);
            this.ensureWidget();
            this.updateActiveStatus();
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            if (onConfigure) onConfigure.apply(this, arguments);
            this.ensureWidget();
            this.updateActiveStatus();
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type) {
            if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
            if (type === 1) { // 輸入端連線變動
                setTimeout(() => {
                    this.manageDynamicInputs();
                    this.updateActiveStatus();
                }, 0);
            }
        };

        nodeType.prototype.manageDynamicInputs = function () {
            if (!this.inputs) return;

            let lockedType = "*";
            for (const input of this.inputs) {
                if (input.link !== null) {
                    const link = app.graph.links[input.link];
                    if (link?.type) {
                        lockedType = link.type;
                        break;
                    }
                }
            }

            if (lockedType === "*") {
                const w = this.ensureWidget();
                if (w && w.valueSpan) {
                    w.value = "-";
                    w.valueSpan.innerText = "-";
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

            for (const input of this.inputs) input.type = lockedType;
            if (this.outputs?.length > 0) this.outputs[0].type = lockedType;
        };
    }
});