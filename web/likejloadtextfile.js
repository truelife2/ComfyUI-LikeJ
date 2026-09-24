import { app } from "../../scripts/app.js";

// ============================================================================
// 1. Vue DOM Grid Fix (自動將 text 設為 auto 伸縮，其餘設為 min-content)
// ============================================================================
function setupAutoFlexFix(node, btnContainer) {
    requestAnimationFrame(() => {
        const widgetsEl = document.querySelector(`[data-widgets-grid-node-id="${node.id}"]`);
        if (!widgetsEl || widgetsEl.dataset.autoFixBound) return;

        widgetsEl.dataset.autoFixBound = "true";

        fix();

        const observer = new MutationObserver(() => {
            fix();
        });
        observer.observe(widgetsEl, {
            attributes: true,
            attributeFilter: ["style"]
        });

        function fix() {
            if (!node.widgets) return;

            const textIdx = node.widgets.findIndex(w => w.name === "text");

            const rowsPattern = node.widgets.map((w, idx) => {
                return idx === textIdx ? "auto" : "min-content";
            }).join(" ");

            widgetsEl.style.setProperty("grid-template-rows", rowsPattern, "important");
        }
    });
}

// ============================================================================
// 2. API Helper Utility
// ============================================================================
const API = {
    async readFile(filePath, encoding = "auto") {
        if (!filePath?.trim()) return "";
        try {
            const resp = await fetch("/likej/read_file_content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: filePath, encoding })
            });
            if (!resp.ok) return "";
            const data = await resp.json();
            return data.content || "";
        } catch (err) {
            console.error("[LikeJ] Failed to read file:", err);
            return "";
        }
    },

    async saveFile(filePath, content, encoding = "auto") {
        try {
            const resp = await fetch("/likej/save_file_content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: filePath, content, encoding })
            });
            return await resp.json();
        } catch (err) {
            console.error("[LikeJ] Failed to save file:", err);
            return { success: false, error: err.message };
        }
    },

    async listDirFiles(directory) {
        if (!directory?.trim()) return [];
        try {
            const resp = await fetch("/likej/list_dir_files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ directory })
            });
            if (!resp.ok) return [];
            const data = await resp.json();
            return data.files || [];
        } catch (err) {
            console.error("[LikeJ] Failed to list directory files:", err);
            return [];
        }
    },

    async uploadFile(file) {
        const body = new FormData();
        body.append("image", file);
        body.append("overwrite", "true");
        const resp = await fetch("/upload/image", { method: "POST", body });
        if (!resp.ok) throw new Error(resp.statusText);
        return await resp.json();
    }
};

