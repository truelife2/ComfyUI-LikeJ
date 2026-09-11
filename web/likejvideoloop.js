import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return "00:00.0";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

function formatFPS(fps) {
    if (!fps || isNaN(fps)) return "0";
    return Number.isInteger(fps) ? fps.toString() : fps.toFixed(2);
}

function findNodeById(id) {
    if (id === null || id === undefined) return null;
    return app.graph?.getNodeById(id)
        || app.graph?.getNodeById(Number(id))
        || app.graph?.getNodeById(String(id));
}

function ensureInfoWidget(node) {
    let widget = node.widgets?.find(w => w.name === "video_info_display");

    node.properties = node.properties || {};
    if (node.properties.video_info_text === undefined) {
        node.properties.video_info_text = "Frames: -  |  Duration: --:--  |  FPS: -";
    }

    const currentText = node.properties.video_info_text;

    if (!widget) {
        if (typeof node.addDOMWidget === "function") {
            const container = document.createElement("div");
            container.className = "comfy-video-info-widget";
            container.style.display = "flex";
            container.style.width = "100%";
            container.style.height = "22px";
            container.style.justifyContent = "center";
            container.style.fontSize = "12px";
            container.style.color = "#A0A0A0";

            const valueSpan = document.createElement("span");
            valueSpan.className = "value-text";
            valueSpan.innerText = currentText;
            container.appendChild(valueSpan);

            widget = node.addDOMWidget("video_info_display", "Video Info", container, {
                serialize: false,
                hideLabel: true,
                computeSize: () => [220, 26]
            });
            widget.valueSpan = valueSpan;
        } else {
            widget = {
                name: "video_info_display",
                type: "text",
                value: currentText,
                options: { serialize: false }
            };
            if (!node.widgets) node.widgets = [];
            node.widgets.push(widget);
        }
    } else {
        if (widget.valueSpan) {
            widget.valueSpan.innerText = currentText;
        }
        widget.value = currentText;
    }

    return widget;
}
function updateWidgetText(node, totalFrames, duration, fps) {
    const activeText = (totalFrames && duration !== undefined && fps)
        ? `Frames: ${totalFrames}  |  Duration: ${formatDuration(duration)}  |  FPS: ${formatFPS(fps)}`
        : "Frames: -  |  Duration: --:--  |  FPS: -";

    node.properties = node.properties || {};
    node.properties.video_info_text = activeText;

    const widget = ensureInfoWidget(node);
    if (widget) {
        widget.value = activeText;
        if (widget.valueSpan) {
            widget.valueSpan.innerText = activeText;
        }
        if (typeof node.setDirtyCanvas === "function") {
            node.setDirtyCanvas(true, true);
        }
    }
}

let isQueuing = false;

