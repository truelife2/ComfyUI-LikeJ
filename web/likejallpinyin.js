import { app } from "../../scripts/app.js";

// 注入全域 CSS 樣式鎖定 ComfyUI V2 CSS Grid 網格佈局
const styleId = "likej-pinyin-v2-style";
if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
        /* 鎖定父容器 Grid：第1行固定 65px、第2行選單自然高、第3行 1fr (吃滿剩餘高度) */
        .lg-node-widgets:has([node-type="LikeJAllPinyin"]) {
            grid-template-rows: 65px min-content 1fr !important;
        }

        /* 鎖定上方 text 輸入框 textarea 本體高度 */
        [node-type="LikeJAllPinyin"] textarea:not([readonly]) {
            max-height: 65px !important;
        }
    `;
    document.head.appendChild(style);
}

app.registerExtension({
    name: "LikeJ.AllPinyinUI",
    async nodeCreated(node) {
        if (node.comfyClass !== "LikeJAllPinyin") return;

        // 建立底部的拼音預覽 Textarea
        const textarea = document.createElement("textarea");
        textarea.value = "";
        textarea.readOnly = true;
        textarea.placeholder = "";
        
        // 使用 ComfyUI 系統 CSS 變數，自動融入主題且不出現亮色白框
        textarea.style.cssText = `
            width: 100%;
            height: 100%;
            padding: 8px;
            resize: none;
            box-sizing: border-box;
            background-color: var(--comfy-input-bg, rgba(0, 0, 0, 0.25));
            color: var(--desc-text, inherit);
            border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
            border-radius: 6px;
            font-family: Consolas, monospace;
            font-size: 13px;
            outline: none;
        `;

        // 傳送空物件 {}，不再序列化儲存文字至 JSON
        node.addDOMWidget("pinyin_preview", "custom_textarea", textarea, {});

        // 監聽執行完成，更新顯示數據
        node.onExecuted = function (message) {
            if (message?.pinyin_list && textarea) {
                textarea.value = message.pinyin_list[0];
            }
            app.graph.setDirtyCanvas(true, true);
        };

        // 設定初始節點大小
        node.setSize([Math.max(node.size[0], 320), 320]);
    }
});