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

// 渲染關節點清單邏輯（維持您原本的搜尋與點擊附加功能）
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
    btnResetAllShapeKeys.setAttribute('data-i18n-title', 'tooltipResetShapeKeys'); // 👈 綁定 title 語系 key
    btnResetAllShapeKeys.innerText = '🔄 ' + i18n[AppState.currentLang].btnResetAllShapeKeys;
    btnResetAllShapeKeys.title = i18n[AppState.currentLang].tooltipResetShapeKeys;
    btnResetAllShapeKeys.style.cssText = 'padding: 3px 8px; font-size: 11px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; cursor: pointer; color: #1d4ed8; font-weight: 600; margin-left: auto; margin-right: 6px; transition: all 0.2s;';
    btnResetAllShapeKeys.addEventListener('mouseenter', () => {
        btnResetAllShapeKeys.style.background = '#dbeafe';
    });
    btnResetAllShapeKeys.addEventListener('mouseleave', () => {
        btnResetAllShapeKeys.style.background = '#eff6ff';
    });

    // 點擊全部重置的邏輯
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

        // 重新渲染清單與畫面
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