import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.LikeJPose3d",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LikeJPose3d") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const self = this;

                const b64Widget = this.addWidget("text", "pose_b64", "", () => {}, { serialize: true });
                b64Widget.type = "hidden";

                const iframe = document.createElement("iframe");
                iframe.src = "/extensions/ComfyUI-LikeJ/likejpose3d.html"; 
                iframe.style.width = "100%";
                iframe.style.height = "400px";
                iframe.style.border = "none";

                // 定義同步尺寸給 iframe 的函式
                const syncSizeToIframe = () => {
                    const wWidget = self.widgets.find(w => w.name === "width");
                    const hWidget = self.widgets.find(w => w.name === "height");
                    if (iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            type: "LIKEJ_POSE3D_SET_SIZE",
                            width: wWidget ? wWidget.value : 512,
                            height: hWidget ? hWidget.value : 512
                        }, "*");
                    }
                };

                // 綁定 width / height 變更監聽
                const bindWidgetChange = (name) => {
                    const w = self.widgets.find(x => x.name === name);
                    if (w) {
                        const origCb = w.callback;
                        w.callback = function () {
                            if (origCb) origCb.apply(this, arguments);
                            syncSizeToIframe();
                        };
                    }
                };

                iframe.onload = () => {
                    bindWidgetChange("width");
                    bindWidgetChange("height");
                    syncSizeToIframe();
                };

                this.addDOMWidget("3d_editor", "HTML", iframe, {
                    getValue() { return b64Widget.value; },
                    setValue(v) { b64Widget.value = v; }
                });

                this.size = [450, 500];

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