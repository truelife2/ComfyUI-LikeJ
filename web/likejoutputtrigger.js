import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LikeJ.OutputTrigger",
    async nodeCreated(node) {
        if (node.comfyClass === "LikeJOutputTrigger") {
            node.onConnectionsChange = function(type, index, connected, link_info) {
                // 僅處理輸入插槽 (type === 1)
                if (type === 1) {
                    // 1. 若最後一個插槽被連上線，自動新增下一個備用插槽
                    const lastInput = node.inputs[node.inputs.length - 1];
                    if (lastInput && lastInput.link !== null) {
                        const nextIndex = node.inputs.length + 1;
                        node.addInput(`input_${nextIndex}`, "*");
                    }

                    // 2. 移除尾端多餘的未連線插槽
                    // 條件：總數量大於 1，且「最後一個」與「倒數第二個」插槽都是空的
                    while (
                        node.inputs.length > 1 &&
                        node.inputs[node.inputs.length - 1].link === null &&
                        node.inputs[node.inputs.length - 2].link === null
                    ) {
                        node.removeInput(node.inputs.length - 1);
                    }

                    // 3. 自動調整節點高度，避免留下空白區域
                    node.setSize(node.computeSize());
                }
            };
        }
    }
});