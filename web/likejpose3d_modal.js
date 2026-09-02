// 初始化彈窗為懸浮視窗，預設關閉時讓滑鼠事件穿透
function initFloatingModal(modal, content, left = '20px', top = '80px') {
    if (!modal || !content) return;
    modal.style.background = 'transparent';
    modal.style.pointerEvents = 'none';
    Object.assign(content.style, {
        pointerEvents: 'none',
        position: 'absolute',
        left, top,
        transform: 'none'
    });
}

// 實作彈窗標題列拖曳功能
function makeDraggable(header, content, ignoreCondition) {
    if (!header || !content) return;
    header.style.cursor = 'grab';
    let isDragging = false, startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
        if (ignoreCondition && ignoreCondition(e)) return;
        isDragging = true;
        header.style.cursor = 'grabbing';
        startX = e.clientX; startY = e.clientY;

        const rect = content.getBoundingClientRect();
        Object.assign(content.style, {
            position: 'absolute',
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            right: 'auto',
            bottom: 'auto',
            transform: 'none'
        });
        initialLeft = rect.left;
        initialTop = rect.top;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        content.style.left = `${initialLeft + (e.clientX - startX)}px`;
        content.style.top = `${initialTop + (e.clientY - startY)}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            header.style.cursor = 'grab';
        }
    });
}

// 綁定背景與按鈕關閉彈窗
function bindModalCloseEvents(modal, closeBtn, closeFn) {
    closeBtn?.addEventListener('click', closeFn);
    modal?.addEventListener('click', (e) => e.target === modal && closeFn());
}

// 觸發 Shape Keys 變更後的系統連動更新
function triggerShapeKeyUpdate() {
    if (typeof getShapeKeysData === 'function') AppState.config.shapeKeys = getShapeKeysData();
    if (typeof notifyConfigChange === 'function') notifyConfigChange();
    if (AppState.renderer && AppState.scene && AppState.camera) {
        AppState.renderer.render(AppState.scene, AppState.camera);
    }
    if (typeof sendPoseToComfyUI === 'function') sendPoseToComfyUI();
}

function closeAllFloatModals() {
    closeJointsModal();
    closeShapeKeysModal();
    closePartsModal();
}

// ==========================================
// --- 1. 骨骼關節列表彈窗 Modal ---
// ==========================================
const jointsListModal = document.getElementById('joints-list-modal');
const jointsContainer = document.getElementById('joints-list-container');
const btnJointsModal = document.getElementById('btn-joints-modal');
const btnCloseJointsModal = document.getElementById('btn-close-joints-modal');
const inputSearchJoints = document.getElementById('input-search-joints');
const btnCopyJoints = document.getElementById('btn-copy-joints');

const jointsModalContent = jointsListModal?.querySelector('.modal-content');
const jointsModalHeader = jointsModalContent?.querySelector('.modal-header');

let jointsModeBtnGroup = null;
if (jointsModalHeader && !document.getElementById('modal-btn-mode-rotate')) {
    jointsModalHeader.style.cssText = 'display: flex; flex-direction: column; gap: 3px; align-items: stretch; padding: 8px 15px 6px 15px;';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; width: 100%;';
    while (jointsModalHeader.firstChild) topRow.appendChild(jointsModalHeader.firstChild);
    jointsModalHeader.appendChild(topRow);

    jointsModeBtnGroup = document.createElement('div');
    jointsModeBtnGroup.className = 'btn-group';
    jointsModeBtnGroup.style.cssText = 'display: flex; justify-content: center; gap: 6px; width: 100%;';
    jointsModeBtnGroup.innerHTML = `
        <button id="modal-btn-mode-rotate" class="toggle-btn active" style="padding: 4px 16px; font-size: 12px;" onclick="setTransformMode('rotate')">Rotate</button>
        <button id="modal-btn-mode-translate" class="toggle-btn" style="padding: 4px 16px; font-size: 12px;" onclick="setTransformMode('translate')">Move</button>
        <button id="modal-btn-mode-scale" class="toggle-btn" style="padding: 4px 16px; font-size: 12px;" onclick="setTransformMode('scale')">Zoom</button>
    `;
    jointsModalHeader.appendChild(jointsModeBtnGroup);
}

initFloatingModal(jointsListModal, jointsModalContent);
makeDraggable(jointsModalHeader, jointsModalContent, (e) => ['BUTTON', 'INPUT'].includes(e.target.tagName));

function renderJointList(filterText = '') {
    if (!jointsContainer) return;
    jointsContainer.innerHTML = '';

    const emptyHtml = `<div style="text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyJoints}</div>`;
    if (!AppState.jointSpheres?.length) {
        jointsContainer.innerHTML = emptyHtml;
        return;
    }

    const activeTarget = (AppState.transformControls?.visible) ? AppState.transformControls.object : null;
    let count = 0;

    AppState.jointSpheres.forEach((sphere) => {
        const bone = sphere.userData?.bone;
        if (!bone) return;

        const boneName = bone.name || "Unnamed_Joint";
        if (filterText && !boneName.toLowerCase().includes(filterText.toLowerCase())) return;

        count++;
        const item = document.createElement('div');
        item.className = 'joint-list-item';

        const isSelected = activeTarget && (activeTarget === bone || activeTarget.userData?.groupBones?.includes(bone));
        if (isSelected) item.classList.add('active');

        const bonesCount = sphere.userData.bones ? sphere.userData.bones.length : 1;
        const extraInfo = bonesCount > 1 ? `<span style="font-size: 10px; opacity: 0.8;">(+${bonesCount - 1})</span>` : '';
        item.innerHTML = `<span>🔴 ${boneName}</span> ${extraInfo}`;

        item.addEventListener('click', () => {
            if (!AppState.showJoints) {
                AppState.showJoints = true;
                updateLanguage();
                if (typeof updateJointSpheres === 'function') updateJointSpheres();
                if (typeof sendPoseToComfyUI === 'function') sendPoseToComfyUI();
            }

            AppState.transformControls.attach(bone);
            AppState.transformControls.visible = true;

            const labelText = bonesCount > 1
                ? `${bone.name} (+${bonesCount - 1} ${i18n[AppState.currentLang].drivenBones})`
                : bone.name;

            if (typeof updateSelectedBoneLabel === 'function') updateSelectedBoneLabel(labelText);
            renderJointList(inputSearchJoints?.value || '');
        });

        jointsContainer.appendChild(item);
    });

    if (count === 0) jointsContainer.innerHTML = emptyHtml;
}

