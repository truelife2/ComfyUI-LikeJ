import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.LikeJPose3d",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LikeJPose3d") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            const onConfigure = nodeType.prototype.onConfigure;

            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const self = this;

                this.properties = this.properties || {};
                this.properties["pose_b64"] = this.properties["pose_b64"] || "";
                this.properties["pose_config"] = this.properties["pose_config"] || "";

                const iframe = document.createElement("iframe");
                iframe.src = "/extensions/ComfyUI-LikeJ/likejpose3d.html?v=" + Date.now();
                iframe.style.width = "100%";
                iframe.style.height = "400px";
                iframe.style.border = "none";

                const syncSizeToIframe = (triggerSend = false) => {
                    const wWidget = self.widgets?.find(w => w.name === "width");
                    const hWidget = self.widgets?.find(w => w.name === "height");
                    const wVal = wWidget ? parseInt(wWidget.value) : 1024;
                    const hVal = hWidget ? parseInt(hWidget.value) : 1024;

                    if (iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            type: "LIKEJ_POSE3D_SET_SIZE",
                            width: wVal,
                            height: hVal,
                            triggerSend: triggerSend
                        }, "*");
                    }
                };

                const bindWidgetCallback = (name) => {
                    const w = self.widgets?.find(x => x.name === name);
                    if (w && !w._likej_bound) {
                        w._likej_bound = true;
                        const origCallback = w.callback;
                        w.callback = function () {
                            if (origCallback) origCallback.apply(this, arguments);
                            syncSizeToIframe(true);
                        };
                    }
                };

                iframe.onload = () => {
                    bindWidgetCallback("width");
                    bindWidgetCallback("height");
                };

                const editorWidget = self.addDOMWidget("3d_editor", "HTML", iframe, {
                    getValue: () => self.properties["pose_b64"],
                    setValue: (v) => { self.properties["pose_b64"] = v; }
                });

                if (editorWidget) {
                    editorWidget.computeSize = () => [450, 400];
                }

                self.setSize([450, 480]);

                window.addEventListener("message", (event) => {
                    if (!event.data || event.source !== iframe.contentWindow) return;

                    if (event.data.type === "LIKEJ_POSE3D_READY") {
                        const savedConfig = self.properties["pose_config"] || "";
                        iframe.contentWindow.postMessage({
                            type: "LIKEJ_POSE3D_LOAD_CONFIG",
                            configStr: savedConfig
                        }, "*");
                        syncSizeToIframe(false);
                    }

                    if (event.data.type === "LIKEJ_POSE3D_UPDATE") {
                        self.properties["pose_b64"] = event.data.image || "";
                        app.graph.setDirtyCanvas(true);
                    }

                    if (event.data.type === "LIKEJ_POSE3D_SAVE_CONFIG") {
                        const strData = typeof event.data.config === "string" 
                            ? event.data.config 
                            : JSON.stringify(event.data.config);
                        
                        self.properties["pose_config"] = strData;
                        app.graph.setDirtyCanvas(true);
                    }
                });

                return r;
            };

            nodeType.prototype.onConfigure = function (info) {
                const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                const self = this;

                const iframeWidget = self.widgets?.find(w => w.name === "3d_editor");
                const iframe = iframeWidget?.element;
                if (iframe && iframe.contentWindow && self.properties?.["pose_config"]) {
                    iframe.contentWindow.postMessage({
                        type: "LIKEJ_POSE3D_LOAD_CONFIG",
                        configStr: self.properties["pose_config"]
                    }, "*");
                }
                return r;
            };
        }
    }
});