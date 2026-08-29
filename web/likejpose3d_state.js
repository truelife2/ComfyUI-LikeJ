/**
 * LikeJ Pose 3D - 全域共用狀態與設定管理 (為未來完全抽離 JS 模組化設計)
 */

// 多語系字典定義
const i18n = {
    zh: {
        titleModelFile: "📁 模型檔案",
        btnUploadModel: "📤 上傳模型",
        btnResetPose: "↺ 重置姿態",
        btnLoadInitialPose: "↺ 初始姿態",
        btnSavePose: "💾 儲存為初始姿態",
        titleTransform: "🕹️ 變換控制",
        btnRotate: "旋轉",
        btnTranslate: "位移",
        btnScale: "縮放",
        btnShowJoints: "顯示關節",
        btnHideJoints: "隱藏關節",
        btnJointList: "🦴 關節列表",
        btnCopyJoints: "📋 複製名稱",
        msgCopySuccess: "已複製關節名稱！",
        modalJointsTitle: "🦴 骨骼關節列表",
        placeholderSearchJoints: "搜尋關節名稱...",
        emptyJoints: "未找到關節點",
        lblJointSize: "關節大小",
        lblGizmoSize: "控制軸大小",
        titleAxis: "📐 軸向對齊",
        titleCamera: "🔍 鏡頭焦點",
        btnFocusLHand: "左手",
        btnFocusRHand: "右手",
        btnFocusFull: "全身",
        titleLights: "⚙️ 燈光設定",
        lblAmbientLight: "環境光強度",
        lblDirectLight: "主光強度",
        lblModelBrightness: "模型明亮度",
        lblBgColor: "背景顏色",
        loadingModel: "3D 模型載入中...",
        uploadingModel: "模型檔案上傳中...",
        lblBonePrefix: "🦴 骨骼:",
        drivenBones: "個連動骨骼",
        msgUploadError: "模型上傳失敗: ",
        msgSaveSuccess: "模型初始姿態已成功儲存",
        msgSaveFailed: "儲存模型初始姿態失敗: ",
        msgLoadError: "模型載入失敗，請檢查檔案格式。",
        btnSaveCustomPose: "💾 儲存姿態",
        promptPoseName: "請輸入姿態名稱 (若已存在則覆蓋)：",
        msgSavePoseSuccess: "姿態已成功儲存：",
        btnLoadPose: "📂 載入姿態",
        modalPoseTitle: "📂 選擇要載入的姿態",
        emptyPoses: "目前沒有已儲存的姿態檔。",
        confirmDeletePose: "確定要刪除此姿態檔嗎？",
        msgDeleteFailed: "刪除姿態失敗: ",
        modalSavePoseTitle: "💾 儲存姿態",
        lblSelectExistingPose: "選擇已有姿態來覆蓋 (選填)：",
        optNewPose: "➕ 建立新姿態",
        lblPoseName: "姿態名稱：",
        btnCancel: "取消",
        btnConfirmSave: "儲存",
        msgPleaseEnterPoseName: "請輸入姿態名稱！",
        confirmDeleteModel: "確定要刪除此模型及相關的所有姿態檔案嗎？",
        cannotDeleteDefault: "預設模型無法刪除！",
        msgDeleteModelFailed: "刪除模型失敗: ",
        titleDeleteModel: "刪除模型",
    },
    en: {
        titleModelFile: "📁 Model File",
        btnUploadModel: "📤 Upload Model",
        btnResetPose: "↺ Reset Pose",
        btnLoadInitialPose: "↺ Initial Pose",
        btnSavePose: "💾 Save as Initial Pose",
        titleTransform: "🕹️ Transform Controls",
        btnRotate: "Rotate",
        btnTranslate: "Move",
        btnScale: "Zoom",
        btnShowJoints: "Show Joints",
        btnHideJoints: "Hide Joints",
        btnJointList: "🦴 Joint List",
        btnCopyJoints: "📋 Copy Names",
        msgCopySuccess: "Copied Joint Names!",
        modalJointsTitle: "🦴 Bone Joints List",
        placeholderSearchJoints: "Search joint name...",
        emptyJoints: "No joint points found",
        lblJointSize: "Joint Size",
        lblGizmoSize: "Control Axis Size",
        titleAxis: "📐 Axis Alignment",
        titleCamera: "🔍 Camera Focus",
        btnFocusLHand: "LHand",
        btnFocusRHand: "RHand",
        btnFocusFull: "Full",
        titleLights: "⚙️ Lights",
        lblAmbientLight: "Ambient Light",
        lblDirectLight: "Main Light",
        lblModelBrightness: "Model Brightness",
        lblBgColor: "Background Color",
        loadingModel: "The 3D Model is loading...",
        uploadingModel: "The Model file is uploading...",
        lblBonePrefix: "🦴 Bone:",
        drivenBones: "Driven Bones",
        msgUploadError: "Model upload failed: ",
        msgSaveSuccess: "The Model Initial Pose Has Been Saved",
        msgSaveFailed: "Failed to save the Model Initial Pose: ",
        msgLoadError: "Failed to load model, please check the file format.",
        btnSaveCustomPose: "💾 Save Pose",
        promptPoseName: "Enter pose name (Will overwrite if exists):",
        msgSavePoseSuccess: "Pose saved successfully: ",
        btnLoadPose: "📂 Load Pose",
        modalPoseTitle: "📂 Select Pose to Load",
        emptyPoses: "No saved poses found.",
        confirmDeletePose: "Are you sure you want to delete this pose?",
        msgDeleteFailed: "Failed to delete pose: ",
        modalSavePoseTitle: "💾 Save Custom Pose",
        lblSelectExistingPose: "Overwrite Existing Pose (Optional):",
        optNewPose: "➕ Create New Pose",
        lblPoseName: "Pose Name:",
        btnCancel: "Cancel",
        btnConfirmSave: "Save",
        msgPleaseEnterPoseName: "Please enter a pose name!",
        confirmDeleteModel: "Are you sure you want to delete this model and all its associated pose files?",
        cannotDeleteDefault: "Default models cannot be deleted!",
        msgDeleteModelFailed: "Failed to delete model: ",
        titleDeleteModel: "Delete Model",
    }
};