function closeJointsModal() {
    if (jointsListModal) {
        jointsListModal.classList.remove('active');
        if (jointsModalContent) jointsModalContent.style.pointerEvents = 'none';
    }
}

btnJointsModal?.addEventListener('click', () => {
    closeShapeKeysModal();
    closePartsModal();
    if (inputSearchJoints) inputSearchJoints.value = '';
    renderJointList();
    if (jointsListModal) {
        jointsListModal.classList.add('active');
        if (jointsModalContent) jointsModalContent.style.pointerEvents = 'auto';
    }
});

bindModalCloseEvents(jointsListModal, btnCloseJointsModal, closeJointsModal);
inputSearchJoints?.addEventListener('input', (e) => renderJointList(e.target.value));

btnCopyJoints?.addEventListener('click', async () => {
    const jointNames = AppState.jointSpheres
        ?.map(s => s.userData?.bone?.name)
        .filter(Boolean) || [];

    if (!jointNames.length) return;

    try {
        await navigator.clipboard.writeText(jointNames.join('\n'));
        btnCopyJoints.innerText = i18n[AppState.currentLang].msgCopySuccess || 'Joint names copied!';
        setTimeout(() => updateLanguage(), 1500);
    } catch (err) {
        console.error('Failed to copy the joint names:', err);
    }
});


// ==========================================
// --- 2. 儲存姿態彈窗 Modal ---
// ==========================================
const savePoseModal = document.getElementById('save-pose-modal');
const selectExistingPose = document.getElementById('select-existing-pose');
const inputPoseName = document.getElementById('input-pose-name');
const btnCloseSaveModal = document.getElementById('btn-close-save-modal');
const btnCancelSavePose = document.getElementById('btn-cancel-save-pose');
const btnConfirmSavePose = document.getElementById('btn-confirm-save-pose');
const btnSaveCustomPose = document.getElementById('btn-save-custom-pose');

