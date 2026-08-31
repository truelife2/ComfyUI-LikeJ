/**
 * LikeJ Pose 3D - 彈窗與開窗互動管理 (Joints List, Load Pose, Save Pose)
 */

// --- 1. 骨骼關節列表彈窗 Modal ---
const jointsListModal = document.getElementById('joints-list-modal');
const jointsContainer = document.getElementById('joints-list-container');
const btnJointsModal = document.getElementById('btn-joints-modal');
const btnCloseJointsModal = document.getElementById('btn-close-joints-modal');
const inputSearchJoints = document.getElementById('input-search-joints');
const btnCopyJoints = document.getElementById('btn-copy-joints');

const jointsModalContent = jointsListModal ? jointsListModal.querySelector('.modal-content') : null;
const jointsModalHeader = jointsModalContent ? jointsModalContent.querySelector('.modal-header') : null;

let jointsModeBtnGroup = null;
if (jointsModalHeader && !document.getElementById('modal-btn-mode-rotate')) {
    // 1. 將原有的 header 內容包進第一行（左右對齊）
    jointsModalHeader.style.cssText = 'display: flex; flex-direction: column; gap: 3px; align-items: stretch;padding: 8px 15px 6px 15px;';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; width: 100%;';

    while (jointsModalHeader.firstChild) {
        topRow.appendChild(jointsModalHeader.firstChild);
    }
    jointsModalHeader.appendChild(topRow);

    // 2. 建立下方置中的按鈕群組
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

// 初始化彈窗為左側懸浮視窗，預設關閉時讓滑鼠事件完全穿透
if (jointsListModal && jointsModalContent) {
    jointsListModal.style.background = 'transparent';
    jointsListModal.style.pointerEvents = 'none';

    jointsModalContent.style.pointerEvents = 'none';
    jointsModalContent.style.position = 'absolute';
    jointsModalContent.style.left = '20px'; // 讓它跟 shape keys 錯開位置，或者依喜好調整
    jointsModalContent.style.top = '80px';
    jointsModalContent.style.transform = 'none';
}

// 實作關節點標題列拖曳功能
if (jointsModalHeader && jointsModalContent) {
    jointsModalHeader.style.cursor = 'grab';
    let isJointsDragging = false;
    let startX, startY, initialLeft, initialTop;

    jointsModalHeader.addEventListener('mousedown', (e) => {
        // 點擊按鈕或輸入框時不觸發拖曳
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

        isJointsDragging = true;
        jointsModalHeader.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;

        const rect = jointsModalContent.getBoundingClientRect();
        jointsModalContent.style.position = 'absolute';
        jointsModalContent.style.left = rect.left + 'px';
        jointsModalContent.style.top = rect.top + 'px';
        jointsModalContent.style.right = 'auto';
        jointsModalContent.style.bottom = 'auto';
        jointsModalContent.style.transform = 'none';

        initialLeft = rect.left;
        initialTop = rect.top;

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isJointsDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        jointsModalContent.style.left = (initialLeft + dx) + 'px';
        jointsModalContent.style.top = (initialTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isJointsDragging) {
            isJointsDragging = false;
            jointsModalHeader.style.cursor = 'grab';
        }
    });
}

// 渲染關節點清單邏輯
function renderJointList(filterText = '') {
    if (!jointsContainer) return;
    jointsContainer.innerHTML = '';

    if (!AppState.jointSpheres || AppState.jointSpheres.length === 0) {
        jointsContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyJoints}</div>`;
        return;
    }

    const activeTarget = (AppState.transformControls && AppState.transformControls.visible) ? AppState.transformControls.object : null;

    let count = 0;
    AppState.jointSpheres.forEach((sphere) => {
        const bone = sphere.userData.bone;
        if (!bone) return;

        const boneName = bone.name || "Unnamed_Joint";

        if (filterText && !boneName.toLowerCase().includes(filterText.toLowerCase())) {
            return;
        }

        count++;
        const item = document.createElement('div');
        item.className = 'joint-list-item';

        const isSelected = activeTarget && (activeTarget === bone || (activeTarget.userData?.groupBones && activeTarget.userData.groupBones.includes(bone)));
        if (isSelected) {
            item.classList.add('active');
        }

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

            if (typeof updateSelectedBoneLabel === 'function') {
                updateSelectedBoneLabel(labelText);
            }

            renderJointList(inputSearchJoints.value);
        });

        jointsContainer.appendChild(item);
    });

    if (count === 0) {
        jointsContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyJoints}</div>`;
    }
}