/**
 * 全域狀態大倉庫 (所有變數皆公用化於此)
 */
const AppState = {
    // 語系與設定
    currentLang: localStorage.getItem('likej_pose3d_lang') || 'en',
    config: {
        modelName: 'female_body_base.glb',
        isDefaultModel: true,
        ambient: 0.4,
        direct: 0.6,
        modelColor: 0.85,
        jointSize: 1.0,
        gizmoSize: 1.0,
        rotationOffset: { x: 0, y: 0, z: 0 },
        pose: [],
        camera: null
    },

    // 渲染目標尺寸
    targetWidth: 1024,
    targetHeight: 1024,

    // 模型與骨骼狀態
    isModelLoaded: false,
    currentModel: null,
    showJoints: false,
    baseJointRadius: 0.008,
    jointScale: 1.0,
    currentBgColor: '#f8f8f8',

    // Three.js 核心物件
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    transformControls: null,
    loader: null,
    ambientLight: null,
    directionalLight: null,
    backLight: null,
    skeletonHelper: null,
    jointSpheres: [],

    // 互動與射線偵測狀態
    raycaster: null,
    mouse: null,
    pointerDownPos: { x: 0, y: 0 },
    isPointerDownOnBlank: false,
    lastRightClickTime: 0,
    lastRightClickBone: null
};

// 語系切換共用函式
function updateLanguage() {
    localStorage.setItem('likej_pose3d_lang', AppState.currentLang);

    const langData = i18n[AppState.currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (langData[key]) {
            el.innerText = langData[key];
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (langData[key]) {
            el.placeholder = langData[key];
        }
    });

    const btnToggleJoints = document.getElementById('btn-toggle-joints');
    if (btnToggleJoints) {
        btnToggleJoints.innerText = AppState.showJoints ? langData.btnHideJoints : langData.btnShowJoints;
    }
}

function toggleLanguage() {
    AppState.currentLang = AppState.currentLang === 'en' ? 'zh' : 'en';
    updateLanguage();
}