btnSaveCustomPose?.addEventListener('click', async () => {
    if (!AppState.config.modelName) return;

    if (inputPoseName) inputPoseName.value = "pose_" + new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (selectExistingPose) selectExistingPose.innerHTML = `<option value="">${i18n[AppState.currentLang].optNewPose}</option>`;

    const currentModelFolder = AppState.config.modelName.replace(/\.(glb|gltf)$/i, '');

    try {
        const res = await fetch('/likejpose3d/list_saved_poses');
        const data = await res.json();

        if (data.success && data.poses && selectExistingPose) {
            data.poses
                .filter(p => {
                    const folder = (p.model_folder || '').replace(/\.(glb|gltf)$/i, '');
                    return folder === currentModelFolder || currentModelFolder.includes(folder) || folder.includes(currentModelFolder);
                })
                .forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.pose_name;
                    opt.innerText = item.pose_name;
                    selectExistingPose.appendChild(opt);
                });
        }
    } catch (e) {
        console.warn("無法取得已有姿態選單:", e);
    }

    savePoseModal?.classList.add('active');
});

selectExistingPose?.addEventListener('change', () => {
    if (selectExistingPose.value && inputPoseName) {
        inputPoseName.value = selectExistingPose.value;
    }
});

function closeSaveModal() {
    savePoseModal?.classList.remove('active');
}

bindModalCloseEvents(savePoseModal, btnCloseSaveModal, closeSaveModal);
btnCancelSavePose?.addEventListener('click', closeSaveModal);

btnConfirmSavePose?.addEventListener('click', async () => {
    const poseName = inputPoseName ? inputPoseName.value.trim() : '';
    if (!poseName) {
        alert(i18n[AppState.currentLang].msgPleaseEnterPoseName);
        return;
    }

    closeSaveModal();

    const prevTCVis = AppState.transformControls.visible;
    AppState.jointSpheres.forEach(s => s.visible = false);
    if (AppState.skeletonHelper) AppState.skeletonHelper.visible = false;
    AppState.transformControls.visible = false;

    AppState.renderer.render(AppState.scene, AppState.camera);
    const previewB64 = AppState.renderer.domElement.toDataURL("image/png");

    AppState.jointSpheres.forEach(s => s.visible = AppState.showJoints);
    if (AppState.skeletonHelper) AppState.skeletonHelper.visible = AppState.showJoints;
    AppState.transformControls.visible = AppState.showJoints && prevTCVis && !!AppState.transformControls.object;

    const poseData = {
        rotationOffset: AppState.config.rotationOffset || { x: 0, y: 0, z: 0 },
        pose: typeof getPoseData === 'function' ? getPoseData() : [],
        shapeKeys: typeof getShapeKeysData === 'function' ? getShapeKeysData() : {},
        hiddenParts: getHiddenPartsData(),
        camera: typeof getCameraData === 'function' ? getCameraData() : null,
        ambient: AppState.config.ambient,
        direct: AppState.config.direct,
        modelColor: AppState.config.modelColor,
        jointSize: AppState.config.jointSize !== undefined ? AppState.config.jointSize : AppState.jointScale,
        gizmoSize: AppState.config.gizmoSize !== undefined ? AppState.config.gizmoSize : AppState.transformControls.size
    };

    try {
        const res = await fetch('/likejpose3d/save_custom_pose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model_filename: AppState.config.modelName,
                pose_name: poseName,
                is_default: AppState.config.isDefaultModel,
                config: poseData,
                preview_b64: previewB64
            })
        });
        const result = await res.json();
        if (result.success) {
            alert(`${i18n[AppState.currentLang].msgSavePoseSuccess}\r\n${result.pose_name}.json (.png)`);
        } else {
            alert(i18n[AppState.currentLang].msgSaveFailed + (result.error || "Unknown Error"));
        }
    } catch (e) {
        alert(i18n[AppState.currentLang].msgSaveFailed + e);
    }
});


