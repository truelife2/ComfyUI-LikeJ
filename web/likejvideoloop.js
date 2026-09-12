import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Global variable to track which Graph (Tab) the Loop is running in
let runningGraphInstance = null;
let isQueuing = false;

// Record current Graph instance when execution starts
api.addEventListener("execution_start", () => {
    runningGraphInstance = app.graph;
});

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

function addDividerWidget(node, targetWidgetName) {
    const targetWidget = node.widgets?.find(w => w.name === targetWidgetName);
    if (!targetWidget) return;

    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.width = "100%";
    container.style.margin = "10px 0 6px 0";

    container.innerHTML = `
        <div style="flex-grow: 1; height: 1px; background-color: rgba(255, 255, 255, 0.15);"></div>
        <span style="padding: 0 8px; font-size: 10px; color: #888; letter-spacing: 0.5px;">LOOP CONTROL</span>
        <div style="flex-grow: 1; height: 1px; background-color: rgba(255, 255, 255, 0.15);"></div>
    `;

    const dividerWidget = node.addDOMWidget("divider_line", "divider_line", container, {
        serialize: false,
        hideLabel: true,
    });

    const targetIdx = node.widgets.indexOf(targetWidget);
    const dividerIdx = node.widgets.indexOf(dividerWidget);
    if (targetIdx !== -1 && dividerIdx !== -1) {
        node.widgets.splice(targetIdx, 0, node.widgets.splice(dividerIdx, 1)[0]);
    }
}

// ---------------------------------------------------------------------
// Bind MutationObserver to specific nodes to prevent Vue style override
// ---------------------------------------------------------------------
function setupAutoFlexFix(node) {
    requestAnimationFrame(() => {
        const widgetsEl = document.querySelector(`[data-widgets-grid-node-id="${node.id}"]`);
        if (!widgetsEl || widgetsEl.dataset.autoFixBound) return;

        widgetsEl.dataset.autoFixBound = "true";
        widgetsEl.style.setProperty("flex", "none", "important");

        const observer = new MutationObserver(() => {
            if (widgetsEl.style.flex !== "none") {
                widgetsEl.style.setProperty("flex", "none", "important");
            }
        });

        observer.observe(widgetsEl, {
            attributes: true,
            attributeFilter: ["style"]
        });
    });
}

// ---------------------------------------------------------------------
// Generic DOM Widget Creation and Update Logic (Fixed Height)
// ---------------------------------------------------------------------
function ensureDisplayWidget(node, widgetName, propName, defaultText) {
    let widget = node.widgets?.find(w => w.name === widgetName);

    node.properties = node.properties || {};
    if (node.properties[propName] === undefined) {
        node.properties[propName] = defaultText;
    }

    const currentText = node.properties[propName];

    if (!widget) {
        const container = document.createElement("div");
        container.className = `comfy-${widgetName}-widget`;
        container.style.display = "flex";
        container.style.width = "100%";
        container.style.height = "22px";
        container.style.boxSizing = "border-box";
        container.style.overflow = "hidden";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.fontSize = "12px";
        container.style.color = "#A0A0A0";

        const valueSpan = document.createElement("span");
        valueSpan.className = "value-text";
        valueSpan.innerText = currentText;
        valueSpan.style.whiteSpace = "nowrap";
        valueSpan.style.overflow = "hidden";
        valueSpan.style.textOverflow = "ellipsis";
        container.appendChild(valueSpan);

        widget = node.addDOMWidget(widgetName, widgetName, container, {
            serialize: false,
            hideLabel: true,
        });
        widget.valueSpan = valueSpan;
    } else {
        if (widget.valueSpan) {
            widget.valueSpan.innerText = currentText;
        }
        widget.value = currentText;
    }

    return widget;
}

function updateDisplayWidget(node, widgetName, propName, text) {
    node.properties = node.properties || {};
    node.properties[propName] = text;

    const widget = ensureDisplayWidget(node, widgetName, propName, text);
    if (widget) {
        widget.value = text;
        if (widget.valueSpan) {
            widget.valueSpan.innerText = text;
        }
        if (typeof node.setDirtyCanvas === "function") {
            node.setDirtyCanvas(true, true);
        }
    }
}

// ---------------------------------------------------------------------
// Load / Save Label Update Wrappers
// ---------------------------------------------------------------------
const LOAD_WIDGET_NAME = "video_info_display";
const LOAD_PROP_NAME = "video_info_text";
const LOAD_DEFAULT_TEXT = "Frames: -  |  Duration: --:--  |  FPS: -";

function updateLoadWidget(node, totalFrames, duration, fps) {
    const text = (totalFrames && duration !== undefined && fps)
        ? `Frames: ${totalFrames}  |  Duration: ${formatDuration(duration)}  |  FPS: ${formatFPS(fps)}`
        : LOAD_DEFAULT_TEXT;
    updateDisplayWidget(node, LOAD_WIDGET_NAME, LOAD_PROP_NAME, text);
}

const SAVE_WIDGET_NAME = "save_info_display";
const SAVE_PROP_NAME = "save_info_text";
const SAVE_DEFAULT_TEXT = "Processed: - / -  |  FPS: -";

function updateSaveWidget(node, processedFrames, totalFrames, fps) {
    const text = (processedFrames !== undefined && fps)
        ? `Processed: ${processedFrames}${totalFrames ? ' / ' + totalFrames : ''}  |  FPS: ${formatFPS(fps)}`
        : SAVE_DEFAULT_TEXT;
    updateDisplayWidget(node, SAVE_WIDGET_NAME, SAVE_PROP_NAME, text);
}

