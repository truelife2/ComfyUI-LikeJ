import { app } from "../../../scripts/app.js";

// DOM 元素建立與樣式設置輔助函式
function createElement(tag, style = {}, props = {}) {
    const el = document.createElement(tag);
    Object.assign(el.style, style);
    Object.assign(el, props);
    return el;
}

app.registerExtension({
    name: "LikeJ.VideoClip",
    async nodeCreated(node) {
        if (node.comfyClass !== "LikeJVideoClip") return;

        let detectedFps = 24.0;
        let isRangePlaying = false;
        let rangePlayRequested = false;

        // 1. 尋找 Widget
        const pathWidget = node.widgets?.find((w) => w.name === "video_path");
        const startWidget = node.widgets?.find((w) => w.name === "start_frame");
        const endWidget = node.widgets?.find((w) => w.name === "end_frame");

        // 2. 建立 UI 佈局
        const container = createElement("div", {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "8px",
            backgroundColor: "rgba(0,0,0,0.4)",
            borderRadius: "8px"
        });

        const videoPlayer = createElement("video", {
            width: "100%",
            maxHeight: "200px",
            borderRadius: "4px",
            display: "none"
        }, { controls: true });

        const infoLabel = createElement("div", {
            color: "#48bb78",
            fontSize: "11px",
            fontWeight: "600"
        }, { innerText: "🎬 Clip Info: Enter video path to preview" });

        // 二合一 播放 / 停止 切換按鈕
        const btnTogglePlay = createElement("button", {
            width: "100%",
            padding: "6px 8px",
            fontSize: "11px",
            fontWeight: "600",
            cursor: "pointer",
            color: "#ffffff",
            border: "none",
            borderRadius: "4px",
            backgroundColor: "#2b6cb0"
        }, { innerText: "▶ Play Selection" });

        // 時間滑桿 (Sliders)
        const sliderStart = createElement("input", { flex: "1" }, { type: "range", min: "0", max: "300", value: 0 });
        const sliderEnd = createElement("input", { flex: "1" }, { type: "range", min: "-1", max: "300", value: -1 });

        const createSliderRow = (labelText, sliderElem) => {
            const row = createElement("div", { display: "flex", alignItems: "center", gap: "6px" });
            const label = createElement("span", { fontSize: "11px", width: "35px" }, { innerText: labelText });
            row.append(label, sliderElem);
            return row;
        };

        const sliderContainer = createElement("div", { display: "flex", flexDirection: "column", gap: "4px" });
        sliderContainer.append(
            createSliderRow("Start:", sliderStart),
            createSliderRow("End:", sliderEnd)
        );

        container.append(videoPlayer, btnTogglePlay, infoLabel, sliderContainer);

        node.addDOMWidget("video_preview_ui", "UI", container, {
            getValue: () => ({}),
            setValue: () => {}
        });

        // --- 核心邏輯與輔助函式 ---

        // 取得當前選區對應的時間 (秒) 與影格數
        const getTimes = () => {
            const startFrame = parseInt(sliderStart.value) || 0;
            const endFrame = parseInt(sliderEnd.value);
            const startTime = startFrame / detectedFps;
            const endTime = (endFrame === -1 || isNaN(endFrame)) ? videoPlayer.duration : endFrame / detectedFps;
            return { startFrame, endFrame, startTime, endTime };
        };

        // 更新按鈕切換狀態 (Play vs Stop)
        const updateBtnState = () => {
            if (!videoPlayer.paused && isRangePlaying) {
                btnTogglePlay.innerText = "⏹ Stop Selection";
                btnTogglePlay.style.backgroundColor = "#c53030"; // 紅色 Stop 狀態
            } else {
                btnTogglePlay.innerText = "▶ Play Selection";
                btnTogglePlay.style.backgroundColor = "#2b6cb0"; // 藍色 Play 狀態
            }
        };

        // 更新文字資訊標籤
        const updateInfoLabel = () => {
            const { startFrame, endFrame } = getTimes();
            const totalFramesStr = (endFrame === -1) ? "End of video" : `${endFrame - startFrame} frames`;
            const durationStr = (endFrame === -1) ? "" : ` (${((endFrame - startFrame) / detectedFps).toFixed(2)}s)`;
            const endDisplay = endFrame === -1 ? 'End' : `${endFrame}f`;

            infoLabel.innerText = `🎬 Start: ${startFrame}f | End: ${endDisplay} | Total: ${totalFramesStr}${durationStr}`;
        };

        // 從 Widget 狀態同步至 DOM 滑桿
        const syncDOMFromWidgets = () => {
            if (startWidget && startWidget.value !== undefined) sliderStart.value = startWidget.value;
            if (endWidget && endWidget.value !== undefined) sliderEnd.value = endWidget.value;

            if (parseInt(sliderStart.value) > parseInt(sliderEnd.value) && parseInt(sliderEnd.value) !== -1) {
                sliderEnd.value = sliderStart.value;
            }

            updateInfoLabel();
            updateBtnState();
        };

        // 從 DOM 滑桿寫回 Widget 數值
        const syncWidgetsFromDOM = () => {
            const sVal = parseInt(sliderStart.value);
            let eVal = parseInt(sliderEnd.value);

            if (sVal > eVal && eVal !== -1) {
                sliderEnd.value = sVal;
                eVal = sVal;
            }

            if (startWidget) startWidget.value = sVal;
            if (endWidget) endWidget.value = eVal;

            updateInfoLabel();
        };

        // 載入影片檔
        const loadVideoSource = (path) => {
            if (!path) {
                videoPlayer.style.display = "none";
                infoLabel.innerText = "🎬 Clip Info: No video path provided";
                return;
            }
            const cleanPath = path.trim().replace(/^['"]|['"]$/g, '');
            if (!cleanPath) return;

            const newSrc = `/likej/view_video_clip?path=${encodeURIComponent(cleanPath)}`;
            if (videoPlayer.getAttribute("data-src") !== newSrc) {
                videoPlayer.setAttribute("data-src", newSrc);
                videoPlayer.src = newSrc;
                videoPlayer.style.display = "block";
            }
        };

        // 停止選區播放：暫停影片並重置時間回到 Start Frame 開頭
        const stopRangePlayback = () => {
            isRangePlaying = false;
            videoPlayer.pause();
            const { startTime } = getTimes();
            if (videoPlayer.duration) videoPlayer.currentTime = startTime;
            updateBtnState();
        };

        // --- 事件監聽 (Event Listeners) ---

        videoPlayer.onloadedmetadata = () => {
            const totalFrames = Math.floor(videoPlayer.duration * detectedFps) || 300;
            sliderStart.max = totalFrames;
            sliderEnd.max = totalFrames;
            syncDOMFromWidgets();
        };

        videoPlayer.addEventListener("play", () => {
            if (!rangePlayRequested) {
                isRangePlaying = false; // 原生播放被點擊 -> 退出選區控制模式
            }
            rangePlayRequested = false;
            updateBtnState();
        });

        videoPlayer.addEventListener("pause", () => {
            isRangePlaying = false;
            updateBtnState();
        });

        // 選區循環播放邏輯
        videoPlayer.ontimeupdate = () => {
            if (isRangePlaying && !videoPlayer.paused) {
                const { startTime, endTime } = getTimes();
                if (endTime > startTime && videoPlayer.currentTime >= endTime) {
                    videoPlayer.currentTime = startTime;
                    videoPlayer.play().catch(() => {});
                }
            }
        };

        // 切換按鈕 (▶ Play Selection <-> ⏹ Stop Selection)
        btnTogglePlay.addEventListener("click", () => {
            if (!videoPlayer.src) return;

            if (!videoPlayer.paused && isRangePlaying) {
                // 停止播放並重置回選區起點
                stopRangePlayback();
            } else {
                // 開始選區播放
                rangePlayRequested = true;
                isRangePlaying = true;
                const { startTime } = getTimes();
                videoPlayer.currentTime = startTime;
                videoPlayer.play().catch((err) => console.log("Playback error:", err));
            }
            updateBtnState();
        });

        // 滑桿拖動事件
        const onSliderInput = (isStartSlider) => {
            isRangePlaying = false;
            syncWidgetsFromDOM();
            updateBtnState();

            const { startTime, endTime } = getTimes();
            if (videoPlayer.duration) {
                videoPlayer.currentTime = isStartSlider ? startTime : (parseInt(sliderEnd.value) === -1 ? videoPlayer.duration : endTime);
            }
        };

        sliderStart.addEventListener("input", () => onSliderInput(true));
        sliderEnd.addEventListener("input", () => onSliderInput(false));

        // 統一綁定 ComfyUI Widget Callbacks
        [
            { widget: pathWidget, handler: (v) => loadVideoSource(v) },
            { widget: startWidget, handler: (v) => { sliderStart.value = v; syncWidgetsFromDOM(); } },
            { widget: endWidget, handler: (v) => { sliderEnd.value = v; syncWidgetsFromDOM(); } }
        ].forEach(({ widget, handler }) => {
            if (!widget) return;
            const origCb = widget.callback;
            widget.callback = function (v) {
                handler(v);
                if (origCb) origCb.apply(this, arguments);
            };
        });

        // 工作流重載/還原 (onConfigure) 鉤子
        const origOnConfigure = node.onConfigure;
        node.onConfigure = function () {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            syncDOMFromWidgets();
            if (pathWidget?.value) loadVideoSource(pathWidget.value);
        };

        // 初始同步
        syncDOMFromWidgets();
        if (pathWidget?.value) loadVideoSource(pathWidget.value);
    }
});