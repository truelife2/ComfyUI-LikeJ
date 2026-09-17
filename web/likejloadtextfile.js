import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

// ============================================================================
// 1. Vue DOM Grid Fix (Single execution without MutationObserver)
// ============================================================================
function setupAutoFlexFix(node) {
    requestAnimationFrame(() => {
        const widgetsEl = document.querySelector(`[data-widgets-grid-node-id="${node.id}"]`);
        if (!widgetsEl) return;

        // Lock button row to min-content so it doesn't stretch like row 4
        widgetsEl.style.setProperty(
            "grid-template-rows",
            "min-content min-content min-content 1fr",
            "important"
        );
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

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".txt,.json,.csv,.md,.log,.yaml,.yml,.prompt,text/*,*/*";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);

        // Native multiline preview widget
        let previewWidget = node.widgets?.find(w => w.name === "preview");
        if (!previewWidget) {
            previewWidget = ComfyWidgets["STRING"](
                node,
                "preview",
                ["STRING", { multiline: true }],
                app
            ).widget;

            if (previewWidget.inputEl) {
                previewWidget.inputEl.readOnly = false;
                previewWidget.inputEl.placeholder = "Text content preview / edit...";
            }

            previewWidget.serializeValue = async () => undefined;
            if (!previewWidget.options) previewWidget.options = {};
            previewWidget.options.serialize = false;
        }

        const refreshPreview = async () => {
            const path = pathWidget?.value || "";
            const encoding = encodingWidget?.value || "auto";
            previewWidget.value = await API.readFile(path, encoding);
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
            const content = previewWidget.value || "";

            const res = await API.saveFile(path, content, encoding);
            if (res.success) {
                alert("✅ File saved successfully!");
            } else {
                alert(`❌ Failed to save file: ${res.error || "Unknown error"}`);
            }
        };

        // Action button container
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
        btnContainer.querySelector("#likej-reload").onclick = refreshPreview;
        btnContainer.querySelector("#likej-save").onclick = handleSave;

        const btnWidget = node.addDOMWidget("action_buttons", "btnGroup", btnContainer, {
            getValue() { return ""; },
            setValue() {}
        });

        btnWidget.computeSize = () => [node.size ? node.size[0] : 300, 26];
        btnWidget.options = { serialize: false };

        if (encodingWidget) {
            const encIdx = node.widgets.indexOf(encodingWidget);
            const btnIdx = node.widgets.indexOf(btnWidget);
            if (encIdx !== -1 && btnIdx !== -1) {
                node.widgets.splice(btnIdx, 1);
                node.widgets.splice(encIdx + 1, 0, btnWidget);
            }
        }

        // Apply grid track fix once upon creation
        setupAutoFlexFix(node);

        if (pathWidget) {
            const origCb = pathWidget.callback;
            pathWidget.callback = function (val) {
                if (origCb) origCb.apply(this, arguments);
                refreshPreview();
            };
        }

        if (encodingWidget) {
            const origEncCb = encodingWidget.callback;
            encodingWidget.callback = function (val) {
                if (origEncCb) origEncCb.apply(this, arguments);
                refreshPreview();
            };
        }

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function () {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            setupAutoFlexFix(node);
            refreshPreview();
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
                app.graph.setDirtyCanvas(true, true);
            } catch (err) {
                alert("File upload failed: " + err.message);
            } finally {
                fileInput.value = "";
            }
        });

        const origOnExecuted = node.onExecuted;
        node.onExecuted = function (message) {
            if (origOnExecuted) origOnExecuted.apply(this, arguments);
            if (message?.text && message.text[0] !== undefined) {
                previewWidget.value = message.text[0];
            }
        };

        const origOnRemoved = node.onRemoved;
        node.onRemoved = function () {
            if (fileInput?.parentElement) {
                fileInput.parentElement.removeChild(fileInput);
            }
            if (origOnRemoved) origOnRemoved.apply(this, arguments);
        };
    }
});