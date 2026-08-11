import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

const nodeCache = new WeakMap();
const PREVIEW_PREFIX = "🔣";

function setNodeCache(node, slotIdx, val) {
    if (!node) return;
    if (!nodeCache.has(node)) {
        nodeCache.set(node, new Map());
    }
    nodeCache.get(node).set(slotIdx, val);
}

function getNodeCache(node, slotIdx) {
    if (!node || !nodeCache.has(node)) return null;
    const slotMap = nodeCache.get(node);
    return slotMap.has(slotIdx) ? slotMap.get(slotIdx) : null;
}

app.registerExtension({
    name: "LikeJ.Previewer",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LikeJPreviewer") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                const self = this;
                this.preview_val = "";

                // 初始化 properties
                this.properties = this.properties || {};
                if (!this.properties.custom_title) {
                    this.properties.custom_title = this.title || "LikeJ Previewer";
                }

                // 建立文字 Display Widget
                const widgetResult = ComfyWidgets["STRING"](
                    this,
                    "preview_display",
                    ["STRING", { multiline: true }],
                    app
                );
                const widget = widgetResult.widget;
                if (widget) {
                    if (widget.inputEl) widget.inputEl.readOnly = true;
                    // 不把預覽內容寫入存檔 JSON
                    widget.serializeValue = async () => undefined;
                }

                // 同步 DOM Header 顯示
                this.updateHeaderDisplay = function () {
                    if (!self.properties) self.properties = {};

                    if (self.title && !self.title.startsWith(PREVIEW_PREFIX)) {
                        self.properties.custom_title = self.title;
                    }

                    if (self.flags?.collapsed) {
                        if (self.preview_val) {
                            const singleLine = String(self.preview_val).replace(/[\r\n]+/g, " ").trim();
                            self.title = `${PREVIEW_PREFIX} ${singleLine}`;
                        } else {
                            self.title = `${PREVIEW_PREFIX} (None)`;
                        }
                    } else {
                        self.title = self.properties.custom_title || "LikeJ Previewer";
                    }
                    self.setDirtyCanvas(true, true);
                };

                // 存檔時寫入真實名稱
                const origOnSerialize = this.onSerialize;
                this.onSerialize = function (info) {
                    if (origOnSerialize) origOnSerialize.apply(this, arguments);

                    const realTitle = self.properties?.custom_title || "LikeJ Previewer";
                    info.title = realTitle;
                    if (!info.properties) info.properties = {};
                    info.properties.custom_title = realTitle;
                };

                // 讀檔時還原真實名稱
                const origOnConfigure = this.onConfigure;
                this.onConfigure = function (info) {
                    if (origOnConfigure) origOnConfigure.apply(this, arguments);

                    if (!self.properties) self.properties = {};

                    if (info?.properties?.custom_title && !info.properties.custom_title.startsWith(PREVIEW_PREFIX)) {
                        self.properties.custom_title = info.properties.custom_title;
                    } else if (info?.title && !info.title.startsWith(PREVIEW_PREFIX)) {
                        self.properties.custom_title = info.title;
                    } else if (!self.properties.custom_title) {
                        self.properties.custom_title = "LikeJ Previewer";
                    }

                    // 重整讀檔時保持空白
                    self.preview_val = "";
                    if (widget) widget.value = "";
                    self.updateHeaderDisplay();
                };

                // 時機 1：手動接線或拉線時觸發
                const origOnConnectionsChange = this.onConnectionsChange;
                this.onConnectionsChange = function (type, slot, connected, link_info) {
                    if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);

                    if (type === 1 && connected && link_info) {
                        const originNode = app.graph.getNodeById(link_info.origin_id);
                        if (originNode) {
                            const originSlotIdx = link_info.origin_slot;
                            const outputSlot = originNode.outputs?.[originSlotIdx];
                            const slotName = outputSlot?.name || `Slot_${originSlotIdx}`;
                            const slotType = outputSlot?.type || "*";

                            let foundValue = getNodeCache(originNode, originSlotIdx);

                            // 如果是 PrimitiveNode，手動接線當下立刻抓 Widget 值
                            if (foundValue === null && (originNode.type === "PrimitiveNode" || originNode.comfyClass === "PrimitiveNode")) {
                                if (originNode.widgets?.[0]?.value !== undefined) {
                                    foundValue = String(originNode.widgets[0].value);
                                }
                            }

                            if (foundValue === null) {
                                foundValue = `[${slotName} (${slotType})] (None)`;
                            }

                            self.preview_val = foundValue;
                            if (widget) widget.value = foundValue;
                            self.updateHeaderDisplay();
                        }
                    } else if (type === 1 && !connected) {
                        self.preview_val = "";
                        if (widget) widget.value = "";
                        self.updateHeaderDisplay();
                    }
                };

                // 攔截收合點擊
                const origCollapse = this.collapse;
                this.collapse = function () {
                    if (origCollapse) origCollapse.apply(this, arguments);
                    self.updateHeaderDisplay();
                };

                const origOnCollapse = this.onCollapse;
                this.onCollapse = function (collapsed) {
                    if (origOnCollapse) origOnCollapse.apply(this, arguments);
                    self.updateHeaderDisplay();
                };

                // 時機 2：Python 執行完成時，寫入快取並更新畫面
                const origOnExecuted = this.onExecuted;
                this.onExecuted = function (message) {
                    if (origOnExecuted) origOnExecuted.apply(this, arguments);

                    if (message?.text?.[0] !== undefined) {
                        const val = message.text[0];
                        self.preview_val = val;
                        if (widget) widget.value = val;

                        const inputLink = self.inputs?.[0]?.link;
                        if (inputLink && app.graph.links[inputLink]) {
                            const link = app.graph.links[inputLink];
                            const originNode = app.graph.getNodeById(link.origin_id);

                            if (originNode) {
                                setNodeCache(originNode, link.origin_slot, val);
                            }
                        }

                        self.updateHeaderDisplay();
                    }
                };
            };
        }
    }
});