/**
 * Voluma - Premium Audio Waveform Editor & Splitter Engine
 * Pure Client-Side Web Audio API, Canvas Drawing, and Binary WAV/ZIP Encoding
 */

// Application State
let audioCtx = null;
let currentAudioBuffer = null;      // Decoded AudioBuffer
let originalDuration = 0;           // Seconds
let activeChannelsData = [];        // Float32Array[] channel samples

// History Stack for Undo/Redo
let historyStack = [];
let historyPointer = -1;

// Selection Management (in seconds)
let selectionStart = 0;
let selectionEnd = 0;
let selectionLength = 0;

// Playback State
let playSourceNode = null;
let masterGainNode = null;
let analyserNode = null;
let isPlaying = false;
let isLooping = false;
let startTimeOffset = 0;            // Seconds where playback started
let startContextTime = 0;           // Context time when playback started
let playbackIntervalId = null;
let playbackVolume = 1.0;           // Standard consolidated playback volume (Adjust volume handle manages precise FX scaling)

// Navigation & Zoom
let zoomLevel = 100;                // Percentage (100% means width fits screen exactly)
let maxCanvasWidth = 16000;         // Upper limit for canvas zoom width
let selectionActive = false;
let isDraggingSelection = false;
let dragStartSeconds = 0;

// Saved Split Tracks list (formerly regions)
let savedRegions = [];
let regionCounter = 0;

// DOM Elements Cache
const audioUploadInput = document.getElementById('audio-upload');
const displayFileName = document.getElementById('display-file-name');
const displayFileMeta = document.getElementById('display-file-meta');
const fileInfoBubble = document.getElementById('file-info-bubble');
const dropZone = document.getElementById('drop-zone');

const waveformViewport = document.getElementById('waveform-viewport');
const waveformCanvas = document.getElementById('waveform-canvas');
const playheadElement = document.getElementById('playhead');
const selectionOverlay = document.getElementById('selection-overlay');
const timeRuler = document.getElementById('time-ruler');

const hudPlayhead = document.getElementById('hud-playhead');
const hudSelectStart = document.getElementById('hud-select-start');
const hudSelectEnd = document.getElementById('hud-select-end');
const hudSelectLen = document.getElementById('hud-select-len');

const btnPlay = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const btnStop = document.getElementById('btn-stop');
const btnLoop = document.getElementById('btn-loop');

const sliderGainFactor = document.getElementById('slider-gain-factor');
const labelGainFactor = document.getElementById('label-gain-factor');
const btnApplyGain = document.getElementById('btn-apply-gain');
const btnFadeIn = document.getElementById('btn-fade-in');
const btnFadeOut = document.getElementById('btn-fade-out');
const btnSilence = document.getElementById('btn-silence');
const btnCrop = document.getElementById('btn-crop');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const labelZoomValue = document.getElementById('zoom-value');

const btnSaveRegion = document.getElementById('btn-save-region');
const savedRegionsContainer = document.getElementById('saved-regions-container');
const regionCountBadge = document.getElementById('region-count');
const btnBulkExport = document.getElementById('btn-bulk-export');

const statusDot = document.querySelector('.status-dot');
const statusText = document.getElementById('status-text');

// Visualizer Canvases
const frequencyCanvas = document.getElementById('frequency-canvas');
const vuBarL = document.getElementById('vu-bar-l');
const vuBarR = document.getElementById('vu-bar-r');

// -------------------------------------------------------------
// 1. Initial Setup & Event Binding
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  setupFileDragAndDrop();
  setupZoomControls();
  setupPlaybackControls();
  setupProcessors();
  setupSelectionHandlers();
  setupRegionsManager();
  
  // Resize handler for main waveform drawing
  window.addEventListener('resize', () => {
    if (currentAudioBuffer) {
      drawWaveform();
      drawRuler();
    }
  });

  // Setup Visualizer Blank Slate
  drawBlankVisualizer();
});

// Drag and drop listeners
function setupFileDragAndDrop() {
  // Global drag events
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hidden');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only hide if cursor leaves drop zone
    if (e.relatedTarget === null || !dropZone.contains(e.relatedTarget)) {
      dropZone.classList.add('hidden');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.add('hidden');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  audioUploadInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });
}

// -------------------------------------------------------------
// 2. Audio File Loading, Decoding, & State Sync
// -------------------------------------------------------------
function updateStatus(text, type = 'info') {
  statusText.textContent = text;
  statusDot.className = 'status-dot';
  
  if (type === 'success') {
    statusDot.classList.add('green');
  } else if (type === 'error') {
    statusDot.style.backgroundColor = '#f43f5e';
    statusDot.style.boxShadow = '0 0 8px #f43f5e';
  } else if (type === 'loading') {
    statusDot.style.backgroundColor = '#10b981';
    statusDot.style.boxShadow = '0 0 8px #10b981';
    statusDot.classList.add('pulsing');
  } else {
    // Info / default mint
    statusDot.style.backgroundColor = '#10b981';
    statusDot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.6)';
  }
}

