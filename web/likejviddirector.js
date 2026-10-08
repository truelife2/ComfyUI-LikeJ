import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ==========================================
// 1. API 服務封裝
// ==========================================
const ApiService = {
    async uploadFile(file, type = "image") {
        if (!file) return null;
        const formData = new FormData();
        formData.append("image", file);
        formData.append("overwrite", "true");
        formData.append("type", "input");
        try {
            const resp = await api.fetchApi("/upload/image", { method: "POST", body: formData });
            if (resp.ok) {
                const data = await resp.json();
                return { name: data.name, subfolder: data.subfolder || "", type: data.type || "input" };
            }
        } catch (e) {
            console.error("[LikeJVideoDirector] 上傳失敗:", e);
        }
        return null;
    },

    async extractFrame(videoObj, position = "last") {
        if (!videoObj) return null;
        const filename = typeof videoObj === "string" ? videoObj : (videoObj.filename || videoObj.name || "");
        const subfolder = typeof videoObj === "string" ? "" : (videoObj.subfolder || "");
        const type = typeof videoObj === "string" ? "output" : (videoObj.type || "output");

        try {
            const resp = await api.fetchApi("/likej/extract_frame", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename, subfolder, type, position })
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data.success) {
                    return data.image;
                } else {
                    alert(`⚠️ 抽幀失敗: ${data.error}`);
                }
            }
        } catch (e) {
            console.error("[LikeJVideoDirector] 呼叫抽幀 API 失敗:", e);
        }
        return null;
    },

    async getVideos(type = "output") {
        try {
            const resp = await api.fetchApi(`/likej/list_videos?type=${type}`);
            if (resp.ok) return await resp.json();
        } catch (e) {
            console.error("[LikeJVideoDirector] 獲取影片列表失敗:", e);
        }
        return [];
    },

    getMediaUrl(fileObj) {
        if (!fileObj) return "";
        const filename = typeof fileObj === "string" ? fileObj : (fileObj.filename || fileObj.name || "");
        const subfolder = typeof fileObj === "string" ? "" : (fileObj.subfolder || "");
        const type = typeof fileObj === "string" ? "input" : (fileObj.type || "input");
        return api.apiURL(`/view?${new URLSearchParams({ filename, subfolder, type })}`);
    },

    async listProjects() {
        try {
            const resp = await api.fetchApi("/likej/list_projects");
            if (resp.ok) return await resp.json();
        } catch (e) {
            console.error("[LikeJVideoDirector] 獲取專案列表失敗:", e);
        }
        return [];
    },

    async exportProject(projectName, scenesData) {
        try {
            const resp = await api.fetchApi("/likej/export_project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_name: projectName, scenes_data: scenesData })
            });
            if (resp.ok) return await resp.json();
        } catch (e) {
            console.error("[LikeJVideoDirector] 匯出專案失敗:", e);
        }
        return { success: false, error: "網路或伺服器錯誤" };
    },

    async loadProject(projectName) {
        try {
            const resp = await api.fetchApi(`/likej/load_project?project_name=${encodeURIComponent(projectName)}`);
            if (resp.ok) return await resp.json();
        } catch (e) {
            console.error("[LikeJVideoDirector] 載入專案失敗:", e);
        }
        return null;
    },

    async exportVideos(exportDirName, scenes) {
        try {
            const resp = await api.fetchApi("/likej/export_videos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ export_dir_name: exportDirName, scenes })
            });
            if (resp.ok) return await resp.json();
        } catch (e) {
            console.error("[LikeJVideoDirector] 匯出影片失敗:", e);
        }
        return { success: false, error: "網路或伺服器錯誤" };
    },
};

// ==========================================
// 2. 通用工具函式與 Modal 彈窗元件
// ==========================================
const moveItem = (arr, idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return false;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    return true;
};

const validateValue = (val, type) => {
    if (val === "" || val === null || val === undefined) return { valid: true, error: "" };
    const t = String(type).toUpperCase();

    if (t === "INT") {
        if (isNaN(Number(val)) || !Number.isInteger(Number(val))) {
            return { valid: false, error: "輸入值必須為整數 (INT)" };
        }
    } else if (t === "FLOAT" || t === "NUMBER") {
        if (isNaN(Number(val))) {
            return { valid: false, error: "輸入值必須為有效的數字" };
        }
    } else if (t === "BOOLEAN") {
        const str = String(val).trim().toLowerCase();
        if (!["true", "false", "1", "0", "t", "f", "yes", "no"].includes(str)) {
            return { valid: false, error: "必須為 true 或 false" };
        }
    } else if (t === "ANY" || t === "JSON") {
        if (typeof val === "string" && (val.trim().startsWith("{") || val.trim().startsWith("["))) {
            try {
                JSON.parse(val);
            } catch (e) {
                return { valid: false, error: "語法不符合合法 JSON 格式" };
            }
        }
    }
    return { valid: true, error: "" };
};

const createModal = ({ title, width = "600px", bodyHtml, footerHtml, onClose }) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(3px);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000; font-family: sans-serif; color: #ddd; font-size: 12px;
    `;

    const stopEvents = e => e.stopPropagation();
    ["mousedown", "pointerdown", "wheel", "keydown"].forEach(evt => overlay.addEventListener(evt, stopEvents));

    const dialog = document.createElement("div");
    dialog.style.cssText = `
        background: #222; border: 1px solid #444; border-radius: 8px;
        width: ${width}; max-width: 90vw; max-height: 88vh; display: flex; flex-direction: column;
        box-shadow: 0 10px 25px rgba(0,0,0,0.8); overflow: hidden;
    `;

    dialog.innerHTML = `
        <div style="padding: 12px 16px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; flex-shrink: 0;">
            <span style="font-size: 14px; font-weight: bold; color: #4db8ff;">${title}</span>
            <button id="modal_close_x" style="background: none; border: none; color: #aaa; font-size: 18px; cursor: pointer;">✖</button>
        </div>
        <div id="modal_body_content" style="padding: 14px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin;">
            ${bodyHtml}
        </div>
        ${footerHtml ? `<div style="padding: 12px 16px; border-top: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; flex-shrink: 0;">${footerHtml}</div>` : ""}
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const closeModal = () => {
        if (onClose) onClose();
        if (overlay.parentNode) document.body.removeChild(overlay);
    };

    dialog.querySelector("#modal_close_x").onclick = closeModal;

    return { overlay, dialog, closeModal };
};

// 🗑️ 通用高質感確認彈窗
const showConfirmModal = ({ title = "⚠️ 操作確認", message, confirmText = "確定刪除", cancelText = "取消", onConfirm }) => {
    const bodyHtml = `
        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0;">
            <div style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">⚠️️</div>
            <div style="font-size: 13px; color: #eee; line-height: 1.5; flex: 1;">${message}</div>
        </div>
    `;
    const footerHtml = `
        <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
            <button id="modal_cancel_btn" style="background: #444; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer;">${cancelText}</button>
            <button id="modal_confirm_btn" style="background: #d9534f; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold;">${confirmText}</button>
        </div>
    `;
    const { dialog, closeModal } = createModal({ title, width: "400px", bodyHtml, footerHtml });

    dialog.querySelector("#modal_cancel_btn").onclick = closeModal;
    dialog.querySelector("#modal_confirm_btn").onclick = () => {
        closeModal();
        if (onConfirm) onConfirm();
    };
};

// 🎬 獨立影片放大預覽彈窗
const openVideoPreviewModal = (videoObj) => {
    if (!videoObj) return;
    const videoUrl = ApiService.getMediaUrl(videoObj);
    const fname = typeof videoObj === "string" ? videoObj : (videoObj.filename || videoObj.name || "video");
    const type = typeof videoObj === "object" ? (videoObj.type || "output") : "output";

    const { dialog, closeModal } = createModal({
        title: `🎬 分鏡影片預覽與詳細資訊`,
        width: "720px",
        bodyHtml: `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: center; align-items: center; background: #000; border-radius: 6px; overflow: hidden; min-height: 250px; padding: 10px;">
                    <video id="preview_video_el" src="${videoUrl}" controls autoplay loop style="max-width: 100%; max-height: 55vh; display: block;"></video>
                </div>
                <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 10px; font-size: 11px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; color: #ccc;">
                    <div><strong style="color: #4db8ff;">📄 檔案名稱：</strong><span style="word-break: break-all;">${fname}</span></div>
                    <div><strong style="color: #4db8ff;">📐 影片解析度：</strong><span id="video_dimensions_info">載入中...</span></div>
                    <div><strong style="color: #4db8ff;">⏱️ 影片總長度：</strong><span id="video_duration_info">載入中...</span></div>
                    <div><strong style="color: #4db8ff;">🏷️ 資源類別：</strong><span>${type}</span></div>
                </div>
            </div>
        `,
        footerHtml: `
            <div style="display: flex; justify-content: flex-end; width: 100%;">
                <button id="btn_close_player" style="background: #444; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer;">關閉</button>
            </div>
        `
    });

    const vidEl = dialog.querySelector("#preview_video_el");
    const dimInfo = dialog.querySelector("#video_dimensions_info");
    const durInfo = dialog.querySelector("#video_duration_info");

    if (vidEl) {
        vidEl.onloadedmetadata = () => {
            if (dimInfo) dimInfo.innerText = `${vidEl.videoWidth} × ${vidEl.videoHeight} px`;
            if (durInfo) durInfo.innerText = `${vidEl.duration.toFixed(2)} 秒`;
        };
        vidEl.onerror = () => {
            if (dimInfo) dimInfo.innerText = "無法讀取";
            if (durInfo) durInfo.innerText = "無法讀取";
        };
    }

    const btnClose = dialog.querySelector("#btn_close_player");
    if (btnClose) btnClose.onclick = closeModal;
};

