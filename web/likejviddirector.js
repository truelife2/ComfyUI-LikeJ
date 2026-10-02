import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

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
    async getVideos(type = "output") {
        try {
            const resp = await api.fetchApi(`/likej/list_videos?type=${type}`);
            if (resp.ok) {
                return await resp.json();
            }
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
    }
};

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
                    <button id="btn_open_modal" style="padding: 4px 8px; background: #2d5a88; color: #fff; border: 1px solid #4a82b8; border-radius: 4px; cursor: pointer; font-weight: bold;">⚙️ 設定與全域 Dict (彈窗)</button>
                    <div id="info_bar" style="color: #aaa;">Clips: 0 | Total: 0s</div>
                </div>

                <div id="strip_container" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px;"></div>
                
                <div style="display: flex; gap: 4px;">
                    <button id="btn_manage_videos" style="flex:1; padding:4px; background: #2d5a88; color: #fff; border:none; border-radius:4px; cursor:pointer;">🎬 設定分鏡影片</button>
                    <button id="btn_add_clip" style="flex:1; padding:4px; background:#2d5a88; color:#fff; border:none; border-radius:4px; cursor:pointer;">➕ 新增分鏡</button>
                    <button id="btn_del_clip" style="flex:1; padding:4px; background:#882d2d; color:#fff; border:none; border-radius:4px; cursor:pointer;">🗑️️ 刪除</button>
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
                                <button id="btn_add_img" style="background:#2d5a88; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">➕ 上傳</button>
                                <button id="btn_left_img" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">◀</button>
                                <button id="btn_right_img" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">▶</button>
                                <button id="btn_del_img" style="background:#882d2d; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">🗑️</button>
                            </div>
                        </div>
                        <input id="file_img" type="file" accept="image/*" style="display: none;">
                        <div id="img_list_box" style="display: flex; gap: 6px; overflow-x: auto; padding: 4px 0; min-height: 52px;"></div>
                    </div>

                    <!-- 參考音訊列表 -->
                    <div style="background: #282828; padding: 6px; border-radius: 4px; border: 1px solid #3d3d3d;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span>🎵 參考音訊列表:</span>
                            <div style="display: flex; gap: 2px;">
                                <button id="btn_add_audio" style="background:#2d5a88; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">➕ 上傳</button>
                                <button id="btn_left_audio" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">◀</button>
                                <button id="btn_right_audio" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">▶</button>
                                <button id="btn_del_audio" style="background:#882d2d; color:#fff; border:none; border-radius:3px; padding:2px 5px; cursor:pointer;">🗑️</button>
                            </div>
                        </div>
                        <input id="file_audio" type="file" accept="audio/*" style="display: none;">
                        <div id="audio_list_box" style="display: flex; gap: 6px; overflow-x: auto; padding: 4px 0; min-height: 40px;"></div>
                    </div>

                    <!-- 當前 Clip 的 Dict 覆蓋區 -->
                    <div style="background: #282828; padding: 6px; border-radius: 4px; border: 1px solid #3d3d3d;">
                        <div style="font-weight: bold; margin-bottom: 4px; color: #aaa;">⚙️ 當前 Clip Dict 覆蓋設定:</div>
                        <div id="clip_dict_container" style="display: flex; flex-direction: column; gap: 6px;"></div>
                    </div>
                </div>
            `;

            node.addDOMWidget("scenes_json_dom", "dom", container, {
                getValue() { return node.extra_info?.scenes_json || "{}"; },
                setValue(v) { node.extra_info = node.extra_info || {}; node.extra_info.scenes_json = v; }
            });

            const $ = sel => container.querySelector(sel);
            const els = {
                infoBar: $("#info_bar"),
                btnOpenModal: $("#btn_open_modal"),
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
            new ResizeObserver(savePromptHeight).observe(els.inputPrompt);
            els.inputPrompt.addEventListener("mouseup", savePromptHeight);

            const getActiveScene = scenes => scenes.find(s => s.selected) || scenes[0];

            const getData = () => {
                try {
                    const raw = node.extra_info?.scenes_json || node.properties?.scenes_json;
                    let parsed = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
                    if (Array.isArray(parsed)) parsed = { global_dict: [], scenes: parsed };
                    parsed.global_dict = parsed.global_dict || [];
                    parsed.scenes = parsed.scenes || [];
                    if (parsed.scenes.length > 0 && !parsed.scenes.some(s => s.selected)) {
                        parsed.scenes[0].selected = true;
                    }
                    return parsed;
                } catch (e) {
                    return { global_dict: [], scenes: [] };
                }
            };

            const syncActiveInputs = (data) => {
                const active = getActiveScene(data.scenes);
                if (active) {
                    if (els.inputPrompt) active.prompt = els.inputPrompt.value;
                    if (els.inputDuration) {
                        const val = parseFloat(els.inputDuration.value);
                        active.duration = isNaN(val) ? 3.0 : val;
                    }
                }
            };

            const saveData = (data, renderCb) => {
                const jsonStr = JSON.stringify(data);
                node.extra_info = node.extra_info || {};
                node.properties = node.properties || {};

                node.extra_info.scenes_json = jsonStr;
                node.properties.scenes_json = jsonStr;

                if (renderCb) renderCb();
                node.setDirtyCanvas(true, true);
            };

            // 🎬 影片管理與選用彈窗 Modal 邏輯
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

                const overlay = document.createElement("div");
                overlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(3px);
                    display: flex; align-items: center; justify-content: center;
                    z-index: 10000; font-family: sans-serif; color: #ddd; font-size: 12px;
                `;

                const stopEvent = e => e.stopPropagation();
                overlay.addEventListener("mousedown", stopEvent);
                overlay.addEventListener("pointerdown", stopEvent);
                overlay.addEventListener("wheel", stopEvent);

                const dialog = document.createElement("div");
                dialog.style.cssText = `
                    background: #222; border: 1px solid #444; border-radius: 8px;
                    width: 600px; max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.8); overflow: hidden;
                `;

                dialog.innerHTML = `
                    <div style="padding: 12px 16px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: #1a1a1a;">
                        <span style="font-size: 14px; font-weight: bold; color: #4db8ff;">🎬 分鏡 #${sceneIdx} 獨立影片清單管理</span>
                        <button id="modal_close_btn" style="background: none; border: none; color: #aaa; font-size: 18px; cursor: pointer;">✖</button>
                    </div>
                    <div style="padding: 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px;">
                        
                        <!-- 1. 當前分鏡影片清單 -->
                        <div style="background: #1a1a1a; border: 1px solid #3d3d3d; border-radius: 6px; padding: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-weight: bold; color: #ffca28;">1. 當前分鏡已選影片 (點擊選擇為主要影片)</span>
                                <div style="display: flex; gap: 4px;">
                                    <button id="btn_modal_left" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 8px; cursor:pointer;">◀ 左移</button>
                                    <button id="btn_modal_right" style="background:#444; color:#fff; border:none; border-radius:3px; padding:2px 8px; cursor:pointer;">▶ 右移</button>
                                    <button id="btn_modal_del" style="background:#882d2d; color:#fff; border:none; border-radius:3px; padding:2px 8px; cursor:pointer;">🗑️ 刪除</button>
                                </div>
                            </div>
                            <div id="modal_scene_videos_box" style="display: flex; gap: 8px; overflow-x: auto; padding: 4px 0; min-height: 70px; align-items: center;"></div>
                        </div>

                        <!-- 2. 從伺服器選擇並新增影片 -->
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

                    </div>
                    <div style="padding: 12px 16px; border-top: 1px solid #333; display: flex; justify-content: flex-end; background: #1a1a1a;">
                        <button id="modal_finish_btn" style="background: #28a745; color: #fff; border: none; padding: 6px 20px; border-radius: 4px; cursor: pointer; font-weight: bold;">完成並儲存</button>
                    </div>
                `;

                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                const btnInput = dialog.querySelector("#btn_tab_input");
                const btnOutput = dialog.querySelector("#btn_tab_output");
                const selectFile = dialog.querySelector("#select_video_file");
                const videoPlayer = dialog.querySelector("#modal_video_player");
                const noVideoTip = dialog.querySelector("#modal_no_video_tip");

                // 渲染彈窗上半部：分鏡影片清單
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
                        `;
                        const vUrl = ApiService.getMediaUrl(vidItem);
                        const fname = vidItem.filename || "video";

                        item.innerHTML = `
                            <video src="${vUrl}" autoplay loop muted playsinline style="width: 100%; height: 50px; object-fit: cover; display: block; border-radius: 2px; pointer-events: none; background: #000;"></video>
                            <div style="font-size: 9px; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;" title="${fname}">#${vIdx} ${fname}</div>
                        `;

                        item.onclick = () => {
                            scene.selected_video_idx = vIdx;
                            scene.video = scene.videos[vIdx];
                            renderModalSceneVideos();
                        };
                        container.appendChild(item);
                    });
                };

                // 當前清單控制按鈕事件
                dialog.querySelector("#btn_modal_del").onclick = () => {
                    if (scene.videos.length > 0) {
                        const idx = scene.selected_video_idx || 0;
                        scene.videos.splice(idx, 1);
                        scene.selected_video_idx = Math.max(0, idx - 1);
                        scene.video = scene.videos[scene.selected_video_idx] || null;
                        renderModalSceneVideos();
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
                    if (currentType === "input") {
                        btnInput.style.background = "#2d5a88";
                        btnInput.style.color = "#fff";
                        btnInput.style.borderColor = "#00a2ff";
                        btnOutput.style.background = "#333";
                        btnOutput.style.color = "#ccc";
                        btnOutput.style.borderColor = "#444";
                    } else {
                        btnOutput.style.background = "#2d5a88";
                        btnOutput.style.color = "#fff";
                        btnOutput.style.borderColor = "#00a2ff";
                        btnInput.style.background = "#333";
                        btnInput.style.color = "#ccc";
                        btnInput.style.borderColor = "#444";
                    }
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
                    if (!isNaN(idx) && videoList[idx]) {
                        selectedFileObj = videoList[idx];
                    } else {
                        selectedFileObj = null;
                    }
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

                const closeModalAndSave = () => {
                    const freshData = getData();
                    syncActiveInputs(freshData);
                    if (freshData.scenes[sceneIdx]) {
                        freshData.scenes[sceneIdx].videos = scene.videos;
                        freshData.scenes[sceneIdx].selected_video_idx = scene.selected_video_idx;
                        freshData.scenes[sceneIdx].video = scene.video;
                        saveData(freshData, renderUI);
                    }
                    document.body.removeChild(overlay);
                };

                dialog.querySelector("#modal_close_btn").onclick = closeModalAndSave;
                dialog.querySelector("#modal_finish_btn").onclick = closeModalAndSave;

                renderModalSceneVideos();
                loadVideoList(currentType);
            }

            // 🪟 全域 Dict 開窗彈窗
            els.btnOpenModal.onclick = () => openDictModal();

            function openDictModal() {
                const data = getData();
                syncActiveInputs(data);

                const overlay = document.createElement("div");
                overlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(3px);
                    display: flex; align-items: center; justify-content: center;
                    z-index: 10000; font-family: sans-serif; color: #ddd; font-size: 12px;
                `;

                const stopEvent = e => e.stopPropagation();
                overlay.addEventListener("mousedown", stopEvent);
                overlay.addEventListener("pointerdown", stopEvent);
                overlay.addEventListener("wheel", stopEvent);

                const dialog = document.createElement("div");
                dialog.style.cssText = `
                    background: #222; border: 1px solid #444; border-radius: 8px;
                    width: 620px; max-width: 90vw; max-height: 80vh;
                    display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.8);
                `;

                dialog.innerHTML = `
                    <div style="padding: 12px 16px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: #1a1a1a;">
                        <span style="font-size: 14px; font-weight: bold; color: #4db8ff;">⚙️ 全域 Dict 參數範本設定 (開窗視窗)</span>
                        <button id="modal_close_btn" style="background: none; border: none; color: #aaa; font-size: 18px; cursor: pointer;">✖</button>
                    </div>
                    <div style="padding: 12px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px;" id="modal_list_container"></div>
                    <div style="padding: 12px; border-top: 1px solid #333; display: flex; justify-content: space-between; background: #1a1a1a;">
                        <button id="modal_add_key_btn" style="background: #2d5a88; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">➕ 新增 Key</button>
                        <button id="modal_save_btn" style="background: #28a745; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">儲存並關閉</button>
                    </div>
                `;

                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

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

                        row.querySelector('[data-field="key"]').oninput = (e) => { gItem.key = e.target.value; };
                        row.querySelector('[data-field="type"]').onchange = (e) => { gItem.type = e.target.value; renderModalList(); };
                        row.querySelector('[data-field="default"]').oninput = (e) => { gItem.default = e.target.value; };
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

                const saveAndCloseModal = () => {
                    const errorMsg = validateGlobalDict();
                    if (errorMsg) {
                        alert(`⚠️ 設定資料無效，無法儲存：\n\n${errorMsg}`);
                        return;
                    }
                    saveData(data, renderUI);
                    document.body.removeChild(overlay);
                };

                dialog.querySelector("#modal_close_btn").onclick = () => document.body.removeChild(overlay);
                dialog.querySelector("#modal_save_btn").onclick = saveAndCloseModal;
                renderModalList();
            }

            function renderUI() {
                if (node.properties?.prompt_height) {
                    els.inputPrompt.style.height = node.properties.prompt_height;
                }

                const data = getData();
                const list = data.scenes;
                const totalDur = list.reduce((sum, s) => sum + (parseFloat(s.duration) || 0), 0);
                els.infoBar.innerText = `Clips: ${list.length} | 總時長: ${totalDur.toFixed(1)}s`;

                // 1. 渲染頂部分鏡卡 (直接嵌入影片縮圖與預覽)
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

                    let previewHtml = "";
                    if (vidUrl) {
                        previewHtml = `<video src="${vidUrl}" autoplay loop muted playsinline style="width: 100%; height: 50px; object-fit: cover; border-radius: 4px; pointer-events: none; background: #000;"></video>`;
                    } else {
                        previewHtml = `<div style="width: 100%; height: 50px; background: #181818; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 10px; border: 1px dashed #444;">無影片</div>`;
                    }

                    card.innerHTML = `
                        <div style="font-weight: bold; color: ${isActive ? "#fff" : "#ccc"}; font-size: 11px;">#${idx} (${s.duration || 0}s)</div>
                        ${previewHtml}
                        <div style="font-size: 9px; opacity: 0.85; color: #ddd; margin-top: 1px;">🎬${s.videos.length} 🖼️${(s.images || []).length} 🎵${(s.audios || []).length}</div>
                    `;

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

                els.inputDuration.value = activeScene.duration ?? 3.0;
                els.inputPrompt.value = activeScene.prompt ?? "";

                // 3. 渲染 Dict 設定
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

                // 4. 媒體資源列表渲染 (圖片與音訊)
                els.imgListBox.innerHTML = activeScene.images.length === 0 ? `<span style="font-size:10px; color:#777; align-self:center;">暫無參考圖</span>` : "";
                activeScene.images.forEach((imgItem, iIdx) => {
                    const isSel = iIdx === (activeScene.selected_img_idx || 0);
                    const item = document.createElement("div");
                    item.style.cssText = `flex: 0 0 auto; padding: 2px; border: 2px solid ${isSel ? "#00a2ff" : "#444"}; border-radius: 4px; cursor: pointer; background: #151515;`;
                    item.innerHTML = `<img src="${ApiService.getMediaUrl(imgItem)}" style="width: 48px; height: 48px; object-fit: cover; display: block; border-radius: 2px;">`;

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

                els.audioListBox.innerHTML = activeScene.audios.length === 0 ? `<span style="font-size:10px; color:#777; align-self:center;">暫無參考音訊</span>` : "";
                activeScene.audios.forEach((audioItem, aIdx) => {
                    const isSel = aIdx === (activeScene.selected_audio_idx || 0);
                    const item = document.createElement("div");
                    item.style.cssText = `flex: 0 0 auto; display: flex; flex-direction: column; gap: 3px; padding: 4px; border: 1px solid ${isSel ? "#00a2ff" : "#444"}; background: ${isSel ? "#004477" : "#1f1f1f"}; border-radius: 4px; cursor: pointer;`;
                    const fileNameStr = typeof audioItem === "object" ? audioItem.name : audioItem;
                    item.innerHTML = `<div style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px;" title="${fileNameStr}">#${aIdx} ${fileNameStr}</div><audio src="${ApiService.getMediaUrl(audioItem)}" controls style="width: 140px; height: 26px;"></audio>`;

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

            els.inputDuration.oninput = els.inputDuration.onchange = () => {
                const data = getData();
                const active = getActiveScene(data.scenes);
                if (active) {
                    let val = parseFloat(els.inputDuration.value);
                    active.duration = isNaN(val) ? 3.0 : val;
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

            $("#btn_del_clip").onclick = () => {
                const data = getData();
                if (data.scenes.length <= 1) return;
                syncActiveInputs(data);
                const idx = data.scenes.findIndex(s => s.selected);
                data.scenes.splice(idx, 1);
                data.scenes[Math.min(idx, data.scenes.length - 1)].selected = true;
                saveData(data, renderUI);
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
                        active[key].splice(idx, 1);
                        active[selKey] = Math.max(0, idx - 1);
                        saveData(data, renderUI);
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
                data.scenes = [{ duration: 3.0, prompt: "", videos: [], selected_video_idx: 0, video: null, images: [], audios: [], dict_params: {}, selected: true }];
            }
            saveData(data);

            const onConfigure = this.onConfigure;
            this.onConfigure = function () {
                if (onConfigure) onConfigure.apply(this, arguments);
                renderUI();
            };

            renderUI();
            node.setSize([380, 560]);
        };
    }
});