import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const ApiService = {
    async uploadFile(file, type = "image") {
        if (!file) return null;
        const formData = new FormData();
        formData.append("image", file); // ComfyUI 通用上傳端點均使用 "image" 欄位名
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
    getMediaUrl(fileObj) {
        if (!fileObj) return "";
        const filename = typeof fileObj === "string" ? fileObj : (fileObj.name || "");
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

            let targetWidget = node.widgets?.find(w => w.name === "scenes_json");

            const container = document.createElement("div");
            container.style.cssText = `
                display: flex; flex-direction: column; gap: 8px;
                background: #1e1e1e; padding: 10px; border-radius: 8px;
                border: 1px solid #333; color: #ddd; font-family: sans-serif;
                box-sizing: border-box; width: 100%; font-size: 11px;
            `;

            container.innerHTML = `
                <div id="info_bar" style="color: #aaa; text-align: right;">Segments: 0 | Total: 0s</div>
                <div id="strip_container" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px;"></div>
                <div style="display: flex; gap: 4px;">
                    <button id="btn_add_clip" style="flex:1; padding:4px; background:#2d5a88; color:#fff; border:none; border-radius:4px; cursor:pointer;">➕ 新增分鏡</button>
                    <button id="btn_del_clip" style="flex:1; padding:4px; background:#882d2d; color:#fff; border:none; border-radius:4px; cursor:pointer;">🗑️ 刪除</button>
                    <button id="btn_left_clip" style="flex:1; padding:4px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer;">◀ 左移</button>
                    <button id="btn_right_clip" style="flex:1; padding:4px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer;">▶ 右移</button>
                </div>
                <hr style="border:0; border-top:1px solid #333; margin:2px 0;">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="display: flex; justify-content: space-between; align-items: center;">
                        <span>⏱️ 片段時長 (秒):</span>
                        <input id="input_duration" type="number" step="0.1" min="0.5" style="width: 70px; background:#222; color:#fff; border:1px solid #444; border-radius:3px; padding:2px 4px;">                    </label>
                    <div>
                        <span style="display: block; margin-bottom: 2px;">📝 Prompt (提示詞):</span>
                        <textarea id="input_prompt" style="width: 100%; background:#222; color:#fff; border:1px solid #444; border-radius:3px; resize:vertical; box-sizing: border-box; min-height: 45px;"></textarea>
                    </div>
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
                    <div>
                        <span style="display: block; margin-bottom: 2px;">⚙️ Dict 自訂參數 (JSON 格式):</span>
                        <textarea id="input_dict" rows="2" style="width: 100%; background:#222; color:#fff; border:1px solid #444; border-radius:3px; resize:vertical; box-sizing: border-box;"></textarea>
                    </div>
                </div>
            `;

            if (targetWidget) {
                targetWidget.type = "dom";
                targetWidget.element = container;
                targetWidget.draw = function () { };
                targetWidget.computeSize = function () { return [360, 580]; };
            } else if (node.addDOMWidget) {
                targetWidget = node.addDOMWidget("scenes_json", "dom", container, {
                    getValue() { return node.properties?.scenes_json || "[]"; },
                    setValue(v) { node.properties = node.properties || {}; node.properties.scenes_json = v; }
                });
            }

            const $ = sel => container.querySelector(sel);
            const els = {
                infoBar: $("#info_bar"),
                stripContainer: $("#strip_container"),
                inputDuration: $("#input_duration"),
                inputPrompt: $("#input_prompt"),
                inputDict: $("#input_dict"),
                imgListBox: $("#img_list_box"),
                fileImg: $("#file_img"),
                audioListBox: $("#audio_list_box"),
                fileAudio: $("#file_audio")
            };

            const getScenes = () => {
                try {
                    const raw = targetWidget?.value || node.properties?.scenes_json || node.extra_info?.scenes_json;
                    const list = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
                    if (Array.isArray(list) && list.length > 0 && !list.some(s => s.selected)) {
                        list[0].selected = true;
                    }
                    return Array.isArray(list) ? list : [];
                } catch (e) {
                    return [];
                }
            };

            const saveScenes = (scenes, renderCb) => {
                const jsonStr = JSON.stringify(scenes);
                node.extra_info = node.extra_info || {};
                node.properties = node.properties || {};

                node.extra_info.scenes_json = jsonStr;
                node.properties.scenes_json = jsonStr;

                if (targetWidget) {
                    targetWidget.value = jsonStr;
                }

                if (renderCb) renderCb();
                node.setDirtyCanvas(true, true);
            };

            const getActiveScene = list => list.find(s => s.selected) || list[0];

            function renderUI() {
                const list = getScenes();
                const totalDur = list.reduce((sum, s) => sum + (parseFloat(s.duration) || 0), 0);
                els.infoBar.innerText = `Clips: ${list.length} | 總時長: ${totalDur.toFixed(1)}s`;

                els.stripContainer.innerHTML = "";
                list.forEach((s, idx) => {
                    const card = document.createElement("div");
                    const isActive = !!s.selected;
                    card.style.cssText = `flex: 0 0 auto; padding: 6px 10px; background: ${isActive ? "#007acc" : "#2d2d2d"}; border: 2px solid ${isActive ? "#00a2ff" : "#444"}; border-radius: 6px; cursor: pointer; text-align: center; user-select: none;`;
                    card.innerHTML = `<div style="font-weight: bold; color: ${isActive ? "#fff" : "#ccc"};">#${idx}</div><div style="font-size: 10px; opacity: 0.8; margin-top: 2px;">${s.duration || 0}s | 🖼️${(s.images || []).length} 🎵${(s.audios || []).length}</div>`;
                    card.onclick = () => {
                        list.forEach(item => item.selected = false);
                        s.selected = true;
                        saveScenes(list, renderUI);
                    };
                    els.stripContainer.appendChild(card);
                });

                const activeScene = getActiveScene(list);
                if (!activeScene) return;

                activeScene.images = activeScene.images || [];
                activeScene.audios = activeScene.audios || [];

                els.inputDuration.value = activeScene.duration ?? 3.0;
                els.inputPrompt.value = activeScene.prompt ?? "";
                els.inputDict.value = typeof activeScene.dict_params === "string" ? activeScene.dict_params : JSON.stringify(activeScene.dict_params || {});

                {
                    const savePromptHeight = () => {
                        const h = els.inputPrompt.style.height;
                        if (h && h !== node.properties.prompt_height) {
                            node.properties.prompt_height = h;
                            node.setDirtyCanvas(true, true);
                        }
                    };
                    new ResizeObserver(savePromptHeight).observe(els.inputPrompt);
                    els.inputPrompt.addEventListener("mouseup", savePromptHeight);

                    const savedHeight = node.properties?.prompt_height;
                    if (savedHeight) els.inputPrompt.style.height = savedHeight;
                }

                els.imgListBox.innerHTML = activeScene.images.length === 0 ? `<span style="font-size:10px; color:#777; align-self:center;">暫無參考圖</span>` : "";
                activeScene.images.forEach((imgItem, iIdx) => {
                    const isSel = iIdx === (activeScene.selected_img_idx || 0);
                    const item = document.createElement("div");
                    item.style.cssText = `flex: 0 0 auto; padding: 2px; border: 2px solid ${isSel ? "#00a2ff" : "#444"}; border-radius: 4px; cursor: pointer; background: #151515;`;
                    item.innerHTML = `<img src="${ApiService.getMediaUrl(imgItem)}" style="width: 48px; height: 48px; object-fit: cover; display: block; border-radius: 2px;">`;
                    item.onclick = () => {
                        activeScene.selected_img_idx = iIdx;
                        saveScenes(list, renderUI);
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
                        activeScene.selected_audio_idx = aIdx;
                        saveScenes(list, renderUI);
                    };
                    els.audioListBox.appendChild(item);
                });
            }

            const updateActiveField = (key, val) => {
                const list = getScenes();
                const active = getActiveScene(list);
                if (active) {
                    active[key] = val;
                    saveScenes(list);
                }
            };

            els.inputDuration.oninput = () => {
                const list = getScenes();
                const active = getActiveScene(list);
                if (active) {
                    let val = parseFloat(els.inputDuration.value);
                    if (isNaN(val)) val = 5.0;
                    active.duration = val;
                    saveScenes(list, renderUI);
                }
            };
            els.inputPrompt.oninput = () => updateActiveField("prompt", els.inputPrompt.value);
            els.inputDict.oninput = () => updateActiveField("dict_params", els.inputDict.value);

            $("#btn_add_clip").onclick = () => {
                const list = getScenes();
                list.forEach(s => s.selected = false);
                list.push({ duration: 5.0, prompt: "", images: [], audios: [], dict_params: "{}", selected: true });
                saveScenes(list, renderUI);
            };
            $("#btn_del_clip").onclick = () => {
                const list = getScenes();
                if (list.length <= 1) return;
                const idx = list.findIndex(s => s.selected);
                list.splice(idx, 1);
                list[Math.min(idx, list.length - 1)].selected = true;
                saveScenes(list, renderUI);
            };
            $("#btn_left_clip").onclick = () => {
                const list = getScenes();
                const idx = list.findIndex(s => s.selected);
                if (idx > 0 && moveItem(list, idx, -1)) saveScenes(list, renderUI);
            };
            $("#btn_right_clip").onclick = () => {
                const list = getScenes();
                const idx = list.findIndex(s => s.selected);
                if (idx !== -1 && idx < list.length - 1 && moveItem(list, idx, 1)) saveScenes(list, renderUI);
            };

            const setupAssetControls = (type, btnAdd, btnDel, btnLeft, btnRight, fileInput) => {
                const key = type === "img" ? "images" : "audios";
                const selKey = type === "img" ? "selected_img_idx" : "selected_audio_idx";
                $(btnAdd).onclick = () => fileInput.click();
                fileInput.onchange = async () => {
                    if (fileInput.files.length > 0) {
                        const uploaded = await ApiService.uploadFile(fileInput.files[0], type);
                        if (uploaded) {
                            const list = getScenes();
                            const active = getActiveScene(list);
                            if (active) {
                                active[key].push(uploaded);
                                active[selKey] = active[key].length - 1;
                                saveScenes(list, renderUI);
                            }
                        }
                        fileInput.value = "";
                    }
                };
                $(btnDel).onclick = () => {
                    const list = getScenes();
                    const active = getActiveScene(list);
                    if (active && active[key].length > 0) {
                        const idx = active[selKey] || 0;
                        active[key].splice(idx, 1);
                        active[selKey] = Math.max(0, idx - 1);
                        saveScenes(list, renderUI);
                    }
                };
                $(btnLeft).onclick = () => {
                    const list = getScenes();
                    const active = getActiveScene(list);
                    if (active && active[key].length > 1) {
                        const idx = active[selKey] || 0;
                        if (moveItem(active[key], idx, -1)) { active[selKey] = idx - 1; saveScenes(list, renderUI); }
                    }
                };
                $(btnRight).onclick = () => {
                    const list = getScenes();
                    const active = getActiveScene(list);
                    if (active && active[key].length > 1) {
                        const idx = active[selKey] || 0;
                        if (moveItem(active[key], idx, 1)) { active[selKey] = idx + 1; saveScenes(list, renderUI); }
                    }
                };
            };

            setupAssetControls("img", "#btn_add_img", "#btn_del_img", "#btn_left_img", "#btn_right_img", els.fileImg);
            setupAssetControls("audio", "#btn_add_audio", "#btn_del_audio", "#btn_left_audio", "#btn_right_audio", els.fileAudio);

            let scenes = getScenes();
            if (scenes.length === 0) {
                scenes = [{ duration: 3.0, prompt: "", images: [], audios: [], selected_img_idx: 0, selected_audio_idx: 0, dict_params: "{}", selected: true }];
            }
            saveScenes(scenes);

            const onConfigure = this.onConfigure;
            this.onConfigure = function () {
                if (onConfigure) onConfigure.apply(this, arguments);
                renderUI();
            };

            renderUI();
            node.setSize([360, 580]);
        };
    }
});