// 關閉視窗的共用方法
function closeJointsModal() {
    if (jointsListModal) {
        jointsListModal.classList.remove('active');
        if (jointsModalContent) jointsModalContent.style.pointerEvents = 'none'; // 關閉時恢復滑鼠穿透
    }
}

if (btnJointsModal) {
    btnJointsModal.addEventListener('click', () => {
        closeShapeKeysModal();

        if (inputSearchJoints) inputSearchJoints.value = '';
        renderJointList();
        if (jointsListModal) {
            jointsListModal.classList.add('active');
            if (jointsModalContent) jointsModalContent.style.pointerEvents = 'auto'; // 開啟時計點擊互動
        }
    });
}

if (btnCloseJointsModal) {
    btnCloseJointsModal.addEventListener('click', closeJointsModal);
}

if (jointsListModal) {
    jointsListModal.addEventListener('click', (e) => {
        if (e.target === jointsListModal) {
            closeJointsModal();
        }
    });
}

if (inputSearchJoints) {
    inputSearchJoints.addEventListener('input', (e) => {
        renderJointList(e.target.value);
    });
}

if (btnCopyJoints) {
    btnCopyJoints.addEventListener('click', async () => {
        if (!AppState.jointSpheres || AppState.jointSpheres.length === 0) return;

        const jointNames = [];
        AppState.jointSpheres.forEach(sphere => {
            if (sphere.userData && sphere.userData.bone && sphere.userData.bone.name) {
                jointNames.push(sphere.userData.bone.name);
            }
        });

        if (jointNames.length === 0) return;

        const textToCopy = jointNames.join('\n');
        try {
            await navigator.clipboard.writeText(textToCopy);
            btnCopyJoints.innerText = i18n[AppState.currentLang].msgCopySuccess || '已複製！';
            setTimeout(() => {
                updateLanguage();
            }, 1500);
        } catch (err) {
            console.error('複製關節名稱失敗:', err);
        }
    });
}


// --- 2. 儲存姿態彈窗 Modal ---
const savePoseModal = document.getElementById('save-pose-modal');
const selectExistingPose = document.getElementById('select-existing-pose');
const inputPoseName = document.getElementById('input-pose-name');
const btnCloseSaveModal = document.getElementById('btn-close-save-modal');
const btnCancelSavePose = document.getElementById('btn-cancel-save-pose');
const btnConfirmSavePose = document.getElementById('btn-confirm-save-pose');
const btnSaveCustomPose = document.getElementById('btn-save-custom-pose');