// ---------------------------------------------------------------------
// Main Extension
// ---------------------------------------------------------------------
app.registerExtension({
    name: "LikeJ.VideoLoop",
    nodeCreated(node) {
        // --- 1. Load Node Initialization ---
        if (node.comfyClass === "LikeJVideoLoopLoad") {
            ensureDisplayWidget(node, LOAD_WIDGET_NAME, LOAD_PROP_NAME, LOAD_DEFAULT_TEXT);
            setupAutoFlexFix(node);

            const pathWidget = node.widgets?.find(w => w.name === "video_path");

            // === Video Upload Button Widget ===
            const uploadBtn = node.addWidget("button", "Upload Video", "upload", () => {
                const fileInput = document.createElement("input");
                fileInput.type = "file";
                fileInput.accept = "video/*,.mp4,.mov,.avi,.mkv,.webm";
                fileInput.style.display = "none";

                fileInput.onchange = async (e) => {
                    if (!e.target.files || e.target.files.length === 0) return;
                    const file = e.target.files[0];

                    const formData = new FormData();
                    formData.append("image", file);
                    formData.append("overwrite", "true");
                    formData.append("type", "input");

                    try {
                        const response = await api.fetchApi("/upload/image", {
                            method: "POST",
                            body: formData,
                        });

                        if (response.status === 200) {
                            const data = await response.json();
                            const uploadedPath = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;

                            if (pathWidget) {
                                pathWidget.value = uploadedPath;
                                if (pathWidget.callback) {
                                    pathWidget.callback(uploadedPath);
                                }
                            }
                        } else {
                            alert("Video upload failed: " + response.statusText);
                        }
                    } catch (err) {
                        console.error("[LikeJ Loop] Video upload error:", err);
                        alert("Video upload failed!");
                    } finally {
                        fileInput.remove();
                    }
                };

                document.body.appendChild(fileInput);
                fileInput.click();
            });

            if (pathWidget && uploadBtn) {
                const pathIdx = node.widgets.indexOf(pathWidget);
                const btnIdx = node.widgets.indexOf(uploadBtn);
                if (pathIdx !== -1 && btnIdx !== -1) {
                    node.widgets.splice(pathIdx + 1, 0, node.widgets.splice(btnIdx, 1)[0]);
                }
            }

            if (pathWidget) {
                const origCallback = pathWidget.callback;
                pathWidget.callback = async function (value) {
                    if (origCallback) origCallback.apply(this, arguments);

                    updateLoadWidget(node);
                    const loopWidget = node.widgets?.find(w => w.name === "looping_frame");
                    if (loopWidget) {
                        loopWidget.value = -1;
                        node.setDirtyCanvas(true, true);
                    }

                    if (value && typeof value === "string" && value.trim() !== "") {
                        try {
                            const res = await api.fetchApi("/likej/get_video_info", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ video_path: value })
                            });
                            const data = await res.json();
                            if (data?.status === "success") {
                                updateLoadWidget(node, data.total_frames, data.duration, data.fps);
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
                    updateLoadWidget(node, info.total_frames, info.duration, info.fps);
                }
            };
        }

        // --- 2. Save Node Initialization ---
        if (node.comfyClass === "LikeJVideoLoopSave") {
            ensureDisplayWidget(node, SAVE_WIDGET_NAME, SAVE_PROP_NAME, SAVE_DEFAULT_TEXT);
            setupAutoFlexFix(node);

            addDividerWidget(node, "auto_queue");

            node.onExecuted = function (message) {
                if (message?.save_info?.[0]) {
                    const info = message.save_info[0];
                    updateSaveWidget(node, info.processed_frames, info.total_frames, info.fps);
                }
            };

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
                updateLoadWidget(loadNode, total_frames, duration, fps);
            }
        });

        api.addEventListener("likej_save_info", (event) => {
            const { save_node_id, processed_frames, total_frames, fps } = event.detail;
            const saveNode = findNodeById(save_node_id);
            if (saveNode) {
                updateSaveWidget(saveNode, processed_frames, total_frames, fps);
            }
        });

        api.addEventListener("likej_loop_next", async (event) => {
            const { load_node_id, save_node_id, next_start_frame, is_finished, auto_queue } = event.detail;

            // [Guard 1]: Check if user switched workflow tabs
            if (runningGraphInstance && app.graph !== runningGraphInstance) {
                console.warn("[LikeJ Loop] Detected workflow tab switch. Auto-Queue has been stopped.");
                isQueuing = false;
                runningGraphInstance = null;
                return;
            }

            const saveNode = findNodeById(save_node_id);
            const loadNode = findNodeById(load_node_id);

            // [Guard 2]: Load node not found, stop Auto-Queue
            if (!loadNode) {
                console.warn(`[LikeJ Loop] Corresponding Load node (${load_node_id}) not found. Auto-Queue stopped.`);
                isQueuing = false;
                runningGraphInstance = null;
                return;
            }

            const loopWidget = loadNode.widgets?.find(w => w.name === "looping_frame");

            // [Guard 3]: looping_frame widget missing, stop Auto-Queue
            if (!loopWidget) {
                console.warn(`[LikeJ Loop] Load node is missing 'looping_frame' widget, cannot update progress. Auto-Queue stopped.`);
                isQueuing = false;
                runningGraphInstance = null;
                return;
            }

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

                // Reset status
                loopWidget.value = -1;
                loadNode.setDirtyCanvas(true, true);

                isQueuing = false;
                runningGraphInstance = null;
                return;
            }

            // Set next start frame
            loopWidget.value = next_start_frame;
            loadNode.setDirtyCanvas(true, true);

            // Trigger Queue if valid and auto_queue enabled
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