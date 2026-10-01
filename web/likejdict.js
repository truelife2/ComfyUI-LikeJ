import { app } from "../../scripts/app.js";

// --- 共用常量與圖示 ---
const TYPES = ["STRING", "INT", "FLOAT", "BOOLEAN", "ANY"];
const ICON_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

// --- 通用 DOM & 節點元件 Helper ---
function setupMinSize(node, minWidth, defaultHeight = 140) {
    node.size = node.size ? [Math.max(node.size[0], minWidth), node.size[1]] : [minWidth, defaultHeight];
    const origResize = node.onResize;
    node.onResize = function (size) {
        if (origResize) origResize.apply(this, arguments);
        if (size[0] < minWidth) size[0] = minWidth;
    };
}

function setupHiddenWidget(node, name) {
    node.widgets = node.widgets || [];
    let widget = node.widgets.find(w => w.name === name);
    if (!widget) {
        widget = node.addWidget("string", name, "[]", () => {}, { hidden: true });
    }
    if (widget) {
        widget.type = "hidden";
        widget.computeSize = () => [0, -4];
    }
    return widget;
}

function createInput(value, placeholder, flex, minWidth, onInput) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = value !== undefined ? String(value) : "";
    inp.placeholder = placeholder;
    inp.className = "comfy-input";
    inp.style.cssText = `flex: ${flex}; min-width: ${minWidth}px; padding: 2px 6px; height: 24px; font-size: 11px; border-radius: 4px; border: 1px solid var(--border-color, #3f3f46); background: var(--comfy-input-bg, #18181b); color: var(--input-text, #e4e4e7); box-sizing: border-box;`;
    inp.oninput = (e) => onInput(e.target.value);
    return inp;
}

function createSelect(value, width, onChange) {
    const sel = document.createElement("select");
    sel.style.cssText = `width: ${width}px; min-width: ${width}px; height: 24px; font-size: 11px; border-radius: 4px; border: 1px solid var(--border-color, #3f3f46); background: var(--comfy-input-bg, #18181b); color: #38bdf8; padding: 0 4px; cursor: pointer; box-sizing: border-box;`;
    TYPES.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (t === value) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.onchange = (e) => onChange(e.target.value);
    return sel;
}

function createBtn(text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    if (text === "trash") {
        btn.title = "Delete";
        btn.innerHTML = ICON_TRASH;
        btn.style.cssText = "height: 24px; width: 24px; min-width: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: none; padding: 0;";
    } else {
        btn.textContent = text;
        btn.style.cssText = "flex: 1; height: 26px; background: var(--component-node-widget-background, #27272a); color: var(--input-text, #e4e4e7); border: 1px dashed var(--border-color, #3f3f46); border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center;";
        btn.onmouseover = () => btn.style.background = "rgba(255,255,255,0.08)";
        btn.onmouseout = () => btn.style.background = "var(--component-node-widget-background, #27272a)";
    }
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
    };
    return btn;
}