async function handleFileSelected(file) {
  if (!file) return;
  
  updateStatus(`Loading sound file: ${file.name}...`, 'loading');
  stopAudio();
  
  // Show file meta bubble
  fileInfoBubble.classList.remove('hidden');
  displayFileName.textContent = file.name;
  displayFileMeta.textContent = "Loading file payload...";

  try {
    // Read file as ArrayBuffer
    const fileReader = new FileReader();
    
    fileReader.onload = async (e) => {
      const arrayBuffer = e.target.result;
      
      // Initialize AudioContext on user interaction
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      updateStatus("Decoding audio spectrum locally...", 'loading');
      
      try {
        // Decode
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // Save initial state in engine
        initAudioBufferState(decodedBuffer);
        
        // Update Meta Display
        const durationStr = formatTimeHMS(decodedBuffer.duration);
        const sr = decodedBuffer.sampleRate;
        const channels = decodedBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo';
        displayFileMeta.textContent = `${durationStr} | ${sr} Hz | ${channels}`;
        
        // UI Enabling
        enableAllEditingControls(true);
        updateStatus(`Decoded successfully: ${file.name}`, 'success');
      } catch (decodeErr) {
        console.error(decodeErr);
        updateStatus("Failed to decode audio. Format might be unsupported.", 'error');
        displayFileMeta.textContent = "Error decoding audio";
      }
    };

    fileReader.onerror = () => {
      updateStatus("Failed to read file.", 'error');
    };

    fileReader.readAsArrayBuffer(file);
  } catch (err) {
    console.error(err);
    updateStatus("Error processing file selection.", 'error');
  }
}

// Set up original structures from decoded audio
function initAudioBufferState(audioBuffer) {
  currentAudioBuffer = audioBuffer;
  originalDuration = audioBuffer.duration;
  
  // Deep copy channel samples to active float array
  activeChannelsData = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const rawData = audioBuffer.getChannelData(c);
    const floatCopy = new Float32Array(rawData.length);
    floatCopy.set(rawData);
    activeChannelsData.push(floatCopy);
  }

  // Clear and initialize history stack
  historyStack = [];
  historyPointer = -1;
  pushHistoryState("Import Sound File");

  // Selection defaults: select none initially
  resetSelection();
  
  // Reset zoom to fit screen
  zoomLevel = 100;
  labelZoomValue.textContent = "100%";
  
  // Draw wave
  drawWaveform();
  drawRuler();
  
  // Move playhead to 0
  updatePlayheadVisual(0);
}

// -------------------------------------------------------------
// 3. High-Performance Dual-Symmetric Waveform Drawing
// -------------------------------------------------------------
function drawWaveform() {
  if (!currentAudioBuffer || activeChannelsData.length === 0) return;

  const width = getCanvasRequiredWidth();
  const height = waveformCanvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  // Sync high-DPI sizing
  waveformCanvas.width = width * dpr;
  waveformCanvas.height = height * dpr;
  waveformCanvas.style.width = `${width}px`;

  const ctx = waveformCanvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const numChannels = activeChannelsData.length;
  const numSamples = activeChannelsData[0].length;
  const centerY = height / 2;
  const ampScale = height * 0.45; // Leave 5% buffer top/bottom

  // Setup gradient style for waves (Sleek Nordic Glacier Mint & Ice Blue Gradient)
  const waveGradient = ctx.createLinearGradient(0, 0, 0, height);
  waveGradient.addColorStop(0, '#06b6d4');    // Ice Blue (edges)
  waveGradient.addColorStop(0.35, '#059669'); // Deep Emerald Teal
  waveGradient.addColorStop(0.5, '#10b981');  // Bright Glacier Mint (center)
  waveGradient.addColorStop(0.65, '#059669'); // Deep Emerald Teal
  waveGradient.addColorStop(1, '#06b6d4');    // Ice Blue (edges)

  ctx.strokeStyle = waveGradient;
  ctx.lineWidth = 1;

  // Downsampling logic
  // Draw channel 1 (L) on top half, channel 2 (R) on bottom half (if stereo),
  // or a unified centered waveform for mono/merged.
  ctx.beginPath();
  
  // Step through every pixel column of the canvas width
  for (let x = 0; x < width; x++) {
    // Find sample indices mapped to this pixel column
    const sampleStart = Math.floor((x / width) * numSamples);
    const sampleEnd = Math.floor(((x + 1) / width) * numSamples);
    
    let minVal = 0;
    let maxVal = 0;

    // Scan samples in this bucket
    for (let s = sampleStart; s < sampleEnd; s++) {
      if (s >= numSamples) break;
      
      // Merge all channels at sample index s for representation
      let sum = 0;
      for (let c = 0; c < numChannels; c++) {
        sum += activeChannelsData[c][s];
      }
      const val = sum / numChannels;

      if (val > maxVal) maxVal = val;
      if (val < minVal) minVal = val;
    }

    // Adjust lines slightly so silent regions still show a thin flat line
    if (maxVal - minVal < 0.005) {
      maxVal = 0.0025;
      minVal = -0.0025;
    }

    // Draw symmetric vertical line
    const yTop = centerY - (maxVal * ampScale);
    const yBottom = centerY - (minVal * ampScale);
    
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBottom);
  }
  
  ctx.stroke();

  // Highlight active selected areas on Waveform (if selection is present)
  if (selectionActive) {
    const leftX = (selectionStart / originalDuration) * width;
    const rightX = (selectionEnd / originalDuration) * width;
    
    // Draw semi-transparent selection cover overlay (ice blue/cyan tint)
    ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
    ctx.fillRect(leftX, 0, rightX - leftX, height);
    
    // Draw boundary border highlights
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftX, 0);
    ctx.lineTo(leftX, height);
    ctx.moveTo(rightX, 0);
    ctx.lineTo(rightX, height);
    ctx.stroke();
  }
}

// Compute desired canvas width based on zoom slider
function getCanvasRequiredWidth() {
  const containerWidth = waveformViewport.clientWidth - 40; // viewport margins
  const zoomFactor = zoomLevel / 100;
  let targetWidth = Math.round(containerWidth * zoomFactor);
  
  // Enforce bounds
  if (targetWidth < containerWidth) targetWidth = containerWidth;
  if (targetWidth > maxCanvasWidth) targetWidth = maxCanvasWidth;
  
  return targetWidth;
}