// ==========================================
// --- 3. 載入姿態彈窗 Modal ---
// ==========================================
const poseModal = document.getElementById('pose-modal');
const poseGallery = document.getElementById('pose-gallery');
const btnLoadPose = document.getElementById('btn-load-pose');
const btnCloseModal = document.getElementById('btn-close-modal');

btnLoadPose?.addEventListener('click', async () => {
    const chkKeepModel = document.getElementById('chk-keep-current-model');
    if (chkKeepModel) chkKeepModel.checked = false;

    poseModal?.classList.add('active');
    if (poseGallery) {
        poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 20px;">Loading...</div>`;
    }

    try {
        const res = await fetch('/likejpose3d/list_saved_poses');
        const data = await res.json();

        if (data.success && data.poses?.length > 0 && poseGallery) {
            poseGallery.innerHTML = '';
            data.poses.forEach(item => {
                const card = document.createElement('div');
                card.className = 'pose-card';

                const imgHTML = item.has_preview
                    ? `<img class="pose-card-img" src="${item.preview_url}" alt="${item.pose_name}">`
                    : `<div class="pose-card-placeholder">🧍</div>`;

                card.innerHTML = `
                    <button class="pose-card-delete" title="Delete Pose">✕</button>
                    <div class="pose-card-img-wrapper">${imgHTML}</div>
                    <div class="pose-card-info">
                        <div class="pose-card-title" title="${item.pose_name}">${item.pose_name}</div>
                        <div class="pose-card-model" title="${item.model_folder}">${item.model_folder}</div>
                    </div>
                `;

                card.addEventListener('click', () => {
                    const keepCurrentModel = document.getElementById('chk-keep-current-model')?.checked || false;
                    if (typeof loadPoseConfigAndModel === 'function') {
                        loadPoseConfigAndModel(item, keepCurrentModel);
                    }
                    poseModal?.classList.remove('active');
                });

                card.querySelector('.pose-card-delete')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(i18n[AppState.currentLang].confirmDeletePose)) return;

                    try {
                        const res = await fetch('/likejpose3d/delete_pose', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                folder: item.model_folder,
                                pose_name: item.pose_name,
                                is_default: item.is_default
                            })
                        });
                        const result = await res.json();
                        if (result.success) {
                            card.remove();
                            if (poseGallery.children.length === 0) {
                                poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyPoses}</div>`;
                            }
                        } else {
                            alert(i18n[AppState.currentLang].msgDeleteFailed + (result.error || "Unknown Error"));
                        }
                    } catch (err) {
                        alert(i18n[AppState.currentLang].msgDeleteFailed + err);
                    }
                });

                poseGallery.appendChild(card);
            });
        } else if (poseGallery) {
            poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyPoses}</div>`;
        }
    } catch (e) {
        if (poseGallery) {
            poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 20px;">Failed to load pose list: ${e}</div>`;
        }
    }
});

bindModalCloseEvents(poseModal, btnCloseModal, () => poseModal?.classList.remove('active'));


// ==========================================
// --- 4. Shape Keys 彈窗與設定管理 ---
// ==========================================
const shapeKeysModal = document.getElementById('shapekeys-list-modal');
const shapeKeysContainer = document.getElementById('shapekeys-list-container');
const btnShapeKeysModal = document.getElementById('btn-shapekeys-modal');
const btnCloseShapeKeysModal = document.getElementById('btn-close-shapekeys-modal');

const modalContent = shapeKeysModal?.querySelector('.modal-content');
const modalHeader = modalContent?.querySelector('.modal-header');

initFloatingModal(shapeKeysModal, modalContent);

