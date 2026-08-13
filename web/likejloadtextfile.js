import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

app.registerExtension({
    name: "LikeJ.LoadTextFile",
    async nodeCreated(node) {
        if (node.comfyClass !== "LikeJLoadTextFile") return;

        // 1. 取得 path 與 encoding 欄位參考
        const pathWidget = node.widgets?.find(w => w.name === "path");
        const encodingWidget = node.widgets?.find(w => w.name === "encoding");

        // 2. 隱藏的網頁原生選檔 input 元素
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".txt,.json,.csv,.md,.log,.yaml,.yml,.prompt,text/*,*/*";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);

        // 3. 建立 ComfyUI 原生 Canvas 按鈕
        const uploadBtn = node.addWidget("button", "📂 Upload File", "upload", () => {
            fileInput.click();
        });

        // 4. 將按鈕位置調整到 encoding 欄位正下方
        if (encodingWidget && uploadBtn) {
            const encIdx = node.widgets.indexOf(encodingWidget);
            const btnIdx = node.widgets.indexOf(uploadBtn);
            if (encIdx !== -1 && btnIdx !== -1 && btnIdx !== encIdx + 1) {
                node.widgets.splice(btnIdx, 1);
                node.widgets.splice(encIdx + 1, 0, uploadBtn);
            }
        }

        // 5. 建立 Preview 預覽框 (不序列化儲存)
        let previewWidget = node.widgets?.find(w => w.name === "preview");
        if (!previewWidget) {
            previewWidget = ComfyWidgets["STRING"](
                node,
                "preview",
                ["STRING", { multiline: true }],
                app
            ).widget;
            
            if (previewWidget.inputEl) {
                previewWidget.inputEl.readOnly = true;
                previewWidget.inputEl.placeholder = "Text content preview...";
                previewWidget.inputEl.style.opacity = "0.85";
                previewWidget.inputEl.style.maxHeight = "200px";
            }

            previewWidget.serializeValue = async () => undefined;
            if (!previewWidget.options) previewWidget.options = {};
            previewWidget.options.serialize = false;
        }

        previewWidget.value = "";

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function () {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            if (previewWidget) previewWidget.value = "";
            if (pathWidget && pathWidget.value) {
                updatePreview(pathWidget.value);
            }
        };

        // 6. 呼叫 Python 後端 API 更新預覽內容
        const updatePreview = async (filePath) => {
            if (!filePath || filePath.trim() === "") {
                previewWidget.value = "";
                return;
            }
            const encoding = encodingWidget ? encodingWidget.value : "auto";

            try {
                const resp = await fetch("/likej/read_file_content", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: filePath, encoding: encoding })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    previewWidget.value = data.content || "";
                } else {
                    previewWidget.value = "";
                }
            } catch (e) {
                console.error("[LikeJLoadTextFile] Failed to preview file:", e);
                previewWidget.value = "";
            }
        };

        // 7. 監聽路徑與編碼選單變更
        if (pathWidget) {
            const origCallback = pathWidget.callback;
            pathWidget.callback = function (val) {
                if (origCallback) origCallback.apply(this, arguments);
                updatePreview(val);
            };
            if (pathWidget.value) {
                updatePreview(pathWidget.value);
            }
        }

        if (encodingWidget) {
            const origEncodingCallback = encodingWidget.callback;
            encodingWidget.callback = function (val) {
                if (origEncodingCallback) origEncodingCallback.apply(this, arguments);
                if (pathWidget && pathWidget.value) {
                    updatePreview(pathWidget.value);
                }
            };
        }

        // 8. 上傳檔案後自動帶入 path 並觸發預覽
        fileInput.addEventListener("change", async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const body = new FormData();
            body.append("image", file);
            body.append("overwrite", "true");

            try {
                const resp = await fetch("/upload/image", {
                    method: "POST",
                    body: body,
                });

                if (resp.ok) {
                    const data = await resp.json();
                    const filename = data.name;

                    if (pathWidget) {
                        pathWidget.value = filename;
                        if (pathWidget.callback) {
                            pathWidget.callback(filename);
                        }
                    }
                    app.graph.setDirtyCanvas(true, true);
                } else {
                    alert("File upload failed: " + resp.statusText);
                }
            } catch (err) {
                console.error("File upload error:", err);
            } finally {
                fileInput.value = "";
            }
        });

        // 9. 節點執行完成後更新預覽
        const origOnExecuted = node.onExecuted;
        node.onExecuted = function (message) {
            if (origOnExecuted) origOnExecuted.apply(this, arguments);
            if (message?.text && message.text[0] !== undefined) {
                previewWidget.value = message.text[0];
            }
        };

        // 清理隱藏的 input 元素
        const origOnRemoved = node.onRemoved;
        node.onRemoved = function () {
            if (fileInput && fileInput.parentElement) {
                fileInput.parentElement.removeChild(fileInput);
            }
            if (origOnRemoved) origOnRemoved.apply(this, arguments);
        };
    }
});