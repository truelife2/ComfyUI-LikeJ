import { app } from "../../scripts/app.js";

// ============================================================================
// 1. Global Configurations & Utility Functions
// ============================================================================
const CONFIG = {
    DEFAULT_W: 1920,
    DEFAULT_H: 1080,
    MIN_BOX_SIZE: 30,
    MIN_CANVAS_SIZE: 64,
    MAX_CANVAS_SIZE: 8192,
    GRID_STEP: 8,
    ENDPOINTS: {
        LAYOUTS: "/likej/layouts",
        PREVIEW: (file) => `/likej/preview/${file}`,
        SAVE: "/likej/save_layout",
        DELETE: "/likej/delete_layout"
    },
    QUICK_PRESETS: [
        { label: "16:9 (1920×1080)", w: 1920, h: 1080 },
        { label: "9:16 (1080×1920)", w: 1080, h: 1920 },
        { label: "1:1 (1024×1024)", w: 1024, h: 1024 },
        { label: "4:5 (1080×1350)", w: 1080, h: 1350 },
        { label: "21:9 (Ultra-Wide)", w: 2560, h: 1080 },
        { label: "2:1 (Character Card)", w: 2048, h: 1024 },
        { label: "4:3 (1440×1080)", w: 1440, h: 1080 },
        { label: "2:3 (1080×1620)", w: 1080, h: 1620 }
    ]
};

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

function el(tag, className = "", props = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.assign(element, props);
    return element;
}

function bindDrag(targetEl, onMove) {
    targetEl.addEventListener("mousedown", (e) => {
        if (e.target !== targetEl && e.target.dataset.noDrag) return;
        e.stopPropagation();

        const startX = e.clientX, startY = e.clientY;
        const handleMove = (me) => onMove(me.clientX - startX, me.clientY - startY);
        const handleUp = () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mouseup", handleUp);
        };

        document.addEventListener("mousemove", handleMove);
        document.addEventListener("mouseup", handleUp);
    });
}

// ============================================================================
// 2. CSS Styles Injection
// ============================================================================
function injectStyles() {
    if (document.getElementById("likej-layout-styles")) return;

    const style = document.createElement("style");
    style.id = "likej-layout-styles";
    style.textContent = `
        .likej-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; font-family: system-ui, -apple-system, sans-serif; }
        .likej-modal-high-z { z-index: 10001; }
        .likej-modal-top-z { z-index: 10002; }
        .likej-dialog { background: #222; border: 1px solid #555; border-radius: 8px; padding: 20px; box-shadow: 0 0 20px rgba(0,0,0,0.8); display: flex; flex-direction: column; gap: 14px; }
        .likej-toolbar { margin-bottom: 12px; display: flex; align-items: center; gap: 10px; background: #222; padding: 8px 16px; border-radius: 6px; border: 1px solid #444; }
        .likej-btn { padding: 6px 12px; cursor: pointer; background: #333; color: #eee; border: 1px solid #555; border-radius: 4px; font-size: 13px; font-weight: 500; transition: background 0.2s, border-color 0.2s; }
        .likej-btn:hover { background: #444; border-color: #777; }
        .likej-btn-primary { background: #2e7d32; color: #fff; border-color: #388e3c; font-weight: bold; }
        .likej-btn-primary:hover { background: #388e3c; }
        .likej-btn-danger { background: #d32f2f; color: #fff; border-color: #e53935; font-weight: bold; }
        .likej-btn-danger:hover { background: #e53935; }
        .likej-input { width: 100%; margin-top: 4px; padding: 6px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; box-sizing: border-box; font-size: 13px; }
        .likej-input:focus { border-color: #00d2ff; outline: none; }
        .likej-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        
        .likej-canvas-container { background: #1a1a1a; border: 2px solid #555; position: relative; overflow: visible; margin: 15px auto; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        .likej-box { position: absolute; background: rgba(0,150,255,0.35); border: 2px solid #00d2ff; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: move; user-select: none; box-sizing: border-box; z-index: 1; }
        
        /* 四角控制點 */
        .likej-box-handle { position: absolute; width: 8px; height: 8px; background: #ffffff; border: 1.5px solid #00d2ff; box-sizing: border-box; border-radius: 2px; z-index: 5; }
        .likej-box-handle.tl { top: -4px; left: -4px; cursor: nwse-resize; }
        .likej-box-handle.tr { top: -4px; right: -4px; cursor: nesw-resize; }
        .likej-box-handle.bl { bottom: -4px; left: -4px; cursor: nesw-resize; }
        .likej-box-handle.br { bottom: -4px; right: -4px; cursor: nwse-resize; }

        /* 右上角刪除按鈕：直接用 z-index 置頂並定位於右上角外側 */
        .likej-box-delete { 
            position: absolute; 
            top: 5px; 
            right: 5px; 
            width: 18px; 
            height: 18px; 
            background: #e53935; 
            color: #ffffff; 
            border: 1px solid #ffffff; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 12px; 
            font-weight: bold; 
            cursor: pointer; 
            z-index: 10; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.4); 
            line-height: 1; 
        }
        .likej-box-delete:hover { background: #ff1a1a; transform: scale(1.1); }

        .likej-gallery-card { position: relative; background: #222; border: 1px solid #444; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: border-color 0.2s; }
        .likej-gallery-card:hover { border-color: #00d2ff; }
        .likej-gallery-img { width: 100%; height: 120px; object-fit: contain; background: #111; border-radius: 4px; margin-bottom: 8px; }
        .likej-scrollable::-webkit-scrollbar { width: 8px; }
        .likej-scrollable::-webkit-scrollbar-track { background: #1e1e1e; border-radius: 4px; }
        .likej-scrollable::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
        .likej-scrollable::-webkit-scrollbar-thumb:hover { background: #00d2ff; }
        
        .likej-dropdown { position: relative; display: inline-block; }
        .likej-dropdown-content { 
            display: none; 
            position: absolute; 
            top: 100%; 
            left: 0; 
            background: #222; 
            border: 1px solid #555; 
            border-radius: 4px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.6); 
            z-index: 100; 
            min-width: 150px; 
            margin-top: 2px; 
            padding: 4px 0; 
        }
        .likej-dropdown-content.show { display: block; }
        .likej-dropdown-content button { display: block; width: 100%; text-align: left; padding: 8px 12px; background: transparent; border: none; color: #eee; cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.15s, color 0.15s; }
        .likej-dropdown-content button:hover { background: #383838; color: #00d2ff; }
    `;
    document.head.appendChild(style);
}

