# SnapText Pro — Context-Preserving Document & Typography Editor ⚡

> **Cloud AI & Vision API Document Text Inpainter & Typography Replicator**  
> Powered by **FastAPI**, **RapidOCR ONNX Runtime**, **Google Gemini 2.5 Flash Vision**, and **OpenCV Smart Glyph Inpainting**.

[![Backend](https://img.shields.io/badge/Backend-FastAPI%20%28Python%203.11%2B%29-009688.svg)](https://fastapi.tiangolo.com)
[![OCR Engine](https://img.shields.io/badge/OCR-RapidOCR%20ONNX%20Runtime-blue.svg)](https://github.com/RapidAI/RapidOCR)
[![Vision AI](https://img.shields.io/badge/Cloud%20AI-Google%20Gemini%202.5%20Flash-4285F4.svg)](https://ai.google.dev/)
[![Computer Vision](https://img.shields.io/badge/Inpainting-OpenCV%20Telea%20%26%20Navier--Stokes-orange.svg)](https://opencv.org)
[![Frontend](https://img.shields.io/badge/Frontend-HTML5%20%2F%20Canvas%20%2F%20Vanilla%20CSS%20%2F%20JS-F7DF1E.svg)](#-frontend-features)

---

## 📌 1. Project Overview

**SnapText Pro** is a full-stack document editing and typography replication suite designed to replace embedded text in images (flyers, posters, menus, certificates, and infographics) without disrupting background colors, gradients, textures, or surrounding graphics.

The system pairs a **FastAPI computer vision backend** with an **interactive browser application**:
1. **Automated Text & Geometry Detection:** Uses **RapidOCR ONNX** (PP-OCRv4/v5) and optional **Google Gemini 2.5 Flash Vision** to detect text boundaries, polygons, and orientations (horizontal and vertical).
2. **Deep Typography Profiling:** Analyzes cropped text patches using Otsu segmentation, distance transforms, and Hough line angle detection to extract the **exact text color**, **background color**, **font weight**, **font size**, **italic slant**, **casing**, and **Google Font family**.
3. **Smart Background Inpainting:** Erases old text at the glyph level using OpenCV Telea (`cv2.INPAINT_TELEA`) and Navier-Stokes (`cv2.INPAINT_NS`) with feathered alpha boundary blending—completely eliminating rectangular black boxes or blurry artifacts.
4. **Interactive In-Place Canvas Editor:** Users tap or drag over text to edit directly on the canvas with a floating typography toolbar, before/after split comparison slider, batch multi-edit mode, and camera import.

---

## 🌟 2. What Is Actually in This Repository

| Directory / Component | Technology Stack | Key Responsibilities |
|---|---|---|
| [`backend/app.py`](backend/app.py) | **FastAPI, RapidOCR, OpenCV, NumPy, Google GenAI SDK** | REST API providing high-speed text detection, typography feature profiling, glyph inpainting, and cloud vision inference. |
| [`web-demo/index.html`](web-demo/index.html) | **HTML5, Google Fonts, Semantic Web UI** | Main user interface with workspace controls, floating formatting popovers, comparison slider, and settings dialogs. |
| [`web-demo/style.css`](web-demo/style.css) | **Modern Vanilla CSS (Custom Design System)** | Refined visual styling with soft 14px card radii, BMW Corporate palette (`#1c69d4`), glassmorphism toolbars, ambient shadows, and responsive layout. |
| [`web-demo/app.js`](web-demo/app.js) | **Vanilla JavaScript, HTML5 Canvas API** | Canvas rendering engine, in-place text editor, interactive split slider, draw-to-edit tool, history undo/redo, and backend API integration. |
| [`web-demo/sample_aws.png`](web-demo/sample_aws.png) | **Test Image / Benchmark** | The official AWS Builder Center flyer sample used for testing detection, font replication, and background inpainting. |
| [`scripts/export_and_quantize_paddleocr.py`](scripts/export_and_quantize_paddleocr.py) | **Python, ONNX, PaddleOCR** | Model conversion and INT8 quantization utility for mobile/edge ONNX runtime deployment. |

---

## 🛠️ 3. Technical Architecture & Pipeline

```
+-------------------------------------------------------------------------------+
|                             INTERACTIVE WEB CLIENT                            |
|    (Canvas 2D Engine · Direct In-Place Editor · Before/After Split Slider)     |
+---------------------------------------+---------------------------------------+
                                        |
                         HTTP / REST API Requests
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                           FASTAPI PYTHON BACKEND                              |
|                       (Running at http://127.0.0.1:8000)                      |
+-------------------+-----------------------------------+-----------------------+
                    |                                   |
                    v                                   v
+---------------------------------------+  +------------------------------------+
|         TEXT DETECTION ENGINE         |  |         INPAINTING ENGINE          |
|  • RapidOCR ONNX (PP-OCRv4/v5)        |  |  • Smart Glyph Mask Extraction     |
|  • Google Gemini 2.5 Flash Vision     |  |  • OpenCV Telea & Navier-Stokes    |
|  • Polygons & Vertical Text Handlers  |  |  • Feathered Boundary Alpha Blend  |
+-------------------+-------------------+  +------------------+-----------------+
                    |                                     |
                    v                                     |
+---------------------------------------+                 |
|     DEEP TYPOGRAPHY & FONT PROFILER   |                 |
|  • Otsu Binarization Ink Segmentation |                 |
|  • Median Hex Foreground & BG Color   |                 |
|  • Stroke Width Transform (Font Weight|                 |
|  • Hough Slant Analysis (Italics)     |                 |
|  • Google Font Matching               |                 |
+-------------------+-------------------+                 |
                    |                                     |
                    +------------------+------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
|                      CANVAS TEXT RE-SYNTHESIS ENGINE                          |
|        (Dynamic Google Fonts · Scaled Baseline Fit · Text Alignment)          |
+-------------------------------------------------------------------------------+
```

---

## 🚀 4. API Endpoints Reference

The FastAPI backend exposes the following REST endpoints:

### `GET /api/health`
Health check verifying vision engine and inpainting readiness.
- **Response:**
  ```json
  {
    "status": "online",
    "engine": "RapidOCR ONNX & Gemini Vision Ready",
    "network": "Cloud Connected (Online Mode)",
    "inpainting": "Smart Glyph-Level Telea & Navier-Stokes Inpainting"
  }
  ```

### `POST /api/detect`
Performs OCR detection and full typography extraction on an uploaded image.
- **Form Data:** `file` (Image binary: PNG, JPEG, WEBP)
- **Response:**
  ```json
  {
    "count": 14,
    "latency_ms": 24.5,
    "regions": [
      {
        "id": "cloud_1",
        "box": { "x": 497, "y": 365, "w": 96, "h": 58 },
        "text": "Build",
        "score": 0.985,
        "textColor": "#0f172a",
        "bgColor": "#93c5fd",
        "fontSize": 45,
        "fontWeight": "900",
        "fontStyle": "normal",
        "fontFamily": "Montserrat",
        "fontCategory": "sans-serif",
        "alignment": "center",
        "isUppercase": false,
        "isVertical": false,
        "letterSpacing": 0.0
      }
    ]
  }
  ```

### `POST /api/inpaint`
Erases old text and reconstructs background texture at the glyph level.
- **Form Data:**
  - `file`: Image binary
  - `x`, `y`, `w`, `h`: Bounding box coordinates
  - `method`: Inpainting mode (`telea` or `ns`)
- **Response:** Streamed PNG image patch with bounding box coordinates in `X-Patch-X`, `X-Patch-Y`, `X-Patch-W`, `X-Patch-H` response headers.

### `POST /api/gemini-detect`
Alternative multimodal cloud AI vision endpoint powered by Google Gemini 2.5 Flash.
- **Form Data:** `file` (Image binary), `api_key` (Optional if passed via `X-Api-Key` header)
- **Response:** Semantic text regions with detected typography and coordinates.

---

## 🎨 5. Key Frontend Features

1. **Preset Document Templates & Custom Uploads:**
   - **AWS Builder Center Flyer** (`sample_aws.png`) — Official benchmark image.
   - **iQOO Battle 2026 Flyer** — Dark-mode esports flyer.
   - **Bistro Menu & Pricing** — Complex restaurant layout with prices and items.
   - **Snapdragon NPU Infographic** — Technical metrics and data points.
   - **Tech Summit Certificate** — Formal certificate with serif & script typography.
   - **Custom Image Upload & Camera Capture** — Test with any real-world image.

2. **Context-Preserving Inline Canvas Editor:**
   - Click any highlighted bounding box on the document to open the in-place editor.
   - The floating typography toolbar lets you fine-tune font family, font size, weight (`Reg`, `Semi`, `Bold`, `Black`), color picker + swatches, alignment, italic toggle, and uppercase transform.

3. **Draw-to-Edit Mode (Custom Bounding Box):**
   - Click **✏️ Draw Box to Edit** to drag a selection box over any arbitrary text in the image. The backend automatically extracts the text, analyzes font styling, inpaints the background, and lets you retype.

4. **Before / After Comparison Split View:**
   - Toggle **↔ Before / After Split** to swipe an interactive divider across the canvas, comparing original pixels (left) against the reconstructed typography (right).

5. **Multi-Document Batch Replacement:**
   - Apply find-and-replace rules across multiple templates simultaneously without cloud re-uploading.

6. **History & Scoped State:**
   - Unlimited step-by-step **Undo** (`Ctrl+Z`) and **Redo** (`Ctrl+Y`), image reset, and high-resolution PNG export.

---

## 💻 6. How to Run Locally

### Prerequisites
- Python 3.10, 3.11, or 3.12
- Node.js or Python `http.server` to serve the static frontend

### Step 1: Start the Python FastAPI Backend
```bash
# Navigate to repository root
cd "backend"

# Activate the virtual environment
# Windows:
.\venv\Scripts\activate
# Linux / macOS:
# source venv/bin/activate

# Install dependencies if not already installed
pip install -r requirements.txt
# (Key packages: fastapi, uvicorn, rapidocr-onnxruntime, opencv-python, numpy, google-genai)

# Start the uvicorn server
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```
*The backend will start at `http://127.0.0.1:8000`.*

### Step 2: Serve the Frontend Web Application
In a separate terminal:
```bash
# Serve the web-demo folder on port 3000
python -m http.server 3000 --directory web-demo
```

### Step 3: Open in Browser
Open your browser and navigate to:
```
http://localhost:3000/
```
The application will automatically load the AWS Builder Center Flyer, run text detection through the local backend, and display interactive bounding boxes ready for instant editing.

---

## ⚙️ 7. Optional Cloud AI Integration (Google Gemini)

To enable deep multimodal document understanding via Google Gemini 2.5 Flash:
1. Click **⚙️ Engine: RapidOCR & Cloud Vision** in the top navigation bar.
2. Select **Google Gemini 2.5 Flash Vision (Cloud AI)**.
3. Enter your Gemini API key (from Google AI Studio).
4. Click **Save Settings**.
5. Subsequent image analyses will run through Gemini Vision while background inpainting remains accelerated by OpenCV.
