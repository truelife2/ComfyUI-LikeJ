import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.LikeJPose3d",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LikeJPose3d") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const self = this;

                // 1. 建立隱藏的 pose_b64 欄位
                const b64Widget = this.addWidget("text", "pose_b64", "", () => {}, { serialize: true });
                b64Widget.type = "hidden";

                // 2. 建立 3D 視窗 iframe
                const iframe = document.createElement("iframe");
                iframe.src = "/extensions/ComfyUI-LikeJ/likejpose3d.html"; 
                iframe.style.width = "100%";
                iframe.style.height = "400px";
                iframe.style.border = "none";

                // 發送尺寸給 iframe
                const syncSizeToIframe = (triggerSend = false) => {
                    const wWidget = self.widgets ? self.widgets.find(w => w.name === "width") : null;
                    const hWidget = self.widgets ? self.widgets.find(w => w.name === "height") : null;
                    const wVal = wWidget ? parseInt(wWidget.value) : 512;
                    const hVal = hWidget ? parseInt(hWidget.value) : 512;

                    if (iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            type: "LIKEJ_POSE3D_SET_SIZE",
                            width: wVal,
                            height: hVal,
                            triggerSend: triggerSend
                        }, "*");
                    }
                };

                // 💡 關鍵修復：為 widget.callback 綁定事件監聽
                const bindWidgetCallback = (name) => {
                    const w = self.widgets ? self.widgets.find(x => x.name === name) : null;
                    if (w && !w._likej_bound) {
                        w._likej_bound = true; // 避免重複綁定
                        const origCallback = w.callback;
                        w.callback = function (value) {
                            if (origCallback) origCallback.apply(this, arguments);
                            syncSizeToIframe(true); // 數值變更時立即命令 iframe 重產 Base64
                        };
                    }
                };

                iframe.onload = () => {
                    bindWidgetCallback("width");
                    bindWidgetCallback("height");
                    syncSizeToIframe(true);
                };

                this.addDOMWidget("3d_editor", "HTML", iframe, {
                    getValue() { return b64Widget ? b64Widget.value : ""; },
                    setValue(v) { if (b64Widget) b64Widget.value = v; }
                });

                this.size = [450, 500];

                // 接收 iframe 傳回的 Base64
                window.addEventListener("message", (event) => {
                    if (event.data && event.data.type === "LIKEJ_POSE3D_UPDATE") {
                        if (b64Widget) {
                            b64Widget.value = event.data.image;
                            app.graph.setDirtyCanvas(true);
                        }
                    }
                });

                return r;
            };
        }
    }
});