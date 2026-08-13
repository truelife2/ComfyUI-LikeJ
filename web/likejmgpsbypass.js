import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LikeJ.MultiGroupsBypasser",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "LikeJMultiGroupsBypasser") return;

        const originalSerialize = nodeType.prototype.serialize;
        nodeType.prototype.serialize = function (o) {
            if (originalSerialize) {
                o = originalSerialize.apply(this, arguments) || o;
            }
            if (!o) {
                o = {};
            }
            if (!o.widgets_values) {
                o.widgets_values = [];
            }
            if (this && this.widgets_values && this.widgets_values[0]) {
                o.widgets_values[0] = this.widgets_values[0];
            }
            return o;
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            if (this.size) {
                this.size[0] = Math.max(this.size[0], 420);
            } else {
                this.size = [420, 200];
            }

            if (!this.widgets_values) {
                this.widgets_values = [""];
            }

            let showTitles = false;
            let groupLists = [];

            const saveData = () => {
                const dataObj = {
                    showTitles: showTitles,
                    items: groupLists
                };
                const str = JSON.stringify(dataObj);
                if (this.widgets && this.widgets.length > 0) {
                    const w = this.widgets.find(w => w.name === "groups_data");
                    if (w) w.value = str;
                }
                if (this.widgets_values) {
                    this.widgets_values[0] = str;
                } else {
                    this.widgets_values = [str];
                }
            };

            const loadData = () => {
                try {
                    let val = "";
                    if (this.widgets && this.widgets.length > 0) {
                        val = this.widgets.find(w => w.name === "groups_data")?.value || this.widgets_values[0] || "";
                    } else {
                        val = this.widgets_values[0] || "";
                    }
                    if (!val) {
                        groupLists = [{ title: "", groups: "" }];
                        showTitles = false;
                        return;
                    }
                    const parsed = JSON.parse(val);
                    
                    if (Array.isArray(parsed)) {
                        groupLists = parsed.map(item => {
                            if (typeof item === 'string') {
                                return { title: "", groups: item };
                            }
                            return {
                                title: item.title !== undefined ? item.title : "",
                                groups: item.groups !== undefined ? item.groups : ""
                            };
                        });
                        showTitles = false;
                    } else if (parsed && typeof parsed === 'object') {
                        showTitles = parsed.showTitles !== undefined ? Boolean(parsed.showTitles) : false;
                        const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
                        groupLists = rawItems.map(item => {
                            if (typeof item === 'string') {
                                return { title: "", groups: item };
                            }
                            return {
                                title: item.title !== undefined ? item.title : "",
                                groups: item.groups !== undefined ? item.groups : ""
                            };
                        });
                    }
                } catch (e) {
                    groupLists = [];
                    showTitles = false;
                }
                if (!Array.isArray(groupLists) || groupLists.length === 0) {
                    groupLists = [{ title: "", groups: "" }];
                    saveData();
                }
            };

            const mainContainer = document.createElement("div");
            mainContainer.style.cssText = "display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 0; box-sizing: border-box;";

            const rowsContainer = document.createElement("div");
            rowsContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px; width: 100%;";

            const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
            const iconBan = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.64" y1="5.64" x2="18.36" y2="18.36"/></svg>`;
            
            const iconTrash = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
            const iconUp = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
            const iconDown = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

            const showCustomChecklist = (targetObj, menuTitle, btnEl, inputEl, index, nodeInstance) => {
                const oldPopup = document.getElementById("likej-switcher-popup");
                if (oldPopup) oldPopup.remove();

                const canvasGroups = (app.graph._groups || []).map(g => g.title).filter(t => t && t.trim() !== "");
                const getSelectedList = () => targetObj.groups ? targetObj.groups.split(',').map(s => s.trim()).filter(Boolean) : [];

                const popup = document.createElement("div");
                popup.id = "likej-switcher-popup";
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
                    emptyMsg.textContent = "(No groups on canvas)";
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
                            const newVal = currentList.join(", ");
                            targetObj.groups = newVal;
                            if (inputEl) inputEl.value = newVal;
                            groupLists[index].groups = newVal;
                            saveData();
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

                const popupRect = popup.getBoundingClientRect();
                if (nodeInstance && nodeInstance.pos && nodeInstance.size && app.canvas) {
                    const canvasRect = app.canvas.canvas.getBoundingClientRect();
                    const scale = app.canvas.ds.scale;
                    const offset = app.canvas.ds.offset;

                    const nodeScreenX = (nodeInstance.pos[0] + offset[0]) * scale + canvasRect.left;
                    const nodeScreenY = (nodeInstance.pos[1] + offset[1]) * scale + canvasRect.top;
                    const nodeScreenWidth = nodeInstance.size[0] * scale;
                    const nodeScreenHeight = nodeInstance.size[1] * scale;

                    let posX = nodeScreenX + (nodeScreenWidth - popupRect.width) / 2;
                    let posY = nodeScreenY + (nodeScreenHeight - popupRect.height) / 2;

                    posX = Math.max(10, Math.min(posX, window.innerWidth - popupRect.width - 10));
                    posY = Math.max(10, Math.min(posY, window.innerHeight - popupRect.height - 10));

                    popup.style.left = `${posX}px`;
                    popup.style.top = `${posY}px`;
                } else {
                    popup.style.left = `${(window.innerWidth - popupRect.width) / 2}px`;
                    popup.style.top = `${(window.innerHeight - popupRect.height) / 2}px`;
                }
                popup.style.opacity = "1";

                function removeMenu() {
                    popup.remove();
                    document.removeEventListener("pointerdown", onPointerDown, true);
                }

                function onPointerDown(e) {
                    if (!popup.contains(e.target) && !btnEl.contains(e.target)) removeMenu();
                }

                setTimeout(() => document.addEventListener("pointerdown", onPointerDown, true), 50);
            };

            const setGroupsModeByString = (groupsStr, mode) => {
                if (!groupsStr) return;
                const names = groupsStr.split(',').map(s => s.trim()).filter(Boolean);
                let hasChanged = false;

                for (let group of (app.graph._groups || [])) {
                    if (names.includes(group.title)) {
                        group.recomputeInsideNodes();
                        for (let node of group._nodes) {
                            if (node.mode !== mode) {
                                node.mode = mode;
                                hasChanged = true;
                            }
                        }
                    }
                }
                if (hasChanged) app.graph.setDirtyCanvas(true, true);
            };

            const renderRows = () => {
                rowsContainer.innerHTML = "";

                groupLists.forEach((item, i) => {
                    const row = document.createElement("div");
                    row.style.cssText = "display: flex; align-items: center; gap: 4px; width: 100%;";

                    const btnRemove = document.createElement("button");
                    btnRemove.type = "button";
                    btnRemove.title = "Remove this row";
                    btnRemove.innerHTML = iconTrash;
                    btnRemove.style.cssText = "height: 24px; width: 24px; min-width: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: none; padding: 0;";
                    btnRemove.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        groupLists.splice(i, 1);
                        if (groupLists.length === 0) groupLists.push({ title: "", groups: "" });
                        saveData();
                        renderRows();
                    };

                    const titleInput = document.createElement("input");
                    titleInput.type = "text";
                    titleInput.value = item.title;
                    titleInput.placeholder = `Title #${i + 1}`;
                    titleInput.className = "comfy-input";
                    titleInput.style.cssText = `width: 105px; min-width: 90px; padding: 2px 6px; height: 24px; font-size: 11px; border-radius: 4px; border: 1px solid var(--border-color, #3f3f46); background: var(--comfy-input-bg, #18181b); color: var(--input-text, #e4e4e7); box-sizing: border-box; display: ${showTitles ? 'block' : 'none'};`;
                    titleInput.oninput = (e) => {
                        item.title = e.target.value;
                        saveData();
                    };

                    const btnUp = document.createElement("button");
                    btnUp.type = "button";
                    btnUp.title = "Move up";
                    btnUp.innerHTML = iconUp;
                    btnUp.style.cssText = `height: 24px; width: 24px; min-width: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: none; padding: 0; color: var(--input-text, #e4e4e7); ${i === 0 ? 'opacity: 0.3; cursor: default;' : ''}`;
                    btnUp.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (i === 0) return;
                        const temp = groupLists[i];
                        groupLists[i] = groupLists[i - 1];
                        groupLists[i - 1] = temp;
                        saveData();
                        renderRows();
                    };

                    const btnDown = document.createElement("button");
                    btnDown.type = "button";
                    btnDown.title = "Move down";
                    btnDown.innerHTML = iconDown;
                    btnDown.style.cssText = `height: 24px; width: 24px; min-width: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: none; padding: 0; color: var(--input-text, #e4e4e7); ${i === groupLists.length - 1 ? 'opacity: 0.3; cursor: default;' : ''}`;
                    btnDown.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (i === groupLists.length - 1) return;
                        const temp = groupLists[i];
                        groupLists[i] = groupLists[i + 1];
                        groupLists[i + 1] = temp;
                        saveData();
                        renderRows();
                    };

                    const inputWrapper = document.createElement("div");
                    inputWrapper.style.cssText = "position: relative; flex: 1; display: flex; align-items: center;";

                    const input = document.createElement("input");
                    input.type = "text";
                    input.value = item.groups;
                    input.placeholder = `Select groups (e.g., Group A, Group B)`;
                    input.className = "comfy-input";
                    input.style.cssText = "width: 100%; padding: 4px 28px 4px 8px; height: 24px; font-size: 12px; border-radius: 4px; border: 1px solid var(--border-color, #3f3f46); background: var(--comfy-input-bg, #18181b); color: var(--input-text, #e4e4e7); box-sizing: border-box;";
                    
                    input.oninput = (e) => {
                        item.groups = e.target.value;
                        saveData();
                    };

                    const dropBtn = document.createElement("button");
                    dropBtn.type = "button";
                    dropBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 2 2 4-4"/><path d="m3 8 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`;
                    dropBtn.style.cssText = "position: absolute; right: 3px; top: 50%; transform: translateY(-50%); background: transparent; color: #9ca3af; border: none; cursor: pointer; padding: 2px; display: flex; align-items: center; justify-content: center;";
                    
                    dropBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const popup = document.getElementById("likej-switcher-popup");
                        if (popup && popup.targetInput === input) {
                            popup.remove();
                            return;
                        }
                        showCustomChecklist(item, `☑ Select Groups (Title: ${item.title || ('#' + (i + 1))})`, dropBtn, input, i, this);
                        document.getElementById("likej-switcher-popup").targetInput = input;
                    };

                    inputWrapper.appendChild(input);
                    inputWrapper.appendChild(dropBtn);

                    const btnEnable = document.createElement("button");
                    btnEnable.type = "button";
                    btnEnable.title = "Enable these groups";
                    btnEnable.innerHTML = iconCheck;
                    btnEnable.style.cssText = "height: 24px; min-width: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: none;";
                    btnEnable.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setGroupsModeByString(item.groups, 0);
                    };

                    const btnDisable = document.createElement("button");
                    btnDisable.type = "button";
                    btnDisable.title = "Bypass these groups";
                    btnDisable.innerHTML = iconBan;
                    btnDisable.style.cssText = "height: 24px; min-width: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: none;";
                    btnDisable.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setGroupsModeByString(item.groups, 4);
                    };

                    row.appendChild(btnRemove);
                    row.appendChild(btnUp);
                    row.appendChild(btnDown);
                    row.appendChild(titleInput);
                    row.appendChild(inputWrapper);
                    row.appendChild(btnEnable);
                    row.appendChild(btnDisable);

                    rowsContainer.appendChild(row);
                });

                const bottomBar = document.createElement("div");
                bottomBar.style.cssText = "display: flex; align-items: center; gap: 6px; width: 100%; margin-top: 2px;";

                const toggleWrapper = document.createElement("label");
                toggleWrapper.style.cssText = "display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 11px; color: var(--input-text, #e4e4e7); user-select: none; padding: 0 4px; white-space: nowrap;";
                
                const toggleCheckbox = document.createElement("input");
                toggleCheckbox.type = "checkbox";
                toggleCheckbox.checked = showTitles;
                toggleCheckbox.style.cssText = "cursor: pointer; width: 13px; height: 13px; accent-color: #38bdf8;";
                toggleCheckbox.onchange = (e) => {
                    showTitles = e.target.checked;
                    saveData();
                    renderRows();
                };

                const toggleText = document.createElement("span");
                toggleText.textContent = "Show Titles";

                toggleWrapper.appendChild(toggleCheckbox);
                toggleWrapper.appendChild(toggleText);

                const btnAdd = document.createElement("button");
                btnAdd.type = "button";
                btnAdd.textContent = "+ Add Group List";
                btnAdd.style.cssText = "flex: 1; height: 26px; background: var(--component-node-widget-background, #27272a); color: var(--input-text, #e4e4e7); border: 1px dashed var(--border-color, #3f3f46); border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center;";
                btnAdd.onmouseover = () => btnAdd.style.background = "rgba(255,255,255,0.08)";
                btnAdd.onmouseout = () => btnAdd.style.background = "var(--component-node-widget-background, #27272a)";
                btnAdd.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    groupLists.push({ title: "", groups: "" });
                    saveData();
                    renderRows();
                };

                // 新增：全部啟用按鈕
                const btnAllEnable = document.createElement("button");
                btnAllEnable.type = "button";
                btnAllEnable.title = "Enable all group lists";
                btnAllEnable.innerHTML = iconCheck;
                btnAllEnable.style.cssText = "height: 26px; min-width: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: 1px solid var(--border-color, #3f3f46);";
                btnAllEnable.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    groupLists.forEach(item => setGroupsModeByString(item.groups, 0));
                };

                // 新增：全部停用/Bypass按鈕
                const btnAllDisable = document.createElement("button");
                btnAllDisable.type = "button";
                btnAllDisable.title = "Bypass all group lists";
                btnAllDisable.innerHTML = iconBan;
                btnAllDisable.style.cssText = "height: 26px; min-width: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--component-node-widget-background, #27272a); border-radius: 4px; border: 1px solid var(--border-color, #3f3f46);";
                btnAllDisable.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    groupLists.forEach(item => setGroupsModeByString(item.groups, 4));
                };

                bottomBar.appendChild(toggleWrapper);
                bottomBar.appendChild(btnAdd);
                bottomBar.appendChild(btnAllEnable);
                bottomBar.appendChild(btnAllDisable);
                rowsContainer.appendChild(bottomBar);

                if (typeof this.setDirtyCanvas === "function") {
                    this.setDirtyCanvas(true, true);
                } else if (app.graph) {
                    app.graph.setDirtyCanvas(true, true);
                }

                if (typeof this.setSize === "function") {
                    const minSize = this.computeSize();
                    this.setSize([Math.max(this.size[0], 420), Math.max(this.size[1], minSize[1])]);
                }
            };

            const onConfigure = this.onConfigure;
            this.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                loadData();
                renderRows();
            };

            loadData();
            mainContainer.appendChild(rowsContainer);
            this.addDOMWidget("switcher_container", "switcher", mainContainer, { label: "" });

            renderRows();
        };
    }
});