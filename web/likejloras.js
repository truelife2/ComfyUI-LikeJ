import { app } from "../../scripts/app.js";

const style = document.createElement("style");
style.textContent = `
    /* === 0. 關閉狀態變暗樣式 (保留互動功能) === */
    .likej-widget-disabled {
        opacity: 0.4 !important;
        filter: grayscale(70%) !important;
        transition: opacity 0.2s ease, filter 0.2s ease !important;
    }

    /* === 移動按鈕容器與樣式 === */
    .likej-row-controls {
        display: inline-flex !important;
        align-items: center !important;
        gap: 1px !important;        
        margin-right: 6px !important; 
        flex-shrink: 0 !important;
        vertical-align: middle !important;
    }

    .likej-move-btn {
        background: rgba(255, 255, 255, 0.12) !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        color: #fff !important;
        cursor: pointer !important;
        font-size: 11px !important;
        width: 18px !important;
        height: 18px !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        line-height: 1 !important;
        margin: 0 !important;
    }

    .likej-move-btn:first-child {
        border-top-left-radius: 3px !important;
        border-bottom-left-radius: 3px !important;
        border-top-right-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
    }

    .likej-move-btn:last-child {
        border-top-right-radius: 3px !important;
        border-bottom-right-radius: 3px !important;
        border-top-left-radius: 0 !important;
        border-bottom-left-radius: 0 !important;
        border-left: none !important;
    }

    .likej-move-btn:hover {
        background: rgba(255, 255, 255, 0.3) !important;
        z-index: 2;
    }

    /* === 1. 基礎版 Layout (3個 Widget 為一組: Enable, LoRA, Strength) === */
    .likej-loras-container {
        display: grid !important;
        grid-template-columns: auto minmax(0, 1fr) 110px !important;
        grid-template-rows: none !important;
        grid-auto-rows: max-content !important;
        gap: 4px 3px !important;
        align-items: center !important;
        height: auto !important;
    }

    .likej-loras-container [class*="grid-cols-subgrid"],
    .likej-loras-container [class*="col-span-"] {
        grid-template-columns: none !important;
        grid-column: auto !important;
    }

    .likej-loras-container > [data-testid="node-widget"] {
        display: flex !important;
        align-items: center !important;
        min-width: 0 !important;
        width: 100% !important;
        padding-right: 0 !important;
        margin: 0 !important;
    }

    /* 第 3n+1 個：Enable 開關 (第 1 欄) */
    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+1) {
        grid-column: 1 !important;
        width: auto !important;
        justify-content: flex-start !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+1) [class*="grid-cols-subgrid"] {
        grid-column: 1 !important;
        justify-content: flex-start !important;
        gap: 4px !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+1) [class*="col-span-2"] {
        grid-column: 1 !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+1) [data-testid="widget-layout-field-label"] {
        display: none !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+1) [class*="ml-auto"] {
        margin-left: 0 !important;
    }

    /* 第 3n+2 個：LoRA 選單 (第 2 欄) */
    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+2) {
        grid-column: 2 !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+2) > [node-id] {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+2) [data-testid="widget-layout-field-label"] {
        flex-shrink: 0 !important;
        white-space: nowrap !important;
        margin: 0 !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+2) [data-testid="widget-layout-field-label"] + div {
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
    }

    /* 第 3n 個：Strength (第 3 欄) */
    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n) {
        grid-column: 3 !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n) > .z-10,
    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n) [data-testid="widget-layout-field-label"] {
        display: none !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n) > [node-id] {
        display: block !important;
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
    }

    /* === 2. 帶 Prompt 版 Layout (4個 Widget 為一組) === */
    .likej-loras-prompt-container {
        display: grid !important;
        grid-template-columns: auto minmax(0, 1fr) 90px !important;
        grid-template-rows: none !important;
        grid-auto-rows: max-content !important;
        gap: 4px 3px !important;
        align-items: center !important;
        height: auto !important;
    }

    .likej-loras-prompt-container [class*="grid-cols-subgrid"],
    .likej-loras-prompt-container [class*="col-span-"] {
        grid-template-columns: none !important;
        grid-column: auto !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"] {
        display: flex !important;
        align-items: center !important;
        min-width: 0 !important;
        width: 100% !important;
        padding-right: 0 !important;
        margin: 0 !important;
    }

    /* 第 4n+1 個：Enable 開關 */
    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+1) {
        grid-column: 1 !important;
        width: auto !important;
        justify-content: flex-start !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+1) [class*="grid-cols-subgrid"] {
        grid-column: 1 !important;
        justify-content: flex-start !important;
        gap: 4px !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+1) [class*="col-span-2"] {
        grid-column: 1 !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+1) [data-testid="widget-layout-field-label"] {
        display: none !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+1) [class*="ml-auto"] {
        margin-left: 0 !important;
    }

    /* 第 4n+2 個：LoRA 選單 */
    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+2) {
        grid-column: 2 !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+2) > [node-id] {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+2) [data-testid="widget-layout-field-label"] {
        flex-shrink: 0 !important;
        white-space: nowrap !important;
        margin: 0 !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+2) [data-testid="widget-layout-field-label"] + div {
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
    }

    /* 第 4n+3 個：Strength */
    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+3) {
        grid-column: 3 !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+3) > .z-10,
    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+3) [data-testid="widget-layout-field-label"] {
        display: none !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+3) > [node-id] {
        display: block !important;
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
    }

    /* 第 4n 個：Prompt 輸入框 (跨全寬) */
    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n) {
        grid-column: 1 / -1 !important;
        margin-bottom: 6px !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n) > [node-id] {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n) [data-testid="widget-layout-field-label"] {
        display: block !important;
        flex-shrink: 0 !important;
        white-space: nowrap !important;
        margin: 0 !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n) [data-testid="widget-layout-field-label"] + div {
        flex: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
    }
`;
document.head.appendChild(style);

