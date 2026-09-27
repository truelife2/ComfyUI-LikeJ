import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LikeJ.RecordAudio",
    async nodeCreated(node) {
        if (node.comfyClass !== "LikeJRecAud") return;

        // Initialize node properties store for extra info
        node.properties = node.properties || {};

        // --- Variables ---
        let mediaRecorder = null;
        let audioChunks = [];
        let timerInterval = null;
        let elapsedSeconds = 0;
        let isPaused = false;
        let currentStream = null;

        // --- UI Container ---
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "8px";
        container.style.padding = "10px";
        container.style.backgroundColor = "var(--comfy-input-bg, #1e1e24)";
        container.style.borderRadius = "8px";
        container.style.border = "1px solid var(--border-color, #333)";
        container.style.color = "#fff";
        container.style.fontSize = "12px";

        // 1. Device Selection Bar
        const devRow = document.createElement("div");
        devRow.style.display = "flex";
        devRow.style.gap = "6px";
        devRow.style.alignItems = "center";

        const devSelect = document.createElement("select");
        devSelect.style.flex = "1";
        devSelect.style.minWidth = "0";
        devSelect.style.padding = "4px 6px";
        devSelect.style.borderRadius = "4px";
        devSelect.style.border = "1px solid #555";
        devSelect.style.backgroundColor = "#2b2b36";
        devSelect.style.color = "#fff";

        const refreshBtn = document.createElement("button");
        refreshBtn.innerText = "🔄 Refresh";
        refreshBtn.style.padding = "4px 8px";
        refreshBtn.style.cursor = "pointer";
        refreshBtn.style.borderRadius = "4px";
        refreshBtn.style.whiteSpace = "nowrap";

        devRow.appendChild(devSelect);
        devRow.appendChild(refreshBtn);

        // 2. Control Buttons
        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.gap = "6px";

        const startBtn = document.createElement("button");
        startBtn.innerText = "🔴 Record";
        startBtn.style.flex = "1";
        startBtn.style.padding = "6px";
        startBtn.style.cursor = "pointer";
        startBtn.style.backgroundColor = "#2e7d32";
        startBtn.style.color = "#fff";
        startBtn.style.border = "none";
        startBtn.style.borderRadius = "4px";

        const pauseBtn = document.createElement("button");
        pauseBtn.innerText = "⏸️ Pause";
        pauseBtn.disabled = true;
        pauseBtn.style.flex = "1";
        pauseBtn.style.padding = "6px";
        pauseBtn.style.cursor = "not-allowed";
        pauseBtn.style.backgroundColor = "#ed6c02";
        pauseBtn.style.color = "#fff";
        pauseBtn.style.border = "none";
        pauseBtn.style.borderRadius = "4px";

        const stopBtn = document.createElement("button");
        stopBtn.innerText = "⏹️ Stop";
        stopBtn.disabled = true;
        stopBtn.style.flex = "1";
        stopBtn.style.padding = "6px";
        stopBtn.style.cursor = "not-allowed";
        stopBtn.style.backgroundColor = "#d32f2f";
        stopBtn.style.color = "#fff";
        stopBtn.style.border = "none";
        stopBtn.style.borderRadius = "4px";

        btnRow.appendChild(startBtn);
        btnRow.appendChild(pauseBtn);
        btnRow.appendChild(stopBtn);

        // 3. Status and Timer
        const statusDiv = document.createElement("div");
        statusDiv.style.display = "flex";
        statusDiv.style.justifyContent = "space-between";
        statusDiv.style.alignItems = "center";

        const statusText = document.createElement("span");
        statusText.innerText = "Status: Ready";
        statusText.style.color = "#aaa";

        const timerText = document.createElement("span");
        timerText.innerText = "00:00";
        timerText.style.fontFamily = "monospace";
        timerText.style.fontSize = "14px";
        timerText.style.fontWeight = "bold";

        statusDiv.appendChild(statusText);
        statusDiv.appendChild(timerText);

        // 4. Audio Player Preview
        const audioPreview = document.createElement("audio");
        audioPreview.controls = true;
        audioPreview.style.width = "100%";
        audioPreview.style.marginTop = "4px";

        // Assemble DOM
        container.appendChild(devRow);
        container.appendChild(btnRow);
        container.appendChild(statusDiv);
        container.appendChild(audioPreview);

        node.addDOMWidget("likej_record_widget", "DOM", container, {
            serialize: false,
        });

        // --- Helper Functions ---
        function formatTime(sec) {
            const m = Math.floor(sec / 60).toString().padStart(2, '0');
            const s = (sec % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        }

        function updateTimerDisplay() {
            timerText.innerText = formatTime(elapsedSeconds);
        }

        function stopTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }

        // --- Refresh Input Devices ---
        async function refreshDevices() {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(d => d.kind === 'audioinput');

                devSelect.innerHTML = "";
                audioInputs.forEach((dev, idx) => {
                    const opt = document.createElement("option");
                    opt.value = dev.deviceId;
                    opt.textContent = dev.label || `Microphone ${idx + 1}`;
                    devSelect.appendChild(opt);
                });

                statusText.innerText = "Status: Devices loaded";
            } catch (err) {
                statusText.innerText = "Status: Mic access denied";
                console.error("Fetch audio devices error:", err);
            }
        }

        refreshBtn.onclick = (e) => {
            e.preventDefault();
            refreshDevices();
        };

        refreshDevices();

        // --- Start Recording ---
        startBtn.onclick = async (e) => {
            e.preventDefault();
            try {
                audioChunks = [];
                elapsedSeconds = 0;
                updateTimerDisplay();

                const deviceId = devSelect.value;
                const constraints = {
                    audio: deviceId ? { deviceId: { exact: deviceId } } : true
                };

                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                mediaRecorder = new MediaRecorder(currentStream);

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    stopTimer();
                    const mimeType = mediaRecorder.mimeType || 'audio/webm';
                    const audioBlob = new Blob(audioChunks, { type: mimeType });
                    
                    audioPreview.src = URL.createObjectURL(audioBlob);

                    if (currentStream) {
                        currentStream.getTracks().forEach(track => track.stop());
                    }

                    // Automatically upload temp audio
                    await uploadTempAudio(audioBlob);
                };

                mediaRecorder.start(100);

                startBtn.disabled = true;
                startBtn.style.cursor = "not-allowed";
                pauseBtn.disabled = false;
                pauseBtn.style.cursor = "pointer";
                stopBtn.disabled = false;
                stopBtn.style.cursor = "pointer";

                statusText.innerText = "Status: Recording...";
                statusText.style.color = "#4caf50";

                timerInterval = setInterval(() => {
                    if (!isPaused) {
                        elapsedSeconds++;
                        updateTimerDisplay();
                    }
                }, 1000);

            } catch (err) {
                alert("Failed to start recording: " + err.message);
                console.error(err);
            }
        };

        // --- Pause / Resume Recording ---
        pauseBtn.onclick = (e) => {
            e.preventDefault();
            if (!mediaRecorder) return;

            if (mediaRecorder.state === "recording") {
                mediaRecorder.pause();
                isPaused = true;
                pauseBtn.innerText = "▶️ Resume";
                statusText.innerText = "Status: Paused";
                statusText.style.color = "#ff9800";
            } else if (mediaRecorder.state === "paused") {
                mediaRecorder.resume();
                isPaused = false;
                pauseBtn.innerText = "⏸️ Pause";
                statusText.innerText = "Status: Recording...";
                statusText.style.color = "#4caf50";
            }
        };

        // --- Stop Recording ---
        stopBtn.onclick = (e) => {
            e.preventDefault();
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }

            startBtn.disabled = false;
            startBtn.style.cursor = "pointer";
            pauseBtn.disabled = true;
            pauseBtn.innerText = "⏸️ Pause";
            pauseBtn.style.cursor = "not-allowed";
            stopBtn.disabled = true;
            stopBtn.style.cursor = "not-allowed";
            isPaused = false;
        };

        // --- Upload Temp Audio to ComfyUI Server ---
        async function uploadTempAudio(blob) {
            statusText.innerText = "Status: Saving temp audio...";
            statusText.style.color = "#aaa";

            const tempFilename = `likej_temp_${Date.now()}.wav`;

            const formData = new FormData();
            formData.append("image", blob, tempFilename);
            formData.append("overwrite", "true");
            formData.append("type", "temp");

            try {
                const response = await fetch("/upload/image", {
                    method: "POST",
                    body: formData,
                });

                if (response.ok) {
                    const data = await response.json();
                    statusText.innerText = "Status: Audio saved & ready!";
                    statusText.style.color = "#2196f3";

                    // Save filename directly into node properties
                    node.properties["recorded_file"] = data.name || tempFilename;
                } else {
                    throw new Error("Server response error");
                }
            } catch (err) {
                statusText.innerText = "Status: Upload failed";
                statusText.style.color = "#f44336";
                console.error("Audio upload error:", err);
            }
        }

        node.setSize([400, 240]);
    }
});