let btnResetAllShapeKeys = null;
if (modalHeader) {
    modalHeader.style.display = 'flex';
    modalHeader.style.alignItems = 'center';

    btnResetAllShapeKeys = document.createElement('button');
    btnResetAllShapeKeys.setAttribute('data-i18n', 'btnResetAllShapeKeys');
    btnResetAllShapeKeys.setAttribute('data-i18n-title', 'tooltipResetShapeKeys');
    btnResetAllShapeKeys.innerText = '🔄 ' + i18n[AppState.currentLang].btnResetAllShapeKeys;
    btnResetAllShapeKeys.title = i18n[AppState.currentLang].tooltipResetShapeKeys;
    btnResetAllShapeKeys.style.cssText = 'padding: 3px 8px; font-size: 11px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; cursor: pointer; color: #1d4ed8; font-weight: 600; margin-left: auto; margin-right: 6px; transition: all 0.2s;';

    btnResetAllShapeKeys.addEventListener('mouseenter', () => btnResetAllShapeKeys.style.background = '#dbeafe');
    btnResetAllShapeKeys.addEventListener('mouseleave', () => btnResetAllShapeKeys.style.background = '#eff6ff');

    btnResetAllShapeKeys.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!AppState.currentModel) return;

        AppState.currentModel.traverse((child) => {
            if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
                child.morphTargetInfluences.fill(0);
            }
        });

        renderShapeKeysList();
        triggerShapeKeyUpdate();
    });

    if (btnCloseShapeKeysModal) btnCloseShapeKeysModal.before(btnResetAllShapeKeys);
    else modalHeader.appendChild(btnResetAllShapeKeys);
}

makeDraggable(modalHeader, modalContent, (e) => e.target === btnResetAllShapeKeys || e.target === btnCloseShapeKeysModal);

function renderShapeKeysList() {
    if (!shapeKeysContainer) return;

    Object.assign(shapeKeysContainer.style, { display: 'flex', flexDirection: 'column', gap: '5px' });
    shapeKeysContainer.innerHTML = '';

    const meshesWithMorphs = [];
    AppState.currentModel?.traverse((child) => {
        if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
            meshesWithMorphs.push(child);
        }
    });

    const emptyHtml = `<div style="text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyShapeKeys}</div>`;
    if (!meshesWithMorphs.length) {
        shapeKeysContainer.innerHTML = emptyHtml;
        return;
    }

    let hasShapeKeys = false;
    meshesWithMorphs.forEach((mesh) => {
        const dictionary = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;

        Object.keys(dictionary).forEach((keyName) => {
            hasShapeKeys = true;
            const index = dictionary[keyName];
            const currentValue = influences[index] !== undefined ? influences[index] : 0;

            const group = document.createElement('div');
            group.className = 'shapekey-item control-group';
            group.addEventListener('mouseenter', () => group.style.background = '#f8fafc');
            group.addEventListener('mouseleave', () => group.style.background = '#ffffff');

            group.innerHTML = `
                <label class="shapekey-header">
                    <span class="shapekey-name" title="${keyName}">${keyName}</span>
                    <span class="val-shapekey shapekey-val">${currentValue.toFixed(2)}</span>
                </label>
                <input type="range" class="opt-shapekey-slider" min="-3" max="3" step="0.01" value="${currentValue}">
            `;

            const slider = group.querySelector('.opt-shapekey-slider');
            const valSpan = group.querySelector('.val-shapekey');

            const updateValue = (val) => {
                slider.value = val;
                influences[index] = val;
                valSpan.innerText = val.toFixed(2);
                triggerShapeKeyUpdate();
            };

            slider.addEventListener('input', (e) => updateValue(parseFloat(e.target.value)));
            group.addEventListener('dblclick', () => updateValue(0));

            shapeKeysContainer.appendChild(group);
        });
    });

    if (!hasShapeKeys) shapeKeysContainer.innerHTML = emptyHtml;
}

function closeShapeKeysModal() {
    if (shapeKeysModal) {
        shapeKeysModal.classList.remove('active');
        if (modalContent) modalContent.style.pointerEvents = 'none';
    }
}

btnShapeKeysModal?.addEventListener('click', () => {
    closeJointsModal();
    closePartsModal();
    renderShapeKeysList();
    if (shapeKeysModal) {
        shapeKeysModal.classList.add('active');
        if (modalContent) modalContent.style.pointerEvents = 'auto';
    }
});

bindModalCloseEvents(shapeKeysModal, btnCloseShapeKeysModal, closeShapeKeysModal);