function setupLikeJLorasNode(node) {
    if (!node || !node.comfyClass || node.__sideBySideInitialized) return;

    const match = node.comfyClass.match(/^LikeJ(\d+)Loras(WithPrompt)?$/);
    if (!match) return;

    node.__sideBySideInitialized = true;

    const count = parseInt(match[1], 10);
    const hasPrompt = !!match[2];

    const targetHeight = hasPrompt 
        ? 620 + (count - 10) * 56 
        : 345 + (count - 10) * 28;
    const minWidth = hasPrompt ? 400 : 380;

    const enforceSize = () => {
        const width = Math.max(minWidth, node.size ? node.size[0] : minWidth);
        node.size = [width, targetHeight];
        if (app.canvas) app.canvas.setDirty(true, true);
    };

    node.computeSize = () => [Math.max(minWidth, node.size ? node.size[0] : minWidth), targetHeight];

    const bindDblClickEvents = (container) => {
        const selector = hasPrompt 
            ? ":scope > [data-testid='node-widget']:nth-child(4n+3)" 
            : ":scope > [data-testid='node-widget']:nth-child(3n)";

        const strengthElements = container.querySelectorAll(selector);
        strengthElements.forEach((el, index) => {
            if (el.dataset.dblclickBound) return;
            el.dataset.dblclickBound = "true";

            el.addEventListener("dblclick", (e) => {
                e.preventDefault();
                e.stopPropagation();

                const input = el.querySelector("input");
                if (input) {
                    input.value = "1";
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                }

                const widgetIndex = hasPrompt ? index * 4 + 2 : index * 3 + 2;
                if (node.widgets && node.widgets[widgetIndex]) {
                    node.widgets[widgetIndex].value = 1.0;
                }
            });
        });
    };

    const injectMoveButtons = (container) => {
        const domWidgets = Array.from(container.querySelectorAll(":scope > [data-testid='node-widget']"));
        
        for (let i = 1; i <= count; i++) {
            const numStr = String(i).padStart(2, "0");
            const targetName = `lora_${numStr}`;

            domWidgets.forEach(domEl => {
                const label = domEl.querySelector("[data-testid='widget-layout-field-label']");
                if (label && label.textContent.includes(targetName)) {
                    if (label.querySelector(".likej-row-controls")) return;

                    const controls = document.createElement("span");
                    controls.className = "likej-row-controls";

                    const upBtn = document.createElement("button");
                    upBtn.className = "likej-move-btn";
                    upBtn.textContent = "▲";
                    upBtn.title = "Move up";
                    upBtn.onclick = (e) => {
                        e.stopPropagation();
                        swapRows(i, i - 1);
                    };

                    const downBtn = document.createElement("button");
                    downBtn.className = "likej-move-btn";
                    downBtn.textContent = "▼";
                    downBtn.title = "Move down";
                    downBtn.onclick = (e) => {
                        e.stopPropagation();
                        swapRows(i, i + 1);
                    };

                    controls.appendChild(upBtn);
                    controls.appendChild(downBtn);
                    label.prepend(controls);
                }
            });
        }
    };

    const swapRows = (a, b) => {
        if (a < 1 || a > count || b < 1 || b > count) return;
        if (!node.widgets) return;

        const getWidgetsOfIndex = (idx) => {
            const s = String(idx).padStart(2, "0");
            return {
                enable: node.widgets.find(w => w.name === `enable_${s}`),
                lora: node.widgets.find(w => w.name === `lora_${s}`),
                strength: node.widgets.find(w => w.name === `strength_${s}`),
                prompt: hasPrompt ? node.widgets.find(w => w.name === `prompt_${s}`) : null
            };
        };

        const rowA = getWidgetsOfIndex(a);
        const rowB = getWidgetsOfIndex(b);

        if (!rowA.enable || !rowB.enable) return;

        // 交換內部資料值
        ['enable', 'lora', 'strength', 'prompt'].forEach(key => {
            if (rowA[key] && rowB[key]) {
                const temp = rowA[key].value;
                rowA[key].value = rowB[key].value;
                rowB[key].value = temp;
            }
        });

        // 觸發節點本身的 callback 讓 Nodes 2.0 狀態更新
        node.widgets.forEach(w => {
            if (w.callback) {
                try {
                    w.callback(w.value, app.canvas, node, null, null);
                } catch (err) {}
            }
        });

        // 強制重新整理 Nodes 2.0 DOM 裡各個 input/select 欄位的顯示與綁定
        const container = document.querySelector(`[data-widgets-grid-node-id="${node.id}"]`);
        if (container) {
            const domWidgets = Array.from(container.querySelectorAll(":scope > [data-testid='node-widget']"));
            domWidgets.forEach(domEl => {
                const input = domEl.querySelector("input, select, textarea");
                if (input) {
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                }
            });
            updateDisabledStates(container);
        }

        if (app.graph && typeof app.graph.setDirtyCanvas === "function") {
            app.graph.setDirtyCanvas(true, true);
        }
        if (app.canvas) app.canvas.setDirty(true, true);
    };

    const updateDisabledStates = (container) => {
        if (!node.widgets) return;

        for (let i = 1; i <= count; i++) {
            const numStr = String(i).padStart(2, "0");
            const enableWidget = node.widgets.find(w => w.name === `enable_${numStr}`);
            const isEnabled = enableWidget ? Boolean(enableWidget.value) : true;

            const targetNames = [`lora_${numStr}`, `strength_${numStr}`];
            if (hasPrompt) targetNames.push(`prompt_${numStr}`);

            const domWidgets = Array.from(container.querySelectorAll(":scope > [data-testid='node-widget']"));
            
            domWidgets.forEach(domEl => {
                const labelText = domEl.textContent || "";
                const matchesTarget = targetNames.some(name => labelText.includes(name));
                if (matchesTarget) {
                    if (isEnabled) {
                        domEl.classList.remove("likej-widget-disabled");
                    } else {
                        domEl.classList.add("likej-widget-disabled");
                    }
                }
            });
        }
    };

    const fixDom = () => {
        const container = document.querySelector(`[data-widgets-grid-node-id="${node.id}"]`);
        if (container) {
            const containerClass = hasPrompt ? "likej-loras-prompt-container" : "likej-loras-container";
            container.classList.add(containerClass);
            container.style.gridTemplateRows = "none";
            bindDblClickEvents(container);
            injectMoveButtons(container);

            if (!container.dataset.clickBound) {
                container.dataset.clickBound = "true";
                container.addEventListener("click", () => {
                    setTimeout(() => updateDisabledStates(container), 20);
                });
            }

            updateDisabledStates(container);
        }
        enforceSize();
    };

    const observer = new MutationObserver(() => fixDom());
    observer.observe(document.body, { childList: true, subtree: true });

    fixDom();
    setTimeout(fixDom, 100);
    setTimeout(fixDom, 400);
}

app.registerExtension({
    name: "LikeJLoras.SideBySideLayout",
    async nodeCreated(node) {
        setupLikeJLorasNode(node);
    },
    async loadedGraphNode(node) {
        setupLikeJLorasNode(node);
    },
    async afterConfigure() {
        if (app.graph && app.graph._nodes) {
            app.graph._nodes.forEach(node => setupLikeJLorasNode(node));
        }
    }
});