// 🖼️ 獨立圖片放大預覽彈窗
const openImagePreviewModal = (imgObj) => {
    if (!imgObj) return;
    const imgUrl = ApiService.getMediaUrl(imgObj);
    const fname = typeof imgObj === "string" ? imgObj : (imgObj.filename || imgObj.name || "image");
    const type = typeof imgObj === "object" ? (imgObj.type || "input") : "input";

    const { dialog, closeModal } = createModal({
        title: `🖼️ 參考圖片預覽與詳細資訊`,
        width: "720px",
        bodyHtml: `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: center; align-items: center; background: #000; border-radius: 6px; overflow: hidden; min-height: 250px; padding: 10px;">
                    <img id="preview_img_el" src="${imgUrl}" style="max-width: 100%; max-height: 55vh; object-fit: contain; display: block;" />
                </div>
                <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 10px; font-size: 11px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; color: #ccc;">
                    <div style="grid-column: span 2;"><strong style="color: #4db8ff;">📄 檔案名稱：</strong><span style="word-break: break-all;">${fname}</span></div>
                    <div><strong style="color: #4db8ff;">📐 圖片解析度：</strong><span id="img_dimensions_info">載入中...</span></div>
                    <div><strong style="color: #4db8ff;">🏷️ 資源類別：</strong><span>${type}</span></div>
                </div>
            </div>
        `,
        footerHtml: `
            <div style="display: flex; justify-content: flex-end; width: 100%;">
                <button id="btn_close_img_player" style="background: #444; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer;">關閉</button>
            </div>
        `
    });

    const imgEl = dialog.querySelector("#preview_img_el");
    const dimInfo = dialog.querySelector("#img_dimensions_info");

    if (imgEl && dimInfo) {
        if (imgEl.complete && imgEl.naturalWidth) {
            dimInfo.innerText = `${imgEl.naturalWidth} × ${imgEl.naturalHeight} px`;
        } else {
            imgEl.onload = () => {
                dimInfo.innerText = `${imgEl.naturalWidth} × ${imgEl.naturalHeight} px`;
            };
            imgEl.onerror = () => {
                dimInfo.innerText = "無法讀取";
            };
        }
    }

    const btnClose = dialog.querySelector("#btn_close_img_player");
    if (btnClose) btnClose.onclick = closeModal;
};

