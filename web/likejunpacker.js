import { app } from "../../scripts/app.js";

const UNPACKER_CONFIGS = {
    "LikeJListUnpacker": { type: "*", prefix: "out_" },
    "LikeJImageUnpacker": { type: "IMAGE", prefix: "image_" },
    "LikeJAudioUnpacker": { type: "AUDIO", prefix: "audio_" },
    "LikeJVideoUnpacker": { type: "VIDEO", prefix: "video_" }
};

app.registerExtension({
    name: "LikeJ.Unpackers",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const config = UNPACKER_CONFIGS[nodeData.name];
        if (!config) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) {
                onNodeCreated.apply(this, arguments);
            }

            const node = this;

            // ⚡ 在節點建立的【同步】階段直接裁切，只保留 1 個預設腳位
            while (node.outputs && node.outputs.length > 1) {
                node.removeOutput(node.outputs.length - 1);
            }

            // 🎨 UI 控制按鈕
            const container = document.createElement("div");
            container.style.cssText = `
                display: flex; gap: 6px; padding: 4px 0;
                width: 100%; box-sizing: border-box;
            `;

            const btnAdd = document.createElement("button");
            btnAdd.innerText = "+ Add Output";
            btnAdd.style.cssText = `
                flex: 1; padding: 4px 8px; background: #2d5a88; color: #fff;
                border: 1px solid #4a82b8; border-radius: 4px; cursor: pointer;
                font-size: 11px; font-weight: bold;
            `;

            const btnDel = document.createElement("button");
            btnDel.innerText = "- Remove Output";
            btnDel.style.cssText = `
                flex: 1; padding: 4px 8px; background: #882d2d; color: #fff;
                border: 1px solid #b84a4a; border-radius: 4px; cursor: pointer;
                font-size: 11px; font-weight: bold;
            `;

            container.appendChild(btnAdd);
            container.appendChild(btnDel);

            node.addDOMWidget("unpacker_controls", "dom", container, {});

            // ➕ 動態新增腳位
            btnAdd.onclick = () => {
                if (node.outputs.length >= 32) return;
                const idx = node.outputs.length;
                node.addOutput(`${config.prefix}${idx}`, config.type);
                node.setSize(node.computeSize());
                node.setDirtyCanvas(true, true);
            };

            // ➖ 動態減少腳位（最少保留 1 個）
            btnDel.onclick = () => {
                if (node.outputs.length <= 1) return;
                node.removeOutput(node.outputs.length - 1);
                node.setSize(node.computeSize());
                node.setDirtyCanvas(true, true);
            };

            // 重算節點高度
            node.setSize(node.computeSize());
        };
    }
});