// ============================================================================
// 3. ComfyUI Extension Registration
// ============================================================================
app.registerExtension({
    name: "LikeJ.ImageArrange",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "LikeJImageArrange") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            if (!this.properties) this.properties = {};
            if (!this.properties.layout) {
                this.properties.layout = { width: CONFIG.DEFAULT_W, height: CONFIG.DEFAULT_H, boxes: [] };
            }

            this.addCustomWidget({
                type: "LAYOUT_PREVIEW",
                name: "layout_preview",
                value: JSON.stringify(this.properties.layout),
                draw(ctx, node, widgetWidth, y) {
                    let layout;
                    try {
                        layout = JSON.parse(this.value);
                    } catch (e) {
                        layout = node.properties?.layout || { width: 1920, height: 1080, boxes: [] };
                    }

                    const cw = layout?.width || 1920;
                    const ch = layout?.height || 1080;
                    const boxes = layout?.boxes || [];

                    const padding = 12;
                    const maxW = widgetWidth - padding * 2;
                    const maxH = 150 - padding * 2;

                    let renderW = maxW;
                    let renderH = (maxW * ch) / cw;

                    if (renderH > maxH) {
                        renderH = maxH;
                        renderW = (maxH * cw) / ch;
                    }

                    const startX = padding + (maxW - renderW) / 2;
                    const startY = y + padding + (maxH - renderH) / 2;

                    ctx.save();
                    ctx.fillStyle = "#121212";
                    ctx.fillRect(startX, startY, renderW, renderH);
                    ctx.strokeStyle = "#383838";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(startX, startY, renderW, renderH);

                    const scale = renderW / cw;
                    boxes.forEach((box, idx) => {
                        const bx = startX + box.x * scale;
                        const by = startY + box.y * scale;
                        const bw = box.w * scale;
                        const bh = box.h * scale;

                        ctx.fillStyle = "rgba(0, 210, 255, 0.25)";
                        ctx.fillRect(bx, by, bw, bh);

                        ctx.strokeStyle = "#00d2ff";
                        ctx.lineWidth = 1.5;
                        ctx.strokeRect(bx, by, bw, bh);

                        const pT = (box.pad_top || 0) * scale;
                        const pB = (box.pad_bottom || 0) * scale;
                        const pL = (box.pad_left || 0) * scale;
                        const pR = (box.pad_right || 0) * scale;

                        if (pT > 0 || pB > 0 || pL > 0 || pR > 0) {
                            ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
                            ctx.setLineDash([2, 2]);
                            ctx.strokeRect(bx + pL, by + pT, Math.max(0, bw - pL - pR), Math.max(0, bh - pT - pB));
                            ctx.setLineDash([]);
                        }

                        ctx.fillStyle = "#ffffff";
                        ctx.font = "bold 11px sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(`#${box.order || idx + 1}`, bx + bw / 2, by + bh / 2);
                    });

                    ctx.restore();
                },
                computeSize: () => [220, 150]
            });

            this.addWidget("button", "📐 Edit Canvas Layout", null, () => openLayoutModal(this));

            if (this.computeSize) {
                const sz = this.computeSize();
                this.setSize([Math.max(sz[0], 240), sz[1]]);
            }

            return r;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure?.apply(this, arguments);
            const previewWidget = this.widgets?.find((w) => w.name === "layout_preview");
            if (previewWidget && this.properties?.layout) {
                previewWidget.value = JSON.stringify(this.properties.layout);
            }
            return r;
        };
    }
});

