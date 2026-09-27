import { app } from "../../scripts/app.js";

// ============================================================================
// 1. Vue DOM Grid Fix
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

    async saveFile(filePath, content, encoding = "auto", overwrite = true) {
        try {
            const resp = await fetch("/likej/save_file_content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: filePath, content, encoding, overwrite })
            });
            return await resp.json();
        } catch (err) {
            console.error("[LikeJ] Failed to save file:", err);
            return { success: false, error: err.message };
        }
    },

    async deleteFile(filePath) {
        try {
            const resp = await fetch("/likej/delete_file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: filePath })
            });
            return await resp.json();
        } catch (err) {
            console.error("[LikeJ] Failed to delete file:", err);
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

// Helper function to extract filename from path
function getFileNameFromPath(path) {
    if (!path) return "";
    const norm = path.replace(/\\/g, "/");
    return norm.split("/").pop();
}

// Helper function to show Save Modal Dialog
function showSaveModal({ currentPath, existingFiles, onConfirm }) {
    const currentFileName = getFileNameFromPath(currentPath);

    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.6); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        font-family: sans-serif; font-size: 13px; color: #eee;
    `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
        background: #222; border: 1px solid #444; border-radius: 8px;
        padding: 16px; width: 360px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        display: flex; flex-direction: column; gap: 12px;
    `;

    dialog.innerHTML = `
        <div style="font-weight: bold; font-size: 15px; border-bottom: 1px solid #333; padding-bottom: 6px;">💾 Save File Options</div>
        
        <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; color: #aaa;">Select existing file in directory:</label>
            <select id="likej-modal-select" style="background: #333; color: #fff; border: 1px solid #555; padding: 4px; border-radius: 4px; outline: none;"></select>
        </div>

        <div style="text-align: center; color: #777; font-size: 11px;">— OR ENTER NEW FILENAME —</div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; color: #aaa;">Target Filename / Relative Path:</label>
            <input type="text" id="likej-modal-input" style="background: #333; color: #fff; border: 1px solid #555; padding: 6px; border-radius: 4px; outline: none;" value="${currentFileName || "new_file.txt"}" />
        </div>

        <div style="display: flex; align-items: center; gap: 6px;">
            <input type="checkbox" id="likej-modal-overwrite" checked />
            <label for="likej-modal-overwrite" style="font-size: 12px; color: #ccc;">Overwrite if file exists</label>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
            <button id="likej-modal-cancel" style="background: #444; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Cancel</button>
            <button id="likej-modal-confirm" style="background: #2563eb; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">Save</button>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const selectEl = dialog.querySelector("#likej-modal-select");
    const inputEl = dialog.querySelector("#likej-modal-input");
    const overwriteEl = dialog.querySelector("#likej-modal-overwrite");

    // Populate dropdown
    const selectOptions = ["-- Keep Custom Input --", ...(existingFiles || [])];
    selectEl.innerHTML = selectOptions.map(f => `<option value="${f}">${f}</option>`).join("");

    if (existingFiles && existingFiles.includes(currentFileName)) {
        selectEl.value = currentFileName;
    }

    selectEl.onchange = () => {
        if (selectEl.value && !selectEl.value.startsWith("--")) {
            inputEl.value = selectEl.value;
        }
    };

    return new Promise((resolve) => {
        dialog.querySelector("#likej-modal-cancel").onclick = () => {
            document.body.removeChild(overlay);
            resolve(null);
        };

        dialog.querySelector("#likej-modal-confirm").onclick = () => {
            const chosenName = inputEl.value.trim();
            const overwrite = overwriteEl.checked;
            document.body.removeChild(overlay);
            resolve({ fileName: chosenName, overwrite });
        };
    });
}

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

        const fileSelectWidget = node.addWidget("combo", "dir_files", "None", () => { }, {
            values: ["None"]
        });
        fileSelectWidget.serialize = false;

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
                fileSelectWidget.options.values = ["None"];
                fileSelectWidget.value = "None";
                return [];
            }

            const files = await API.listDirFiles(dir);
            if (files && files.length > 0) {
                const newValues = ["None", ...files];
                fileSelectWidget.options.values = newValues;
                if (!newValues.includes(fileSelectWidget.value)) {
                    fileSelectWidget.value = "None";
                }
            } else {
                fileSelectWidget.options.values = ["None", "(No text files found)"];
                if (fileSelectWidget.value !== "None") {
                    fileSelectWidget.value = "None";
                }
            }
            return files || [];
        };

        fileSelectWidget.callback = function (val) {
            if (!val || val === "None" || val.startsWith("(")) return;
            
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
            const currentPath = pathWidget?.value?.trim() || "";
            const dir = dirWidget?.value?.trim() || "";
            const existingFiles = await API.listDirFiles(dir);

            const result = await showSaveModal({ currentPath, existingFiles });
            if (!result || !result.fileName) return;

            let targetPath = result.fileName;

            // If a directory is specified and target is relative, merge them
            if (dir && !targetPath.includes(":") && !targetPath.startsWith("/") && !targetPath.startsWith("\\")) {
                const separator = dir.includes("/") ? "/" : "\\";
                targetPath = dir.endsWith("/") || dir.endsWith("\\")
                    ? `${dir}${result.fileName}`
                    : `${dir}${separator}${result.fileName}`;
            }

            const encoding = encodingWidget?.value || "auto";
            const content = textWidget?.value || "";

            const res = await API.saveFile(targetPath, content, encoding, result.overwrite);
            if (res.success) {
                if (pathWidget) {
                    pathWidget.value = res.path || targetPath;
                }
                await updateDirFilesList();
                alert("✅ File saved successfully!");
            } else {
                alert(`❌ Failed to save file: ${res.error || "Unknown error"}`);
            }
        };

        const handleDelete = async () => {
            const path = pathWidget?.value?.trim();
            if (!path) {
                alert("Please specify a valid file path to delete.");
                return;
            }

            const confirmed = confirm(`⚠️ Are you sure you want to permanently delete this file?\n\n${path}`);
            if (!confirmed) return;

            const res = await API.deleteFile(path);
            if (res.success) {
                alert("🗑️ File deleted successfully!");
                if (pathWidget) pathWidget.value = "";
                if (textWidget) textWidget.value = "";
                await updateDirFilesList();
            } else {
                alert(`❌ Failed to delete file: ${res.error || "Unknown error"}`);
            }
        };

        // 2. Action Buttons Container
        const btnContainer = document.createElement("div");
        btnContainer.id = `likej-btn-container-${node.id}`;
        btnContainer.style.cssText = `
            width: 100%;
            height: 26px;
            display: flex;
            gap: 4px;
            align-items: center;
            box-sizing: border-box;
            overflow: hidden;
            margin: 2px 0;
        `;

        btnContainer.innerHTML = `
            <button type="button" id="likej-upload" style="flex:1; height:24px; line-height:22px; background:#242424; color:#ccc; border:1px solid #3d3d3d; border-radius:4px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:2px; outline:none;">📂 Upload</button>
            <button type="button" id="likej-reload" style="flex:1; height:24px; line-height:22px; background:#242424; color:#ccc; border:1px solid #3d3d3d; border-radius:4px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:2px; outline:none;">🔄 Reload</button>
            <button type="button" id="likej-save" style="flex:1; height:24px; line-height:22px; background:#242424; color:#ccc; border:1px solid #3d3d3d; border-radius:4px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:2px; outline:none;">💾 Save</button>
            <button type="button" id="likej-delete" style="flex:1; height:24px; line-height:22px; background:#242424; color:#e53e3e; border:1px solid #3d3d3d; border-radius:4px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:2px; outline:none;">🗑️ Delete</button>
        `;

        const btns = btnContainer.querySelectorAll("button");
        btns.forEach(btn => {
            btn.onmouseenter = () => { btn.style.background = "#333"; btn.style.borderColor = "#555"; };
            btn.onmouseleave = () => { btn.style.background = "#242424"; btn.style.borderColor = "#3d3d3d"; };
        });

        btnContainer.querySelector("#likej-upload").onclick = () => fileInput.click();
        btnContainer.querySelector("#likej-reload").onclick = () => {
            updateDirFilesList();
            refreshPreview();
        };
        btnContainer.querySelector("#likej-save").onclick = handleSave;
        btnContainer.querySelector("#likej-delete").onclick = handleDelete;

        const btnWidget = node.addDOMWidget("action_buttons", "btnGroup", btnContainer, {});
        btnWidget.serialize = false;

        node.widgets = [
            pathWidget,
            encodingWidget,
            btnWidget,
            textWidget,
            dirWidget,
            fileSelectWidget
        ].filter(Boolean);

        setupAutoFlexFix(node, btnContainer);

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