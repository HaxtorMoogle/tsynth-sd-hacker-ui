// TSYNTH SD-HACKER UI - main.js
// ElectroTechnique Teensy 4.1 inspired

let currentPage = 'main';
let audioContext;
let oscillator;
let analyser;
let waveformData = new Uint8Array(128);

// Web MIDI for Teensy 4.1
let midiAccess = null;

async function initMIDI() {
    try {
        midiAccess = await navigator.requestMIDIAccess();
        console.log('MIDI ready for Teensy 4.1');
        midiAccess.inputs.forEach(input => {
            input.onmidimessage = handleMIDIMessage;
        });
    } catch(e) {
        console.log('MIDI not available - simulate for Teensy');
    }
}

function handleMIDIMessage(msg) {
    const [status, data1, data2] = msg.data;
    if (status === 176) { // CC
        console.log(`Teensy CC: ${data1} = ${data2}`);
        addLog(`MIDI CC${data1}: ${data2}`);
    }
}

// WebAudio Synth
function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    waveformData = new Uint8Array(analyser.frequencyBinCount);
    
    // Oscillator
    oscillator = audioContext.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 440;
    const gain = audioContext.createGain();
    gain.gain.value = 0.1;
    
    oscillator.connect(gain);
    gain.connect(analyser);
    analyser.connect(audioContext.destination);
    oscillator.start();
    
    console.log('WebAudio Synth initialized - synced to waveform');
}

function updateWaveform() {
    if (!analyser) return;
    analyser.getByteTimeDomainData(waveformData);
}

// SD WebUI API Hook - txt2img
async function generateImage(prompt) {
    const payload = {
        prompt: prompt,
        negative_prompt: "blurry, low quality",
        steps: parseInt(document.getElementById('steps').value) || 42,
        cfg_scale: parseFloat(document.getElementById('cfg').value) || 7.5,
        seed: parseInt(document.getElementById('seed').value) || -1,
        sampler_name: "Euler a",
        width: 512,
        height: 512
    };

    addLog('SENDING TO SD WEBUI API...');
    
    try {
        const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const data = await response.json();
            const image = `data:image/png;base64,${data.images[0]}`;
            document.getElementById('generated').style.backgroundImage = `url(${image})`;
            document.getElementById('generated').classList.remove('hidden');
            addToHistory(prompt, image);
            addLog('IMAGE SYNTHESIZED SUCCESSFULLY');
        } else {
            throw new Error('API error');
        }
    } catch(e) {
        console.error(e);
        addLog('LOCAL SD API NOT REACHED - USING DEMO IMAGE');
        const demoUrl = `https://picsum.photos/id/${Math.floor(Math.random()*1000)}/800/600`;
        document.getElementById('generated').style.backgroundImage = `url(${demoUrl})`;
        document.getElementById('generated').classList.remove('hidden');
        addToHistory(prompt, demoUrl);
    }
}

function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = Array.from(document.querySelectorAll('.nav-link')).find(l => l.getAttribute('onclick').includes(page));
    if (activeLink) activeLink.classList.add('active');
    
    const content = document.getElementById('content');
    content.innerHTML = '';
    
    if (page === 'main') {
        loadDashboard(content);
    } else if (page === 'library') {
        content.innerHTML = `<div class="terminal p-8 text-center"><h2 class="text-3xl">IMAGE LIBRARY</h2><p class="text-[#ff00aa]">Teensy-patched generations coming soon...</p></div>`;
    } else if (page === 'training') {
        content.innerHTML = `<div class="terminal p-8 text-center"><h2 class="text-3xl">TRAINING LAB</h2><p>LoRA fine-tune on TSynth patches</p></div>`;
    } else if (page === 'patch') {
        content.innerHTML = `<div class="terminal p-8"><h2 class="text-3xl mb-4">PATCH EDITOR</h2><textarea class="w-full h-64 bg-black border border-[#00ff9f] p-4">OSC1: Saw / FILTER: LP24 / ENV: ADSR</textarea></div>`;
    }
}