// Draw ticks and labels on the time ruler
function drawRuler() {
  if (!currentAudioBuffer) return;

  const width = getCanvasRequiredWidth();
  timeRuler.innerHTML = '';
  timeRuler.style.width = `${width}px`;

  // Ruler tick densities based on total duration and current canvas width
  const pixelsPerSecond = width / originalDuration;
  
  // Decide interval of ticks
  let tickInterval = 1; // second
  if (pixelsPerSecond < 5) tickInterval = 30;
  else if (pixelsPerSecond < 15) tickInterval = 10;
  else if (pixelsPerSecond < 35) tickInterval = 5;
  else if (pixelsPerSecond < 80) tickInterval = 2;
  else tickInterval = 1;

  for (let t = 0; t <= originalDuration; t += tickInterval) {
    const x = t * pixelsPerSecond;
    
    const tick = document.createElement('div');
    tick.className = 'ruler-tick';
    
    // Major tick with label every few ticks
    const isMajor = t % (tickInterval * 5) === 0 || t === 0;
    if (isMajor) {
      tick.classList.add('major');
      const label = document.createElement('span');
      label.textContent = formatTimeMS(t);
      tick.appendChild(label);
    }
    
    tick.style.left = `${x}px`;
    timeRuler.appendChild(tick);
  }
}

// Zoom Handlers
function setupZoomControls() {
  btnZoomIn.addEventListener('click', () => {
    if (zoomLevel < 1000) {
      zoomLevel = Math.min(1000, zoomLevel + 50);
      syncZoomUI();
    }
  });

  btnZoomOut.addEventListener('click', () => {
    if (zoomLevel > 100) {
      zoomLevel = Math.max(100, zoomLevel - 50);
      syncZoomUI();
    }
  });

  btnZoomFit.addEventListener('click', () => {
    zoomLevel = 100;
    syncZoomUI();
  });
}

function syncZoomUI() {
  labelZoomValue.textContent = `${zoomLevel}%`;
  drawWaveform();
  drawRuler();
  
  // Re-sync current selection visual overlay
  updateSelectionOverlayVisual();
  
  // Re-sync active playhead indicator
  if (currentAudioBuffer) {
    updatePlayheadVisual(startTimeOffset);
  }
}

// -------------------------------------------------------------
// 4. Time Selection & Cursor Interaction Layers
// -------------------------------------------------------------
function setupSelectionHandlers() {
  // Bind interactions directly on canvas
  waveformCanvas.addEventListener('mousedown', (e) => {
    if (!currentAudioBuffer) return;

    const rect = waveformCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const canvasWidth = getCanvasRequiredWidth();
    
    // Map mouse click to exact audio second
    const targetSecond = (mouseX / canvasWidth) * originalDuration;
    
    // Toggle audio stops during click
    const wasPlaying = isPlaying;
    if (isPlaying) {
      pauseAudio();
    }
    
    isDraggingSelection = true;
    dragStartSeconds = targetSecond;
    
    // Set both start/end to cursor point
    selectionStart = targetSecond;
    selectionEnd = targetSecond;
    selectionLength = 0;
    selectionActive = true;
    
    // Set playing head to cursor
    startTimeOffset = targetSecond;
    updatePlayheadVisual(targetSecond);
    
    updateSelectionHUD();
    updateSelectionOverlayVisual();
    drawWaveform(); // redraw to show selection
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingSelection || !currentAudioBuffer) return;

    const rect = waveformCanvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left;
    const canvasWidth = getCanvasRequiredWidth();
    
    // Clamp mouse x bounds to canvas width
    if (mouseX < 0) mouseX = 0;
    if (mouseX > canvasWidth) mouseX = canvasWidth;

    const currentSecond = (mouseX / canvasWidth) * originalDuration;
    
    // Determine start vs end based on drag direction
    if (currentSecond > dragStartSeconds) {
      selectionStart = dragStartSeconds;
      selectionEnd = currentSecond;
    } else {
      selectionStart = currentSecond;
      selectionEnd = dragStartSeconds;
    }
    
    selectionLength = selectionEnd - selectionStart;
    
    // Move playhead to selection bounds start
    startTimeOffset = selectionStart;
    updatePlayheadVisual(selectionStart);
    
    updateSelectionHUD();
    updateSelectionOverlayVisual();
    drawWaveform();
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingSelection) {
      isDraggingSelection = false;
      
      // If selection is extremely tiny, treat it as a single point cursor instead of selection range
      if (selectionLength < 0.05) {
        resetSelection();
        drawWaveform();
      }
    }
  });
}

function resetSelection() {
  selectionStart = 0;
  selectionEnd = originalDuration;
  selectionLength = originalDuration;
  selectionActive = false;
  
  // Disable selection processing controls
  btnApplyGain.disabled = true;
  btnFadeIn.disabled = true;
  btnFadeOut.disabled = true;
  btnSilence.disabled = true;
  btnCrop.disabled = true;
  btnSaveRegion.disabled = true;

  updateSelectionHUD();
  updateSelectionOverlayVisual();
}

function updateSelectionHUD() {
  hudPlayhead.textContent = formatTimeHMS(startTimeOffset);
  
  if (selectionActive) {
    hudSelectStart.textContent = formatTimeHMS(selectionStart);
    hudSelectEnd.textContent = formatTimeHMS(selectionEnd);
    hudSelectLen.textContent = formatTimeHMS(selectionLength);
    
    // Enable processors
    btnApplyGain.disabled = false;
    btnFadeIn.disabled = false;
    btnFadeOut.disabled = false;
    btnSilence.disabled = false;
    btnCrop.disabled = false;
    btnSaveRegion.disabled = false;
  } else {
    hudSelectStart.textContent = "00:00.000";
    hudSelectEnd.textContent = formatTimeHMS(originalDuration);
    hudSelectLen.textContent = formatTimeHMS(originalDuration);
  }
}

