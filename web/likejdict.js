import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LikeJ.Dictionary",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "LikeJDictionary") return;

        const MIN_WIDTH = 480;

        // 確保 extra.kv_data 被正確序列化保存至工作流 JSON
        const originalSerialize = nodeType.prototype.serialize;
        nodeType.prototype.serialize = function (o) {
            if (this.saveData) {
                this.saveData();
            }
            let res = originalSerialize ? originalSerialize.apply(this, arguments) || o : o || {};
            res.extra = res.extra || {};
            if (this.properties && this.properties["kv_data"]) {
                res.extra["kv_data"] = this.properties["kv_data"];
            }
            return res;
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            // 限制最小寬度
            if (this.size) {
                this.size[0] = Math.max(this.size[0], MIN_WIDTH);
            } else {
                this.size = [MIN_WIDTH, 120];
            }

            const onResize = this.onResize;
            this.onResize = function (size) {
                if (onResize) onResize.apply(this, arguments);
                if (size[0] < MIN_WIDTH) {
                    size[0] = MIN_WIDTH;
                }
            };

            this.properties = this.properties || {};
            this.properties["kv_data"] = this.properties["kv_data"] || [];

            let kvData = this.properties["kv_data"];

            this.saveData = () => {
                this.properties["kv_data"] = kvData;
            };

            const loadData = () => {
                if (this.properties && Array.isArray(this.properties["kv_data"])) {
                    kvData = this.properties["kv_data"];
                } else {
                    kvData = [];
                    this.properties["kv_data"] = kvData;
                }
            };

            const mainContainer = document.createElement("div");
            mainContainer.style.cssText = "display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 0; box-sizing: border-box;";

            const rowsContainer = document.createElement("div");
            rowsContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px; width: 100%;";

            const iconTrash = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

            const renderRows = () => {
                rowsContainer.innerHTML = "";

                kvData.forEach((item, i) => {
                    const row = document.createElement("div");
                    row.style.cssText = "display: flex; align-items: center; gap: 4px; width: 100%;";

                    const btnRemove = document.createElement("button");
                    btnRemove.type = "button";
                    btnRemove.title = "Delete key-value pair";
                    btnRemove.innerHTML = iconTrash;
                    btnRemove.style.cssText = "height: 24px; width: 24px; min-width: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: none; padding: 0;";
                    btnRemove.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        kvData.splice(i, 1);
                        this.saveData();
                        renderRows();
                    };

                    const keyInput = document.createElement("input");
                    keyInput.type = "text";
                    keyInput.value = item.key || "";
                    keyInput.placeholder = "Key";
                    keyInput.className = "comfy-input";
                    keyInput.style.cssText = "flex: 1; min-width: 80px; padding: 2px 6px; height: 24px; font-size: 11px; border-radius: 4px; border: 1px solid var(--border-color, #3f3f46); background: var(--comfy-input-bg, #18181b); color: var(--input-text, #e4e4e7); box-sizing: border-box;";
                    keyInput.oninput = (e) => {
                        item.key = e.target.value;
                        this.saveData();
                    };

                    const typeSelect = document.createElement("select");
                    typeSelect.style.cssText = "width: 85px; min-width: 85px; height: 24px; font-size: 11px; border-radius: 4px; border: 1px solid var(--border-color, #3f3f46); background: var(--comfy-input-bg, #18181b); color: #38bdf8; padding: 0 4px; cursor: pointer; box-sizing: border-box;";
                    const types = ["STRING", "INT", "FLOAT", "BOOLEAN", "RAW"];
                    types.forEach(t => {
                        const opt = document.createElement("option");
                        opt.value = t;
                        opt.textContent = t;
                        if (t === item.type) opt.selected = true;
                        typeSelect.appendChild(opt);
                    });
                    typeSelect.onchange = (e) => {
                        item.type = e.target.value;
                        this.saveData();
                    };

                    const valInput = document.createElement("input");
                    valInput.type = "text";
                    valInput.value = item.value !== undefined ? String(item.value) : "";
                    valInput.placeholder = "Value";
                    valInput.className = "comfy-input";
                    valInput.style.cssText = "flex: 1.5; min-width: 100px; padding: 2px 6px; height: 24px; font-size: 11px; border-radius: 4px; border: 1px solid var(--border-color, #3f3f46); background: var(--comfy-input-bg, #18181b); color: var(--input-text, #e4e4e7); box-sizing: border-box;";
                    valInput.oninput = (e) => {
                        item.value = e.target.value;
                        this.saveData();
                    };

                    row.appendChild(btnRemove);
                    row.appendChild(keyInput);
                    row.appendChild(typeSelect);
                    row.appendChild(valInput);

                    rowsContainer.appendChild(row);
                });

                const bottomBar = document.createElement("div");
                bottomBar.style.cssText = "display: flex; align-items: center; gap: 6px; width: 100%; margin-top: 2px;";

                const btnAdd = document.createElement("button");
                btnAdd.type = "button";
                btnAdd.textContent = "+ Add Key-Value";
                btnAdd.style.cssText = "flex: 1; height: 26px; background: var(--component-node-widget-background, #27272a); color: var(--input-text, #e4e4e7); border: 1px dashed var(--border-color, #3f3f46); border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center;";
                btnAdd.onmouseover = () => btnAdd.style.background = "rgba(255,255,255,0.08)";
                btnAdd.onmouseout = () => btnAdd.style.background = "var(--component-node-widget-background, #27272a)";
                btnAdd.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nextIdx = kvData.length + 1;
                    kvData.push({ key: `Key_${nextIdx}`, type: "STRING", value: "" });
                    this.saveData();
                    renderRows();
                };

                bottomBar.appendChild(btnAdd);
                rowsContainer.appendChild(bottomBar);

                if (typeof this.setDirtyCanvas === "function") {
                    this.setDirtyCanvas(true, true);
                } else if (app.graph) {
                    app.graph.setDirtyCanvas(true, true);
                }

                if (typeof this.setSize === "function") {
                    const minHeight = 80 + kvData.length * 28;
                    const currentWidth = Math.max(this.size[0] || 0, MIN_WIDTH);
                    this.setSize([currentWidth, minHeight]);
                }
            };

            const onConfigure = this.onConfigure;
            this.onConfigure = function(info) {
                if (onConfigure) onConfigure.apply(this, arguments);
                if (info && info.extra && Array.isArray(info.extra["kv_data"])) {
                    this.properties = this.properties || {};
                    this.properties["kv_data"] = info.extra["kv_data"];
                }
                loadData();
                renderRows();
            };

            loadData();
            mainContainer.appendChild(rowsContainer);
            this.addDOMWidget("kv_container", "kv_editor", mainContainer, { label: "" });

            renderRows();
        };
    }
});