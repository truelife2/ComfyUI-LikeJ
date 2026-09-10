import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "LikeJ.VideoLoop",
    nodeCreated(node) {
        if (node.comfyClass === "LikeJVideoLoopSave") {
            const forceWidget = node.widgets?.find(w => w.name === "force_finish");
            if (forceWidget) {
                const origCallback = forceWidget.callback;
                forceWidget.callback = async function (value) {
                    if (origCallback) origCallback.apply(this, arguments);

                    // 1. 如果是在靜止狀態下直接勾選強制完成，手動觸發歸檔 API
                    if (value && !app.runningNodeId) {
                        try {
                            const res = await api.fetchApi("/likej/force_finish_idle", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ node_id: node.id })
                            });
                            const data = await res.json();
                            if (data.status === "success") {
                                console.log("[LikeJ Loop] 靜止狀態下已成功歸檔影片:", data.final_path);
                            }
                        } catch (err) {
                            console.error("[LikeJ Loop] 強制歸檔請求失敗:", err);
                        } finally {
                            forceWidget.value = false;
                            
                            const loadNode = app.graph.nodes.find(n => n.comfyClass === "LikeJVideoLoopLoad");
                            if (loadNode) {
                                const loopWidget = loadNode.widgets?.find(w => w.name === "looping_frame");
                                if (loopWidget) {
                                    loopWidget.value = -1;
                                    if (typeof loopWidget.callback === "function") loopWidget.callback(-1);
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
            const { load_node_id, total_frames } = event.detail;
            const loadNode = app.graph.getNodeById(load_node_id) || app.graph.getNodeById(Number(load_node_id));
            if (loadNode) {
                let widget = loadNode.widgets?.find(w => w.name === "total_frames_display");
                if (!widget) {
                    widget = loadNode.addCustomWidget({
                        name: "total_frames_display",
                        type: "text",
                        value: `總幀數: ${total_frames}`,
                        options: { serialize: false }
                    });
                } else {
                    widget.value = `總幀數: ${total_frames}`;
                }
                loadNode.setDirtyCanvas(true, true);
            }
        });

        api.addEventListener("likej_loop_next", async (event) => {
            const { load_node_id, save_node_id, next_start_frame, is_finished, auto_queue } = event.detail;

            const saveNode = app.graph.getNodeById(save_node_id) 
                          || app.graph.getNodeById(Number(save_node_id)) 
                          || app.graph.getNodeById(String(save_node_id));

            let isForceFinishActive = false;
            let isAutoQueueActive = Boolean(auto_queue);

            if (saveNode && saveNode.widgets) {
                const forceWidget = saveNode.widgets.find(w => w.name === "force_finish");
                if (forceWidget) {
                    isForceFinishActive = Boolean(forceWidget.value);
                    if (isForceFinishActive) {
                        forceWidget.value = false;
                        saveNode.setDirtyCanvas(true, true);
                    }
                }

                const autoQueueWidget = saveNode.widgets.find(w => w.name === "auto_queue");
                if (autoQueueWidget !== undefined) {
                    isAutoQueueActive = Boolean(autoQueueWidget.value);
                }
            }

            const shouldStop = is_finished || isForceFinishActive;

            // 2.【關鍵修復】如果判定要停止，但當前 Chunk Python 沒機會收尾（例如手動卡斷或特殊中斷），主動呼叫 API 強制封裝歸檔
            if (shouldStop) {
                try {
                    await api.fetchApi("/likej/force_finish_idle", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ node_id: save_node_id })
                    });
                    console.log("[LikeJ Loop] 觸發停止，已確保背景 FFmpeg 順利完成歸檔。");
                } catch (e) {
                    console.error("[LikeJ Loop] 停止時歸檔請求發生錯誤:", e);
                }
            }

            // 3. 更新 Load 節點數值（若結束則重置為 -1）
            const loadNode = app.graph.getNodeById(load_node_id) || app.graph.getNodeById(Number(load_node_id));
            if (loadNode) {
                const widget = loadNode.widgets?.find(w => w.name === "looping_frame");
                if (widget) {
                    widget.value = shouldStop ? -1 : next_start_frame;
                    if (typeof widget.callback === "function") widget.callback(widget.value);
                    loadNode.setDirtyCanvas(true, true);
                }
            }

            if (shouldStop) {
                console.log("[LikeJ Loop] 迴圈已正式停止。");
                return;
            }

            // 4. 正常推進下一輪
            if (isAutoQueueActive) {
                console.log("[LikeJ Loop] 觸發下一輪 Queue");
                await app.queuePrompt(0);
            } else {
                console.log("[LikeJ Loop] auto_queue 已關閉，暫停自動排隊");
            }
        });
    }
});