// ==========================================
// --- 5. 模型部件選擇彈窗 Modal ---
// ==========================================
const partsListModal = document.getElementById('parts-list-modal');
const partsContainer = document.getElementById('parts-list-container');
const btnPartsModal = document.getElementById('btn-parts-modal');
const btnClosePartsModal = document.getElementById('btn-close-parts-modal');
const btnPartsShowAll = document.getElementById('btn-parts-show-all');
const btnPartsHideAll = document.getElementById('btn-parts-hide-all');

const partsModalContent = partsListModal?.querySelector('.modal-content');
const partsModalHeader = partsModalContent?.querySelector('.modal-header');

initFloatingModal(partsListModal, partsModalContent, '20px', '120px');
makeDraggable(partsModalHeader, partsModalContent, (e) => e.target.tagName === 'BUTTON');

function closePartsModal() {
    if (partsListModal) {
        partsListModal.classList.remove('active');
        if (partsModalContent) partsModalContent.style.pointerEvents = 'none';
    }
}

function renderPartsList() {
    if (!partsContainer) return;
    partsContainer.innerHTML = '';

    const meshes = [];
    AppState.currentModel?.traverse((child) => {
        if (child.isMesh) meshes.push(child);
    });

    if (!meshes.length) {
        partsContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">None Model Parts</div>`;
        return;
    }

    meshes.forEach((mesh, index) => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px;';

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; font-weight: 500; color: #334155;';
        nameSpan.innerText = mesh.name || `Part_${index + 1}`;
        nameSpan.title = mesh.name || `Part_${index + 1}`;

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = mesh.visible;
        chk.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';

        chk.addEventListener('change', () => {
            mesh.visible = chk.checked;
            AppState.config.hiddenParts = getHiddenPartsData();
            notifyConfigChange();
            sendPoseToComfyUI();
            if (AppState.renderer && AppState.scene && AppState.camera) {
                AppState.renderer.render(AppState.scene, AppState.camera);
            }
        });

        item.appendChild(nameSpan);
        item.appendChild(chk);
        partsContainer.appendChild(item);
    });
}

function getHiddenPartsData() {
    if (!AppState.currentModel) return [];
    const hiddenParts = [];
    AppState.currentModel.traverse((child) => {
        if (child.isMesh && child.visible === false) {
            if (child.name) hiddenParts.push(child.name);
        }
    });
    return hiddenParts;
}

function applyHiddenPartsData(hiddenParts) {
    
    if (!AppState.currentModel || !Array.isArray(hiddenParts)) return;

    const hiddenSet = new Set(hiddenParts);
    AppState.currentModel.traverse((child) => {
        if (child.isMesh && child.name) {
            child.visible = !hiddenSet.has(child.name);
        }
    });
    renderPartsList();
}

btnPartsModal?.addEventListener('click', () => {
    closeJointsModal();
    closeShapeKeysModal();

    renderPartsList();
    if (partsListModal) {
        partsListModal.classList.add('active');
        if (partsModalContent) partsModalContent.style.pointerEvents = 'auto';
    }
});

bindModalCloseEvents(partsListModal, btnClosePartsModal, closePartsModal);

btnPartsShowAll?.addEventListener('click', () => {
    AppState.currentModel?.traverse((child) => {
        if (child.isMesh) child.visible = true;
    });
    AppState.config.hiddenParts = getHiddenPartsData();

    notifyConfigChange();
    sendPoseToComfyUI();

    renderPartsList();
});

btnPartsHideAll?.addEventListener('click', () => {
    AppState.currentModel?.traverse((child) => {
        if (child.isMesh) child.visible = false;
    });
    AppState.config.hiddenParts = getHiddenPartsData();

    notifyConfigChange();
    sendPoseToComfyUI();

    renderPartsList();
});