if (btnSaveCustomPose) {
    btnSaveCustomPose.addEventListener('click', async () => {
        if (!AppState.config.modelName) return;

        const defaultName = "pose_" + new Date().toISOString().slice(0, 10).replace(/-/g, "");
        if (inputPoseName) inputPoseName.value = defaultName;

        if (selectExistingPose) {
            selectExistingPose.innerHTML = `<option value="">${i18n[AppState.currentLang].optNewPose}</option>`;
        }

        const currentModelFolder = AppState.config.modelName.replace(/\.(glb|gltf)$/i, '');

        try {
            const res = await fetch('/likejpose3d/list_saved_poses');
            const data = await res.json();

            if (data.success && data.poses && selectExistingPose) {
                const matchingPoses = data.poses.filter(p => {
                    const folder = (p.model_folder || '').replace(/\.(glb|gltf)$/i, '');
                    return folder === currentModelFolder || currentModelFolder.includes(folder) || folder.includes(currentModelFolder);
                });

                matchingPoses.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.pose_name;
                    opt.innerText = item.pose_name;
                    selectExistingPose.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn("無法取得已有姿態選單:", e);
        }

        if (savePoseModal) savePoseModal.classList.add('active');
    });
}

if (selectExistingPose) {
    selectExistingPose.addEventListener('change', () => {
        if (selectExistingPose.value && inputPoseName) {
            inputPoseName.value = selectExistingPose.value;
        }
    });
}

function closeSaveModal() {
    if (savePoseModal) savePoseModal.classList.remove('active');
}

if (btnCloseSaveModal) btnCloseSaveModal.addEventListener('click', closeSaveModal);
if (btnCancelSavePose) btnCancelSavePose.addEventListener('click', closeSaveModal);
if (savePoseModal) {
    savePoseModal.addEventListener('click', (e) => {
        if (e.target === savePoseModal) closeSaveModal();
    });
}

if (btnConfirmSavePose) {
    btnConfirmSavePose.addEventListener('click', async () => {
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
}


// --- 3. 載入姿態彈窗 Modal ---
const poseModal = document.getElementById('pose-modal');
const poseGallery = document.getElementById('pose-gallery');
const btnLoadPose = document.getElementById('btn-load-pose');
const btnCloseModal = document.getElementById('btn-close-modal');

if (btnLoadPose) {
    btnLoadPose.addEventListener('click', async () => {
        if (poseGallery) {
            poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 20px;">Loading...</div>`;
        }
        if (poseModal) poseModal.classList.add('active');

        try {
            const res = await fetch('/likejpose3d/list_saved_poses');
            const data = await res.json();

            if (data.success && data.poses && data.poses.length > 0 && poseGallery) {
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
                        if (typeof loadPoseConfigAndModel === 'function') {
                            loadPoseConfigAndModel(item);
                        }
                        if (poseModal) poseModal.classList.remove('active');
                    });

                    const btnDelete = card.querySelector('.pose-card-delete');
                    btnDelete.addEventListener('click', async (e) => {
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
}

if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
        if (poseModal) poseModal.classList.remove('active');
    });
}

if (poseModal) {
    poseModal.addEventListener('click', (e) => {
        if (e.target === poseModal) poseModal.classList.remove('active');
    });
}


// --- 4. Shape Keys 彈窗與設定管理 (支援拖曳、懸浮、背景互動) ---
const shapeKeysModal = document.getElementById('shapekeys-list-modal');
const shapeKeysContainer = document.getElementById('shapekeys-list-container');
const btnShapeKeysModal = document.getElementById('btn-shapekeys-modal');
const btnCloseShapeKeysModal = document.getElementById('btn-close-shapekeys-modal');

const modalContent = shapeKeysModal ? shapeKeysModal.querySelector('.modal-content') : null;
const modalHeader = modalContent ? modalContent.querySelector('.modal-header') : null;

// 初始化彈窗為左側懸浮視窗，預設關閉時讓滑鼠事件完全穿透
if (shapeKeysModal && modalContent) {
    shapeKeysModal.style.background = 'transparent';
    shapeKeysModal.style.pointerEvents = 'none';

    modalContent.style.pointerEvents = 'none';
    modalContent.style.position = 'absolute';
    modalContent.style.left = '20px';
    modalContent.style.top = '80px';
    modalContent.style.transform = 'none';
}

// 將「全部重置」按鈕美化並放進標題列
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
    btnResetAllShapeKeys.addEventListener('mouseenter', () => {
        btnResetAllShapeKeys.style.background = '#dbeafe';
    });
    btnResetAllShapeKeys.addEventListener('mouseleave', () => {
        btnResetAllShapeKeys.style.background = '#eff6ff';
    });

    btnResetAllShapeKeys.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!AppState.currentModel) return;

        AppState.currentModel.traverse((child) => {
            if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
                const influences = child.morphTargetInfluences;
                for (let i = 0; i < influences.length; i++) {
                    influences[i] = 0;
                }
            }
        });

        renderShapeKeysList();

        if (typeof getShapeKeysData === 'function') {
            AppState.config.shapeKeys = getShapeKeysData();
        }
        if (typeof notifyConfigChange === 'function') {
            notifyConfigChange();
        }
        if (AppState.renderer && AppState.scene && AppState.camera) {
            AppState.renderer.render(AppState.scene, AppState.camera);
        }
        if (typeof sendPoseToComfyUI === 'function') {
            sendPoseToComfyUI();
        }
    });

    if (btnCloseShapeKeysModal) {
        btnCloseShapeKeysModal.before(btnResetAllShapeKeys);
    } else {
        modalHeader.appendChild(btnResetAllShapeKeys);
    }
}

