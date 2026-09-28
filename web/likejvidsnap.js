import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function cleanPath(p) {
    if (!p) return "";
    return p.trim().replace(/^["']+|["']+/g, '').trim();
}

app.registerExtension({
    name: "LikeJ.VideoSnapshot",
    async nodeCreated(node) {
        if (node.comfyClass !== "LikeJVideoSnapshot") return;

        // 1. Create custom UI container
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.gap = "6px";
        container.style.padding = "6px";
        container.style.backgroundColor = "#121212";
        container.style.borderRadius = "6px";
        container.style.marginTop = "4px";
        container.style.boxSizing = "border-box";
        container.style.width = "100%";
        container.style.minHeight = "200px";

        // 2. Create HTML5 Video player (Remove fixed maxHeight and set object-fit)
        const videoEl = document.createElement("video");
        videoEl.controls = true;
        videoEl.style.width = "100%";
        videoEl.style.height = "100%";
        videoEl.style.flex = "1";
        videoEl.style.objectFit = "contain"; // 自動依照比例縮放且不變形
        videoEl.style.borderRadius = "4px";
        videoEl.style.backgroundColor = "#000";

        // 3. Info text label
        const infoText = document.createElement("div");
        infoText.style.fontSize = "11px";
        infoText.style.color = "#aaa";
        infoText.style.fontFamily = "monospace";
        infoText.innerText = "Current Frame: 0 | Time: 0.00s";

        container.appendChild(videoEl);
        container.appendChild(infoText);

        // Append custom DOM widget
        node.addDOMWidget("video_preview", "custom_preview", container, {
            serialize: false,
        });

        // 4. Create horizontal separator line widget
        const separatorWidget = {
            name: "separator",
            type: "custom_separator",
            draw(ctx, node, width, y, height) {
                ctx.save();
                ctx.strokeStyle = "#3a3a3a";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(15, y + height / 2);
                ctx.lineTo(width - 15, y + height / 2);
                ctx.stroke();
                ctx.restore();
            },
            computeSize() {
                return [0, 14];
            }
        };

        const selectIdx = node.widgets.findIndex((w) => w.name === "select_from_input");
        if (selectIdx !== -1) {
            node.widgets.splice(selectIdx, 0, separatorWidget);
        }

        node.setSize([360, 440]);

        // 監聽節點拉大/拉小的動作，動態計算並調整播放器高度
        const origOnResize = node.onResize;
        node.onResize = function (size) {
            if (origOnResize) origOnResize.apply(this, arguments);
            if (container) {
                const nodeHeight = size[1];
                // 扣除上方輸入框等控件高度，讓容器填滿剩餘空間
                const targetHeight = Math.max(180, nodeHeight - 210);
                container.style.height = `${targetHeight}px`;
            }
        };

        const pathWidget = node.widgets.find((w) => w.name === "video_path");
        const selectWidget = node.widgets.find((w) => w.name === "select_from_input");
        const frameWidget = node.widgets.find((w) => w.name === "frame_number");

        let currentFps = 30;

        async function updateVideoSource() {
            let videoPath = "";
            if (pathWidget && pathWidget.value) {
                videoPath = cleanPath(pathWidget.value);
            } else if (selectWidget && selectWidget.value) {
                videoPath = cleanPath(selectWidget.value);
            }

            if (!videoPath) {
                videoEl.removeAttribute("src");
                videoEl.load();
                infoText.innerText = "Current Frame: 0 | Time: 0.00s";
                return;
            }

            try {
                const res = await api.fetchApi(`/likej/video_info?path=${encodeURIComponent(videoPath)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.fps) {
                        currentFps = data.fps;
                    }
                    if (frameWidget && data.total_frames) {
                        frameWidget.options.max = data.total_frames - 1;
                    }
                }
            } catch (e) {
                console.warn("[LikeJVideoSnapshot] Failed to fetch video info, falling back to 30 FPS.", e);
            }

            const videoUrl = `/likej/view_video?path=${encodeURIComponent(videoPath)}`;
            videoEl.src = videoUrl;
        }

        if (pathWidget) {
            const origCallback = pathWidget.callback;
            pathWidget.callback = function () {
                if (origCallback) origCallback.apply(this, arguments);
                updateVideoSource();
            };
        }

        if (selectWidget) {
            const origCallback = selectWidget.callback;
            selectWidget.callback = function (val) {
                if (origCallback) origCallback.apply(this, arguments);
                if (val && pathWidget && !pathWidget.value) {
                    pathWidget.value = val;
                }
                updateVideoSource();
            };
        }

        videoEl.addEventListener("loadedmetadata", () => {
            if (frameWidget) {
                videoEl.currentTime = frameWidget.value / currentFps;
            }
        });

        videoEl.addEventListener("timeupdate", () => {
            if (!videoEl.paused && !videoEl.seeking) return;
            
            const calculatedFrame = Math.round(videoEl.currentTime * currentFps);
            if (frameWidget && frameWidget.value !== calculatedFrame) {
                frameWidget.value = calculatedFrame;
                if (frameWidget.callback) {
                    frameWidget.callback(calculatedFrame);
                }
            }
            infoText.innerText = `Current Frame: ${calculatedFrame} | Time: ${videoEl.currentTime.toFixed(2)}s (${currentFps.toFixed(1)} FPS)`;
        });

        if (frameWidget) {
            const origFrameCallback = frameWidget.callback;
            frameWidget.callback = function (val) {
                if (origFrameCallback) origFrameCallback.apply(this, arguments);
                if (videoEl.duration) {
                    videoEl.currentTime = val / currentFps;
                }
            };
        }

        updateVideoSource();

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (info) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            updateVideoSource();
        };
    },
});