function updateSelectionOverlayVisual() {
  if (!selectionActive || !currentAudioBuffer) {
    selectionOverlay.classList.add('hidden');
    return;
  }

  const canvasWidth = getCanvasRequiredWidth();
  const leftX = (selectionStart / originalDuration) * canvasWidth;
  const rightX = (selectionEnd / originalDuration) * canvasWidth;
  
  // Offset alignment due to viewport scroller
  selectionOverlay.style.left = `${leftX}px`;
  selectionOverlay.style.width = `${rightX - leftX}px`;
  selectionOverlay.classList.remove('hidden');
}

function updatePlayheadVisual(seconds) {
  if (!currentAudioBuffer) {
    playheadElement.classList.add('hidden');
    return;
  }

  const canvasWidth = getCanvasRequiredWidth();
  const x = (seconds / originalDuration) * canvasWidth;
  
  playheadElement.style.left = `${x}px`;
  playheadElement.classList.remove('hidden');
  hudPlayhead.textContent = formatTimeHMS(seconds);
}

// -------------------------------------------------------------
// 5. Audio Playback Controls & Synchronization
// -------------------------------------------------------------
function setupPlaybackControls() {
  btnPlay.addEventListener('click', () => {
    if (!currentAudioBuffer) return;
    playAudio();
  });

  btnPause.addEventListener('click', () => {
    pauseAudio();
  });

  btnStop.addEventListener('click', () => {
    stopAudio();
  });

  btnLoop.addEventListener('click', () => {
    isLooping = !isLooping;
    btnLoop.classList.toggle('active', isLooping);
    if (playSourceNode) {
      playSourceNode.loop = isLooping;
    }
  });
}

// Regenerates an active AudioBuffer object from stored Float32Arrays
function getActiveBufferForPlayback() {
  if (activeChannelsData.length === 0) return null;
  
  const sampleRate = currentAudioBuffer.sampleRate;
  const length = activeChannelsData[0].length;
  
  // Re-create buffer instance
  const tempBuffer = audioCtx.createBuffer(activeChannelsData.length, length, sampleRate);
  for (let c = 0; c < activeChannelsData.length; c++) {
    tempBuffer.copyToChannel(activeChannelsData[c], c);
  }
  return tempBuffer;
}

function playAudio() {
  if (isPlaying || !currentAudioBuffer) return;

  // Make sure context is active
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // Retrieve reconstituted buffer
  const bufferToPlay = getActiveBufferForPlayback();
  
  playSourceNode = audioCtx.createBufferSource();
  playSourceNode.buffer = bufferToPlay;
  
  // Wire dynamic gain node (Full 100% volume for standard playback output; precise FX handles sample adjustments)
  masterGainNode = audioCtx.createGain();
  masterGainNode.gain.setValueAtTime(playbackVolume, audioCtx.currentTime);
  
  // Wire Analyser Node for live visualizer
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 256;
  
  // Connections
  playSourceNode.connect(masterGainNode);
  masterGainNode.connect(analyserNode);
  analyserNode.connect(audioCtx.destination);

  // Set looping configuration
  playSourceNode.loop = isLooping;
  if (isLooping && selectionActive) {
    playSourceNode.loopStart = selectionStart;
    playSourceNode.loopEnd = selectionEnd;
  }

  // Starting position clamp
  let playStart = startTimeOffset;
  if (selectionActive && (playStart < selectionStart || playStart >= selectionEnd)) {
    playStart = selectionStart;
  }
  
  // Start source node
  playSourceNode.start(0, playStart);

  isPlaying = true;
  startContextTime = audioCtx.currentTime;
  startTimeOffset = playStart;

  // Toggle button decks
  btnPlay.classList.add('playing');
  btnPause.disabled = false;
  btnStop.disabled = false;
  btnPlay.disabled = true;
  
  updateStatus("Playback active", 'success');

  // Launch timing tracking loop
  startPlaybackTracker();

  // Launch visualization loop
  startVisualizationLoop();
}

function pauseAudio() {
  if (!isPlaying) return;
  
  // Compute exactly where we paused
  const elapsed = audioCtx.currentTime - startContextTime;
  startTimeOffset += elapsed;
  
  // Cap at bounds
  if (startTimeOffset >= originalDuration) {
    startTimeOffset = selectionActive ? selectionStart : 0;
  }

  stopSourceNodeQuietly();
  
  isPlaying = false;
  btnPlay.classList.remove('playing');
  btnPause.disabled = true;
  btnPlay.disabled = false;
  
  clearInterval(playbackIntervalId);
  updateStatus("Playback paused");
}

function stopAudio() {
  stopSourceNodeQuietly();
  
  // Reset plays position
  startTimeOffset = selectionActive ? selectionStart : 0;
  updatePlayheadVisual(startTimeOffset);

  isPlaying = false;
  btnPlay.classList.remove('playing');
  btnPause.disabled = true;
  btnStop.disabled = true;
  btnPlay.disabled = false;

  clearInterval(playbackIntervalId);
  updateStatus("Playback stopped");
}

function stopSourceNodeQuietly() {
  if (playSourceNode) {
    try {
      playSourceNode.stop();
    } catch (e) {
      // already stopped/finished
    }
    playSourceNode.disconnect();
    playSourceNode = null;
  }
}