// 實作標題列拖曳功能
if (modalHeader && modalContent) {
    modalHeader.style.cursor = 'grab';
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    modalHeader.addEventListener('mousedown', (e) => {
        if (e.target === btnResetAllShapeKeys || e.target === btnCloseShapeKeysModal) return;

        isDragging = true;
        modalHeader.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;

        const rect = modalContent.getBoundingClientRect();
        modalContent.style.position = 'absolute';
        modalContent.style.left = rect.left + 'px';
        modalContent.style.top = rect.top + 'px';
        modalContent.style.right = 'auto';
        modalContent.style.bottom = 'auto';
        modalContent.style.transform = 'none';

        initialLeft = rect.left;
        initialTop = rect.top;

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        modalContent.style.left = (initialLeft + dx) + 'px';
        modalContent.style.top = (initialTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            modalHeader.style.cursor = 'grab';
        }
    });
}

function renderShapeKeysList() {
    if (!shapeKeysContainer) return;

    shapeKeysContainer.style.display = 'flex';
    shapeKeysContainer.style.flexDirection = 'column';
    shapeKeysContainer.style.gap = '5px';
    shapeKeysContainer.innerHTML = '';

    let hasShapeKeys = false;
    const meshesWithMorphs = [];

    if (AppState.currentModel) {
        AppState.currentModel.traverse((child) => {
            if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
                meshesWithMorphs.push(child);
            }
        });
    }

    if (meshesWithMorphs.length === 0) {
        shapeKeysContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyShapeKeys}</div>`;
        return;
    }

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

            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                influences[index] = val;
                valSpan.innerText = val.toFixed(2);

                if (typeof getShapeKeysData === 'function') {
                    AppState.config.shapeKeys = getShapeKeysData();
                }
                if (typeof notifyConfigChange === 'function') {
                    notifyConfigChange();
                }

                if (AppState.renderer && AppState.scene && AppState.camera) {
                    AppState.renderer.render(AppState.scene, AppState.camera);
                }

                if (typeof sendPoseToComfyUI === 'function') {
                    sendPoseToComfyUI();
                }
            });

            group.addEventListener('dblclick', () => {
                slider.value = 0;
                influences[index] = 0;
                valSpan.innerText = (0).toFixed(2);

                if (typeof getShapeKeysData === 'function') {
                    AppState.config.shapeKeys = getShapeKeysData();
                }
                if (typeof notifyConfigChange === 'function') {
                    notifyConfigChange();
                }

                if (AppState.renderer && AppState.scene && AppState.camera) {
                    AppState.renderer.render(AppState.scene, AppState.camera);
                }

                if (typeof sendPoseToComfyUI === 'function') {
                    sendPoseToComfyUI();
                }
            });

            shapeKeysContainer.appendChild(group);
        });
    });

    if (!hasShapeKeys) {
        shapeKeysContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyShapeKeys}</div>`;
    }
}

// 關閉視窗的共用方法
function closeShapeKeysModal() {
    if (shapeKeysModal) {
        shapeKeysModal.classList.remove('active');
        if (modalContent) modalContent.style.pointerEvents = 'none'; // 關閉時恢復穿透
    }
}

if (btnShapeKeysModal) {
    btnShapeKeysModal.addEventListener('click', () => {
        closeJointsModal();

        renderShapeKeysList();
        if (shapeKeysModal) {
            shapeKeysModal.classList.add('active');
            if (modalContent) modalContent.style.pointerEvents = 'auto'; // 開啟時計點擊互動
        }
    });
}

