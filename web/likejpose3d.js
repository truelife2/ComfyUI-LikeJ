import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.LikeJPose3d",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LikeJPose3d") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const self = this;

                // 1. 姿態影像隱藏欄位
                const b64Widget = this.addWidget("text", "pose_b64", "", () => {}, { serialize: true });
                b64Widget.type = "hidden";

                // 💡 2. 擴充設定隱藏欄位 (序列化儲存在工作流)
                const configWidget = this.addWidget("text", "pose_config", "{}", () => {}, { serialize: true });
                configWidget.type = "hidden";

                // 3. 建立 3D 視窗 iframe
                const iframe = document.createElement("iframe");
                iframe.src = "/extensions/ComfyUI-LikeJ/likejpose3d.html"; 
                iframe.style.width = "100%";
                iframe.style.height = "400px";
                iframe.style.border = "none";

                // 發送尺寸與存檔的 Config 給 iframe
                const syncToIframe = (triggerSend = false) => {
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

                        // 將存儲在 Node 上的 config 發送至 HTML 載入
                        iframe.contentWindow.postMessage({
                            type: "LIKEJ_POSE3D_LOAD_CONFIG",
                            configStr: configWidget ? configWidget.value : "{}"
                        }, "*");
                    }
                };

                const bindWidgetCallback = (name) => {
                    const w = self.widgets ? self.widgets.find(x => x.name === name) : null;
                    if (w && !w._likej_bound) {
                        w._likej_bound = true;
                        const origCallback = w.callback;
                        w.callback = function (value) {
                            if (origCallback) origCallback.apply(this, arguments);
                            syncToIframe(true);
                        };
                    }
                };

                iframe.onload = () => {
                    bindWidgetCallback("width");
                    bindWidgetCallback("height");
                    syncToIframe(true);
                };

                this.addDOMWidget("3d_editor", "HTML", iframe, {
                    getValue() { return b64Widget ? b64Widget.value : ""; },
                    setValue(v) { if (b64Widget) b64Widget.value = v; }
                });

                this.size = [450, 500];

                // 💡 接收來自 iframe 的訊息
                window.addEventListener("message", (event) => {
                    if (!event.data) return;

                    // 更新姿態圖片
                    if (event.data.type === "LIKEJ_POSE3D_UPDATE") {
                        if (b64Widget) {
                            b64Widget.value = event.data.image;
                            app.graph.setDirtyCanvas(true);
                        }
                    }

                    // 💡 儲存 UI 配置至 Node 的 hidden widget 上
                    if (event.data.type === "LIKEJ_POSE3D_SAVE_CONFIG") {
                        if (configWidget) {
                            configWidget.value = JSON.stringify(event.data.config);
                            app.graph.setDirtyCanvas(true);
                        }
                    }
                });

                return r;
            };
        }
    }
});