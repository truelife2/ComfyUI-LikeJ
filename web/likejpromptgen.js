import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "LikeJ.PromptGenerator",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LikeJPromptGenerator") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                const buttonName = "📝 Edit / Manage System Instructions";
                const hasButton = this.widgets?.some(w => w.name === buttonName);
                
                if (!hasButton) {
                    const btn = this.addWidget("button", buttonName, null, () => {
                        showInstructionModal(this);
                    });

                    // 確保按鈕定位在 system_instruction_file 下拉選單的正下方
                    const targetIdx = this.widgets.findIndex(w => w.name === "system_instruction_file");
                    if (targetIdx !== -1) {
                        const btnIdx = this.widgets.indexOf(btn);
                        if (btnIdx !== -1) {
                            this.widgets.splice(btnIdx, 1);
                            this.widgets.splice(targetIdx + 1, 0, btn);
                        }
                    }
                }

                return r;
            };
        }
    }
});

function showInstructionModal(node) {
    const fileWidget = node.widgets.find(w => w.name === "system_instruction_file");
    const availableFiles = fileWidget ? (fileWidget.options?.values || ["None"]) : ["None"];
    let currentFile = fileWidget ? fileWidget.value : availableFiles[0];

    // Overlay 遮罩層
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        zIndex: "10000",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        opacity: "0",
        transition: "opacity 0.2s ease"
    });

    // Dialog 彈出視窗主體
    const dialog = document.createElement("div");
    Object.assign(dialog.style, {
        backgroundColor: "#1e1e1e",
        color: "#e0e0e0",
        padding: "24px",
        borderRadius: "10px",
        width: "640px",
        maxWidth: "90vw",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif",
        transform: "scale(0.95)",
        transition: "transform 0.2s ease"
    });

    const fileOptionsHtml = availableFiles.map(f => 
        `<option value="${f}" ${f === currentFile ? "selected" : ""}>${f}</option>`
    ).join("");

    dialog.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 10px;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 8px;">
                📝 <span>System Instruction Manager</span>
            </h3>
            <span style="font-size: 11px; color: #888; background: #2a2a2a; padding: 2px 8px; border-radius: 12px;">Ctrl+Enter to Save</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 12px; font-weight: 500; color: #aaa;">Select Existing File:</label>
                <select id="likej-file-select" style="background: #2a2a2a; color: #fff; border: 1px solid #444; padding: 8px 10px; border-radius: 6px; outline: none; cursor: pointer;">
                    ${fileOptionsHtml}
                </select>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 12px; font-weight: 500; color: #aaa;">Target Filename (Save / Save As):</label>
                <input type="text" id="likej-filename" value="${currentFile || 'new_instruction.md'}" 
                    style="background: #2a2a2a; color: #fff; border: 1px solid #444; padding: 8px 10px; border-radius: 6px; outline: none;" />
            </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 12px; font-weight: 500; color: #aaa;">Instruction Content:</label>
            <textarea id="likej-content" rows="13" spellcheck="false"
                style="background: #141414; color: #d4d4d4; border: 1px solid #333; padding: 10px; border-radius: 6px; font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; resize: vertical; outline: none;"></textarea>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; border-top: 1px solid #333; padding-top: 14px;">
            <button id="likej-delete" style="background: rgba(217, 83, 79, 0.15); color: #ff6b6b; border: 1px solid rgba(217, 83, 79, 0.3); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all 0.2s;">Delete File</button>
            <div style="display: flex; gap: 10px;">
                <button id="likej-cancel" style="background: #333; color: #ccc; border: 1px solid #444; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Cancel</button>
                <button id="likej-save" style="background: #2563eb; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: background 0.2s;">Save Instruction</button>
            </div>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 平滑進入動畫
    requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        dialog.style.transform = "scale(1)";
    });

    const fileSelect = dialog.querySelector("#likej-file-select");
    const filenameInput = dialog.querySelector("#likej-filename");
    const contentTextarea = dialog.querySelector("#likej-content");

    // 關閉視窗與觸發淡出動畫
    const closeModal = () => {
        overlay.style.opacity = "0";
        dialog.style.transform = "scale(0.95)";
        setTimeout(() => {
            if (overlay.parentNode) document.body.removeChild(overlay);
        }, 200);
    };

    // 讀取檔案
    const loadFileContent = async (filename) => {
        if (!filename || filename === "None") {
            contentTextarea.value = "";
            return;
        }
        try {
            const resp = await api.fetchApi(`/likej/get_instruction?filename=${encodeURIComponent(filename)}`);
            if (resp.ok) {
                const data = await resp.json();
                contentTextarea.value = data.content || "";
            }
        } catch (e) {
            console.error("[LikeJ] Failed to load file:", e);
        }
    };

    loadFileContent(currentFile);

    // 事件控制
    fileSelect.addEventListener("change", (e) => {
        const selected = e.target.value;
        filenameInput.value = selected;
        loadFileContent(selected);
    });

    dialog.querySelector("#likej-cancel").onclick = closeModal;

    // 鍵盤快捷鍵：Esc 關閉、Ctrl+Enter 儲存
    const handleKeyDown = (e) => {
        if (e.key === "Escape") {
            closeModal();
            document.removeEventListener("keydown", handleKeyDown);
        } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            dialog.querySelector("#likej-save").click();
            document.removeEventListener("keydown", handleKeyDown);
        }
    };
    document.addEventListener("keydown", handleKeyDown);

    // 刪除邏輯
    dialog.querySelector("#likej-delete").onclick = async () => {
        const targetFile = fileSelect.value;
        if (!targetFile || targetFile === "None") {
            alert("No file selected to delete.");
            return;
        }

        if (!confirm(`Are you sure you want to delete "${targetFile}"?`)) return;

        try {
            const resp = await api.fetchApi("/likej/delete_instruction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: targetFile })
            });

            if (resp.ok) {
                const resData = await resp.json();
                if (fileWidget) {
                    fileWidget.options.values = resData.files;
                    fileWidget.value = resData.files[0] || "None";
                }
                closeModal();
            } else {
                const err = await resp.json();
                alert("Failed to delete: " + (err.error || "Unknown error"));
            }
        } catch (e) {
            alert("Request failed: " + e);
        }
    };

    // 儲存邏輯
    dialog.querySelector("#likej-save").onclick = async () => {
        const filename = filenameInput.value.trim();
        const content = contentTextarea.value;

        if (!filename) {
            alert("Please enter a valid filename!");
            return;
        }

        try {
            const resp = await api.fetchApi("/likej/save_instruction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename, content })
            });

            if (resp.ok) {
                const resData = await resp.json();
                if (fileWidget) {
                    fileWidget.options.values = resData.files;
                    fileWidget.value = resData.filename;
                }
                closeModal();
            } else {
                const err = await resp.json();
                alert("Failed to save: " + (err.error || "Unknown error"));
            }
        } catch (e) {
            alert("Request failed: " + e);
        }
    };
}