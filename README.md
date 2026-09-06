# SnapText — Context-Preserving Document Text Editor 📱⚡
> **100% Offline, NPU-Accelerated Native Android Image Text Editor**  
> *Submitted for iQOO Hackathon 2026 · Chennai City Battle (Idea-Screening Stage)*

[![Platform](https://img.shields.io/badge/Platform-Android%20(Kotlin)-green.svg)](https://developer.android.com)
[![Hardware](https://img.shields.io/badge/NPU-Snapdragon%20Hexagon-yellow.svg)](https://www.qualcomm.com/snapdragon)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Offline%20(Zero%20Internet)-brightgreen.svg)](#-privacy-guarantee)
[![Inference](https://img.shields.io/badge/Runtime-ONNX%20Mobile%20NNAPI-blue.svg)](https://onnxruntime.ai)

---

## 📌 1. Executive Summary

**The Problem:** Modifying text embedded in images (flyers, infographics, documents, restaurant menus, certificates) currently requires desktop software like Photoshop or cloud AI tools (e.g. Canva, Adobe Express). Cloud tools present **severe privacy risks** for confidential documents, rely on internet connectivity, introduce round-trip latency, and frequently hallucinate background textures.

**The Solution:** **SnapText** is a 100% offline native Android application powered by on-device ML and computer vision. It detects text boxes in imported images via **PP-OCRv5 INT8 on Snapdragon Hexagon NPU**, lets the user edit specific text regions via typing or on-device speech, reconstructs the background locally using **OpenCV Telea Inpainting**, and re-renders new text seamlessly with match-sampled typography.

**Privacy Guarantee:** Zero network calls. **No `INTERNET` permission** declared in `AndroidManifest.xml`.

---

## 🌟 2. Key Features & PRD Scope Alignment

### 2.1 Core Features (10/10 Shipped)
1. **Import Image:** Android Photo Picker (`PickVisualMedia`) + Camera capture (`ACTION_IMAGE_CAPTURE`) with EXIF orientation correction.
2. **Auto Text Detection:** PP-OCRv5 DBNet INT8 quantized tensor inference + dynamic contrast boundary candidate extraction.
3. **Tap-to-Edit:** Bounding boxes highlighted on canvas; tap to open Material 3 editor bottom sheet.
4. **Type or Speak Replacement Text:** Standard keyboard + on-device Android `SpeechRecognizer` (`EXTRA_PREFER_OFFLINE`).
5. **Erase + Reconstruct Background:** OpenCV Android SDK `cv2.inpaint()` using Fast Marching Method (`INPAINT_TELEA`) with 4px dilation.
6. **Re-render New Text:** Dynamic font sizing, baseline alignment, and perimeter ring K-means color sampling.
7. **Multi-Edit per Session:** Sequential edits across multiple regions on the same session canvas.
8. **Undo per Edit:** Immutable `EditHistoryManager` stack with unlimited step-by-step undo and redo.
9. **Save / Export:** Scoped storage saving to Android MediaStore (`/Pictures/SnapText`) + native sharing (`ACTION_SEND`).
10. **Visible Offline Proof:** Prominent top bar badge verifying `100% OFFLINE · ZERO NETWORK CALLS`.

### 2.2 Stretch Features (2/2 Shipped)
1. **Before/After Compare Slider:** Draggable split slider (`BeforeAfterSlider.kt`) providing instant visual verification of pixel preservation.
2. **Batch Mode:** Automated find-and-replace across multiple documents (`BatchEditDialog.kt`) without cloud upload.

---

## 🛠️ 3. Architecture & Technical Pipeline

```
+-----------------------------------------------------------------------+
|                           ANDROID USER INTERFACE                       |
|        (Jetpack Compose · Material 3 · Interactive Touch Overlay)     |
+------------------------------------+----------------------------------+
                                     |
                                     v
+-----------------------------------------------------------------------+
|                    DOCUMENT EDITOR VIEWMODEL / STATE                  |
|    (Multi-Edit History Stack · Scoped Storage · Batch Progress State) |
+---------------+--------------------+----------------------------------+
                |                    |
                v                    v
+-------------------------------+  +------------------------------------+
|   ONNX RUNTIME MOBILE (NNAPI) |  |        OPENCV ANDROID SDK          |
|  PP-OCRv5 Mobile Det & Rec    |  | Telea Inpainting + Mask Dilation   |
| (Snapdragon Hexagon NPU Offload) | (Fast Marching Method, <15ms)      |
+---------------+---------------+  +----------------+-------------------+
                |                                   |
                +-----------------+-----------------+
                                  |
                                  v
+-----------------------------------------------------------------------+
|                      TEXT SYNTHESIS & RENDERER                        |
|        (Color Sampling · Canvas Paint Engine · Typography Match)      |
+-----------------------------------------------------------------------+
```

| Layer | Technology Choice | Rationale |
|---|---|---|
| **Platform** | Native Android (Kotlin) | Direct hardware access & lowest latency |
| **UI Framework** | Jetpack Compose + Material 3 | Modern declarative reactive UI |
| **Text Detection / Rec** | PaddleOCR Mobile (PP-OCRv5) | SOTA accuracy for mobile documents in ~4.2 MB |
| **Model Quantization** | ONNX INT8 Quantization | 75% memory footprint reduction & fast tensor math |
| **Inference Runtime** | ONNX Runtime Mobile + NNAPI EP | Direct offload to Qualcomm Hexagon NPU |
| **Background Reconstruction** | OpenCV Android SDK (`INPAINT_TELEA`) | Real-time ($O(N \log N)$) offline texture reconstruction |
| **Text Re-render** | Android `Canvas` & `Paint` | Hardware-accelerated native font metrics |
| **Voice Input** | Android `SpeechRecognizer` | Offline speech-to-text without network |
| **Network** | NONE | Absolute zero-network privacy guarantee |

---

## 🚀 4. Repository Structure

```
IQOO Hackathon/
├── app/
│   ├── build.gradle.kts                # Android dependencies & ONNX/OpenCV config
│   └── src/main/
│       ├── AndroidManifest.xml          # Zero network manifest declaration + FileProvider
│       ├── res/xml/file_paths.xml       # Scoped storage sharing paths
│       └── java/com/iqoo/doceditor/
│           ├── MainActivity.kt          # Main entry point & theme
│           ├── data/model/
│           │   ├── TextRegion.kt        # Bounding box & text metadata model
│           │   └── EditHistory.kt       # Non-destructive undo stack
│           ├── engine/
│           │   ├── PaddleOcrEngine.kt   # ONNX Runtime + NNAPI interface + candidate extraction
│           │   ├── OpenCvInpainter.kt   # OpenCV background reconstruction (INPAINT_TELEA)
│           │   ├── TextCanvasRenderer.kt# Canvas text synthesis engine
│           │   └── ColorSampler.kt      # Border pixel color extraction
│           ├── ui/
│           │   ├── screens/
│           │   │   └── EditorScreen.kt  # Main editor screen with photo picker, camera, save/share
│           │   ├── components/
│           │   │   ├── InteractiveCanvas.kt    # Touch overlay with boxes
│           │   │   ├── TextEditBottomSheet.kt  # Keyboard/Voice modal
│           │   │   ├── BeforeAfterSlider.kt    # Comparison split slider
│           │   │   ├── BatchEditDialog.kt      # Stretch Feature 2 Batch Mode modal
│           │   │   └── OfflineBadge.kt         # Visual privacy proof
│           │   ├── theme/
│           │   │   ├── Color.kt
│           │   │   └── Theme.kt
│           │   └── viewmodel/
│           │       └── DocumentEditorViewModel.kt # StateFlow & Scoped Storage manager
├── scripts/
│   └── export_and_quantize_paddleocr.py# Python INT8 model quantization pipeline
├── web-demo/                            # Interactive Web Simulator for idea screening testing
│   ├── index.html                       # High-aesthetic iQOO cyberpunk simulator
│   ├── style.css                        # Glassmorphic dark styling & responsive grid
│   └── app.js                           # Telea inpainting, templates & batch mode simulation
├── ARCHITECTURE.md                      # Detailed technical architecture specification
└── SUBMISSION_PITCH.md                  # Hackathon idea screening submission document
```

---

## ⚡ 5. Testing & Quick Demonstration

### Option A: Interactive Web Simulator (Instant Browser Test)
Judges and evaluators can test the complete user flow immediately in any web browser without building the APK:
1. Open `web-demo/index.html` in Chrome/Edge/Firefox.
2. Select any template ("iQOO Battle Flyer", "Bistro Menu", "NPU Infographic", "Certificate") or import an image / capture camera.
3. Tap any highlighted text box to open the editor.
4. Type or speak replacement text and click **Apply & Reconstruct**.
5. Test the **Before/After Split Slider** and **Batch Multi-Edit Mode**!

### Option B: Android Studio Project Build
1. Open the repository root in Android Studio (Giraffe or newer).
2. Sync Gradle dependencies (pre-configured with Gradle 8.2 wrapper and Kotlin 1.9.22).
3. Connect an Android device (e.g. iQOO 12, Neo 9 Pro, or Snapdragon emulator) and click **Run**.

---

## 🛡️ 6. Privacy & Compliance Audit

- **No INTERNET Permission:** Manifest verified. No network sockets or external telemetry.
- **On-Device Data Boundary:** Image bitmaps remain in local application memory and scoped storage.
- **Microphone Access:** Used exclusively via Android's local on-device `SpeechRecognizer` (`EXTRA_PREFER_OFFLINE`).
