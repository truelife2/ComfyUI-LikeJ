import { app } from "../../scripts/app.js";

const style = document.createElement("style");
style.textContent = `
    /* === 0. 關閉狀態變暗樣式 (保留互動功能) === */
    .likej-widget-disabled {
        opacity: 0.4 !important;
        filter: grayscale(70%) !important;
        transition: opacity 0.2s ease, filter 0.2s ease !important;
    }

    /* === 1. 基礎版 Layout (3個 Widget 為一組: Enable, LoRA, Strength) === */
    .likej-loras-container {
        display: grid !important;
        grid-template-columns: auto minmax(0, 1fr) 110px !important;
        grid-template-rows: none !important;
        grid-auto-rows: max-content !important;
        gap: 4px 6px !important;
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
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+1) [data-testid="widget-layout-field-label"] {
        display: none !important;
    }

    /* 第 3n+2 個：LoRA 選單 (第 2 欄) */
    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+2) {
        grid-column: 2 !important;
    }

    .likej-loras-container > [data-testid="node-widget"]:nth-child(3n+2) > [node-id] {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
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

    /* === 2. 帶 Prompt 版 Layout (4個 Widget 為一組: Enable, LoRA, Strength, Prompt) === */
    .likej-loras-prompt-container {
        display: grid !important;
        grid-template-columns: auto minmax(0, 1fr) 90px !important;
        grid-template-rows: none !important;
        grid-auto-rows: max-content !important;
        gap: 4px 6px !important;
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

    /* 第 4n+1 個：Enable 開關 (第 1 欄) */
    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+1) {
        grid-column: 1 !important;
        width: auto !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+1) [data-testid="widget-layout-field-label"] {
        display: none !important;
    }

    /* 第 4n+2 個：LoRA 選單 (第 2 欄) */
    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+2) {
        grid-column: 2 !important;
    }

    .likej-loras-prompt-container > [data-testid="node-widget"]:nth-child(4n+2) > [node-id] {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
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

    /* 第 4n+3 個：Strength (第 3 欄) */
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
        gap: 6px !important;
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

    // 雙擊 Strength 歸位 1.0 的事件綁定
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

    // 根據 node.widgets 的內部 Boolean 值更新 DOM 變暗狀態
    const updateDisabledStates = (container) => {
        if (!node.widgets) return;
        const step = hasPrompt ? 4 : 3;
        const domWidgets = Array.from(container.querySelectorAll(":scope > [data-testid='node-widget']"));

        for (let i = 0; i < count; i++) {
            const enableWidgetIndex = i * step;
            const enableWidget = node.widgets[enableWidgetIndex];
            const isEnabled = enableWidget ? Boolean(enableWidget.value) : true;

            for (let j = 1; j < step; j++) {
                const targetDom = domWidgets[i * step + j];
                if (targetDom) {
                    if (isEnabled) {
                        targetDom.classList.remove("likej-widget-disabled");
                    } else {
                        targetDom.classList.add("likej-widget-disabled");
                    }
                }
            }
        }
    };

    const fixDom = () => {
        const container = document.querySelector(`[data-widgets-grid-node-id="${node.id}"]`);
        if (container) {
            const containerClass = hasPrompt ? "likej-loras-prompt-container" : "likej-loras-container";
            container.classList.add(containerClass);
            container.style.gridTemplateRows = "none";
            bindDblClickEvents(container);

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