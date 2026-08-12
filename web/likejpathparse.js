import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

app.registerExtension({
    name: "LikeJPathParse.ShowText",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LikeJPathParse") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);

                // 1. 移除舊的預覽元件
                if (this.widgets) {
                    const pos = this.widgets.findIndex((w) => w.name === "parsed_preview");
                    if (pos !== -1) {
                        this.widgets[pos].onRemove?.();
                        this.widgets.splice(pos, 1);
                    }
                }

                // 2. 解析文字資料（解開 List/Array 確保拿到 String）
                let textStr = "";
                if (message?.text) {
                    if (Array.isArray(message.text)) {
                        // 如果裡面包著清單，把它串接成字串
                        textStr = message.text.flatMap(item => Array.isArray(item) ? item : [item]).join("\n");
                    } else {
                        textStr = String(message.text);
                    }
                }

                // 3. 建立並更新 UI 文字框
                if (textStr) {
                    const widgetRes = ComfyWidgets["STRING"](this, "parsed_preview", ["STRING", { multiline: true }], app);
                    const widget = widgetRes.widget;
                    
                    if (widget && widget.inputEl) {
                        widget.inputEl.readOnly = true;
                        widget.inputEl.style.opacity = "0.8";
                        widget.value = textStr;
                    }
                    
                    this.onResize?.(this.size);
                }
            };
        }
    },
});