// ==========================================
// --- 6. 瀏覽與載入 VNCCS 姿勢庫 ---
// ==========================================
const VNCCS_BONE_MAP = {
    "root": "Root", "_rootJoint": "Root", "pelvis": "pelvis",
    "spine_01": "spine_01", "spine_02": "spine_02", "spine_03": "spine_03", "neck_01": "neck_01", "head": "head",
    "clavicle_l": "clavicle_l", "upperarm_l": "upperarm_l", "lowerarm_l": "lowerarm_l", "hand_l": "hand_l",
    "thumb_01_l": "thumb_01_l", "thumb_02_l": "thumb_02_l", "thumb_03_l": "thumb_03_l",
    "index_01_l": "index_01_l", "index_02_l": "index_02_l", "index_03_l": "index_03_l",
    "middle_01_l": "middle_01_l", "middle_02_l": "middle_02_l", "middle_03_l": "middle_03_l",
    "ring_01_l": "ring_01_l", "ring_02_l": "ring_02_l", "ring_03_l": "ring_03_l",
    "pinky_01_l": "pinky_01_l", "pinky_02_l": "pinky_02_l", "pinky_03_l": "pinky_03_l",
    "clavicle_r": "clavicle_r", "upperarm_r": "upperarm_r", "lowerarm_r": "lowerarm_r", "hand_r": "hand_r",
    "thumb_01_r": "thumb_01_r", "thumb_02_r": "thumb_02_r", "thumb_03_r": "thumb_03_r",
    "index_01_r": "index_01_r", "index_02_r": "index_02_r", "index_03_r": "index_03_r",
    "middle_01_r": "middle_01_r", "middle_02_r": "middle_02_r", "middle_03_r": "middle_03_r",
    "ring_01_r": "ring_01_r", "ring_02_r": "ring_02_r", "ring_03_r": "ring_03_r",
    "pinky_01_r": "pinky_01_r", "pinky_02_r": "pinky_02_r", "pinky_03_r": "pinky_03_r",
    "thigh_l": "thigh_l", "calf_l": "calf_l", "foot_l": "foot_l", "ball_l": "ball_l",
    "thigh_r": "thigh_r", "calf_r": "calf_r", "foot_r": "foot_r", "ball_r": "ball_r"
};

function convertVnccsToInternalPose(vnccsData, customOffsets = {}, ignoreHipPosition = false) {
    if (!vnccsData?.bones) return null;
    const poseArray = [];

    resetPose({ skipSharpKeys: true });

    const rootQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(-90));
    poseArray.push({
        name: "Root",
        p: null,
        q: [rootQuat.x, rootQuat.y, rootQuat.z, rootQuat.w],
        s: [1, 1, 1]
    });

    for (const [vnccsBoneName, eulerDeg] of Object.entries(vnccsData.bones)) {
        const targetBoneName = VNCCS_BONE_MAP[vnccsBoneName] || vnccsBoneName;
        if (!targetBoneName) continue;

        let targetBoneNode = null;
        AppState.currentModel?.traverse((child) => {
            if (child.isBone && child.name === targetBoneName) targetBoneNode = child;
        });

        if (targetBoneNode) {
            const qWorldOld = new THREE.Quaternion();
            targetBoneNode.getWorldQuaternion(qWorldOld);

            const qParentWorld = new THREE.Quaternion();
            targetBoneNode.parent?.getWorldQuaternion(qParentWorld);

            const wx = THREE.MathUtils.degToRad(eulerDeg[0] || 0);
            const wy = THREE.MathUtils.degToRad(eulerDeg[1] || 0);
            const wz = THREE.MathUtils.degToRad(eulerDeg[2] || 0);

            const qWorldX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wx);
            const qWorldY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wy);
            const qWorldZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), wz);

            const qWorldDelta = new THREE.Quaternion().copy(qWorldX).multiply(qWorldY).multiply(qWorldZ);
            const qWorldNew = qWorldDelta.multiply(qWorldOld);
            const qFinal = qParentWorld.clone().invert().multiply(qWorldNew);

            poseArray.push({
                name: targetBoneName,
                p: null,
                q: [qFinal.x, qFinal.y, qFinal.z, qFinal.w],
                s: [1, 1, 1]
            });
        }
    }

    const rotOffset = vnccsData.modelRotation ? {
        x: THREE.MathUtils.degToRad(vnccsData.modelRotation[0] || 0),
        y: THREE.MathUtils.degToRad(vnccsData.modelRotation[1] || 0),
        z: THREE.MathUtils.degToRad(vnccsData.modelRotation[2] || 0)
    } : { x: 0, y: 0, z: 0 };

    return { rotationOffset: rotOffset, pose: poseArray, shapeKeys: null, camera: null };
}