// Clock tick interval tracker for smooth playhead motion
function startPlaybackTracker() {
  clearInterval(playbackIntervalId);
  
  const tickRateMs = 30; // 33 FPS tick
  
  playbackIntervalId = setInterval(() => {
    if (!isPlaying) return;

    const elapsed = audioCtx.currentTime - startContextTime;
    let currentPos = startTimeOffset + elapsed;

    if (isLooping) {
      const loopLen = selectionActive ? (selectionEnd - selectionStart) : originalDuration;
      const baseStart = selectionActive ? selectionStart : 0;
      if (currentPos >= baseStart + loopLen) {
        // Wrap around loop bounds
        startContextTime = audioCtx.currentTime;
        startTimeOffset = baseStart;
        currentPos = baseStart;
      }
    } else {
      if (currentPos >= (selectionActive ? selectionEnd : originalDuration)) {
        // Reached end of track/selection
        stopAudio();
        return;
      }
    }

    updatePlayheadVisual(currentPos);
  }, tickRateMs);
}

// -------------------------------------------------------------
// 6. Non-Destructive Audio Transformation Algorithms
// -------------------------------------------------------------
function setupProcessors() {
  // Volume Slider feedback
  sliderGainFactor.addEventListener('input', (e) => {
    labelGainFactor.textContent = `${e.target.value}%`;
  });

  // Apply volume change
  btnApplyGain.addEventListener('click', () => {
    if (!selectionActive) return;
    const factor = parseFloat(sliderGainFactor.value) / 100;
    
    applyAudioOperation((samples) => {
      return samples * factor;
    }, `Adjust Volume to ${sliderGainFactor.value}%`);
  });

  // Apply Linear Fade In
  btnFadeIn.addEventListener('click', () => {
    if (!selectionActive) return;
    
    applyAudioOperationWithIndex((val, i, startIndex, length) => {
      const fraction = (i - startIndex) / length;
      return val * fraction;
    }, "Apply Fade In");
  });

  // Apply Linear Fade Out
  btnFadeOut.addEventListener('click', () => {
    if (!selectionActive) return;
    
    applyAudioOperationWithIndex((val, i, startIndex, length) => {
      const fraction = (i - startIndex) / length;
      return val * (1.0 - fraction);
    }, "Apply Fade Out");
  });

  // Silence selected region
  btnSilence.addEventListener('click', () => {
    if (!selectionActive) return;
    
    applyAudioOperation(() => {
      return 0.0;
    }, "Silence Region");
  });

  // Crop selection
  btnCrop.addEventListener('click', () => {
    if (!selectionActive) return;
    
    stopAudio();

    const sampleRate = currentAudioBuffer.sampleRate;
    const startIndex = Math.floor(selectionStart * sampleRate);
    const endIndex = Math.floor(selectionEnd * sampleRate);
    const newLength = endIndex - startIndex;

    if (newLength <= 0) return;

    // Build crop transaction
    const croppedChannels = [];
    for (let c = 0; c < activeChannelsData.length; c++) {
      const srcChannel = activeChannelsData[c];
      const newFloat = new Float32Array(newLength);
      
      // Copy sub segment
      for (let i = 0; i < newLength; i++) {
        newFloat[i] = srcChannel[startIndex + i];
      }
      croppedChannels.push(newFloat);
    }

    // Set new active variables
    activeChannelsData = croppedChannels;
    
    // Synthesize temporary AudioBuffer to compute duration
    const tempBuf = audioCtx.createBuffer(croppedChannels.length, newLength, sampleRate);
    currentAudioBuffer = tempBuf;
    originalDuration = tempBuf.duration;

    // Clear selection
    resetSelection();
    
    // Register History
    pushHistoryState("Crop to Selection");
    
    // Redraw Workstation
    drawWaveform();
    drawRuler();
    updatePlayheadVisual(0);
    
    updateStatus("Cropped selection successfully", 'success');
  });

  // Undo/Redo Click Triggers
  btnUndo.addEventListener('click', () => {
    triggerUndo();
  });

  btnRedo.addEventListener('click', () => {
    triggerRedo();
  });
}

// Master processor loop (amplitude-only transformations)
function applyAudioOperation(sampleTransformFn, operationName) {
  stopAudio();

  const sampleRate = currentAudioBuffer.sampleRate;
  const startIndex = Math.floor(selectionStart * sampleRate);
  const endIndex = Math.floor(selectionEnd * sampleRate);

  // Deep copy channels data
  const channelsCopy = activeChannelsData.map(channel => {
    const newChan = new Float32Array(channel.length);
    newChan.set(channel);
    return newChan;
  });

  // Apply transform function onto arrays in-place
  for (let c = 0; c < channelsCopy.length; c++) {
    const chSamples = channelsCopy[c];
    for (let i = startIndex; i < endIndex; i++) {
      if (i >= chSamples.length) break;
      chSamples[i] = sampleTransformFn(chSamples[i]);
    }
  }

  // Commit changes
  activeChannelsData = channelsCopy;
  pushHistoryState(operationName);
  
  drawWaveform();
  updateStatus(`Applied filter: ${operationName}`, 'success');
}

// Index-aware processor loop (like fades)
function applyAudioOperationWithIndex(sampleTransformFn, operationName) {
  stopAudio();

  const sampleRate = currentAudioBuffer.sampleRate;
  const startIndex = Math.floor(selectionStart * sampleRate);
  const endIndex = Math.floor(selectionEnd * sampleRate);
  const length = endIndex - startIndex;

  if (length <= 0) return;

  const channelsCopy = activeChannelsData.map(channel => {
    const newChan = new Float32Array(channel.length);
    newChan.set(channel);
    return newChan;
  });

  for (let c = 0; c < channelsCopy.length; c++) {
    const chSamples = channelsCopy[c];
    for (let i = startIndex; i < endIndex; i++) {
      if (i >= chSamples.length) break;
      chSamples[i] = sampleTransformFn(chSamples[i], i, startIndex, length);
    }
  }

  activeChannelsData = channelsCopy;
  pushHistoryState(operationName);
  
  drawWaveform();
  updateStatus(`Applied filter: ${operationName}`, 'success');
}