// ==========================================
// 3. ComfyUI 擴充節點註冊
// ==========================================
app.registerExtension({
    name: "LikeJ.VideoDirector",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "LikeJVideoDirector") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            const node = this;
            node.extra_info = node.extra_info || {};
            node.properties = node.properties || {};

            const container = document.createElement("div");
            container.style.cssText = `
                display: flex; flex-direction: column; gap: 8px;
                background: #1e1e1e; padding: 10px; border-radius: 8px;
                border: 1px solid #333; color: #ddd; font-family: sans-serif;
                box-sizing: border-box; width: 100%; font-size: 11px;
            `;

            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button id="btn_open_modal" style="padding: 4px 8px; background: #2d5a88; color: #fff; border: 1px solid #4a82b8; border-radius: 4px; cursor: pointer; font-weight: bold;">⚙️ 設定全域 Dict</button>
                        <button id="btn_play_mode" style="padding: 4px 8px; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">▶️ 播放模式</button>
                        <button id="btn_export_proj" style="padding: 4px 6px; background: #d97706; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">📦 匯出專案</button>
                        <button id="btn_import_proj" style="padding: 4px 6px; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">📂 匯入專案</button> 
                        <button id="btn_export_vids" style="padding: 4px 6px; background: #059669; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">🎬 匯出影片</button>
                    </div>
                    <div id="info_bar" style="color: #aaa;">Clips: 0 | Total: 0s</div>
                </div>

                <div id="strip_container" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin;"></div>
                
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button id="btn_manage_videos" style="flex:1; padding:4px; background: #2d5a88; color: #fff; border:none; border-radius:4px; cursor:pointer;">🎬 設定分鏡影片</button>
                    <button id="btn_add_clip" style="flex:1; padding:4px; background:#2d5a88; color:#fff; border:none; border-radius:4px; cursor:pointer;">➕ 新增分鏡</button>
                    <button id="btn_del_clip" style="flex:1; padding:4px; background:#882d2d; color:#fff; border:none; border-radius:4px; cursor:pointer;">🗑 刪除</button>
                    <button id="btn_left_clip" style="flex:1; padding:4px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer;">◀ 左移</button>
                    <button id="btn_right_clip" style="flex:1; padding:4px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer;">▶ 右移</button>
                </div>

                <hr style="border:0; border-top:1px solid #333; margin:2px 0;">

                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="display: flex; justify-content: space-between; align-items: center;">
                        <span>⏱️ 片段時長 (秒):</span>
                        <input id="input_duration" type="number" step="0.1" min="0.5" style="width: 70px; background:#222; color:#fff; border:1px solid #444; border-radius:3px; padding:2px 4px;">
                    </label>

                    <div>
                        <span style="display: block; margin-bottom: 2px;">📝 Prompt (提示詞):</span>
                        <textarea id="input_prompt" style="width: 100%; background:#222; color:#fff; border:1px solid #444; border-radius:3px; resize:vertical; box-sizing: border-box; min-height: 45px;"></textarea>
                    </div>

                    <!-- 參考圖片列表 -->
                    <div style="background: #282828; padding: 6px; border-radius: 4px; border: 1px solid #3d3d3d;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span>🖼️ 參考圖片列表:</span>
                            <div style="display: flex; gap: 2px;">
                                <button id="btn_add_prev_last" style="background:#005f73; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;" title="引用上一分鏡的最後一幀">⏮️ 前尾</button>
                                <button id="btn_add_next_first" style="background:#005f73; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;" title="引用下一分鏡的第一幀">⏭ 後首</button>
                                <button id="btn_add_img" style="background:#2d5a88; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">➕ 上傳</button>
                                <button id="btn_left_img" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">◀</button>
                                <button id="btn_right_img" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">▶</button>
                                <button id="btn_del_img" style="background:#882d2d; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">🗑</button>
                            </div>
                        </div>
                        <input id="file_img" type="file" accept="image/*" style="display: none;">
                        <div id="img_list_box" style="display: flex; gap: 6px; overflow-x: auto; padding: 4px 0; min-height: 52px; scrollbar-width: thin;"></div>
                    </div>

                    <!-- 參考音訊列表 -->
                    <div style="background: #282828; padding: 6px; border-radius: 4px; border: 1px solid #3d3d3d;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span>🎵 參考音訊列表:</span>
                            <div style="display: flex; gap: 2px;">
                                <button id="btn_add_audio" style="background:#2d5a88; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">➕ 上傳</button>
                                <button id="btn_left_audio" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">◀</button>
                                <button id="btn_right_audio" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">▶</button>
                                <button id="btn_del_audio" style="background:#882d2d; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">🗑</button>
                            </div>
                        </div>
                        <input id="file_audio" type="file" accept="audio/*" style="display: none;">
                        <div id="audio_list_box" style="display: flex; gap: 6px; overflow-x: auto; padding: 4px 0; min-height: 40px; scrollbar-width: thin;"></div>
                    </div>

                    <!-- 當前 Clip 的 Dict 覆蓋區 -->
                    <div style="background: #282828; padding: 6px; border-radius: 4px; border: 1px solid #3d3d3d;">
                        <div style="font-weight: bold; margin-bottom: 4px; color: #aaa;">⚙ 當前 Clip Dict 覆蓋設定:</div>
                        <div id="clip_dict_container" style="display: flex; flex-direction: column; gap: 6px;"></div>
                    </div>
                </div>
            `;

            node.addDOMWidget("scenes_json_dom", "dom", container, {
                getValue() { return JSON.stringify(node._scenesCache || getData()); },
                setValue(v) {
                    node.extra_info = node.extra_info || {};
                    node.extra_info.scenes_json = v;
                    node._scenesCache = null;
                }
            });

            const $ = sel => container.querySelector(sel);
            const els = {
                infoBar: $("#info_bar"),
                btnOpenModal: $("#btn_open_modal"),
                btnPlayMode: $("#btn_play_mode"),
                btnExportProj: $("#btn_export_proj"),
                btnImportProj: $("#btn_import_proj"),
                btnExportVids: $("#btn_export_vids"),
                stripContainer: $("#strip_container"),
                inputDuration: $("#input_duration"),
                inputPrompt: $("#input_prompt"),
                btnManageVideos: $("#btn_manage_videos"),
                clipDictContainer: $("#clip_dict_container"),
                imgListBox: $("#img_list_box"),
                fileImg: $("#file_img"),
                audioListBox: $("#audio_list_box"),
                fileAudio: $("#file_audio")
            };

            const savePromptHeight = () => {
                const h = els.inputPrompt.style.height;
                if (h && h !== node.properties.prompt_height) {
                    node.properties.prompt_height = h;
                    node.setDirtyCanvas(true, true);
                }
            };
            const resizeObserver = new ResizeObserver(savePromptHeight);
            resizeObserver.observe(els.inputPrompt);
            els.inputPrompt.addEventListener("mouseup", savePromptHeight);

            const onRemoved = this.onRemoved;
            this.onRemoved = function () {
                if (onRemoved) onRemoved.apply(this, arguments);
                resizeObserver.disconnect();
            };

            const getData = () => {
                if (node._scenesCache) return node._scenesCache;

                try {
                    const raw = node.extra_info?.scenes_json || node.properties?.scenes_json;
                    let parsed = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
                    if (Array.isArray(parsed)) parsed = { global_dict: [], scenes: parsed };
                    parsed.global_dict = parsed.global_dict || [];
                    parsed.scenes = parsed.scenes || [];
                    if (parsed.scenes.length > 0 && !parsed.scenes.some(s => s.selected)) {
                        parsed.scenes[0].selected = true;
                    }
                    node._scenesCache = parsed;
                    return parsed;
                } catch (e) {
                    node._scenesCache = { global_dict: [], scenes: [] };
                    return node._scenesCache;
                }
            };

            const getActiveScene = scenes => scenes.find(s => s.selected) || scenes[0];

            const syncActiveInputs = (data) => {
                const active = getActiveScene(data.scenes);
                if (active) {
                    if (els.inputPrompt) active.prompt = els.inputPrompt.value;
                    if (els.inputDuration) {
                        const val = parseFloat(els.inputDuration.value);
                        active.duration = isNaN(val) ? 5.0 : val;
                    }
                }
            };

            const saveData = (data, renderCb) => {
                node._scenesCache = data;
                const jsonStr = JSON.stringify(data);
                node.extra_info = node.extra_info || {};
                node.properties = node.properties || {};

                node.extra_info.scenes_json = jsonStr;
                node.properties.scenes_json = jsonStr;

                if (renderCb) renderCb();
                node.setDirtyCanvas(true, true);
            };
            // 📦 匯出專案彈窗邏輯
            const openExportProjectModal = async () => {
                const data = getData();
                syncActiveInputs(data);

                const projectList = await ApiService.listProjects();

                const bodyHtml = `
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div style="color: #ccc; font-size: 11px; line-height: 1.4;">
                            匯出專案時，系統會建立專屬專案包，並將當前所有分鏡引用的<strong>影片、參考圖片、參考音訊檔全部複製備份</strong>至同一專案目錄內。
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-weight: bold; color: #ffca28;">下拉選擇已有專案 (進行覆蓋)：</label>
                            <select id="select_existing_proj" style="background: #151515; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 12px;">
                                <option value="">-- 請選擇已有專案，或直接在下方新建 --</option>
                                ${projectList.map(p => `<option value="${p.name}">${p.name} (${new Date(p.mtime * 1000).toLocaleString()})</option>`).join("")}
                            </select>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-weight: bold; color: #4db8ff;">專案名稱 (資料夾名稱)：</label>
                            <input id="input_proj_name" type="text" placeholder="請輸入檔名/專案名稱" style="background: #151515; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 12px;">
                        </div>

                        <div id="export_status_tip" style="color: #888; font-size: 11px; min-height: 18px;"></div>
                    </div>
                `;

                const footerHtml = `
                    <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
                        <button id="modal_cancel_export" style="background: #444; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer;">取消</button>
                        <button id="modal_confirm_export" style="background: #d97706; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">🚀 開始匯出與備份</button>
                    </div>
                `;

                const { dialog, closeModal } = createModal({
                    title: "📦 匯出專案 (複製所有媒體檔案與設定)",
                    width: "520px",
                    bodyHtml,
                    footerHtml
                });

                const selectProj = dialog.querySelector("#select_existing_proj");
                const inputName = dialog.querySelector("#input_proj_name");
                const statusTip = dialog.querySelector("#export_status_tip");

                selectProj.onchange = () => {
                    if (selectProj.value) {
                        inputName.value = selectProj.value;
                    }
                };

                dialog.querySelector("#modal_cancel_export").onclick = closeModal;

                dialog.querySelector("#modal_confirm_export").onclick = async () => {
                    const projName = inputName.value.trim();
                    if (!projName) {
                        alert("⚠️ 請輸入或選擇專案名稱！");
                        return;
                    }

                    statusTip.innerText = "⏳ 正在複製媒體資源檔案並寫入專案包，請稍候...";
                    statusTip.style.color = "#ffca28";

                    const result = await ApiService.exportProject(projName, data);
                    if (result && result.success) {
                        saveData(result.scenes_data, renderUI);
                        alert(`✅ 專案「${projName}」匯出成功！\n所有相關媒體資源已複製至 output/likej_projects/${projName}/`);
                        closeModal();
                    } else {
                        statusTip.innerText = `❌ 匯出失敗: ${result?.error || "未知錯誤"}`;
                        statusTip.style.color = "#ff4d4d";
                    }
                };
            };

            // 📂 匯入專案彈窗邏輯
            const openImportProjectModal = async () => {
                const projectList = await ApiService.listProjects();

                if (projectList.length === 0) {
                    alert("⚠️ 目前伺服器上尚無任何已匯出的專案包可供匯入！");
                    return;
                }

                const bodyHtml = `
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div style="color: #ccc; font-size: 11px;">
                            選取要載入的專案包。匯入後會自動覆蓋當前節點的所有分鏡與媒體路徑。
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-weight: bold; color: #0284c7;">請選擇要載入的專案：</label>
                            <select id="select_import_proj" style="background: #151515; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 12px;">
                                ${projectList.map(p => `<option value="${p.name}">${p.name} (更新時間: ${new Date(p.mtime * 1000).toLocaleString()})</option>`).join("")}
                            </select>
                        </div>

                        <div id="import_info_box" style="background: #1a1a1a; border: 1px solid #333; padding: 8px; border-radius: 4px; font-size: 11px; color: #aaa; min-height: 50px;">
                            載入專案詳細資訊中...
                        </div>
                    </div>
                `;

                const footerHtml = `
                    <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
                        <button id="modal_cancel_import" style="background: #444; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer;">取消</button>
                        <button id="modal_confirm_import" style="background: #0284c7; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">📂 確定匯入此專案</button>
                    </div>
                `;

                const { dialog, closeModal } = createModal({
                    title: "📂 匯入專案 (載入專案包與媒體庫)",
                    width: "520px",
                    bodyHtml,
                    footerHtml
                });

                const selectProj = dialog.querySelector("#select_import_proj");
                const infoBox = dialog.querySelector("#import_info_box");

                const updateImportInfo = async () => {
                    const pName = selectProj.value;
                    if (!pName) return;
                    infoBox.innerText = "⏳ 讀取專案資料中...";
                    const res = await ApiService.loadProject(pName);
                    if (res && res.success && res.scenes_data) {
                        const sc = res.scenes_data.scenes || [];
                        infoBox.innerHTML = `
                            <div><strong style="color: #4db8ff;">專案名稱：</strong> ${pName}</div>
                            <div><strong style="color: #ffca28;">分鏡數量：</strong> ${sc.length} 個</div>
                            <div><strong style="color: #28a745;">全域 Dict 鍵數：</strong> ${(res.scenes_data.global_dict || []).length} 個</div>
                        `;
                    } else {
                        infoBox.innerText = "⚠️ 無法讀取該專案資料";
                    }
                };

                selectProj.onchange = updateImportInfo;
                updateImportInfo();

                dialog.querySelector("#modal_cancel_import").onclick = closeModal;

                dialog.querySelector("#modal_confirm_import").onclick = () => {
                    const pName = selectProj.value;
                    if (!pName) return;

                    showConfirmModal({
                        title: "📂 匯入專案確認",
                        message: `確定要載入專案 <strong>「${pName}」</strong> 嗎？這將會覆蓋當前編輯中的所有分鏡設定！`,
                        confirmText: "確定覆蓋匯入",
                        onConfirm: async () => {
                            const res = await ApiService.loadProject(pName);
                            if (res && res.success && res.scenes_data) {
                                saveData(res.scenes_data, renderUI);
                                alert(`✅ 專案「${pName}」已成功載入！`);
                                closeModal();
                            } else {
                                alert("❌ 載入專案失敗！");
                            }
                        }
                    });
                };
            };

            els.btnExportProj.onclick = openExportProjectModal;
            els.btnImportProj.onclick = openImportProjectModal;

            // 🎬 匯出影片彈窗邏輯 (帶有已有目錄下拉選單)
            const openExportVideosModal = async () => {
                const data = getData();
                syncActiveInputs(data);
                const scenes = data.scenes || [];

                if (scenes.length === 0) {
                    alert("⚠️ 目前沒有任何分鏡資料可供匯出！");
                    return;
                }

                // 取得已有目錄/專案清單
                const projectList = await ApiService.listProjects();

                const bodyHtml = `
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="color: #ccc; font-size: 11px; line-height: 1.4;">
                系統將會抓取各分鏡所設定/選取的影片，依照<strong>分鏡順序編號命名</strong>（如 <code>scene_000.mp4</code>、<code>scene_001.mp4</code>）複製輸出至指定資料夾中。
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-weight: bold; color: #ffca28;">下拉選擇已有目錄 (進行覆蓋)：</label>
                <select id="select_existing_vid_dir" style="background: #151515; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 12px;">
                    <option value="">-- 請選擇已有目錄，或直接在下方新建 --</option>
                    ${projectList.map(p => `<option value="${p.name}">${p.name} (${new Date(p.mtime * 1000).toLocaleString()})</option>`).join("")}
                </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-weight: bold; color: #059669;">匯出目錄名稱 (資料夾名稱)：</label>
                <input id="input_export_vid_dir" type="text" placeholder="例如：my_movie_v1" style="background: #151515; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 12px;">
            </div>

            <div id="export_vids_status_tip" style="color: #888; font-size: 11px; min-height: 18px;"></div>
        </div>
    `;

                const footerHtml = `
        <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
            <button id="modal_cancel_export_vid" style="background: #444; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer;">取消</button>
            <button id="modal_confirm_export_vid" style="background: #059669; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">🚀 開始匯出影片</button>
        </div>
    `;

                const { dialog, closeModal } = createModal({
                    title: "🎬 匯出分鏡影片 (依照分鏡編號輸出)",
                    width: "520px",
                    bodyHtml,
                    footerHtml
                });

                const selectDir = dialog.querySelector("#select_existing_vid_dir");
                const inputDir = dialog.querySelector("#input_export_vid_dir");
                const statusTip = dialog.querySelector("#export_vids_status_tip");

                // 切換下拉選單時自動帶入輸入框
                selectDir.onchange = () => {
                    if (selectDir.value) {
                        inputDir.value = selectDir.value;
                    }
                };

                dialog.querySelector("#modal_cancel_export_vid").onclick = closeModal;

                dialog.querySelector("#modal_confirm_export_vid").onclick = async () => {
                    const dirName = inputDir.value.trim();
                    if (!dirName) {
                        alert("⚠️ 請輸入或選擇匯出目錄名稱！");
                        return;
                    }

                    statusTip.innerText = "⏳ 正在處理影片複製與命名，請稍候...";
                    statusTip.style.color = "#ffca28";

                    const result = await ApiService.exportVideos(dirName, scenes);
                    if (result && result.success) {
                        alert(`✅ 影片匯出成功！\n共匯出 ${result.exported_count} 個分鏡影片 (跳過無影片分鏡: ${result.skipped_count} 個)\n\n儲存路徑：\n${result.export_dir}`);
                        closeModal();
                    } else {
                        statusTip.innerText = `❌ 匯出失敗: ${result?.error || "未知錯誤"}`;
                        statusTip.style.color = "#ff4d4d";
                    }
                };
            };

            els.btnExportVids.onclick = openExportVideosModal;

            // 🎬 全分鏡連貫播放模式彈窗 (雙 Video 緩衝無閃爍)
            const openSequencePlayerModal = (startSceneIdx = 0) => {
                const data = getData();
                syncActiveInputs(data);
                const scenes = data.scenes || [];

                const playableItems = [];
                scenes.forEach((s, idx) => {
                    s.videos = s.videos || (s.video ? [s.video] : []);
                    s.selected_video_idx = s.selected_video_idx ?? 0;
                    const activeVid = s.videos[s.selected_video_idx] || s.video;
                    if (activeVid) {
                        playableItems.push({
                            sceneIdx: idx,
                            videoObj: activeVid,
                            duration: s.duration || 0,
                            prompt: s.prompt || ""
                        });
                    }
                });

                if (playableItems.length === 0) {
                    alert("⚠️ 目前沒有任何分鏡設定影片，無法啟動播放模式！");
                    return;
                }

                let playIdx = playableItems.findIndex(p => p.sceneIdx >= startSceneIdx);
                if (playIdx === -1) playIdx = 0;

                const bodyHtml = `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; padding: 6px 12px; border-radius: 6px; border: 1px solid #333; flex-shrink: 0;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-weight: bold; color: #28a745;" id="play_status_badge">▶️ 播放中</span>
                                <span id="play_scene_info" style="color: #4db8ff; font-weight: bold;">分鏡 #0</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px; font-size: 11px;">
                                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; color: #ccc; user-select: none;">
                                    <input type="checkbox" id="chk_auto_loop" checked> 全分鏡循環播放
                                </label>
                                <button id="btn_start_from_first" style="background: #2d5a88; color: #fff; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer;">⏮️ 第一鏡</button>
                                <button id="btn_start_from_selected" style="background: #005f73; color: #fff; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer;">🎯 點選鏡</button>
                            </div>
                        </div>

                        <!-- 雙層無縫影片播放區域 (固定高度，徹底防閃爍與晃動) -->
                        <div style="position: relative; width: 100%; height: 320px; background: #000; border-radius: 6px; overflow: hidden; flex-shrink: 0; border: 1px solid #2a2a2a;">
                            <video id="seq_video_a" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; opacity: 1; transition: opacity 0.2s ease;" playsinline></video>
                            <video id="seq_video_b" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; opacity: 0; transition: opacity 0.2s ease;" playsinline></video>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; padding: 6px 12px; border-radius: 6px; border: 1px solid #333; flex-shrink: 0;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <button id="btn_seq_prev" style="background: #444; color: #fff; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer;">⏮️ 上一鏡</button>
                                <button id="btn_seq_toggle" style="background: #28a745; color: #fff; border: none; padding: 4px 14px; border-radius: 3px; cursor: pointer; font-weight: bold;">⏸️ 暫停</button>
                                <button id="btn_seq_next" style="background: #444; color: #fff; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer;">⏭️ 下一鏡</button>
                            </div>
                            <div id="seq_time_info" style="color: #aaa; font-size: 11px;">00:00 / 00:00</div>
                        </div>

                        <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 8px; flex-shrink: 0;">
                            <div style="font-size: 11px; font-weight: bold; color: #aaa; margin-bottom: 6px;">🎬 可播放分鏡清單 (點擊切換)：</div>
                            <div id="seq_playlist_strip" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin;"></div>
                        </div>
                    </div>
                `;

                const footerHtml = `
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span style="font-size: 11px; color: #888;">💡 提示：點擊上方膠卷縮圖可隨時跳轉至該分鏡播放</span>
                        <button id="btn_close_seq_player" style="background: #444; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer;">關閉播放器</button>
                    </div>
                `;

                const { dialog, closeModal } = createModal({
                    title: `🎬 全分鏡連續播放模式`,
                    width: "780px",
                    bodyHtml,
                    footerHtml,
                    onClose: () => {
                        videoA.pause();
                        videoB.pause();
                        videoA.src = "";
                        videoB.src = "";
                    }
                });

                const videoA = dialog.querySelector("#seq_video_a");
                const videoB = dialog.querySelector("#seq_video_b");
                let activeVidEl = videoA;
                let hiddenVidEl = videoB;

                const playStatusBadge = dialog.querySelector("#play_status_badge");
                const playSceneInfo = dialog.querySelector("#play_scene_info");
                const seqTimeInfo = dialog.querySelector("#seq_time_info");
                const playlistStrip = dialog.querySelector("#seq_playlist_strip");
                const btnToggle = dialog.querySelector("#btn_seq_toggle");
                const chkAutoLoop = dialog.querySelector("#chk_auto_loop");

                const renderPlaylistStrip = () => {
                    playlistStrip.innerHTML = "";
                    playableItems.forEach((item, pIdx) => {
                        const isPlaying = pIdx === playIdx;
                        const card = document.createElement("div");
                        card.style.cssText = `
                            flex: 0 0 auto; width: 80px; padding: 4px;
                            border: 2px solid ${isPlaying ? "#28a745" : "#444"};
                            background: ${isPlaying ? "#1b4324" : "#222"};
                            border-radius: 4px; cursor: pointer; text-align: center;
                        `;
                        const vUrl = ApiService.getMediaUrl(item.videoObj);

                        card.innerHTML = `
                            <div style="position: relative; width: 100%; height: 45px; background: #000; border-radius: 2px; overflow: hidden;">
                                <video src="${vUrl}" muted playsinline style="width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none;"></video>
                                ${isPlaying ? `<div style="position: absolute; top:2px; right:2px; background:#28a745; color:#fff; font-size:8px; padding:1px 3px; border-radius:2px;">播放中</div>` : ""}
                            </div>
                            <div style="font-size: 9px; color: ${isPlaying ? "#fff" : "#ccc"}; font-weight: bold; margin-top: 3px;">#${item.sceneIdx} (${item.duration}s)</div>
                        `;

                        card.onclick = () => {
                            playIdx = pIdx;
                            loadAndPlayItem();
                        };

                        playlistStrip.appendChild(card);
                    });
                };

                const loadAndPlayItem = () => {
                    if (playIdx < 0 || playIdx >= playableItems.length) return;
                    const current = playableItems[playIdx];
                    const vUrl = ApiService.getMediaUrl(current.videoObj);

                    playSceneInfo.innerText = `分鏡 #${current.sceneIdx} (進度 ${playIdx + 1}/${playableItems.length})`;

                    // 雙 Video 緩衝無縫切換核心邏輯
                    hiddenVidEl.src = vUrl;
                    hiddenVidEl.currentTime = 0;
                    hiddenVidEl.play().then(() => {
                        hiddenVidEl.style.opacity = "1";
                        activeVidEl.style.opacity = "0";
                        activeVidEl.pause();

                        // 交換當前與隱藏影片指標
                        const temp = activeVidEl;
                        activeVidEl = hiddenVidEl;
                        hiddenVidEl = temp;

                        btnToggle.innerText = "⏸️ 暫停";
                        playStatusBadge.innerText = "▶️ 播放中";
                        playStatusBadge.style.color = "#28a745";
                    }).catch(err => {
                        console.log("[LikeJVideoDirector] 自動播放回應:", err);
                        hiddenVidEl.style.opacity = "1";
                        activeVidEl.style.opacity = "0";
                        activeVidEl.pause();
                        const temp = activeVidEl;
                        activeVidEl = hiddenVidEl;
                        hiddenVidEl = temp;
                    });

                    renderPlaylistStrip();
                };

                const handleEnded = (e) => {
                    if (e.target !== activeVidEl) return;
                    const shouldLoop = chkAutoLoop.checked;
                    if (playIdx + 1 < playableItems.length) {
                        playIdx++;
                        loadAndPlayItem();
                    } else if (shouldLoop) {
                        playIdx = 0;
                        loadAndPlayItem();
                    } else {
                        btnToggle.innerText = "▶️ 播放";
                        playStatusBadge.innerText = "⏹️ 播放完畢";
                        playStatusBadge.style.color = "#ffca28";
                    }
                };

                const handleTimeUpdate = (e) => {
                    if (e.target === activeVidEl && activeVidEl.duration) {
                        const cur = Math.floor(activeVidEl.currentTime);
                        const tot = Math.floor(activeVidEl.duration);
                        const fmt = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
                        seqTimeInfo.innerText = `${fmt(cur)} / ${fmt(tot)}`;
                    }
                };

                videoA.onended = handleEnded;
                videoB.onended = handleEnded;
                videoA.ontimeupdate = handleTimeUpdate;
                videoB.ontimeupdate = handleTimeUpdate;

                btnToggle.onclick = () => {
                    if (activeVidEl.paused) {
                        activeVidEl.play();
                        btnToggle.innerText = "⏸️ 暫停";
                        playStatusBadge.innerText = "▶️ 播放中";
                        playStatusBadge.style.color = "#28a745";
                    } else {
                        activeVidEl.pause();
                        btnToggle.innerText = "▶️ 播放";
                        playStatusBadge.innerText = "⏸️ 已暫停";
                        playStatusBadge.style.color = "#ffca28";
                    }
                };

                dialog.querySelector("#btn_seq_prev").onclick = () => {
                    playIdx = (playIdx - 1 + playableItems.length) % playableItems.length;
                    loadAndPlayItem();
                };

                dialog.querySelector("#btn_seq_next").onclick = () => {
                    playIdx = (playIdx + 1) % playableItems.length;
                    loadAndPlayItem();
                };

                dialog.querySelector("#btn_start_from_first").onclick = () => {
                    playIdx = 0;
                    loadAndPlayItem();
                };

                dialog.querySelector("#btn_start_from_selected").onclick = () => {
                    const curSelectedIdx = data.scenes.findIndex(s => s.selected);
                    let targetPIdx = playableItems.findIndex(p => p.sceneIdx >= (curSelectedIdx >= 0 ? curSelectedIdx : 0));
                    if (targetPIdx === -1) targetPIdx = 0;
                    playIdx = targetPIdx;
                    loadAndPlayItem();
                };

                dialog.querySelector("#btn_close_seq_player").onclick = closeModal;

                loadAndPlayItem();
            };

            // 🎬 影片管理彈窗
            function openVideoManageModal(sceneIdx) {
                const data = getData();
                syncActiveInputs(data);
                const scene = data.scenes[sceneIdx];
                if (!scene) return;

                scene.videos = scene.videos || (scene.video ? [scene.video] : []);
                scene.selected_video_idx = scene.selected_video_idx ?? 0;

                let currentType = "output";
                let videoList = [];
                let selectedFileObj = null;

                const bodyHtml = `
                    <div style="background: #1a1a1a; border: 1px solid #3d3d3d; border-radius: 6px; padding: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-weight: bold; color: #ffca28;">1. 當前分鏡已選影片 (點擊切換，點擊 🔍 放大)</span>
                            <div style="display: flex; gap: 4px;">
                                <button id="btn_modal_left" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 8px; cursor:pointer;">◀ 左移</button>
                                <button id="btn_modal_right" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 8px; cursor:pointer;">▶ 右移</button>
                                <button id="btn_modal_del" style="background:#882d2d; color:#fff; border:none; border-radius:3px; padding:2px 8px; cursor:pointer;">🗑️ 刪除</button>
                            </div>
                        </div>
                        <div id="modal_scene_videos_box" style="display: flex; gap: 8px; overflow-x: auto; padding: 4px 0; min-height: 75px; align-items: center; scrollbar-width: thin;"></div>
                    </div>

                    <div style="background: #1a1a1a; border: 1px solid #3d3d3d; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 10px;">
                        <span style="font-weight: bold; color: #4db8ff;">2. 從伺服器選擇並新增影片至清單</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: bold;">來源切換：</span>
                            <button id="btn_tab_input" style="padding: 4px 12px; border-radius: 4px; border: 1px solid #444; cursor: pointer; background: #333; color: #ccc;">Input 影片庫</button>
                            <button id="btn_tab_output" style="padding: 4px 12px; border-radius: 4px; border: 1px solid #444; cursor: pointer; background: #333; color: #ccc;">Output 輸出庫</button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: bold;">選擇檔案：</span>
                            <select id="select_video_file" style="flex: 1; background: #151515; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 12px;"></select>
                        </div>
                        <div style="background: #111; border: 1px solid #333; border-radius: 6px; padding: 8px; display: flex; align-items: center; justify-content: center; min-height: 140px;">
                            <video id="modal_video_player" controls style="max-width: 100%; max-height: 180px; border-radius: 4px; display: none;"></video>
                            <div id="modal_no_video_tip" style="color: #777;">未選擇影片或目錄無影片檔</div>
                        </div>
                        <button id="modal_add_to_list_btn" style="background: #2d5a88; color: #fff; border: 1px solid #4a82b8; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">➕ 新增選取影片至此分鏡清單</button>
                    </div>
                `;

                const footerHtml = `
                    <div style="display: flex; justify-content: flex-end; width: 100%;">
                        <button id="modal_finish_btn" style="background: #28a745; color: #fff; border: none; padding: 6px 20px; border-radius: 4px; cursor: pointer; font-weight: bold;">完成並儲存</button>
                    </div>
                `;

                const { dialog, closeModal } = createModal({
                    title: `🎬 分鏡 #${sceneIdx} 獨立影片清單管理`,
                    width: "600px",
                    bodyHtml,
                    footerHtml,
                    onClose: () => {
                        const freshData = getData();
                        syncActiveInputs(freshData);
                        if (freshData.scenes[sceneIdx]) {
                            freshData.scenes[sceneIdx].videos = scene.videos;
                            freshData.scenes[sceneIdx].selected_video_idx = scene.selected_video_idx;
                            freshData.scenes[sceneIdx].video = scene.video;
                            saveData(freshData, renderUI);
                        }
                    }
                });

                const btnInput = dialog.querySelector("#btn_tab_input");
                const btnOutput = dialog.querySelector("#btn_tab_output");
                const selectFile = dialog.querySelector("#select_video_file");
                const videoPlayer = dialog.querySelector("#modal_video_player");
                const noVideoTip = dialog.querySelector("#modal_no_video_tip");

                const renderModalSceneVideos = () => {
                    const container = dialog.querySelector("#modal_scene_videos_box");
                    container.innerHTML = scene.videos.length === 0 ? `<div style="color:#777; font-size:11px;">目前此分鏡暫無影片，請從下方選擇並新增。</div>` : "";

                    scene.videos.forEach((vidItem, vIdx) => {
                        const isSel = vIdx === scene.selected_video_idx;
                        const item = document.createElement("div");
                        item.style.cssText = `
                            flex: 0 0 auto; width: 90px; padding: 4px; 
                            border: 2px solid ${isSel ? "#00a2ff" : "#444"}; 
                            background: ${isSel ? "#004477" : "#222"}; 
                            border-radius: 4px; cursor: pointer; text-align: center;
                            position: relative;
                        `;
                        const vUrl = ApiService.getMediaUrl(vidItem);
                        const fname = vidItem.filename || "video";

                        item.innerHTML = `
                            <div class="v-wrap" style="position: relative; width: 100%; height: 50px; background: #000; border-radius: 2px; overflow: hidden;">
                                <video src="${vUrl}" loop muted playsinline style="width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none;"></video>
                                <div class="zoom-btn" style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.7); color: #fff; font-size: 9px; padding: 1px 3px; border-radius: 2px; cursor: pointer; z-index: 2;" title="點擊放大播放與查看詳細資訊">🔍</div>
                            </div>
                            <div style="font-size: 9px; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;" title="${fname}">#${vIdx} ${fname}</div>
                        `;

                        const vWrap = item.querySelector(".v-wrap");
                        const vidEl = item.querySelector("video");
                        const zoomBtn = item.querySelector(".zoom-btn");

                        vWrap.onmouseenter = () => vidEl.play().catch(() => { });
                        vWrap.onmouseleave = () => {
                            vidEl.pause();
                            vidEl.currentTime = 0;
                        };

                        zoomBtn.onclick = (e) => {
                            e.stopPropagation();
                            openVideoPreviewModal(vidItem);
                        };

                        item.onclick = () => {
                            scene.selected_video_idx = vIdx;
                            scene.video = scene.videos[vIdx];
                            renderModalSceneVideos();
                        };

                        container.appendChild(item);
                    });
                };

                dialog.querySelector("#btn_modal_del").onclick = () => {
                    if (scene.videos.length > 0) {
                        const idx = scene.selected_video_idx || 0;
                        showConfirmModal({
                            title: "🗑️ 刪除影片確認",
                            message: `確定要從此分鏡清單中移除 <strong>#${idx} ${scene.videos[idx].filename || ''}</strong> 嗎？`,
                            onConfirm: () => {
                                scene.videos.splice(idx, 1);
                                scene.selected_video_idx = Math.max(0, idx - 1);
                                scene.video = scene.videos[scene.selected_video_idx] || null;
                                renderModalSceneVideos();
                            }
                        });
                    }
                };

                dialog.querySelector("#btn_modal_left").onclick = () => {
                    if (scene.videos.length > 1) {
                        const idx = scene.selected_video_idx || 0;
                        if (moveItem(scene.videos, idx, -1)) {
                            scene.selected_video_idx = idx - 1;
                            scene.video = scene.videos[scene.selected_video_idx];
                            renderModalSceneVideos();
                        }
                    }
                };

                dialog.querySelector("#btn_modal_right").onclick = () => {
                    if (scene.videos.length > 1) {
                        const idx = scene.selected_video_idx || 0;
                        if (moveItem(scene.videos, idx, 1)) {
                            scene.selected_video_idx = idx + 1;
                            scene.video = scene.videos[scene.selected_video_idx];
                            renderModalSceneVideos();
                        }
                    }
                };

                const updateTabStyles = () => {
                    const isInput = currentType === "input";
                    btnInput.style.cssText += `background: ${isInput ? "#2d5a88" : "#333"}; color: ${isInput ? "#fff" : "#ccc"}; border-color: ${isInput ? "#00a2ff" : "#444"};`;
                    btnOutput.style.cssText += `background: ${!isInput ? "#2d5a88" : "#333"}; color: ${!isInput ? "#fff" : "#ccc"}; border-color: ${!isInput ? "#00a2ff" : "#444"};`;
                };

                const updatePreview = () => {
                    if (selectedFileObj) {
                        videoPlayer.src = ApiService.getMediaUrl(selectedFileObj);
                        videoPlayer.style.display = "block";
                        noVideoTip.style.display = "none";
                    } else {
                        videoPlayer.src = "";
                        videoPlayer.style.display = "none";
                        noVideoTip.style.display = "block";
                    }
                };

                const loadVideoList = async (type) => {
                    currentType = type;
                    updateTabStyles();
                    selectFile.innerHTML = `<option value="">載入中...</option>`;
                    videoList = await ApiService.getVideos(type);
                    selectFile.innerHTML = "";

                    if (videoList.length === 0) {
                        selectFile.innerHTML = `<option value="">(此資料夾暫無影片檔案)</option>`;
                        selectedFileObj = null;
                    } else {
                        videoList.forEach((v, i) => {
                            const opt = document.createElement("option");
                            opt.value = i;
                            const dateStr = v.mtime ? new Date(v.mtime * 1000).toLocaleString() : "";
                            const pathStr = v.subfolder ? `${v.subfolder}/${v.filename}` : v.filename;
                            opt.textContent = `${pathStr} (${dateStr})`;
                            selectFile.appendChild(opt);
                        });

                        selectFile.selectedIndex = 0;
                        selectedFileObj = videoList[0];
                    }
                    updatePreview();
                };

                btnInput.onclick = () => loadVideoList("input");
                btnOutput.onclick = () => loadVideoList("output");

                selectFile.onchange = () => {
                    const idx = parseInt(selectFile.value);
                    selectedFileObj = (!isNaN(idx) && videoList[idx]) ? videoList[idx] : null;
                    updatePreview();
                };

                dialog.querySelector("#modal_add_to_list_btn").onclick = () => {
                    if (selectedFileObj) {
                        const existIdx = scene.videos.findIndex(v =>
                            v.filename === selectedFileObj.filename &&
                            (v.subfolder || "") === (selectedFileObj.subfolder || "") &&
                            (v.type || "output") === (selectedFileObj.type || "output")
                        );

                        if (existIdx !== -1) {
                            scene.selected_video_idx = existIdx;
                        } else {
                            scene.videos.push(selectedFileObj);
                            scene.selected_video_idx = scene.videos.length - 1;
                        }
                        scene.video = scene.videos[scene.selected_video_idx];
                        renderModalSceneVideos();
                    }
                };

                dialog.querySelector("#modal_finish_btn").onclick = closeModal;

                renderModalSceneVideos();
                loadVideoList(currentType);
            }

            // 🪟 全域 Dict 開窗彈窗
            els.btnOpenModal.onclick = () => openDictModal();

            function openDictModal() {
                const data = getData();
                syncActiveInputs(data);

                const footerHtml = `
                    <button id="modal_add_key_btn" style="background: #2d5a88; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">➕ 新增 Key</button>
                    <button id="modal_save_btn" style="background: #28a745; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">儲存並關閉</button>
                `;

                const { dialog, closeModal } = createModal({
                    title: "⚙️ 全域 Dict 參數範本設定 (開窗視窗)",
                    width: "620px",
                    bodyHtml: `<div id="modal_list_container" style="display: flex; flex-direction: column; gap: 8px;"></div>`,
                    footerHtml
                });

                const renderModalList = () => {
                    const listContainer = dialog.querySelector("#modal_list_container");
                    listContainer.innerHTML = data.global_dict.length === 0 ? `<div style="color:#777; text-align:center; padding: 20px;">目前無任何參數 Key，請點擊左下角「新增 Key」</div>` : "";

                    data.global_dict.forEach((gItem, idx) => {
                        const row = document.createElement("div");
                        row.style.cssText = "display: flex; gap: 8px; align-items: center; background: #2a2a2a; padding: 6px 8px; border-radius: 4px;";
                        const curType = String(gItem.type || "STRING").toUpperCase();

                        row.innerHTML = `
                            <input type="text" placeholder="Key 名稱" value="${gItem.key || ""}" style="width: 120px; background:#181818; color:#fff; border:1px solid #444; border-radius:3px; padding:4px;" data-field="key">
                            <select style="background:#181818; color:#38bdf8; border:1px solid #444; border-radius:3px; padding:4px; font-weight:bold;" data-field="type">
                                <option value="STRING" ${curType === "STRING" ? "selected" : ""}>STRING</option>
                                <option value="INT" ${curType === "INT" ? "selected" : ""}>INT</option>
                                <option value="FLOAT" ${curType === "FLOAT" || curType === "NUMBER" ? "selected" : ""}>FLOAT</option>
                                <option value="BOOLEAN" ${curType === "BOOLEAN" ? "selected" : ""}>BOOLEAN</option>
                                <option value="ANY" ${curType === "ANY" || curType === "JSON" ? "selected" : ""}>ANY</option>
                            </select>
                            <input type="text" placeholder="主場預設值" value="${gItem.default ?? ""}" style="flex: 1; background:#181818; color:#fff; border:1px solid #444; border-radius:3px; padding:4px;" data-field="default">
                            <button style="background:#882d2d; color:#fff; border:none; border-radius:3px; padding:4px 8px; cursor:pointer;" data-del="${idx}">🗑</button>
                        `;

                        row.querySelector('[data-field="key"]').oninput = e => { gItem.key = e.target.value; };
                        row.querySelector('[data-field="type"]').onchange = e => { gItem.type = e.target.value; renderModalList(); };
                        row.querySelector('[data-field="default"]').oninput = e => { gItem.default = e.target.value; };
                        row.querySelector('[data-del]').onclick = () => { data.global_dict.splice(idx, 1); renderModalList(); };

                        listContainer.appendChild(row);
                    });
                };

                dialog.querySelector("#modal_add_key_btn").onclick = () => {
                    data.global_dict.push({ key: `key_${data.global_dict.length + 1}`, type: "STRING", default: "" });
                    renderModalList();
                };

                const validateGlobalDict = () => {
                    const keys = new Set();
                    for (let i = 0; i < data.global_dict.length; i++) {
                        const item = data.global_dict[i];
                        const keyName = (item.key || "").trim();

                        if (!keyName) return `第 ${i + 1} 列的 Key 名稱不可為空！`;
                        if (keys.has(keyName)) return `重複的 Key 名稱：「${keyName}」！Key 名稱必須唯一。`;
                        keys.add(keyName);

                        const defVal = item.default ?? "";
                        if (defVal !== "") {
                            const res = validateValue(defVal, item.type);
                            if (!res.valid) return `Key 「${keyName}」的預設值類型不符合 [${item.type}]：\n${res.error} (當前輸入: "${defVal}")`;
                        }
                    }
                    return null;
                };

                dialog.querySelector("#modal_save_btn").onclick = () => {
                    const errorMsg = validateGlobalDict();
                    if (errorMsg) {
                        alert(`⚠️ 設定資料無效，無法儲存：\n\n${errorMsg}`);
                        return;
                    }
                    saveData(data, renderUI);
                    closeModal();
                };

                renderModalList();
            }

            // UI 渲染主邏輯
            function renderUI() {
                if (node.properties?.prompt_height) {
                    els.inputPrompt.style.height = node.properties.prompt_height;
                }

                const data = getData();
                const list = data.scenes;
                const totalDur = list.reduce((sum, s) => sum + (parseFloat(s.duration) || 0), 0);
                els.infoBar.innerText = `Clips: ${list.length} | 總時長: ${totalDur.toFixed(1)}s`;

                // 1. 渲染頂部分鏡卡
                els.stripContainer.innerHTML = "";
                list.forEach((s, idx) => {
                    s.videos = s.videos || (s.video ? [s.video] : []);
                    s.selected_video_idx = s.selected_video_idx ?? 0;
                    const activeVid = s.videos[s.selected_video_idx] || s.video;
                    const vidUrl = activeVid ? ApiService.getMediaUrl(activeVid) : "";

                    const card = document.createElement("div");
                    const isActive = !!s.selected;
                    card.style.cssText = `
                        flex: 0 0 auto; width: 85px; padding: 5px; 
                        background: ${isActive ? "#007acc" : "#2d2d2d"}; 
                        border: 2px solid ${isActive ? "#00a2ff" : "#444"}; 
                        border-radius: 6px; cursor: pointer; text-align: center; user-select: none;
                        display: flex; flex-direction: column; align-items: center; gap: 4px;
                    `;

                    const videoWrap = document.createElement("div");
                    videoWrap.style.cssText = "position: relative; width: 100%; height: 50px; background: #000; border-radius: 4px; overflow: hidden;";

                    if (vidUrl) {
                        videoWrap.innerHTML = `
                            <video src="${vidUrl}" loop muted playsinline style="width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none;"></video>
                            <div style="position: absolute; bottom: 2px; right: 2px; display: flex; gap: 2px; z-index: 2;">
                                <div class="play-seq-btn" style="background: rgba(40,167,69,0.85); color: #fff; font-size: 9px; padding: 1px 3px; border-radius: 2px; cursor: pointer;" title="從此分鏡開啟播放模式">▶️</div>
                                <div class="zoom-btn" style="background: rgba(0,0,0,0.7); color: #fff; font-size: 9px; padding: 1px 3px; border-radius: 2px; cursor: pointer;" title="點擊放大播放與查看詳細資訊">🔍</div>
                            </div>
                        `;
                        const vidEl = videoWrap.querySelector("video");
                        const zoomBtn = videoWrap.querySelector(".zoom-btn");
                        const playSeqBtn = videoWrap.querySelector(".play-seq-btn");

                        videoWrap.onmouseenter = () => vidEl.play().catch(() => { });
                        videoWrap.onmouseleave = () => {
                            vidEl.pause();
                            vidEl.currentTime = 0;
                        };

                        zoomBtn.onclick = (e) => {
                            e.stopPropagation();
                            openVideoPreviewModal(activeVid);
                        };

                        playSeqBtn.onclick = (e) => {
                            e.stopPropagation();
                            openSequencePlayerModal(idx);
                        };
                    } else {
                        videoWrap.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #666; font-size: 10px; border: 1px dashed #444;">無影片</div>`;
                    }

                    const titleEl = document.createElement("div");
                    titleEl.style.cssText = `font-weight: bold; color: ${isActive ? "#fff" : "#ccc"}; font-size: 11px;`;
                    titleEl.innerText = `#${idx} (${s.duration || 0}s)`;

                    const metaEl = document.createElement("div");
                    metaEl.style.cssText = "font-size: 9px; opacity: 0.85; color: #ddd; margin-top: 1px;";
                    metaEl.innerText = `🎬${s.videos.length} 🖼${(s.images || []).length} 🎵${(s.audios || []).length}`;

                    card.appendChild(titleEl);
                    card.appendChild(videoWrap);
                    card.appendChild(metaEl);

                    card.onclick = () => {
                        const freshData = getData();
                        syncActiveInputs(freshData);
                        freshData.scenes.forEach(item => item.selected = false);
                        if (freshData.scenes[idx]) freshData.scenes[idx].selected = true;
                        saveData(freshData, renderUI);
                    };

                    els.stripContainer.appendChild(card);
                });

                const activeScene = getActiveScene(list);
                if (!activeScene) return;

                activeScene.videos = activeScene.videos || (activeScene.video ? [activeScene.video] : []);
                activeScene.selected_video_idx = activeScene.selected_video_idx ?? 0;
                activeScene.images = activeScene.images || [];
                activeScene.audios = activeScene.audios || [];
                activeScene.dict_params = activeScene.dict_params || {};

                els.inputDuration.value = activeScene.duration ?? 5.0;
                els.inputPrompt.value = activeScene.prompt ?? "";

                // 2. 渲染 Dict 設定區
                els.clipDictContainer.innerHTML = data.global_dict.length === 0 ? `<span style="color:#777;">尚未設定全域 Dict 範本（請點擊上方按鈕開窗編輯）。</span>` : "";
                data.global_dict.forEach((gItem) => {
                    if (!gItem.key) return;
                    const keyName = gItem.key;
                    const keyType = String(gItem.type || "STRING").toUpperCase();
                    const globalDefVal = gItem.default ?? "";

                    const clipParam = activeScene.dict_params[keyName] || { use_default: true, value: globalDefVal };
                    activeScene.dict_params[keyName] = clipParam;

                    const row = document.createElement("div");
                    row.style.cssText = "display: flex; gap: 6px; align-items: center; background: #202020; padding: 4px; border-radius: 4px;";
                    const isDefault = clipParam.use_default !== false;

                    let inputHtml = "";
                    if (keyType === "BOOLEAN") {
                        const curVal = isDefault ? globalDefVal : clipParam.value;
                        inputHtml = `
                            <select ${isDefault ? "disabled" : ""} style="flex:1; background:#111; color:${isDefault ? "#888" : "#fff"}; border:1px solid #444; border-radius:3px; padding:2px;" data-val-input>
                                <option value="true" ${String(curVal) === "true" ? "selected" : ""}>true</option>
                                <option value="false" ${String(curVal) === "false" ? "selected" : ""}>false</option>
                            </select>`;
                    } else if (keyType === "INT" || keyType === "FLOAT" || keyType === "NUMBER") {
                        const curVal = isDefault ? globalDefVal : (clipParam.value ?? "");
                        inputHtml = `
                            <input type="number" step="${keyType === "INT" ? "1" : "any"}" 
                                   value="${curVal}" 
                                   placeholder="${isDefault ? `(預設: ${globalDefVal})` : ''}" 
                                   ${isDefault ? "disabled" : ""} 
                                   style="flex:1; background:#111; color:${isDefault ? "#888" : "#fff"}; border:1px solid #444; border-radius:3px; padding:2px;" 
                                   data-val-input>`;
                    } else {
                        const curVal = isDefault ? globalDefVal : (clipParam.value ?? "");
                        inputHtml = `
                            <input type="text" 
                                   value="${curVal}" 
                                   placeholder="${isDefault ? `(預設: ${globalDefVal})` : ''}" 
                                   ${isDefault ? "disabled" : ""} 
                                   style="flex:1; background:#111; color:${isDefault ? "#888" : "#fff"}; border:1px solid #444; border-radius:3px; padding:2px;" 
                                   data-val-input>`;
                    }

                    row.innerHTML = `
                        <span style="width: 75px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${keyName}">${keyName}</span>
                        <label style="display: flex; align-items: center; gap: 2px; color: #aaa; cursor: pointer; user-select: none;">
                            <input type="checkbox" ${isDefault ? "checked" : ""} data-use-default> 繼承
                        </label>
                        ${inputHtml}
                    `;

                    row.querySelector('[data-use-default]').onchange = (e) => {
                        const freshData = getData();
                        const active = getActiveScene(freshData.scenes);
                        if (active) {
                            const p = active.dict_params[keyName] || { use_default: true, value: globalDefVal };
                            p.use_default = e.target.checked;
                            if (!p.use_default && p.value === undefined) p.value = globalDefVal;
                            active.dict_params[keyName] = p;
                        }
                        saveData(freshData, renderUI);
                    };

                    const valInput = row.querySelector('[data-val-input]');
                    valInput.oninput = valInput.onchange = (e) => {
                        const val = e.target.value;
                        const vRes = validateValue(val, keyType);

                        if (!vRes.valid) {
                            valInput.style.borderColor = "#ff4d4d";
                            valInput.title = vRes.error;
                        } else {
                            valInput.style.borderColor = "#444";
                            valInput.title = "";
                            const freshData = getData();
                            const active = getActiveScene(freshData.scenes);
                            if (active) {
                                const p = active.dict_params[keyName] || { use_default: true, value: globalDefVal };
                                p.value = val;
                                active.dict_params[keyName] = p;
                                saveData(freshData);
                            }
                        }
                    };

                    els.clipDictContainer.appendChild(row);
                });

                // 3. 媒體資源列表渲染
                els.imgListBox.innerHTML = activeScene.images.length === 0 ? `<span style="font-size:10px; color:#777; align-self:center;">暫無參考圖</span>` : "";
                activeScene.images.forEach((imgItem, iIdx) => {
                    const isSel = iIdx === (activeScene.selected_img_idx || 0);
                    const item = document.createElement("div");
                    item.style.cssText = `flex: 0 0 auto; padding: 2px; border: 2px solid ${isSel ? "#00a2ff" : "#444"}; border-radius: 4px; cursor: pointer; background: #151515; position: relative;`;

                    const imgUrl = ApiService.getMediaUrl(imgItem);
                    item.innerHTML = `
                        <div class="img-wrap" style="position: relative; width: 48px; height: 48px; border-radius: 2px; overflow: hidden;">
                            <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                            <div class="zoom-btn" style="position: absolute; bottom: 1px; right: 1px; background: rgba(0,0,0,0.75); color: #fff; font-size: 8px; padding: 1px 2px; border-radius: 2px; cursor: pointer; z-index: 2;" title="點擊放大圖片與查看詳細資訊">🔍</div>
                        </div>
                    `;

                    const zoomBtn = item.querySelector(".zoom-btn");

                    zoomBtn.onclick = (e) => {
                        e.stopPropagation();
                        openImagePreviewModal(imgItem);
                    };

                    item.onclick = () => {
                        const freshData = getData();
                        const active = getActiveScene(freshData.scenes);
                        if (active) {
                            active.selected_img_idx = iIdx;
                            saveData(freshData, renderUI);
                        }
                    };
                    els.imgListBox.appendChild(item);
                });

                // 🎵 音訊列表與自動時間長度讀取
                els.audioListBox.innerHTML = activeScene.audios.length === 0 ? `<span style="font-size:10px; color:#777; align-self:center;">暫無參考音訊</span>` : "";
                activeScene.audios.forEach((audioItem, aIdx) => {
                    const isSel = aIdx === (activeScene.selected_audio_idx || 0);
                    const item = document.createElement("div");
                    item.style.cssText = `flex: 0 0 auto; display: flex; flex-direction: column; gap: 3px; padding: 4px; border: 1px solid ${isSel ? "#00a2ff" : "#444"}; background: ${isSel ? "#004477" : "#1f1f1f"}; border-radius: 4px; cursor: pointer;`;

                    const fileNameStr = typeof audioItem === "object" ? (audioItem.filename || audioItem.name || "audio") : audioItem;
                    const audioUrl = ApiService.getMediaUrl(audioItem);

                    item.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; max-width: 140px; font-size: 10px;">
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${fileNameStr}">#${aIdx} ${fileNameStr}</span>
                            <span class="audio-dur-tag" style="color: #ffca28; font-size: 9px; font-weight: bold; margin-left: 4px; flex-shrink: 0;">⏱ ...</span>
                        </div>
                        <audio src="${audioUrl}" controls style="width: 140px; height: 26px;"></audio>
                    `;

                    const audioEl = item.querySelector("audio");
                    const durTag = item.querySelector(".audio-dur-tag");

                    if (audioEl && durTag) {
                        audioEl.onloadedmetadata = () => {
                            if (audioEl.duration && !isNaN(audioEl.duration) && isFinite(audioEl.duration)) {
                                durTag.innerText = `⏱️ ${audioEl.duration.toFixed(1)}s`;
                            } else {
                                durTag.innerText = "";
                            }
                        };
                        audioEl.onerror = () => {
                            durTag.innerText = "無法讀取";
                        };
                    }

                    item.onclick = (e) => {
                        if (e.target.tagName.toLowerCase() === "audio") return;
                        const freshData = getData();
                        const active = getActiveScene(freshData.scenes);
                        if (active) {
                            active.selected_audio_idx = aIdx;
                            saveData(freshData, renderUI);
                        }
                    };
                    els.audioListBox.appendChild(item);
                });
            }

            // 事件監聽繫結
            els.inputDuration.oninput = els.inputDuration.onchange = () => {
                const data = getData();
                const active = getActiveScene(data.scenes);
                if (active) {
                    let val = parseFloat(els.inputDuration.value);
                    active.duration = isNaN(val) ? 5.0 : val;
                    saveData(data, renderUI);
                }
            };

            els.inputPrompt.oninput = els.inputPrompt.onchange = () => {
                const data = getData();
                const active = getActiveScene(data.scenes);
                if (active) {
                    active.prompt = els.inputPrompt.value;
                    saveData(data);
                }
            };

            els.btnPlayMode.onclick = () => {
                const data = getData();
                const active = getActiveScene(data.scenes);
                const activeIdx = data.scenes.findIndex(s => s === active);
                openSequencePlayerModal(activeIdx >= 0 ? activeIdx : 0);
            };

            els.btnManageVideos.onclick = () => {
                const data = getData();
                const active = getActiveScene(data.scenes);
                const activeIdx = data.scenes.findIndex(s => s === active);
                openVideoManageModal(activeIdx);
            };

            $("#btn_add_clip").onclick = () => {
                const data = getData();
                syncActiveInputs(data);
                data.scenes.forEach(s => s.selected = false);
                data.scenes.push({ duration: 5.0, prompt: "", videos: [], selected_video_idx: 0, video: null, images: [], audios: [], dict_params: {}, selected: true });
                saveData(data, renderUI);
            };

            // 🗑️ 刪除分鏡
            $("#btn_del_clip").onclick = () => {
                const data = getData();
                if (data.scenes.length <= 1) {
                    alert("⚠️ 至少需保留一個分鏡，無法刪除！");
                    return;
                }
                const idx = data.scenes.findIndex(s => s.selected);
                showConfirmModal({
                    title: "🗑️ 刪除分鏡確認",
                    message: `確定要刪除 <strong>分鏡 #${idx}</strong> 嗎？此操作無法撤銷。`,
                    confirmText: "確定刪除",
                    onConfirm: () => {
                        syncActiveInputs(data);
                        data.scenes.splice(idx, 1);
                        data.scenes[Math.min(idx, data.scenes.length - 1)].selected = true;
                        saveData(data, renderUI);
                    }
                });
            };

            $("#btn_left_clip").onclick = () => {
                const data = getData();
                syncActiveInputs(data);
                const idx = data.scenes.findIndex(s => s.selected);
                if (idx > 0 && moveItem(data.scenes, idx, -1)) saveData(data, renderUI);
            };

            $("#btn_right_clip").onclick = () => {
                const data = getData();
                syncActiveInputs(data);
                const idx = data.scenes.findIndex(s => s.selected);
                if (idx !== -1 && idx < data.scenes.length - 1 && moveItem(data.scenes, idx, 1)) saveData(data, renderUI);
            };

            const handleExtractFrame = async (offset, position) => {
                const freshData = getData();
                syncActiveInputs(freshData);

                const curIdx = freshData.scenes.findIndex(s => s.selected);
                if (curIdx === -1) return;

                const targetIdx = curIdx + offset;
                if (targetIdx < 0 || targetIdx >= freshData.scenes.length) {
                    alert(offset < 0 ? "⚠️ 當前已經是第一個分鏡，沒有上一分鏡！" : "⚠️ 當前已經是最後一個分鏡，沒有下一分鏡！");
                    return;
                }

                const targetScene = freshData.scenes[targetIdx];
                const videos = targetScene.videos || (targetScene.video ? [targetScene.video] : []);
                const selIdx = targetScene.selected_video_idx ?? 0;
                const videoObj = videos[selIdx] || targetScene.video;

                if (!videoObj) {
                    alert(`⚠️ 分鏡 #${targetIdx} 尚未設定或選擇影片，無法擷取畫面！`);
                    return;
                }

                const extractedImg = await ApiService.extractFrame(videoObj, position);
                if (extractedImg) {
                    const active = getActiveScene(freshData.scenes);
                    if (active) {
                        active.images = active.images || [];
                        active.images.push(extractedImg);
                        active.selected_img_idx = active.images.length - 1;
                        saveData(freshData, renderUI);
                    }
                }
            };

            $("#btn_add_prev_last").onclick = () => handleExtractFrame(-1, "last");
            $("#btn_add_next_first").onclick = () => handleExtractFrame(1, "first");

            const setupAssetControls = (type, btnAdd, btnDel, btnLeft, btnRight, fileInput) => {
                const key = type === "img" ? "images" : "audios";
                const selKey = type === "img" ? "selected_img_idx" : "selected_audio_idx";

                $(btnAdd).onclick = () => fileInput.click();
                fileInput.onchange = async () => {
                    if (fileInput.files.length > 0) {
                        const uploaded = await ApiService.uploadFile(fileInput.files[0], type);
                        if (uploaded) {
                            const data = getData();
                            const active = getActiveScene(data.scenes);
                            if (active) {
                                active[key].push(uploaded);
                                active[selKey] = active[key].length - 1;
                                saveData(data, renderUI);
                            }
                        }
                        fileInput.value = "";
                    }
                };

                $(btnDel).onclick = () => {
                    const data = getData();
                    const active = getActiveScene(data.scenes);
                    if (active && active[key].length > 0) {
                        const idx = active[selKey] || 0;
                        const label = type === "img" ? "參考圖片" : "參考音訊";
                        showConfirmModal({
                            title: `🗑️ 刪除${label}確認`,
                            message: `確定要移除當前選取的<strong>${label} #${idx}</strong> 嗎？`,
                            onConfirm: () => {
                                active[key].splice(idx, 1);
                                active[selKey] = Math.max(0, idx - 1);
                                saveData(data, renderUI);
                            }
                        });
                    }
                };

                $(btnLeft).onclick = () => {
                    const data = getData();
                    const active = getActiveScene(data.scenes);
                    if (active && active[key].length > 1) {
                        const idx = active[selKey] || 0;
                        if (moveItem(active[key], idx, -1)) { active[selKey] = idx - 1; saveData(data, renderUI); }
                    }
                };

                $(btnRight).onclick = () => {
                    const data = getData();
                    const active = getActiveScene(data.scenes);
                    if (active && active[key].length > 1) {
                        const idx = active[selKey] || 0;
                        if (moveItem(active[key], idx, 1)) { active[selKey] = idx + 1; saveData(data, renderUI); }
                    }
                };
            };

            setupAssetControls("img", "#btn_add_img", "#btn_del_img", "#btn_left_img", "#btn_right_img", els.fileImg);
            setupAssetControls("audio", "#btn_add_audio", "#btn_del_audio", "#btn_left_audio", "#btn_right_audio", els.fileAudio);

            let data = getData();
            if (data.scenes.length === 0) {
                data.scenes = [{ duration: 5.0, prompt: "", videos: [], selected_video_idx: 0, video: null, images: [], audios: [], dict_params: {}, selected: true }];
            }
            saveData(data);

            const onConfigure = this.onConfigure;
            this.onConfigure = function () {
                if (onConfigure) onConfigure.apply(this, arguments);
                node._scenesCache = null;
                renderUI();
            };

            renderUI();
            node.setSize([500, 500]);
        };
    }
});