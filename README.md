# ❄️ Voluma - Premium Audio Waveform Editor & Splitter

**Voluma** is a high-performance, responsive, client-side single-page application (SPA) designed for seamless local audio editing, splitting, visual analysis, and export. 

Styled in an elegant, professional **Nordic Glacier Mint & Ice Blue** design system, Voluma runs **100% locally in the user's browser** via the Web Audio API. No server uploads are required, guaranteeing absolute privacy, zero network latency, and sub-millisecond audio rendering.

---

## 🌐 Live Web Workstation

Launch the online editor instantly from any browser (desktop, laptop, mobile):
🔗 **[https://seehighxb.github.io/Voluma-sound-editor/](https://seehighxb.github.io/Voluma-sound-editor/)**

*Supported formats: `WAV`, `MP3`, `FLAC`, `M4A`, `OGG`, and any format supported natively by your browser's decoding engine.*

---

## ✨ Core Premium Features

### 1. High-DPI Dual-Symmetric Waveform Visualizer
- **Dual-Symmetric downsampled rendering**: Renders multi-million sample audio points instantly using an optimized horizontal pixel bucket canvas loop.
- **Micro-interactivity**: Click and drag gestures to select range slices down to sample-level precision.
- **Scrollable Horizontal Zoom**: Zoom in up to 1000% for micro-adjustments or zoom out to 100% (fit track to viewport) with fluid scrolling.
- **Floating Controls**: A sleek, borderless, floating glassmorphism zoom deck anchors the top-right corner to keep the layout entirely clean.

### 2. Live Frequency Spectrogram & Peaking VU Meters
- **Circular Hologram Visualizer**: Features a dancing 72-point radial frequency spectrum rendered at 60 FPS in a rotating holographic ring layout during active playback.
- **Peaking Stereo LED VU indicators**: Continuously scans sample arrays around the playhead, calculating Left and Right channel decibel limits and rendering responsive bouncing meter fills.

### 3. Precision Audio Editing & Complete Undo Stack
- **Adjust Volume (Gain)**: Amplifies or attenuates selection regions between `0%` and `300%` using a precise digital slider.
- **Creative FX**: Apply linear fade-ins, decay fade-outs, absolute silencing, or crop selection ranges instantly.
- **Deep Undo/Redo Engine**: Clones Float32 raw channel buffers before any destructive action, letting you backtrack edits seamlessly.

### 4. Split-Track List & Unified ZIP Compiler
- **Queue Split Selections**: Drag selection ranges on the canvas and split them into distinct tracks in a sidebar list. Rename tracks dynamically (e.g. `Intro_Chime`, `Melody_Hook`).
- **Sequential Custom Naming**: Clicking **"Export All Split Files"** prompts you for a preferred base name (e.g. `Vocals`). The app will name files inside the archive sequentially: `vocals_1.wav`, `vocals_2.wav`, etc.
- **Unified ZIP Archive**: Compiles all WAV tracks into a single compressed folder (`voluma_split_tracks.zip`) completely client-side in seconds using JSZip. Download one single file instead of twenty individual browser prompts!

---

## 💻 How to Use Voluma

### Way 1: Live Public Link (Instant Access)
1. Navigate to: **[https://seehighxb.github.io/Voluma-sound-editor/](https://seehighxb.github.io/Voluma-sound-editor/)**
2. Click **"Load Sound File"** in the top-right, or drag-and-drop an audio file directly into the browser tab.
3. Start editing, splitting, and visual-peaking immediately!

### Way 2: Local Offline Use (No Internet Required)
If you want to use the editor completely offline, or host it on your own server, you can do so in seconds:

#### Method A: Double-Click (Zero Setup)
1. Download and unzip the **`voluma_local_workstation.zip`** package from the repository.
2. Inside the unzipped directory, double-click **`index.html`** to open it. It will launch locally in your default web browser (Chrome, Edge, Firefox, or Safari) and run 100% offline.

#### Method B: Local Static Server
If you want to serve it locally under `http://localhost`, open your terminal inside the unzipped folder and run:
- **Using Python:** `python -m http.server 8085`
- **Using Node/NPM:** `npx http-server -p 8085`
- Then visit **`http://localhost:8085`** in your browser.

---

## 🛠️ Project File Architecture

- **`index.html`**: Layout framework, semantic structures, inline high-DPI vector icons, and dynamic JSZip compression links.
- **`styles.css`**: Nordic Glacier Mint & Deep Space Purple tokens, micro-animations, glowing ranges, custom track sliders, and absolute floating alignments.
- **`app.js`**: Core Web Audio API contexts, downsampling algorithms, 60 FPS requestAnimationFrame canvas spectrum, binary WAV encoder, and sequential ZIP compressors.

---

## 🔒 Security and Privacy
Voluma processes all audio data **strictly inside your local browser memory sandbox**. No files, metadata, or waveforms are ever transmitted or uploaded to a remote server. Your audio tracks remain completely private and secure.

---
Created with ❄️ by **Jojo** & **Antigravity Coding Assistant (DeepMind)**. Enjoy editing!