// -------------------------------------------------------------
// 7. Undo/Redo Engine Stack implementation
// -------------------------------------------------------------
function pushHistoryState(actionName) {
  // Discard future redos if we were in the middle of history
  if (historyPointer < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyPointer + 1);
  }

  // Create deep copy of active Float arrays for preservation
  const preservationCopy = activeChannelsData.map(channel => {
    const arr = new Float32Array(channel.length);
    arr.set(channel);
    return arr;
  });

  historyStack.push({
    action: actionName,
    channels: preservationCopy,
    duration: originalDuration
  });

  historyPointer++;
  syncHistoryButtons();
}

function triggerUndo() {
  if (historyPointer <= 0) return;

  stopAudio();
  historyPointer--;
  restoreHistoryState(historyStack[historyPointer]);
  syncHistoryButtons();
  
  updateStatus(`Undo: ${historyStack[historyPointer + 1].action}`);
}

function triggerRedo() {
  if (historyPointer >= historyStack.length - 1) return;

  stopAudio();
  historyPointer++;
  restoreHistoryState(historyStack[historyPointer]);
  syncHistoryButtons();

  updateStatus(`Redo: ${historyStack[historyPointer].action}`);
}

function restoreHistoryState(stateObj) {
  // Deep clone samples back out
  activeChannelsData = stateObj.channels.map(channel => {
    const arr = new Float32Array(channel.length);
    arr.set(channel);
    return arr;
  });

  originalDuration = stateObj.duration;
  
  // Reconstitute sample bounds
  const sampleRate = currentAudioBuffer.sampleRate;
  const tempBuf = audioCtx.createBuffer(activeChannelsData.length, activeChannelsData[0].length, sampleRate);
  currentAudioBuffer = tempBuf;

  // Clear selections
  resetSelection();

  // Redraw
  drawWaveform();
  drawRuler();
  updatePlayheadVisual(0);
}

function syncHistoryButtons() {
  btnUndo.disabled = historyPointer <= 0;
  btnRedo.disabled = historyPointer >= historyStack.length - 1;
}

function enableAllEditingControls(enable) {
  if (enable) {
    btnPlay.disabled = false;
    btnLoop.disabled = false;
  }
}

// -------------------------------------------------------------
// 8. 60 FPS Real-time Frequency Spectrum & VU Indicators
// -------------------------------------------------------------
function drawBlankVisualizer() {
  const width = frequencyCanvas.clientWidth;
  const height = frequencyCanvas.clientHeight;
  frequencyCanvas.width = width;
  frequencyCanvas.height = height;

  const ctx = frequencyCanvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  // Background grids
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // Draw cool default central amber circle
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(245, 158, 11, 0.2)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0; // reset shadow
}