if (btnCloseShapeKeysModal) {
    btnCloseShapeKeysModal.addEventListener('click', closeShapeKeysModal);
}

if (shapeKeysModal) {
    shapeKeysModal.addEventListener('click', (e) => {
        if (e.target === shapeKeysModal) {
            closeShapeKeysModal();
        }
    });
}

// ==========================================
// --- 5. 瀏覽與載入 VNCCS 姿勢庫 ---
// ==========================================

// 5-1. VNCCS 骨骼名稱映射表 (補齊 root 對應)
const VNCCS_BONE_MAP = {
    "root": "Root",
    "_rootJoint": "Root",
    "pelvis": "pelvis",
    "spine_01": "spine_01",
    "spine_02": "spine_02",
    "spine_03": "spine_03",
    "neck_01": "neck_01",
    "head": "head",

    // 左手臂
    "clavicle_l": "clavicle_l",
    "upperarm_l": "upperarm_l",
    "lowerarm_l": "lowerarm_l",
    "hand_l": "hand_l",
    "thumb_01_l": "thumb_01_l",
    "thumb_02_l": "thumb_02_l",
    "thumb_03_l": "thumb_03_l",
    "index_01_l": "index_01_l",
    "index_02_l": "index_02_l",
    "index_03_l": "index_03_l",
    "middle_01_l": "middle_01_l",
    "middle_02_l": "middle_02_l",
    "middle_03_l": "middle_03_l",
    "ring_01_l": "ring_01_l",
    "ring_02_l": "ring_02_l",
    "ring_03_l": "ring_03_l",
    "pinky_01_l": "pinky_01_l",
    "pinky_02_l": "pinky_02_l",
    "pinky_03_l": "pinky_03_l",

    // 右手臂
    "clavicle_r": "clavicle_r",
    "upperarm_r": "upperarm_r",
    "lowerarm_r": "lowerarm_r",
    "hand_r": "hand_r",
    "thumb_01_r": "thumb_01_r",
    "thumb_02_r": "thumb_02_r",
    "thumb_03_r": "thumb_03_r",
    "index_01_r": "index_01_r",
    "index_02_r": "index_02_r",
    "index_03_r": "index_03_r",
    "middle_01_r": "middle_01_r",
    "middle_02_r": "middle_02_r",
    "middle_03_r": "middle_03_r",
    "ring_01_r": "ring_01_r",
    "ring_02_r": "ring_02_r",
    "ring_03_r": "ring_03_r",
    "pinky_01_r": "pinky_01_r",
    "pinky_02_r": "pinky_02_r",
    "pinky_03_r": "pinky_03_r",

    // 下半身
    "thigh_l": "thigh_l",
    "calf_l": "calf_l",
    "foot_l": "foot_l",
    "ball_l": "ball_l",
    "thigh_r": "thigh_r",
    "calf_r": "calf_r",
    "foot_r": "foot_r",
    "ball_r": "ball_r"
};

/**
 * 5-2. 將 VNCCS 的 JSON 資料轉為系統內部的 PoseData 格式
 * 正確對齊 Unity (左手系) 到 Three.js (右手系) 的旋轉軸向與正負號
 */