// --- 通用字典 UI 編輯器控制器 ---
function setupDictionaryEditor(node, opts) {
    setupMinSize(node, opts.minWidth);
    const jsonWidget = setupHiddenWidget(node, opts.widgetName);

    let data = [];
    if (jsonWidget && jsonWidget.value) {
        try { data = JSON.parse(jsonWidget.value); } catch (e) { data = []; }
    }

    const syncToWidget = () => {
        if (jsonWidget) jsonWidget.value = JSON.stringify(data);
        node.properties = node.properties || {};
        node.properties[opts.propName] = data;

        if (opts.onSync) opts.onSync(data);

        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (app.graph) app.graph.setDirtyCanvas(true, true);
    };

    const mainContainer = document.createElement("div");
    mainContainer.style.cssText = "display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 0; box-sizing: border-box;";

    const rowsContainer = document.createElement("div");
    rowsContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px; width: 100%;";

    const renderRows = () => {
        rowsContainer.innerHTML = "";

        data.forEach((item, i) => {
            const row = document.createElement("div");
            row.style.cssText = "display: flex; align-items: center; gap: 4px; width: 100%;";

            const btnRemove = createBtn("trash", () => {
                data.splice(i, 1);
                syncToWidget();
                renderRows();
            });

            const keyInput = createInput(item.key, opts.hasValue ? "Key" : "Key Name", 1, opts.hasValue ? 80 : 120, (val) => {
                item.key = val;
                syncToWidget();
            });

            const typeSelect = createSelect(item.type, opts.hasValue ? 85 : 95, (val) => {
                item.type = val;
                syncToWidget();
            });

            row.appendChild(btnRemove);
            row.appendChild(keyInput);
            row.appendChild(typeSelect);

            if (opts.hasValue) {
                const valInput = createInput(item.value, "Value", 1.5, 100, (val) => {
                    item.value = val;
                    syncToWidget();
                });
                row.appendChild(valInput);
            }

            rowsContainer.appendChild(row);
        });

        const bottomBar = document.createElement("div");
        bottomBar.style.cssText = "display: flex; align-items: center; gap: 6px; width: 100%; margin-top: 2px;";
        const btnAdd = createBtn(opts.addBtnText, () => {
            data.push(opts.createDefaultItem(data.length + 1));
            syncToWidget();
            renderRows();
        });

        bottomBar.appendChild(btnAdd);
        rowsContainer.appendChild(bottomBar);

        if (typeof node.setSize === "function") {
            const minHeight = 90 + data.length * 28;
            const currentWidth = Math.max(node.size[0] || 0, opts.minWidth);
            node.setSize([currentWidth, minHeight]);
        }
    };

    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        if (origOnConfigure) origOnConfigure.apply(this, arguments);
        let targetData = null;
        if (info && info.widgets_values) {
            const idx = this.widgets?.findIndex(w => w.name === opts.widgetName);
            if (idx >= 0 && info.widgets_values[idx] !== undefined) {
                try { targetData = JSON.parse(info.widgets_values[idx]); } catch (e) {}
            }
        }
        if (!targetData && info && info.extra && Array.isArray(info.extra[opts.propName])) {
            targetData = info.extra[opts.propName];
        }
        if (Array.isArray(targetData)) {
            data = targetData;
            if (jsonWidget) jsonWidget.value = JSON.stringify(data);
        }
        renderRows();
        if (opts.onSync) opts.onSync(data);
    };

    syncToWidget();
    mainContainer.appendChild(rowsContainer);
    node.addDOMWidget(opts.propName + "_container", opts.propName + "_editor", mainContainer, { label: "" });
    renderRows();
}

// --- ComfyUI 擴充註冊 ---
app.registerExtension({
    name: "LikeJ.Dictionary",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // 1. LikeJDictionary 節點
        if (nodeData.name === "LikeJDictionary") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                setupDictionaryEditor(this, {
                    minWidth: 480,
                    widgetName: "kv_json",
                    propName: "kv_data",
                    hasValue: true,
                    addBtnText: "+ Add Key-Value",
                    createDefaultItem: (idx) => ({ key: `key_${idx}`, type: "STRING", value: "" })
                });
            };

        // 2. LikeJDictionaryGets 節點
        } else if (nodeData.name === "LikeJDictionaryGets") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                const syncOutputs = (keysData) => {
                    this.outputs = this.outputs || [];
                    while (this.outputs.length < keysData.length) {
                        const item = keysData[this.outputs.length];
                        const name = (item && item.key) ? item.key.trim() : `val_${this.outputs.length + 1}`;
                        const type = (item && item.type === "ANY") ? "*" : ((item && item.type) || "*");
                        this.addOutput(name, type);
                    }
                    while (this.outputs.length > keysData.length) {
                        this.removeOutput(this.outputs.length - 1);
                    }
                    keysData.forEach((item, i) => {
                        if (this.outputs[i]) {
                            this.outputs[i].name = (item.key && item.key.trim() !== "") ? item.key.trim() : `val_${i + 1}`;
                            this.outputs[i].type = (item.type === "ANY") ? "*" : (item.type || "*");
                        }
                    });
                };

                setupDictionaryEditor(this, {
                    minWidth: 380,
                    widgetName: "keys_json",
                    propName: "keys_data",
                    hasValue: false,
                    addBtnText: "+ Add Output Key",
                    createDefaultItem: (idx) => ({ key: `key_${idx}`, type: "STRING" }),
                    onSync: syncOutputs
                });
            };
        }
    }
});