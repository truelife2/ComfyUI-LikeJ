import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LikeJ.ImageSlots",
    async nodeCreated(node) {
        if (node.comfyClass !== "LikeJImageSlots") return;

        // 計算目前節點最大的槽位編號
        const getSlotCount = () => {
            let max = 1;
            if (node.inputs) {
                for (const input of node.inputs) {
                    if (input.name.startsWith("image_") || input.name.startsWith("mask_")) {
                        const num = parseInt(input.name.split("_")[1]);
                        if (num > max) max = num;
                    }
                }
            }
            return max;
        };

        // 按鈕 1：加入槽位 (+ Add Slot)
        node.addWidget("button", "+ Add Slot", null, () => {
            const nextCount = getSlotCount() + 1;
            node.addInput(`image_${nextCount}`, "IMAGE");
            node.addInput(`mask_${nextCount}`, "MASK");
            
            // 保持使用者設定的寬度 (node.size[0])，僅更新計算後的高度 (computed[1])
            const currentWidth = node.size[0];
            const computedSize = node.computeSize();
            node.setSize([currentWidth, computedSize[1]]);
        });

        // 按鈕 2：移除槽位 (- Remove Slot)
        node.addWidget("button", "- Remove Slot", null, () => {
            const currentCount = getSlotCount();
            if (currentCount <= 1) return; // 保留限制：至少維持 1 個槽位

            const imgName = `image_${currentCount}`;
            const maskName = `mask_${currentCount}`;

            // 倒序刪除最後一組 image 與 mask
            for (let i = node.inputs.length - 1; i >= 0; i--) {
                if (node.inputs[i].name === imgName || node.inputs[i].name === maskName) {
                    node.removeInput(i);
                }
            }
            
            // 保持使用者設定的寬度 (node.size[0])，僅更新計算後的高度 (computed[1])
            const currentWidth = node.size[0];
            const computedSize = node.computeSize();
            node.setSize([currentWidth, computedSize[1]]);
        });
    }
});