function convertVnccsToInternalPose(vnccsData, customOffsets = {}, ignoreHipPosition = false) {
    if (!vnccsData || !vnccsData.bones) return null;
    const poseArray = [];

    resetPose();

    const rootQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        THREE.MathUtils.degToRad(-90)
    );
    poseArray.push({
        name: "Root",
        p: null,
        q: [rootQuat.x, rootQuat.y, rootQuat.z, rootQuat.w],
        s: [1, 1, 1]
    });

    {
        for (const [vnccsBoneName, eulerDeg] of Object.entries(vnccsData.bones)) {
            const targetBoneName = VNCCS_BONE_MAP[vnccsBoneName] || vnccsBoneName;
            if (!targetBoneName) continue;

            let targetBoneNode = null;

            if (AppState.currentModel) {
                AppState.currentModel.traverse((child) => {
                    if (child.isBone && child.name === targetBoneName) {
                        targetBoneNode = child;
                    }
                });
            }

            if (targetBoneNode) {
                // 1. 取得骨骼「真正的世界四元數」與「父節點的世界四元數」
                const qWorldOld = new THREE.Quaternion();
                targetBoneNode.getWorldQuaternion(qWorldOld);

                const qParentWorld = new THREE.Quaternion();
                if (targetBoneNode.parent) {
                    targetBoneNode.parent.getWorldQuaternion(qParentWorld);
                }

                // 2. 嚴格按原本的 [X, Y, Z] 世界軸設定（不翻轉、不換位）
                const wx = THREE.MathUtils.degToRad(eulerDeg[0] || 0); // 世界 X 軸
                const wy = THREE.MathUtils.degToRad(eulerDeg[1] || 0); // 世界 Y 軸
                const wz = THREE.MathUtils.degToRad(eulerDeg[2] || 0); // 世界 Z 軸

                const qWorldX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wx);
                const qWorldY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wy);
                const qWorldZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), wz);

                // 3. 在絕對世界空間中組合增量旋轉
                // 若原始數據為 XYZ 順序：
                const qWorldDelta = new THREE.Quaternion()
                    .copy(qWorldX)
                    .multiply(qWorldY)
                    .multiply(qWorldZ);

                // 4. 計算套用世界增量後的新世界姿態
                const qWorldNew = qWorldDelta.multiply(qWorldOld);

                // 5. 扣除父節點的影響，轉回這根骨骼專屬的 Local 四元數
                const qFinal = qParentWorld.clone().invert().multiply(qWorldNew);

                poseArray.push({
                    name: targetBoneName,
                    p: null,
                    q: [qFinal.x, qFinal.y, qFinal.z, qFinal.w],
                    s: [1, 1, 1]
                });
            }
        }
    }

    const rotOffset = vnccsData.modelRotation ? {
        x: THREE.MathUtils.degToRad(vnccsData.modelRotation[0] || 0),
        y: THREE.MathUtils.degToRad(vnccsData.modelRotation[1] || 0),
        z: THREE.MathUtils.degToRad(vnccsData.modelRotation[2] || 0)
    } : { x: 0, y: 0, z: 0 };

    return {
        rotationOffset: rotOffset,
        pose: poseArray,
        shapeKeys: {},
        camera: null
    };
}



/**
 * 5-3. 獨立的 VNCCS 姿勢載入與套用函式
 */
