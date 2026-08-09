import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LikeJ.GroupsBypasser",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "LikeJGroupsBypasser") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            const targetWidget = this.widgets?.find(w => w.name === "pos_groups");
            const invertWidget = this.widgets?.find(w => w.name === "neg_groups");

            // 1. 建立一個包含左右並排按鈕的 DOM 容器
            const container = document.createElement("div");
            container.style.cssText = "display: flex; gap: 6px; width: 100%; align-items: stretch; padding: 2px 0;";

            const createBtn = (labelText, mode, contentHtml) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "relative inline-flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation whitespace-nowrap appearance-none border-none font-medium font-inter transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-secondary-background-hover h-6 rounded-sm text-xs flex-1 border-0 bg-component-node-widget-background px-2 py-1 text-base-foreground";
                btn.innerHTML = `<span>${labelText}</span> ${contentHtml}`;
                btn.onclick = (e) => {
                    e.preventDefault();
                    this.setGroupsMode(mode);
                };
                return btn;
            };

            const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="#38bdf8"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
            const iconBan = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;

            const btnEnable = createBtn("Pos", 0, `${iconCheck} &nbsp;|&nbsp; Neg ${iconBan}`);
            const btnBypass = createBtn("Pos", 4, `${iconBan} &nbsp;|&nbsp; Neg ${iconCheck}`);

            container.appendChild(btnEnable);
            container.appendChild(btnBypass);

            // 以 DOM Widget 形式加入，讓它作為一個整體佔據版面
            this.addDOMWidget("action_buttons", "btn_group", container);

            // 調整 Widget 順序，讓按鈕顯示在最上方
            if (this.widgets && this.widgets.length >= 3) {
                const domWidget = this.widgets.pop();
                this.widgets.unshift(domWidget);
            }

            // 2. 自訂 Group 勾選選單
            const showCustomChecklist = (nodeEl, targetWidget, menuTitle, attrName, btnEl) => {
                const oldPopup = document.getElementById("likej-group-popup");
                if (oldPopup) oldPopup.remove();

                const canvasGroups = (app.graph._groups || []).map(g => g.title).filter(t => t && t.trim() !== "");
                const getSelectedList = () => targetWidget && targetWidget.value ? targetWidget.value.split(',').map(s => s.trim()).filter(Boolean) : [];

                const popup = document.createElement("div");
                popup.id = "likej-group-popup";
                popup.dataset.likejOwner = attrName;

                popup.style.cssText = `
                    position: fixed; z-index: 999999;
                    background: var(--comfy-menu-bg, #222226); color: var(--fg-color, #e0e0e0);
                    border: 1px solid var(--border-color, #3f3f46); border-radius: 8px;
                    padding: 10px 12px; min-width: 240px; max-width: 320px; max-height: 320px;
                    overflow-y: auto; box-shadow: 0 12px 28px rgba(0,0,0,0.65);
                    font-family: var(--font-family, sans-serif); font-size: 13px;
                    opacity: 0; transition: opacity 0.15s ease;
                `;

                const header = document.createElement("div");
                header.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.12));";

                const titleSpan = document.createElement("span");
                titleSpan.textContent = menuTitle;
                titleSpan.style.cssText = "font-weight: 600; font-size: 14px; color: var(--descrip-text, #e2e8f0);";

                const closeBtn = document.createElement("button");
                closeBtn.innerHTML = "✕";
                closeBtn.style.cssText = "background: transparent; border: none; color: #9ca3af; font-size: 14px; cursor: pointer; padding: 2px 6px; border-radius: 4px;";
                closeBtn.onclick = (e) => { e.stopPropagation(); removeMenu(); };

                header.appendChild(titleSpan);
                header.appendChild(closeBtn);
                popup.appendChild(header);

                if (canvasGroups.length === 0) {
                    const emptyMsg = document.createElement("div");
                    emptyMsg.textContent = "(No Group)";
                    emptyMsg.style.cssText = "color: #71717a; padding: 12px 0; text-align: center;";
                    popup.appendChild(emptyMsg);
                } else {
                    canvasGroups.forEach(title => {
                        const label = document.createElement("label");
                        label.style.cssText = "display: flex; align-items: center; padding: 6px 8px; cursor: pointer; border-radius: 5px; gap: 10px; margin-bottom: 2px;";
                        label.onmouseover = () => label.style.background = "rgba(255,255,255,0.08)";
                        label.onmouseout = () => label.style.background = "transparent";

                        const checkbox = document.createElement("input");
                        checkbox.type = "checkbox";
                        checkbox.style.cssText = "cursor: pointer; width: 15px; height: 15px; accent-color: #38bdf8;";
                        checkbox.checked = getSelectedList().includes(title);

                        checkbox.onchange = () => {
                            let currentList = getSelectedList();
                            if (checkbox.checked) {
                                if (!currentList.includes(title)) currentList.push(title);
                            } else {
                                currentList = currentList.filter(t => t !== title);
                            }
                            targetWidget.value = currentList.join(", ");
                        };

                        const span = document.createElement("span");
                        span.textContent = title;
                        span.style.cssText = "word-break: break-all; line-height: 1.3;";

                        label.appendChild(checkbox);
                        label.appendChild(span);
                        popup.appendChild(label);
                    });
                }

                document.body.appendChild(popup);

                const rect = nodeEl ? nodeEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
                const nodeCenterX = rect.left + rect.width / 2;
                const nodeCenterY = rect.top + rect.height / 2;

                const popWidth = popup.offsetWidth || 260;
                const popHeight = popup.offsetHeight || 200;

                let posX = nodeCenterX - popWidth / 2;
                let posY = nodeCenterY - popHeight / 2;

                posX = Math.max(10, Math.min(posX, window.innerWidth - popWidth - 10));
                posY = Math.max(10, Math.min(posY, window.innerHeight - popHeight - 10));

                popup.style.left = `${posX}px`;
                popup.style.top = `${posY}px`;
                popup.style.opacity = "1";

                function removeMenu() {
                    popup.remove();
                    document.removeEventListener("pointerdown", onPointerDown, true);
                }

                function onPointerDown(e) {
                    if (!popup.contains(e.target) && !btnEl.contains(e.target)) {
                        removeMenu();
                    }
                }

                setTimeout(() => document.addEventListener("pointerdown", onPointerDown, true), 50);
            };

            // 3. 輸入框按鈕注入
            const setupDOM = () => {
                const currentId = this.id;
                if (currentId === undefined || currentId === null) return false;

                const nodeRows = document.querySelectorAll(`[node-id="${currentId}"]`);
                if (nodeRows.length === 0) return false;

                nodeRows.forEach(row => {
                    const input = row.querySelector('input');
                    if (input) {
                        const attrName = input.getAttribute('aria-label');
                        if (attrName === 'pos_groups' || attrName === 'neg_groups') {
                            const widgetObj = (attrName === 'pos_groups') ? targetWidget : invertWidget;
                            const menuTitle = (attrName === 'pos_groups') ? "☑ Select pos_groups" : "☑ Select neg_groups";

                            const parent = input.parentElement;
                            if (parent && widgetObj && !parent.querySelector(`.likej-btn-${attrName}`)) {
                                input.style.paddingRight = "28px";

                                const btn = document.createElement("button");
                                btn.className = `likej-inline-btn likej-btn-${attrName}`;
                                btn.title = "Select Group";
                                btn.type = "button";
                                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 2 2 4-4"/><path d="m3 8 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`;

                                btn.style.cssText = `
                                    position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
                                    background: transparent; color: var(--component-node-foreground, #9ca3af);
                                    border: none; border-radius: 4px; width: 22px; height: 22px; padding: 0;
                                    cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center;
                                    transition: all 0.15s ease;
                                `;

                                btn.onmouseover = () => {
                                    btn.style.background = "rgba(255, 255, 255, 0.15)";
                                    btn.style.color = "#38bdf8";
                                };
                                btn.onmouseout = () => {
                                    btn.style.background = "transparent";
                                    btn.style.color = "var(--component-node-foreground, #9ca3af)";
                                };

                                btn.onclick = (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const existingPopup = document.getElementById("likej-group-popup");
                                    if (existingPopup) {
                                        const isSameWidget = existingPopup.dataset.likejOwner === attrName;
                                        existingPopup.remove();
                                        if (isSameWidget) return;
                                    }

                                    const nodeEl = row.closest('.lg-node') || row.closest('[class*="node"]') || row.parentElement.parentElement;
                                    showCustomChecklist(nodeEl, widgetObj, menuTitle, attrName, btn);
                                };

                                parent.appendChild(btn);
                            }
                        }
                    }
                });

                return true;
            };

            const timer = setInterval(() => {
                if (setupDOM()) clearInterval(timer);
            }, 100);

            const observer = new MutationObserver(() => setupDOM());
            observer.observe(document.body, { childList: true, subtree: true });

            this.setGroupsMode = function(primaryMode) {
                const invertMode = (primaryMode === 0) ? 4 : 0;
                const targetNames = (targetWidget && targetWidget.value) ? targetWidget.value.split(',').map(s => s.trim()).filter(Boolean) : [];
                const invertNames = (invertWidget && invertWidget.value) ? invertWidget.value.split(',').map(s => s.trim()).filter(Boolean) : [];

                let hasChanged = false;
                for (let group of (app.graph._groups || [])) {
                    let targetMode = null;
                    if (targetNames.includes(group.title)) targetMode = primaryMode;
                    else if (invertNames.includes(group.title)) targetMode = invertMode;

                    if (targetMode !== null) {
                        group.recomputeInsideNodes(); 
                        for (let node of group._nodes) {
                            if (node.mode !== targetMode) {
                                node.mode = targetMode;
                                hasChanged = true;
                            }
                        }
                    }
                }
                if (hasChanged) app.graph.setDirtyCanvas(true, true);
            };
        };
    }
});