function startVisualizationLoop() {
  const width = frequencyCanvas.clientWidth;
  const height = frequencyCanvas.clientHeight;
  frequencyCanvas.width = width;
  frequencyCanvas.height = height;

  const ctx = frequencyCanvas.getContext('2d');
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function drawFrame() {
    if (!isPlaying) {
      drawBlankVisualizer();
      vuBarL.style.width = '0%';
      vuBarR.style.width = '0%';
      return;
    }

    requestAnimationFrame(drawFrame);

    // Get live frequency amplitudes
    analyserNode.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, width, height);

    // Draw Cyber-purple/gold grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // A. Draw Premium Circular Cyberpunk Hologram Spectrum in Center (Gold & Purple motif)
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = 45;

    // Draw rotating cyber-rings
    const rotationSpeed = Date.now() * 0.0006;
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius + 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
    ctx.arc(centerX, centerY, baseRadius - 8, 0, Math.PI * 2);
    ctx.stroke();

    // Render radial bars dancing
    const barCount = 72;
    ctx.lineWidth = 2.2;
    ctx.shadowBlur = 8;

    for (let i = 0; i < barCount; i++) {
      const binIdx = Math.floor((i / barCount) * (bufferLength * 0.6));
      const amplitude = dataArray[binIdx] / 255.0; // 0.0 to 1.0

      const angle = (i / barCount) * Math.PI * 2 + rotationSpeed;
      const barHeight = amplitude * 42; // Max dancing height

      const startX = centerX + Math.cos(angle) * baseRadius;
      const startY = centerY + Math.sin(angle) * baseRadius;
      const endX = centerX + Math.cos(angle) * (baseRadius + barHeight);
      const endY = centerY + Math.sin(angle) * (baseRadius + barHeight);

      // Gradient color based on angle (Glacier Mint to Ice Blue)
      const angleFraction = i / barCount;
      if (angleFraction < 0.5) {
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.45 + amplitude * 0.55})`; // Mint
        ctx.shadowColor = '#10b981';
      } else {
        ctx.strokeStyle = `rgba(6, 182, 212, ${0.45 + amplitude * 0.55})`;  // Ice Blue/Cyan
        ctx.shadowColor = '#06b6d4';
      }

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
    ctx.shadowBlur = 0; // Reset canvas shadows

    // B. Draw Left/Right channel amplitude peaking meters
    const sampleRate = currentAudioBuffer.sampleRate;
    const currentSecond = startTimeOffset + (audioCtx.currentTime - startContextTime);
    const centerSampleIdx = Math.floor(currentSecond * sampleRate);
    
    const scanWindow = 1024;
    let peakL = 0.001;
    let peakR = 0.001;

    if (centerSampleIdx < activeChannelsData[0].length) {
      const count = Math.min(scanWindow, activeChannelsData[0].length - centerSampleIdx);
      
      // Channel 0 (L)
      for (let s = 0; s < count; s++) {
        const val = Math.abs(activeChannelsData[0][centerSampleIdx + s]);
        if (val > peakL) peakL = val;
      }
      
      // Channel 1 (R)
      if (activeChannelsData.length > 1) {
        for (let s = 0; s < count; s++) {
          const val = Math.abs(activeChannelsData[1][centerSampleIdx + s]);
          if (val > peakR) peakR = val;
        }
      } else {
        peakR = peakL;
      }
    }

    const displayPeakL = Math.min(100, Math.round(Math.pow(peakL, 0.6) * 105));
    const displayPeakR = Math.min(100, Math.round(Math.pow(peakR, 0.6) * 105));

    // Update width percentages of visual bars directly
    vuBarL.style.width = `${displayPeakL}%`;
    vuBarR.style.width = `${displayPeakR}%`;
  }

  requestAnimationFrame(drawFrame);
}

// -------------------------------------------------------------
// 9. Regions Manager List (Queue Split Tracks)
// -------------------------------------------------------------
function setupRegionsManager() {
  btnSaveRegion.addEventListener('click', () => {
    if (!selectionActive) return;

    regionCounter++;
    
    const newRegion = {
      id: `region-${Date.now()}`,
      name: `Split Track ${regionCounter}`,
      start: selectionStart,
      end: selectionEnd,
      duration: selectionLength
    };

    savedRegions.push(newRegion);
    
    renderSavedRegionsList();
    updateStatus(`Added selection to split list: ${newRegion.name}`, 'success');
  });

  btnBulkExport.addEventListener('click', () => {
    if (savedRegions.length === 0) return;
    triggerBulkSplitZipExport();
  });
}

function renderSavedRegionsList() {
  regionCountBadge.textContent = savedRegions.length;
  
  if (savedRegions.length === 0) {
    savedRegionsContainer.innerHTML = `
      <div class="regions-empty-state">
        <svg viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v20M17 5v14M22 9v6M7 8v8M2 10v4" />
        </svg>
        <p>No split tracks created yet</p>
        <span class="help-text">Drag on the waveform to make a selection, then click "Split Selection" to queue a split track.</span>
      </div>
    `;
    btnBulkExport.disabled = true;
    return;
  }

  btnBulkExport.disabled = false;
  savedRegionsContainer.innerHTML = '';

  savedRegions.forEach(region => {
    const item = document.createElement('div');
    item.className = 'region-item';
    item.id = region.id;

    const durationStr = formatTimeHMS(region.duration);
    const startStr = formatTimeHMS(region.start);
    const endStr = formatTimeHMS(region.end);

    item.innerHTML = `
      <div class="region-meta">
        <input type="text" class="region-title-input" value="${region.name}" data-id="${region.id}">
        <span class="region-duration">${durationStr}</span>
      </div>
      <div class="region-times">
        <span><svg viewBox="0 0 24 24" width="8" height="8" fill="var(--text-muted)"><circle cx="12" cy="12" r="10"/></svg> Start: ${startStr}</span>
        <span><svg viewBox="0 0 24 24" width="8" height="8" fill="var(--text-muted)"><circle cx="12" cy="12" r="10"/></svg> End: ${endStr}</span>
      </div>
      <div class="region-actions">
        <div class="region-mini-btn-group">
          <button class="btn-mini play-mini" title="Play region segment" data-id="${region.id}">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
          <button class="btn-mini delete-mini" title="Remove split track" data-id="${region.id}">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <button class="btn-mini export-mini" title="Export this track (WAV)" data-id="${region.id}">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Export
        </button>
      </div>
    `;

    // Dynamic title rename listener
    const titleInput = item.querySelector('.region-title-input');
    titleInput.addEventListener('change', (e) => {
      const rid = e.target.getAttribute('data-id');
      const found = savedRegions.find(r => r.id === rid);
      if (found) {
        found.name = e.target.value;
      }
    });

    // Play Mini segment
    item.querySelector('.play-mini').addEventListener('click', () => {
      stopAudio();
      
      // Select this exact range visually on screen
      selectionStart = region.start;
      selectionEnd = region.end;
      selectionLength = region.duration;
      selectionActive = true;
      
      updateSelectionHUD();
      updateSelectionOverlayVisual();
      drawWaveform();

      playAudio();
    });

    // Delete region
    item.querySelector('.delete-mini').addEventListener('click', () => {
      savedRegions = savedRegions.filter(r => r.id !== region.id);
      renderSavedRegionsList();
      updateStatus(`Removed split track`, 'info');
    });

    // Export single region WAV
    item.querySelector('.export-mini').addEventListener('click', () => {
      exportSingleRegionToWAV(region);
    });

    savedRegionsContainer.appendChild(item);
  });
}

// -------------------------------------------------------------
// 10. Binary WAV Encoder in Pure JS (16-bit Stereo PCM WAV format)
// -------------------------------------------------------------
function exportSingleRegionToWAV(region, targetFileName = null) {
  try {
    const sampleRate = currentAudioBuffer.sampleRate;
    const startSample = Math.floor(region.start * sampleRate);
    const endSample = Math.floor(region.end * sampleRate);
    const lengthSamples = endSample - startSample;

    if (lengthSamples <= 0) {
      updateStatus("Invalid split sample range.", 'error');
      return null;
    }

    // Extract raw samples from active channels array
    const subSegments = [];
    for (let c = 0; c < activeChannelsData.length; c++) {
      const fullChan = activeChannelsData[c];
      const slice = new Float32Array(lengthSamples);
      
      // Extract segment copy safely
      for (let i = 0; i < lengthSamples; i++) {
        slice[i] = (startSample + i < fullChan.length) ? fullChan[startSample + i] : 0.0;
      }
      subSegments.push(slice);
    }

    // Binary encode to WAV ArrayBuffer
    const wavBytes = encodeWAV16BitPCM(subSegments, sampleRate);
    
    // If a filename is specified, we return the Blob instead of initiating download (used in ZIP compilation)
    if (targetFileName) {
      return new Blob([wavBytes], { type: 'audio/wav' });
    }

    // Build Blob and trigger download
    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    const blobUrl = URL.createObjectURL(blob);
    
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = blobUrl;
    
    // Clean file name
    const safeName = region.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    downloadAnchor.download = `${safeName}.wav`;
    
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    
    // Revoke URL memory after timeout
    setTimeout(() => URL.revokeObjectURL(blobUrl), 20000);
    
    updateStatus(`Exported track successfully: ${region.name}.wav`, 'success');
  } catch (err) {
    console.error(err);
    updateStatus(`Error exporting segment: ${err.message}`, 'error');
  }
}

// -------------------------------------------------------------
// 11. Custom Naming Prompt & Unified ZIP compilation using JSZip
// -------------------------------------------------------------
function triggerBulkSplitZipExport() {
  // 1. Prompt user for custom base naming preference
  let preferredName = prompt(
    "Enter preferred name for split tracks:\n(Or leave blank to use their individual saved names)", 
    "Split Track"
  );
  
  // User clicked "Cancel" on dialog
  if (preferredName === null) {
    updateStatus("Export canceled.");
    return;
  }
  
  preferredName = preferredName.trim();

  // 2. Check if JSZip library loaded successfully from CDN
  if (typeof JSZip !== 'undefined') {
    updateStatus("Compiling ZIP archive of split tracks...", 'loading');
    
    try {
      const zip = new JSZip();
      
      savedRegions.forEach((region, index) => {
        // Compile raw WAV bytes for this region
        const wavBlob = exportSingleRegionToWAV(region, "GET_BLOB");
        
        if (wavBlob) {
          // File naming: either sequential with custom prefix or saved unique list titles
          let fileName = "";
          if (preferredName !== "") {
            const safeBase = preferredName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
            fileName = `${safeBase}_${index + 1}.wav`;
          } else {
            fileName = `${region.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}.wav`;
          }
          
          zip.file(fileName, wavBlob);
        }
      });
      
      // Assemble and trigger a single ZIP download
      zip.generateAsync({ type: 'blob' }).then(function(zipContent) {
        const zipUrl = URL.createObjectURL(zipContent);
        const zipAnchor = document.createElement('a');
        zipAnchor.href = zipUrl;
        zipAnchor.download = "voluma_split_tracks.zip";
        
        document.body.appendChild(zipAnchor);
        zipAnchor.click();
        document.body.removeChild(zipAnchor);
        
        setTimeout(() => URL.revokeObjectURL(zipUrl), 20000);
        updateStatus(`ZIP compiled! Exported ${savedRegions.length} tracks successfully.`, 'success');
      }).catch(function(zipErr) {
        console.error("ZIP Generation error:", zipErr);
        updateStatus("ZIP compression failed. Falling back to sequential file downloads.", 'error');
        triggerBulkSequentialWAVExportLegacy(preferredName);
      });
      
    } catch (zipCreationErr) {
      console.error(zipCreationErr);
      updateStatus("Failed to compile ZIP. Falling back to sequential downloads.", 'error');
      triggerBulkSequentialWAVExportLegacy(preferredName);
    }
    
  } else {
    // Falls back to sequential individual file downloads if JSZip library failed to load
    updateStatus("JSZip script unavailable. Initiating sequential WAV downloads...", 'loading');
    triggerBulkSequentialWAVExportLegacy(preferredName);
  }
}

// Fallback legacy bulk downloads if ZIP libraries are offline
function triggerBulkSequentialWAVExportLegacy(preferredName) {
  let i = 0;
  function processNext() {
    if (i >= savedRegions.length) {
      updateStatus(`Batch export completed! Saved ${savedRegions.length} tracks.`, 'success');
      return;
    }
    
    const region = savedRegions[i];
    
    // Override name if custom prefix is specified
    if (preferredName !== "") {
      const clonedRegion = Object.assign({}, region);
      clonedRegion.name = `${preferredName} ${i + 1}`;
      exportSingleRegionToWAV(clonedRegion);
    } else {
      exportSingleRegionToWAV(region);
    }
    
    i++;
    setTimeout(processNext, 850);
  }

  processNext();
}

/**
 * 16-Bit Stereo PCM WAV Encoder
 * @param {Float32Array[]} channelData 
 * @param {number} sampleRate 
 * @returns {ArrayBuffer}
 */
function encodeWAV16BitPCM(channelData, sampleRate) {
  const numChannels = channelData.length;
  const numSamples = channelData[0].length;
  
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const subchunk2Size = numSamples * blockAlign;
  
  const buffer = new ArrayBuffer(44 + subchunk2Size);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* chunk size */
  view.setUint32(4, 36 + subchunk2Size, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk size */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM = 1) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitsPerSample, true);
  
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk size */
  view.setUint32(40, subchunk2Size, true);

  // Write Interleaved Float32 samples converted to 16-bit signed PCM Int16
  let offset = 44;
  for (let s = 0; s < numSamples; s++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][s];
      if (sample > 1.0) sample = 1.0;
      if (sample < -1.0) sample = -1.0;
      
      const sample16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample16, true);
      offset += 2;
    }
  }

  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// -------------------------------------------------------------
// 12. Timing Formatting Utilities
// -------------------------------------------------------------
function formatTimeMS(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const minStr = min.toString().padStart(2, '0');
  const secStr = sec.toString().padStart(2, '0');
  return `${minStr}:${secStr}`;
}

function formatTimeHMS(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  const minStr = min.toString().padStart(2, '0');
  const secStr = sec.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(3, '0');
  
  return `${minStr}:${secStr}.${msStr}`;
}