// ============================================================================
// 3. ComfyUI Extension Definition
// ============================================================================
app.registerExtension({
    name: "LikeJ.LoadTextFile",
    async nodeCreated(node) {
        if (node.comfyClass !== "LikeJLoadTextFile") return;

        const pathWidget = node.widgets?.find(w => w.name === "path");
        const encodingWidget = node.widgets?.find(w => w.name === "encoding");
        const textWidget = node.widgets?.find(w => w.name === "text");
        const dirWidget = node.widgets?.find(w => w.name === "directory");

        if (textWidget && textWidget.inputEl) {
            textWidget.inputEl.placeholder = "Text content preview / edit...";
        }

        // 1. 動態下拉選單 (dir_files)
        const fileSelectWidget = node.addWidget("combo", "dir_files", "", () => { }, {
            values: ["(Select file from directory)"]
        });

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".txt,.json,.csv,.md,.log,.yaml,.yml,.prompt,text/*,*/*";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);

        const refreshPreview = async () => {
            const path = pathWidget?.value || "";
            const encoding = encodingWidget?.value || "auto";
            const content = await API.readFile(path, encoding);
            if (textWidget) {
                textWidget.value = content;
            }
        };

        const updateDirFilesList = async () => {
            const dir = dirWidget?.value?.trim();
            if (!dir) {
                fileSelectWidget.options.values = ["(Select file from directory)"];
                fileSelectWidget.value = "(Select file from directory)";
                return;
            }

            const files = await API.listDirFiles(dir);
            if (files && files.length > 0) {
                fileSelectWidget.options.values = files;
                if (!files.includes(fileSelectWidget.value)) {
                    fileSelectWidget.value = files[0];
                }
            } else {
                fileSelectWidget.options.values = ["(No text files found)"];
                fileSelectWidget.value = "(No text files found)";
            }
        };

        fileSelectWidget.callback = function (val) {
            if (!val || val.startsWith("(")) return;
            const dir = dirWidget?.value?.trim() || "";
            if (dir) {
                const separator = dir.includes("/") ? "/" : "\\";
                const fullPath = dir.endsWith("/") || dir.endsWith("\\")
                    ? `${dir}${val}`
                    : `${dir}${separator}${val}`;
                if (pathWidget) {
                    pathWidget.value = fullPath;
                    refreshPreview();
                }
            }
        };

        const handleSave = async () => {
            const path = pathWidget?.value?.trim();
            if (!path) {
                alert("Please enter or upload a valid file path first!");
                return;
            }

            const confirmed = confirm(`⚠️ Are you sure you want to overwrite the content of this file?\n\n${path}`);
            if (!confirmed) return;

            const encoding = encodingWidget?.value || "auto";
            const content = textWidget?.value || "";

            const res = await API.saveFile(path, content, encoding);
            if (res.success) {
                alert("✅ File saved successfully!");
            } else {
                alert(`❌ Failed to save file: ${res.error || "Unknown error"}`);
            }
        };

        // 2. 操作按鈕容器 (action_buttons)
        const btnContainer = document.createElement("div");
        btnContainer.id = `likej-btn-container-${node.id}`;
        btnContainer.style.cssText = `
            width: 100%;
            height: 26px;
            display: flex;
            gap: 6px;
            align-items: center;
            box-sizing: border-box;
            overflow: hidden;
            margin: 2px 0;
        `;

        btnContainer.innerHTML = `
            <button type="button" id="likej-upload" style="flex:1; height:24px; line-height:22px; background:#242424; color:#ccc; border:1px solid #3d3d3d; border-radius:4px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px; outline:none;">📂 Upload</button>
            <button type="button" id="likej-reload" style="flex:1; height:24px; line-height:22px; background:#242424; color:#ccc; border:1px solid #3d3d3d; border-radius:4px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px; outline:none;">🔄 Reload</button>
            <button type="button" id="likej-save" style="flex:1; height:24px; line-height:22px; background:#242424; color:#ccc; border:1px solid #3d3d3d; border-radius:4px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px; outline:none;">💾 Save</button>
        `;

        const btns = btnContainer.querySelectorAll("button");
        btns.forEach(btn => {
            btn.onmouseenter = () => { btn.style.background = "#333"; btn.style.borderColor = "#555"; btn.style.color = "#fff"; };
            btn.onmouseleave = () => { btn.style.background = "#242424"; btn.style.borderColor = "#3d3d3d"; btn.style.color = "#ccc"; };
        });

        btnContainer.querySelector("#likej-upload").onclick = () => fileInput.click();
        btnContainer.querySelector("#likej-reload").onclick = () => {
            updateDirFilesList();
            refreshPreview();
        };
        btnContainer.querySelector("#likej-save").onclick = handleSave;

        const btnWidget = node.addDOMWidget("action_buttons", "btnGroup", btnContainer, {
            getValue() { return ""; },
            setValue() { }
        });

        btnWidget.computeSize = () => [node.size ? node.size[0] : 300, 26];
        btnWidget.options = { serialize: false };

        // 最終組合順序
        node.widgets = [
            pathWidget,          // 1. 路徑
            encodingWidget,      // 2. 編碼
            btnWidget,           // 3. 按鈕群組
            textWidget,          // 4. 文字框 (auto 伸展)
            dirWidget,           // 5. 目錄
            fileSelectWidget     // 6. 目錄檔案下拉選單
        ].filter(Boolean);

        setupAutoFlexFix(node, btnContainer);

        // 綁定路徑改變時自動載入
        if (pathWidget) {
            const origCb = pathWidget.callback;
            pathWidget.callback = function (val) {
                if (origCb) origCb.apply(this, arguments);
                refreshPreview();
            };
        }

        if (dirWidget) {
            const origDirCb = dirWidget.callback;
            dirWidget.callback = function (val) {
                if (origDirCb) origDirCb.apply(this, arguments);
                updateDirFilesList();
            };
        }

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function () {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            updateDirFilesList();
        };

        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const data = await API.uploadFile(file);
                if (pathWidget) {
                    pathWidget.value = data.name;
                    if (pathWidget.callback) pathWidget.callback(data.name);
                }
                refreshPreview();
                app.graph.setDirtyCanvas(true, true);
            } catch (err) {
                alert("File upload failed: " + err.message);
            } finally {
                fileInput.value = "";
            }
        });

        const origOnRemoved = node.onRemoved;
        node.onRemoved = function () {
            if (fileInput?.parentElement) {
                fileInput.parentElement.removeChild(fileInput);
            }
            if (origOnRemoved) origOnRemoved.apply(this, arguments);
        };
    }
});