app.registerExtension({
    name: "LikeJ.VideoLoop",
    nodeCreated(node) {
        if (node.comfyClass === "LikeJVideoLoopLoad") {
            ensureInfoWidget(node);

            // 監聽 video_path 異動事件
            const pathWidget = node.widgets?.find(w => w.name === "video_path");
            if (pathWidget) {
                const origCallback = pathWidget.callback;
                pathWidget.callback = async function (value) {
                    if (origCallback) origCallback.apply(this, arguments);

                    // 1. 立即重置 Label 文字與 looping_frame 狀態
                    updateWidgetText(node);
                    const loopWidget = node.widgets?.find(w => w.name === "looping_frame");
                    if (loopWidget) {
                        loopWidget.value = -1;
                        node.setDirtyCanvas(true, true);
                    }

                    // 2. 若有新路徑，非同步請求後端 API 取得最新影片資訊並更新
                    if (value && typeof value === "string" && value.trim() !== "") {
                        try {
                            const res = await api.fetchApi("/likej/get_video_info", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ video_path: value })
                            });
                            const data = await res.json();
                            if (data?.status === "success") {
                                updateWidgetText(node, data.total_frames, data.duration, data.fps);
                            }
                        } catch (err) {
                            console.error("[LikeJ Loop] Failed to fetch video info:", err);
                        }
                    }
                };
            }

            node.onExecuted = function (message) {
                if (message?.video_info?.[0]) {
                    const info = message.video_info[0];
                    updateWidgetText(node, info.total_frames, info.duration, info.fps);
                }
            };
        }

        if (node.comfyClass === "LikeJVideoLoopSave") {
            const forceWidget = node.widgets?.find(w => w.name === "force_finish");
            if (forceWidget) {
                const origCallback = forceWidget.callback;
                forceWidget.callback = async function (value) {
                    if (origCallback) origCallback.apply(this, arguments);

                    if (value && !app.runningNodeId) {
                        try {
                            await api.fetchApi("/likej/force_finish_idle", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ node_id: node.id })
                            });
                        } catch (err) {
                            console.error("[LikeJ Loop] Force finish request failed:", err);
                        } finally {
                            forceWidget.value = false;
                            const loadNode = app.graph?.nodes?.find(n => n.comfyClass === "LikeJVideoLoopLoad");
                            if (loadNode?.widgets) {
                                const loopWidget = loadNode.widgets.find(w => w.name === "looping_frame");
                                if (loopWidget) {
                                    loopWidget.value = -1;
                                    loadNode.setDirtyCanvas(true, true);
                                }
                            }
                            node.setDirtyCanvas(true, true);
                        }
                    }
                };
            }
        }
    },
    async setup() {
        api.addEventListener("likej_video_info", (event) => {
            const { load_node_id, total_frames, duration, fps } = event.detail;
            const loadNode = findNodeById(load_node_id);
            if (loadNode) {
                updateWidgetText(loadNode, total_frames, duration, fps);
            }
        });

        api.addEventListener("likej_loop_next", async (event) => {
            const { load_node_id, save_node_id, next_start_frame, is_finished, auto_queue } = event.detail;

            const saveNode = findNodeById(save_node_id);
            const loadNode = findNodeById(load_node_id);

            let isForceFinishActive = false;
            let isAutoQueueActive = Boolean(auto_queue);

            if (saveNode?.widgets) {
                const forceWidget = saveNode.widgets.find(w => w.name === "force_finish");
                if (forceWidget) isForceFinishActive = Boolean(forceWidget.value);

                const autoQueueWidget = saveNode.widgets.find(w => w.name === "auto_queue");
                if (autoQueueWidget !== undefined) isAutoQueueActive = Boolean(autoQueueWidget.value);
            }

            const shouldStop = is_finished || isForceFinishActive;

            if (shouldStop) {
                if (isForceFinishActive && !is_finished && saveNode) {
                    try {
                        await api.fetchApi("/likej/force_finish_idle", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ node_id: saveNode.id })
                        });
                    } catch (err) {
                        console.error("[LikeJ Loop] Force finish API call failed:", err);
                    }
                }

                if (saveNode?.widgets) {
                    const forceWidget = saveNode.widgets.find(w => w.name === "force_finish");
                    if (forceWidget) {
                        forceWidget.value = false;
                        saveNode.setDirtyCanvas(true, true);
                    }
                }

                if (loadNode?.widgets) {
                    const loopWidget = loadNode.widgets.find(w => w.name === "looping_frame");
                    if (loopWidget) {
                        loopWidget.value = -1;
                        loadNode.setDirtyCanvas(true, true);
                    }
                }

                isQueuing = false;
                return;
            }

            if (loadNode?.widgets) {
                const loopWidget = loadNode.widgets.find(w => w.name === "looping_frame");
                if (loopWidget) {
                    loopWidget.value = next_start_frame;
                    loadNode.setDirtyCanvas(true, true);
                }
            }

            if (isAutoQueueActive && !isQueuing) {
                isQueuing = true;
                try {
                    await app.queuePrompt(0);
                } finally {
                    setTimeout(() => { isQueuing = false; }, 300);
                }
            }
        });
    }
});