async function loadVnccsPose(item) {
    try {
        const poseRes = await fetch(item.json_url);
        const rawData = await poseRes.json();
        if (!rawData) return;

        const poseConfig = Array.isArray(rawData.pose) ? rawData : convertVnccsToInternalPose(rawData);
        if (!poseConfig) {
            console.error(i18n[AppState.currentLang].msgParseVnccsError);
            return;
        }

        if (typeof applyPoseData === 'function') {
            applyPoseData(poseConfig.pose);
        } else {
            console.error("❌ 找不到 applyPoseData 函式！");
            alert("套用失敗：全域找不到 applyPoseData 處理函式");
            return;
        }

        if (poseConfig.rotationOffset && AppState.currentModel) {
            AppState.config.rotationOffset = poseConfig.rotationOffset;
            AppState.currentModel.rotation.set(
                poseConfig.rotationOffset.x,
                poseConfig.rotationOffset.y,
                poseConfig.rotationOffset.z
            );
        }

        if (poseConfig.camera && AppState.camera) {
            AppState.camera.position.set(...poseConfig.camera.pos);
            if (AppState.controls) {
                AppState.controls.target.set(...poseConfig.camera.target);
                AppState.controls.update();
            } else {
                AppState.camera.lookAt(...poseConfig.camera.target);
            }
        }

        if (poseConfig.shapeKeys && typeof applyShapeKeysData === 'function') {
            applyShapeKeysData(poseConfig.shapeKeys);
        }

        if (poseConfig.pose) AppState.config.pose = poseConfig.pose;
        if (poseConfig.camera) AppState.config.camera = poseConfig.camera;
        if (poseConfig.shapeKeys) AppState.config.shapeKeys = poseConfig.shapeKeys;

        if (typeof notifyConfigChange === 'function') notifyConfigChange();
        if (typeof sendPoseToComfyUI === 'function') sendPoseToComfyUI();
        if (AppState.renderer && AppState.scene && AppState.camera) {
            AppState.renderer.render(AppState.scene, AppState.camera);
        }

        focusFullBody(true);
    } catch (err) {
        console.error("載入 VNCCS 姿態檔案失敗:", err);
        alert(i18n[AppState.currentLang].errorLoadVnccs + err);
    }
}

const btnLoadVnccs = document.getElementById('btn-load-vnccs');
btnLoadVnccs?.addEventListener('click', async () => {
    if (poseGallery) {
        poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 20px;">${i18n[AppState.currentLang].loadingVnccs}</div>`;
    }
    poseModal?.classList.add('active');

    try {
        const res = await fetch('/likejpose3d/list_vnccs_poses');
        const data = await res.json();

        if (data.success && data.poses?.length > 0 && poseGallery) {
            poseGallery.innerHTML = '';
            data.poses.forEach(item => {
                const card = document.createElement('div');
                card.className = 'pose-card';

                const imgHTML = item.has_preview
                    ? `<img class="pose-card-img" src="${item.preview_url}" alt="${item.pose_name}">`
                    : `<div class="pose-card-placeholder">🧍</div>`;

                card.innerHTML = `
                    <div class="pose-card-img-wrapper">${imgHTML}</div>
                    <div class="pose-card-info">
                        <div class="pose-card-title" title="${item.pose_name}">${item.pose_name}</div>
                        <div class="pose-card-model" title="${item.model_folder}">${item.model_folder}</div>
                    </div>
                `;

                card.addEventListener('click', () => {
                    loadVnccsPose(item);
                    poseModal?.classList.remove('active');
                });

                poseGallery.appendChild(card);
            });
        } else if (poseGallery) {
            poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyPoses}</div>`;
        }
    } catch (e) {
        if (poseGallery) {
            poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 20px;">Failed to load VNCCS list: ${e}</div>`;
        }
    }
});