function loadDashboard(container) {
    container.innerHTML = `
        <div class="grid grid-cols-12 gap-6">
            <!-- SIDEBAR -->
            <div class="col-span-3 space-y-6">
                <div class="terminal p-4 rounded">
                    <div class="flex justify-between mb-3"><span class="text-[#ff00aa]">MODEL CORE</span></div>
                    <select id="model" class="w-full bg-black border border-[#00ff9f] p-2">
                        <option>TSYNTH-DREAM-v4.1.safetensors</option>
                    </select>
                </div>

                <div class="terminal p-4 rounded">
                    <div class="mb-2 text-[#ff00aa]">PROMPT INJECTION</div>
                    <textarea id="prompt" class="w-full h-40 bg-black border border-[#00ff9f] p-3 resize-y" placeholder="neon hacker girl playing TSynth..."></textarea>
                    <div class="mt-3 flex gap-2">
                        <button onclick="generateFromUI()" class="flex-1 bg-[#00ff9f] text-black py-3 hover:brightness-110 text-lg">SYNTHESIZE // F5</button>
                        <button onclick="randomPrompt()" class="flex-1 border border-[#ff00aa] py-3 hover:bg-[#ff00aa]/10">RANDOM PATCH</button>
                    </div>
                </div>

                <div class="terminal p-4 rounded">
                    <div class="text-[#ff00aa] mb-4">ANALOG KNOBS</div>
                    <div class="grid grid-cols-3 gap-6">
                        <div onclick="tweakKnob(this)" class="text-center"><div class="knob mx-auto mb-2"></div><div>CUTOFF</div></div>
                        <div onclick="tweakKnob(this)" class="text-center"><div class="knob mx-auto mb-2"></div><div>RESO</div></div>
                        <div onclick="tweakKnob(this)" class="text-center"><div class="knob mx-auto mb-2"></div><div>ATTACK</div></div>
                    </div>
                </div>
            </div>

            <!-- MAIN -->
            <div class="col-span-6 space-y-6">
                <div class="terminal p-2 rounded h-[520px] flex items-center justify-center relative" id="canvas">
                    <div id="output" class="w-full h-full flex items-center justify-center text-6xl text-[#00ff9f]/30 flex-col">
                        <i class="fas fa-waveform mb-4"></i>
                        <span class="text-xl">WAITING FOR SIGNAL...</span>
                    </div>
                    <div id="generated" class="hidden w-full h-full bg-cover bg-center"></div>
                </div>

                <div class="terminal p-4 rounded">
                    <div class="flex justify-between mb-3 text-xs"><span class="text-[#ff00aa]">RECENT PATCHES</span></div>
                    <div id="history" class="grid grid-cols-4 gap-2"></div>
                </div>
            </div>

            <!-- RIGHT -->
            <div class="col-span-3 space-y-6">
                <div class="terminal p-4 rounded">
                    <div class="text-[#ff00aa]">PARAMETERS</div>
                    <div class="space-y-6 mt-4">
                        <div>
                            <label>STEPS <span id="steps_val" class="float-right">42</span></label>
                            <input id="steps" type="range" min="10" max="100" value="42" class="w-full accent-[#00ff9f]" oninput="updateVal(this, 'steps_val')">
                        </div>
                        <div>
                            <label>CFG <span id="cfg_val" class="float-right">7.5</span></label>
                            <input id="cfg" type="range" min="1" max="20" step="0.1" value="7.5" class="w-full accent-[#00ff9f]" oninput="updateVal(this, 'cfg_val')">
                        </div>
                        <div>
                            <label>SEED</label>
                            <input id="seed" type="number" value="1337" class="w-full bg-black border border-[#00ff9f] p-2">
                        </div>
                    </div>
                </div>

                <div class="terminal p-4 rounded">
                    <div class="text-[#ff00aa] mb-2">OSCILLOSCOPE</div>
                    <canvas id="osc" width="300" height="160" class="bg-black border border-[#00ff9f]"></canvas>
                </div>

                <div class="terminal p-4 rounded text-xs" id="log-container">
                    <div class="text-[#ff00aa]">SYSTEM LOG</div>
                    <div id="log" class="h-32 overflow-y-auto mt-2 text-gray-400"></div>
                </div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        initOscilloscope();
        initAudio();
        initMIDI();
        addLog('DASHBOARD BOOT COMPLETE');
    }, 100);
}

function tweakKnob(el) {
    el.querySelector('.knob').style.transform = `rotate(${Math.random() * 340 - 170}deg)`;
    addLog('KNOB TWEAKED // MIDI CC SENT TO TEENSY');
    if (oscillator) oscillator.frequency.value = 200 + Math.random() * 800;
}

function updateVal(slider, id) {
    document.getElementById(id).textContent = slider.value;
}

function generateFromUI() {
    const prompt = document.getElementById('prompt').value.trim() || "cyberpunk synthwave tsynth interface";
    generateImage(prompt);
}

function randomPrompt() {
    const prompts = [
        "hacker girl with TSynth Teensy4.1, neon grid, analog waveforms",
        "retro CRT terminal, green phosphor, glitch art, cyber synth",
        "exploding modular synth, vaporwave sunset, digital rain"
    ];
    document.getElementById('prompt').value = prompts[Math.floor(Math.random() * prompts.length)];
    generateFromUI();
}

function addToHistory(prompt, imgSrc) {
    const history = document.getElementById('history');
    const div = document.createElement('div');
    div.className = 'aspect-video bg-cover border border-[#00ff9f]/50 cursor-pointer hover:border-[#ff00aa]';
    div.style.backgroundImage = `url('${imgSrc}')`;
    div.onclick = () => {
        document.getElementById('generated').style.backgroundImage = `url('${imgSrc}')`;
    };
    history.prepend(div);
    if (history.children.length > 8) history.lastChild.remove();
}

let oscCanvas, oscCtx;
function initOscilloscope() {
    oscCanvas = document.getElementById('osc');
    oscCtx = oscCanvas.getContext('2d');
    animateOsc();
}

function animateOsc() {
    if (!oscCtx) return;
    requestAnimationFrame(animateOsc);
    
    oscCtx.fillStyle = 'rgba(0,0,0,0.2)';
    oscCtx.fillRect(0, 0, oscCanvas.width, oscCanvas.height);
    
    oscCtx.strokeStyle = '#00ff9f';
    oscCtx.lineWidth = 3;
    oscCtx.shadowBlur = 20;
    oscCtx.shadowColor = '#00ff9f';
    
    oscCtx.beginPath();
    const sliceWidth = oscCanvas.width / waveformData.length;
    let x = 0;
    
    for (let i = 0; i < waveformData.length; i++) {
        const v = waveformData[i] / 128.0;
        const y = v * oscCanvas.height / 2;
        if (i === 0) oscCtx.moveTo(x, y);
        else oscCtx.lineTo(x, y);
        x += sliceWidth;
    }
    oscCtx.lineTo(oscCanvas.width, oscCanvas.height / 2);
    oscCtx.stroke();
    
    updateWaveform();
}

function addLog(msg) {
    const logEl = document.getElementById('log');
    if (logEl) {
        logEl.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}<br>`;
        logEl.scrollTop = logEl.scrollHeight;
    }
}

window.onload = () => {
    navigate('main');
};

document.addEventListener('keydown', e => {
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        generateFromUI();
    }
});