// ============================================================================
// 4. Layout Modal Logic
// ============================================================================
function openLayoutModal(node) {
    injectStyles();

    const currentLayout = node.properties?.layout || {};
    let canvasW = currentLayout.width || CONFIG.DEFAULT_W;
    let canvasH = currentLayout.height || CONFIG.DEFAULT_H;
    let boxes = currentLayout.boxes ? JSON.parse(JSON.stringify(currentLayout.boxes)) : [];
    let maxZIndex = 1; // 用來記錄目前最高層級

    if (boxes.length === 0) {
        boxes.push({ id: 1, order: 1, x: 50, y: 50, w: 400, h: 300, pad_top: 0, pad_bottom: 0, pad_left: 0, pad_right: 0 });
    }

    const modal = el("div", "likej-modal-overlay");
    const toolbar = el("div", "likej-toolbar");
    const sizeDisplay = el("div", "", { style: "font-weight:bold;font-size:14px;color:#00d2ff;margin-right:6px;" });

    const setCanvasBtn = el("button", "likej-btn", { innerText: "⚙️ Set Canvas Size" });
    const addBtn = el("button", "likej-btn", { innerText: "+ Add Box" });

    const alignDropdown = el("div", "likej-dropdown");
    const alignMenuBtn = el("button", "likej-btn", { innerText: "📐 Align ▾" });
    const alignMenuContent = el("div", "likej-dropdown-content");

    const alignHBtn = el("button", "", { innerText: "↔️ Align Horizontal" });
    const alignVBtn = el("button", "", { innerText: "↕️ Align Vertical" });

    alignMenuContent.append(alignHBtn, alignVBtn);
    alignDropdown.append(alignMenuBtn, alignMenuContent);

    alignMenuBtn.onclick = (e) => {
        e.stopPropagation();
        alignMenuContent.classList.toggle("show");
    };

    alignMenuContent.onclick = (e) => {
        e.stopPropagation();
    };

    const globalClickHandler = () => {
        alignMenuContent.classList.remove("show");
    };
    document.addEventListener("click", globalClickHandler);

    modal.addEventListener("DOMNodeRemoved", () => {
        document.removeEventListener("click", globalClickHandler);
    });

    const galleryBtn = el("button", "likej-btn", { innerText: "📂 Load Preset" });
    const savePresetBtn = el("button", "likej-btn", { innerText: "💾 Save Preset" });

    const cancelBtn = el("button", "likej-btn likej-btn-danger", { innerText: "Cancel" });
    cancelBtn.onclick = () => modal.remove();

    const saveBtn = el("button", "likej-btn likej-btn-primary", { innerText: "Save & Apply" });

    toolbar.append(sizeDisplay, setCanvasBtn, addBtn, alignDropdown, galleryBtn, savePresetBtn, cancelBtn, saveBtn);

    const canvasContainer = el("div", "likej-canvas-container");
    modal.append(toolbar, canvasContainer);
    document.body.appendChild(modal);

    let scale = 1;

    function updateCanvasSize() {
        sizeDisplay.innerText = `Canvas: ${canvasW} × ${canvasH}`;
        const containerW = 800;
        const containerH = (containerW * canvasH) / canvasW;

        canvasContainer.style.width = `${containerW}px`;
        canvasContainer.style.height = `${containerH}px`;
        scale = containerW / canvasW;

        renderBoxes();
    }

    setCanvasBtn.onclick = () => {
        const sizeModal = el("div", "likej-modal-overlay likej-modal-high-z");
        const presetButtons = CONFIG.QUICK_PRESETS.map(
            (p) => `<button class="likej-btn preset-btn" data-w="${p.w}" data-h="${p.h}">${p.label}</button>`
        ).join("");

        sizeModal.innerHTML = `
            <div class="likej-dialog" style="width: 400px;">
                <h3 style="margin:0;font-size:18px;color:#00d2ff;text-align:center;">⚙️ Set Canvas Dimensions</h3>
                <div style="display:flex;gap:12px;align-items:center;">
                    <label style="flex:1;font-size:13px;">Width:
                        <input type="number" id="dialog_cw" value="${canvasW}" min="${CONFIG.MIN_CANVAS_SIZE}" max="${CONFIG.MAX_CANVAS_SIZE}" step="${CONFIG.GRID_STEP}" class="likej-input">
                    </label>
                    <label style="flex:1;font-size:13px;">Height:
                        <input type="number" id="dialog_ch" value="${canvasH}" min="${CONFIG.MIN_CANVAS_SIZE}" max="${CONFIG.MAX_CANVAS_SIZE}" step="${CONFIG.GRID_STEP}" class="likej-input">
                    </label>
                </div>
                <div>
                    <div style="font-size:12px;color:#aaa;margin-bottom:6px;">Quick Presets:</div>
                    <div class="likej-grid-2col">${presetButtons}</div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
                    <button id="cancel_size" class="likej-btn">Cancel</button>
                    <button id="apply_size" class="likej-btn likej-btn-primary">Apply & Scale</button>
                </div>
            </div>
        `;

        document.body.appendChild(sizeModal);

        const inputW = sizeModal.querySelector("#dialog_cw");
        const inputH = sizeModal.querySelector("#dialog_ch");

        sizeModal.querySelectorAll(".preset-btn").forEach((btn) => {
            btn.onclick = () => {
                inputW.value = btn.dataset.w;
                inputH.value = btn.dataset.h;
            };
        });

        sizeModal.querySelector("#cancel_size").onclick = () => sizeModal.remove();

        sizeModal.querySelector("#apply_size").onclick = () => {
            let newW = parseInt(inputW.value) || canvasW;
            let newH = parseInt(inputH.value) || canvasH;

            newW = clamp(Math.round(newW / CONFIG.GRID_STEP) * CONFIG.GRID_STEP, CONFIG.MIN_CANVAS_SIZE, CONFIG.MAX_CANVAS_SIZE);
            newH = clamp(Math.round(newH / CONFIG.GRID_STEP) * CONFIG.GRID_STEP, CONFIG.MIN_CANVAS_SIZE, CONFIG.MAX_CANVAS_SIZE);

            if (newW !== canvasW || newH !== canvasH) {
                const scaleX = newW / canvasW;
                const scaleY = newH / canvasH;

                boxes.forEach((box) => {
                    box.x = Math.round(box.x * scaleX);
                    box.y = Math.round(box.y * scaleY);
                    box.w = Math.max(CONFIG.MIN_BOX_SIZE, Math.round(box.w * scaleX));
                    box.h = Math.max(CONFIG.MIN_BOX_SIZE, Math.round(box.h * scaleY));
                });

                canvasW = newW;
                canvasH = newH;
                updateCanvasSize();
            }

            sizeModal.remove();
        };
    };

    function openBoxEditModal(box) {
        const boxModal = el("div", "likej-modal-overlay likej-modal-top-z");

        const pTop = box.pad_top || 0;
        const pBottom = box.pad_bottom || 0;
        const pLeft = box.pad_left || 0;
        const pRight = box.pad_right || 0;

        boxModal.innerHTML = `
            <div class="likej-dialog" style="width:360px;">
                <h3 style="margin:0;font-size:16px;color:#00d2ff;text-align:center;">✏️ Edit Box #${box.order} Settings</h3>
                <div class="likej-grid-2col">
                    <label style="font-size:13px;grid-column: span 2;">Order:
                        <input type="number" id="box_order" value="${box.order}" min="1" class="likej-input">
                    </label>
                    <label style="font-size:13px;">X Position:
                        <input type="number" id="box_x" value="${box.x}" class="likej-input">
                    </label>
                    <label style="font-size:13px;">Y Position:
                        <input type="number" id="box_y" value="${box.y}" class="likej-input">
                    </label>
                    <label style="font-size:13px;">Width:
                        <input type="number" id="box_w" value="${box.w}" class="likej-input">
                    </label>
                    <label style="font-size:13px;">Height:
                        <input type="number" id="box_h" value="${box.h}" class="likej-input">
                    </label>
                </div>
                <div style="margin-top:6px;border-top:1px solid #444;padding-top:8px;">
                    <div style="font-size:13px;font-weight:bold;color:#00d2ff;margin-bottom:6px;">Margin / Padding (px):</div>
                    <div class="likej-grid-2col">
                        <label style="font-size:12px;">Top:
                            <input type="number" id="box_pad_top" value="${pTop}" min="0" class="likej-input">
                        </label>
                        <label style="font-size:12px;">Bottom:
                            <input type="number" id="box_pad_bottom" value="${pBottom}" min="0" class="likej-input">
                        </label>
                        <label style="font-size:12px;">Left:
                            <input type="number" id="box_pad_left" value="${pLeft}" min="0" class="likej-input">
                        </label>
                        <label style="font-size:12px;">Right:
                            <input type="number" id="box_pad_right" value="${pRight}" min="0" class="likej-input">
                        </label>
                    </div>
                </div>
                <div style="font-size:11px;color:#aaa;margin-top:4px;">* Values exceeding canvas (${canvasW}×${canvasH}) will be constrained automatically.</div>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
                    <button id="cancel_box" class="likej-btn">Cancel</button>
                    <button id="apply_box" class="likej-btn likej-btn-primary">Apply</button>
                </div>
            </div>
        `;

        document.body.appendChild(boxModal);

        boxModal.querySelector("#cancel_box").onclick = () => boxModal.remove();

        boxModal.querySelector("#apply_box").onclick = () => {
            const targetOrder = parseInt(boxModal.querySelector("#box_order").value) || box.order;
            const inputX = parseInt(boxModal.querySelector("#box_x").value) || 0;
            const inputY = parseInt(boxModal.querySelector("#box_y").value) || 0;
            const inputW = parseInt(boxModal.querySelector("#box_w").value) || 100;
            const inputH = parseInt(boxModal.querySelector("#box_h").value) || 100;

            box.order = Math.max(1, targetOrder);

            // 1. 先獲取目標尺寸（不能小於最小值，也不能大於畫布總寬高）
            let targetW = clamp(inputW, CONFIG.MIN_BOX_SIZE, canvasW);
            let targetH = clamp(inputH, CONFIG.MIN_BOX_SIZE, canvasH);

            // 2. 先調整位置：若右/下超出邊界，則向左/上移
            let targetX = inputX;
            if (targetX + targetW > canvasW) {
                targetX = canvasW - targetW;
            }

            let targetY = inputY;
            if (targetY + targetH > canvasH) {
                targetY = canvasH - targetH;
            }

            // 3. 邊界保護（確保不超出左上角 0, 0）
            targetX = Math.max(0, targetX);
            targetY = Math.max(0, targetY);

            // 4. 若移動後右/下依然超出（例如輸入尺寸本身就大於畫布），才縮小尺寸
            if (targetX + targetW > canvasW) {
                targetW = canvasW - targetX;
            }
            if (targetY + targetH > canvasH) {
                targetH = canvasH - targetY;
            }

            box.x = targetX;
            box.y = targetY;
            box.w = targetW;
            box.h = targetH;
            
            box.pad_top = Math.max(0, parseInt(boxModal.querySelector("#box_pad_top").value) || 0);
            box.pad_bottom = Math.max(0, parseInt(boxModal.querySelector("#box_pad_bottom").value) || 0);
            box.pad_left = Math.max(0, parseInt(boxModal.querySelector("#box_pad_left").value) || 0);
            box.pad_right = Math.max(0, parseInt(boxModal.querySelector("#box_pad_right").value) || 0);

            renderBoxes();
            boxModal.remove();
        };
    }

    function renderBoxes() {
        canvasContainer.innerHTML = "";
        boxes.sort((a, b) => (a.order || 0) - (b.order || 0));

        boxes.forEach((box, index) => {
            if (box.order === undefined || box.order === null) box.order = index + 1;

            if (box.x + box.w > canvasW) box.w = Math.max(CONFIG.MIN_BOX_SIZE, canvasW - box.x);
            if (box.y + box.h > canvasH) box.h = Math.max(CONFIG.MIN_BOX_SIZE, canvasH - box.y);

            const boxEl = el("div", "likej-box");
            box._el = boxEl;

            const innerPadEl = el("div", "", {
                style: `position:absolute;border:1px dashed rgba(255,255,255,0.7);pointer-events:none;box-sizing:border-box;`
            });
            boxEl.appendChild(innerPadEl);

            const label = el("div", "", {
                style: "font-weight:bold;font-size:14px;pointer-events:none;text-align:center;line-height:1.25;z-index:1;"
            });
            boxEl.appendChild(label);

            const updateBoxStyle = () => {
                boxEl.style.left = `${box.x * scale}px`;
                boxEl.style.top = `${box.y * scale}px`;
                boxEl.style.width = `${box.w * scale}px`;
                boxEl.style.height = `${box.h * scale}px`;

                const pT = (box.pad_top || 0) * scale;
                const pB = (box.pad_bottom || 0) * scale;
                const pL = (box.pad_left || 0) * scale;
                const pR = (box.pad_right || 0) * scale;

                if (pT > 0 || pB > 0 || pL > 0 || pR > 0) {
                    innerPadEl.style.display = "block";
                    innerPadEl.style.left = `${pL}px`;
                    innerPadEl.style.top = `${pT}px`;
                    innerPadEl.style.width = `${Math.max(0, box.w * scale - pL - pR)}px`;
                    innerPadEl.style.height = `${Math.max(0, box.h * scale - pT - pB)}px`;
                } else {
                    innerPadEl.style.display = "none";
                }

                label.innerHTML = `#${box.order}<br><span style="font-size:11px;opacity:0.9;font-weight:normal;">${box.w} × ${box.h}<br>(X: ${box.x}, Y: ${box.y})</span>`;
            };
            box._updateStyle = updateBoxStyle;

            // 雙擊直接開啟編輯
            boxEl.ondblclick = (e) => {
                e.stopPropagation();
                openBoxEditModal(box);
            };

            const delBtn = el("span", "likej-box-delete", { innerText: "×" });
            delBtn.dataset.noDrag = "true";
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete Box #${box.order}?`)) {
                    boxes.splice(boxes.indexOf(box), 1);
                    renderBoxes();
                }
            };

            const handles = {
                tl: el("div", "likej-box-handle tl"),
                tr: el("div", "likej-box-handle tr"),
                bl: el("div", "likej-box-handle bl"),
                br: el("div", "likej-box-handle br")
            };

            Object.values(handles).forEach((h) => {
                h.dataset.noDrag = "true";
            });

            boxEl.append(delBtn, handles.tl, handles.tr, handles.bl, handles.br);

            let initX, initY, initW, initH;

            // 按下時僅提升 z-index，完全不碰 DOM 結構
            boxEl.addEventListener("mousedown", () => {
                boxEl.style.zIndex = ++maxZIndex;
                initX = box.x;
                initY = box.y;
            });

            bindDrag(boxEl, (dx, dy) => {
                box.x = clamp(Math.round(initX + dx / scale), 0, canvasW - box.w);
                box.y = clamp(Math.round(initY + dy / scale), 0, canvasH - box.h);
                updateBoxStyle();
            });

            const setupHandle = (handleEl, calcFn) => {
                handleEl.addEventListener("mousedown", (e) => {
                    e.stopPropagation();
                    boxEl.style.zIndex = ++maxZIndex;
                    initX = box.x;
                    initY = box.y;
                    initW = box.w;
                    initH = box.h;
                });
                bindDrag(handleEl, (dx, dy) => {
                    calcFn(dx / scale, dy / scale);
                    updateBoxStyle();
                });
            };

            setupHandle(handles.br, (dx_c, dy_c) => {
                const newX2 = clamp(Math.round(initX + initW + dx_c), initX + CONFIG.MIN_BOX_SIZE, canvasW);
                const newY2 = clamp(Math.round(initY + initH + dy_c), initY + CONFIG.MIN_BOX_SIZE, canvasH);
                box.w = newX2 - initX;
                box.h = newY2 - initY;
            });

            setupHandle(handles.bl, (dx_c, dy_c) => {
                const newX = clamp(Math.round(initX + dx_c), 0, initX + initW - CONFIG.MIN_BOX_SIZE);
                const newY2 = clamp(Math.round(initY + initH + dy_c), initY + CONFIG.MIN_BOX_SIZE, canvasH);
                box.x = newX;
                box.w = (initX + initW) - newX;
                box.h = newY2 - initY;
            });

            setupHandle(handles.tr, (dx_c, dy_c) => {
                const newX2 = clamp(Math.round(initX + initW + dx_c), initX + CONFIG.MIN_BOX_SIZE, canvasW);
                const newY = clamp(Math.round(initY + dy_c), 0, initY + initH - CONFIG.MIN_BOX_SIZE);
                box.y = newY;
                box.w = newX2 - initX;
                box.h = (initY + initH) - newY;
            });

            setupHandle(handles.tl, (dx_c, dy_c) => {
                const newX = clamp(Math.round(initX + dx_c), 0, initX + initW - CONFIG.MIN_BOX_SIZE);
                const newY = clamp(Math.round(initY + dy_c), 0, initY + initH - CONFIG.MIN_BOX_SIZE);
                box.x = newX;
                box.y = newY;
                box.w = (initX + initW) - newX;
                box.h = (initY + initH) - newY;
            });

            updateBoxStyle();
            canvasContainer.appendChild(boxEl);
        });
    }

    addBtn.onclick = () => {
        const nextOrder = boxes.length > 0 ? Math.max(...boxes.map((b) => b.order || 0)) + 1 : 1;
        boxes.push({ id: Date.now(), x: 50, y: 50, w: 400, h: 300, order: nextOrder, pad_top: 0, pad_bottom: 0, pad_left: 0, pad_right: 0 });
        renderBoxes();
    };

    galleryBtn.onclick = () => {
        const galleryModal = el("div", "likej-modal-overlay likej-modal-high-z", { style: "padding:30px;box-sizing:border-box;" });

        galleryModal.innerHTML = `
            <div style="width:100%;max-width:900px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h2 style="margin:0;">📂 Select Layout Preset</h2>
                <button id="close_gallery" class="likej-btn likej-btn-danger">Close</button>
            </div>
            <div id="gallery_grid" class="likej-scrollable" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:16px;width:100%;max-width:900px;max-height:80vh;overflow-y:auto;padding:10px;"></div>
        `;

        document.body.appendChild(galleryModal);
        galleryModal.querySelector("#close_gallery").onclick = () => galleryModal.remove();

        const grid = galleryModal.querySelector("#gallery_grid");

        async function fetchAndRenderPresets() {
            grid.innerHTML = "<p style='color:#aaa;'>Loading presets...</p>";
            try {
                const res = await fetch(CONFIG.ENDPOINTS.LAYOUTS);
                const layouts = await res.json();
                grid.innerHTML = "";

                if (layouts.length === 0) {
                    grid.innerHTML = "<p style='color:#aaa;'>No saved layout presets found.</p>";
                    return;
                }

                layouts.forEach(async (item) => {
                    const card = el("div", "likej-gallery-card");

                    const deleteBtn = el("button", "likej-btn-danger", {
                        innerText: "×",
                        title: "Delete Preset",
                        style: "position:absolute;top:6px;right:6px;border-radius:50%;width:22px;height:22px;font-size:14px;padding:0;display:flex;align-items:center;justify-content:center;z-index:2;"
                    });

                    deleteBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete preset "${item.name}"?`)) {
                            try {
                                const delRes = await fetch(CONFIG.ENDPOINTS.DELETE, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ filename: item.name })
                                });
                                const delResult = await delRes.json();
                                if (delResult.success) fetchAndRenderPresets();
                                else alert(`Failed to delete preset: ${delResult.error}`);
                            } catch (err) {
                                alert("Error deleting preset!");
                            }
                        }
                    };

                    const img = el("img", "likej-gallery-img", { src: item.preview_url || "" });
                    const nameText = el("span", "", {
                        innerText: item.name,
                        style: "font-weight:bold;font-size:13px;color:#fff;margin-bottom:2px;word-break:break-all;text-align:center;"
                    });

                    const sizeText = el("span", "", {
                        innerText: "Loading...",
                        style: "font-size:11px;color:#00d2ff;margin-bottom:4px;"
                    });

                    card.append(deleteBtn, img, nameText, sizeText);

                    let loadedData = null;
                    try {
                        const lres = await fetch(CONFIG.ENDPOINTS.PREVIEW(item.json_file));
                        loadedData = await lres.json();
                        if (loadedData.width && loadedData.height) {
                            sizeText.innerText = `${loadedData.width} × ${loadedData.height}`;
                        } else {
                            sizeText.innerText = "Unknown size";
                        }
                    } catch (e) {
                        sizeText.innerText = "";
                    }

                    card.onclick = () => {
                        if (!loadedData) return;
                        canvasW = loadedData.width || CONFIG.DEFAULT_W;
                        canvasH = loadedData.height || CONFIG.DEFAULT_H;
                        boxes = loadedData.boxes || [];
                        updateCanvasSize();
                        galleryModal.remove();
                    };

                    grid.appendChild(card);
                });
            } catch (e) {
                grid.innerHTML = "<p style='color:#ff4d4d;'>Failed to connect to backend layout API.</p>";
            }
        }

        fetchAndRenderPresets();
    };

    savePresetBtn.onclick = () => {
        const saveModal = el("div", "likej-modal-overlay likej-modal-high-z");

        saveModal.innerHTML = `
            <div class="likej-dialog" style="width: 380px; max-height: 80vh;">
                <h3 style="margin:0;font-size:18px;color:#00d2ff;text-align:center;">💾 Save Layout Preset</h3>
                <label style="font-size:13px;display:block;">
                    Preset Name:
                    <input type="text" id="preset_name_input" class="likej-input" placeholder="Enter new name or click existing..." style="margin-top:6px;">
                </label>
                <div>
                    <div style="font-size:12px;color:#aaa;margin-bottom:6px;">Select existing preset to overwrite:</div>
                    <div id="existing_presets_list" class="likej-scrollable" style="max-height: 180px; overflow-y: auto; border: 1px solid #444; border-radius: 4px; padding: 4px; background: #1a1a1a;">
                        <div style="color:#888;font-size:12px;padding:6px;text-align:center;">Loading presets...</div>
                    </div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
                    <button id="cancel_save_preset" class="likej-btn">Cancel</button>
                    <button id="confirm_save_preset" class="likej-btn likej-btn-primary">Save / Overwrite</button>
                </div>
            </div>
        `;

        document.body.appendChild(saveModal);

        const nameInput = saveModal.querySelector("#preset_name_input");
        const listContainer = saveModal.querySelector("#existing_presets_list");

        fetch(CONFIG.ENDPOINTS.LAYOUTS)
            .then((res) => res.json())
            .then((layouts) => {
                listContainer.innerHTML = "";
                if (!layouts || layouts.length === 0) {
                    listContainer.innerHTML = "<div style='color:#888;font-size:12px;padding:6px;text-align:center;'>No existing presets found</div>";
                    return;
                }
                layouts.forEach((item) => {
                    const itemEl = el("div", "", {
                        innerText: item.name,
                        style: "padding: 6px 10px; border-bottom: 1px solid #2a2a2a; cursor: pointer; font-size: 13px; border-radius: 3px; transition: background 0.15s, color 0.15s;"
                    });
                    itemEl.onmouseenter = () => {
                        itemEl.style.background = "#333";
                        itemEl.style.color = "#00d2ff";
                    };
                    itemEl.onmouseleave = () => {
                        itemEl.style.background = "transparent";
                        itemEl.style.color = "#fff";
                    };
                    itemEl.onclick = () => {
                        nameInput.value = item.name;
                    };
                    listContainer.appendChild(itemEl);
                });
            })
            .catch(() => {
                listContainer.innerHTML = "<div style='color:#ff4d4d;font-size:12px;padding:6px;text-align:center;'>Failed to load existing presets</div>";
            });

        saveModal.querySelector("#cancel_save_preset").onclick = () => saveModal.remove();

        saveModal.querySelector("#confirm_save_preset").onclick = async () => {
            const filename = nameInput.value.trim();
            if (!filename) {
                alert("Please enter or select a preset name!");
                return;
            }

            try {
                const res = await fetch(CONFIG.ENDPOINTS.SAVE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filename: filename,
                        layout: { width: canvasW, height: canvasH, boxes: boxes }
                    })
                });
                const result = await res.json();

                if (result.success) {
                    saveModal.remove();
                } else {
                    alert(`Save failed: ${result.error}`);
                }
            } catch (e) {
                alert("Failed to save preset to backend!");
            }
        };
    };

    saveBtn.onclick = () => {
        const layoutData = { width: canvasW, height: canvasH, boxes: boxes };

        if (!node.properties) node.properties = {};
        node.properties.layout = layoutData;

        const previewWidget = node.widgets?.find((w) => w.name === "layout_preview");
        if (previewWidget) {
            previewWidget.value = JSON.stringify(layoutData);
        }

        const [origW, origH] = node.size;
        node._sizeToggled = !node._sizeToggled;
        const newW = node._sizeToggled ? origW + 1 : origW - 1;

        node.setSize([newW, origH]);

        if (app.canvas) {
            app.canvas.setDirty(true, true);
        }

        modal.remove();
    };

    alignHBtn.onclick = () => {
        if (boxes.length === 0) return;
        const itemW = Math.floor(canvasW / boxes.length);
        boxes.forEach((box, index) => {
            box.x = index * itemW;
            box.y = 0;
            box.w = (index === boxes.length - 1) ? canvasW - box.x : itemW;
            box.h = canvasH;
        });
        renderBoxes();
        alignMenuContent.classList.remove("show");
    };

    alignVBtn.onclick = () => {
        if (boxes.length === 0) return;
        const itemH = Math.floor(canvasH / boxes.length);
        boxes.forEach((box, index) => {
            box.x = 0;
            box.y = index * itemH;
            box.w = canvasW;
            box.h = (index === boxes.length - 1) ? canvasH - box.y : itemH;
        });
        renderBoxes();
        alignMenuContent.classList.remove("show");
    };

    updateCanvasSize();
}