async function loadVnccsPose(item) {
    try {
        const poseRes = await fetch(item.json_url);
        const rawData = await poseRes.json();
        if (!rawData) return;

        let poseConfig;
        if (rawData.pose && Array.isArray(rawData.pose)) {
            poseConfig = rawData;
        } else {
            poseConfig = convertVnccsToInternalPose(rawData);
        }
        if (!poseConfig) {
            console.error(i18n[AppState.currentLang].msgParseVnccsError);
            return;
        }

        // 1. 套用模型骨骼姿態
        if (typeof applyPoseData === 'function') {
            applyPoseData(poseConfig.pose);
        } else {
            console.error("❌ 找不到 applyPoseData 函式！");
            alert("套用失敗：全域找不到 applyPoseData 處理函式");
            return;
        }

        // 2. 套用全域模型旋轉 (modelRotation)
        if (poseConfig.rotationOffset && AppState.currentModel) {
            AppState.config.rotationOffset = poseConfig.rotationOffset;
            AppState.currentModel.rotation.set(
                poseConfig.rotationOffset.x,
                poseConfig.rotationOffset.y,
                poseConfig.rotationOffset.z
            );
        }

        // 3. 套用 Camera 視角與 Target 對齊
        if (poseConfig.camera && AppState.camera) {
            AppState.camera.position.set(
                poseConfig.camera.pos[0],
                poseConfig.camera.pos[1],
                poseConfig.camera.pos[2]
            );

            if (AppState.controls) {
                AppState.controls.target.set(
                    poseConfig.camera.target[0],
                    poseConfig.camera.target[1],
                    poseConfig.camera.target[2]
                );
                AppState.controls.update();
            } else {
                AppState.camera.lookAt(
                    poseConfig.camera.target[0],
                    poseConfig.camera.target[1],
                    poseConfig.camera.target[2]
                );
            }
        }

        if (poseConfig.shapeKeys && typeof applyShapeKeysData === 'function') {
            applyShapeKeysData(poseConfig.shapeKeys);
        }

        if (poseConfig.pose) AppState.config.pose = poseConfig.pose;
        if (poseConfig.camera) AppState.config.camera = poseConfig.camera;
        if (poseConfig.shapeKeys) AppState.config.shapeKeys = poseConfig.shapeKeys;

        if (typeof notifyConfigChange === 'function') {
            notifyConfigChange();
        }

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

// 5-4. 按鈕事件綁定與畫廊渲染 (多語系化)
const btnLoadVnccs = document.getElementById('btn-load-vnccs');

if (btnLoadVnccs) {
    btnLoadVnccs.addEventListener('click', async () => {
        if (poseGallery) {
            poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 20px;">${i18n[AppState.currentLang].loadingVnccs}</div>`;
        }
        if (poseModal) poseModal.classList.add('active');

        try {
            const res = await fetch('/likejpose3d/list_vnccs_poses');
            const data = await res.json();

            if (data.success && data.poses && data.poses.length > 0 && poseGallery) {
                poseGallery.innerHTML = '';

                poseGallery.style.display = 'grid';
                poseGallery.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
                poseGallery.style.gap = '12px';
                poseGallery.style.padding = '10px';

                data.poses.forEach(item => {
                    const card = document.createElement('div');
                    card.style.cssText = `
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 8px;
                        background: #ffffff;
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        transition: transform 0.1s ease, box-shadow 0.1s ease;
                    `;
                    card.onmouseover = () => { card.style.borderColor = '#6366f1'; card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; };
                    card.onmouseout = () => { card.style.borderColor = '#e2e8f0'; card.style.boxShadow = 'none'; };

                    const imgHTML = item.has_preview
                        ? `<img src="${item.preview_url}" style="width: 100%; height: 140px; object-fit: contain; border-radius: 4px; background: #f8fafc;" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='🧍';">`
                        : `<div style="width: 100%; height: 140px; display: flex; align-items: center; justify-content: center; font-size: 32px; background: #f8fafc; border-radius: 4px;">🧍</div>`;

                    card.innerHTML = `
                        <div style="width: 100%; text-align: center; overflow: hidden;">${imgHTML}</div>
                        <div style="margin-top: 6px; width: 100%; text-align: center;">
                            <div style="font-size: 12px; font-weight: bold; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.pose_name}">${item.pose_name}</div>
                            <div style="font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.folder}">${item.folder}</div>
                        </div>
                    `;

                    card.addEventListener('click', async () => {
                        await loadVnccsPose(item);
                        if (poseModal) poseModal.classList.remove('active');
                    });

                    poseGallery.appendChild(card);
                });
            } else if (poseGallery) {
                poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 20px;">${i18n[AppState.currentLang].emptyVnccs}</div>`;
            }
        } catch (e) {
            if (poseGallery) {
                poseGallery.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 20px;">${i18n[AppState.currentLang].errorLoadVnccs}${e}</div>`;
            }
        }
    });
}

// 判斷並控制 VNCCS 按鈕顯示/隱藏
function updateVnccsBtnVisibility() {
    const btnVnccs = document.getElementById('btn-load-vnccs');
    if (!btnVnccs) return;

    const isDefault = AppState.config.isDefaultModel === true;
    const modelName = AppState.config.modelName;
    const allowedModels = ['default.glb', 'default_faceless.glb'];

    if (isDefault && allowedModels.includes(modelName)) {
        btnVnccs.style.display = ''; // 恢復預設顯示
    } else {
        btnVnccs.style.display = 'none'; // 隱藏按鈕
    }
}

// 關閉所有浮動視窗
function closeAllFloatModals() {
    closeJointsModal();
    closeShapeKeysModal();
}