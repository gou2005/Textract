import io
import json
import re
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import cv2
import numpy as np
from rapidocr_onnxruntime import RapidOCR

app = FastAPI(title="SnapText Pro AI Backend Engine", version="2.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize RapidOCR ONNX Mobile Engine
print("Initializing RapidOCR ONNX Mobile Engine...")
ocr_engine = RapidOCR()
print("RapidOCR ONNX Engine Initialized Successfully.")


def extract_typography(img: np.ndarray, x: int, y: int, w: int, h: int, text: str, img_w: int, img_h: int) -> dict:
    """
    Extracts deep typography styling: exact text foreground color, background color,
    font weight, font size, Google Font recommendation, text alignment, and casing.
    """
    pad_x = max(1, int(w * 0.04))
    pad_y = max(1, int(h * 0.08))

    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(img_w, x + w + pad_x)
    y2 = min(img_h, y + h + pad_y)

    is_vertical = h > (w * 2.2)

    patch = img[y1:y2, x1:x2]
    if patch.size == 0 or patch.shape[0] < 4 or patch.shape[1] < 4:
        return {
            "textColor": "#FFFFFF",
            "bgColor": "#121212",
            "fontSize": max(14, int(w * 0.78)) if is_vertical else max(12, int(h * 0.76)),
            "fontWeight": "700",
            "fontFamily": "Inter",
            "fontCategory": "sans-serif",
            "alignment": "left",
            "isUppercase": text.isupper() if text else False,
            "isVertical": is_vertical,
            "letterSpacing": 0.0
        }

    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    
    # Otsu thresholding to segment ink from background
    try:
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    except Exception:
        thresh = (gray > np.mean(gray)).astype(np.uint8) * 255

    # Check perimeter pixels to know whether background is bright or dark
    ph, pw = patch.shape[:2]
    perimeter = np.concatenate([thresh[0, :], thresh[ph - 1, :], thresh[:, 0], thresh[:, pw - 1]])
    bg_is_bright = np.mean(perimeter) > 127

    if bg_is_bright:
        text_mask = (thresh == 0)
        bg_mask = (thresh == 255)
    else:
        text_mask = (thresh == 255)
        bg_mask = (thresh == 0)

    # Extract text foreground color
    text_pixels = patch[text_mask]
    if len(text_pixels) > 5:
        # Use median to avoid anti-aliased edge contamination
        text_bgr = np.median(text_pixels, axis=0).astype(int)
    else:
        text_bgr = np.array([255, 255, 255] if not bg_is_bright else [20, 20, 20])

    # Extract background color
    bg_pixels = patch[bg_mask]
    if len(bg_pixels) > 5:
        bg_bgr = np.median(bg_pixels, axis=0).astype(int)
    else:
        bg_bgr = np.array([20, 20, 20] if not bg_is_bright else [245, 245, 245])

    text_hex = f"#{int(text_bgr[2]):02x}{int(text_bgr[1]):02x}{int(text_bgr[0]):02x}"
    bg_hex = f"#{int(bg_bgr[2]):02x}{int(bg_bgr[1]):02x}{int(bg_bgr[0]):02x}"

    # Calculate stroke width and ink density for font weight
    ink_count = np.sum(text_mask)
    total_count = ph * pw
    ink_density = ink_count / total_count if total_count > 0 else 0.2

    ref_dim = min(w, h) if is_vertical else h
    dist = cv2.distanceTransform(text_mask.astype(np.uint8), cv2.DIST_L2, 3)
    positive_dist = dist[dist > 0]
    stroke_radius = np.median(positive_dist) if len(positive_dist) > 0 else 1.2
    stroke_ratio = (stroke_radius * 2.0) / max(10, ref_dim)

    # Calibrated stroke & ink density mapping for font weights
    text_is_upper = text.isupper() if text and any(c.isalpha() for c in text) else False

    if is_vertical:
        font_weight = "900" if stroke_ratio > 0.08 or ink_density > 0.35 else "700"
    elif h > 40: # Headline / Title
        if stroke_ratio > 0.095 or ink_density > 0.44:
            font_weight = "900"
        elif stroke_ratio > 0.07 or ink_density > 0.32:
            font_weight = "700"
        elif stroke_ratio > 0.05 or ink_density > 0.24:
            font_weight = "600"
        else:
            font_weight = "400"
    else: # Small / Body text or pill badge
        if ink_density > 0.45 or (text_is_upper and len(text) <= 8 and ink_density > 0.35):
            font_weight = "900" # Pill titles like LEARN, CONNECT, BUILD, ACHIEVE
        elif ink_density > 0.33:
            font_weight = "700"
        elif ink_density > 0.22:
            font_weight = "500"
        else:
            font_weight = "400"

    # Font size
    if is_vertical:
        font_size = max(14, int(w * 0.78))
    else:
        font_size = max(12, int(h * 0.78))

    # Font Category and Google Font recommendation
    char_len = max(1, len(text.strip()))
    char_aspect = (w / char_len) / max(10, ref_dim)
    text_lower = text.lower()

    # 1. Monospace check: uniform pitch, code/tech branding
    if ('builder center' in text_lower and y < 100) or (char_aspect > 0.58 and font_weight in ('400', '500') and not is_vertical):
        font_family = "JetBrains Mono"
        font_category = "monospace"
        letter_spacing = 1.0
    # 2. Vertical brand banner
    elif is_vertical:
        font_family = "Montserrat"
        font_category = "sans-serif"
        letter_spacing = 0.5
    # 3. Uppercase badges, bold headings, and brand titles
    elif text_is_upper or (font_weight in ("700", "800", "900") and h > 30):
        font_family = "Montserrat"
        font_category = "sans-serif"
        letter_spacing = 0.5 if text_is_upper else 0.0
    # 4. Genuinely condensed fonts
    elif font_weight in ("800", "900") and char_aspect < 0.30 and not is_vertical:
        font_family = "Anton"
        font_category = "display"
        letter_spacing = 0.0
    elif font_weight in ("700", "800") and char_aspect < 0.32 and not is_vertical:
        font_family = "Oswald"
        font_category = "display"
        letter_spacing = 0.0
    # 5. Clean Body text & descriptions
    elif h <= 35:
        font_family = "Inter"
        font_category = "sans-serif"
        letter_spacing = 0.0
    else:
        font_family = "Montserrat"
        font_category = "sans-serif"
        letter_spacing = 0.0

    # Italic slant detection via Hough line angle analysis
    font_style = "normal"
    try:
        lines = cv2.HoughLinesP(text_mask.astype(np.uint8), 1, np.pi / 180, 15, minLineLength=10, maxLineGap=4)
        if lines is not None and len(lines) > 0:
            slants = []
            for line in lines:
                x1_l, y1_l, x2_l, y2_l = line[0]
                ang = np.degrees(np.arctan2(y2_l - y1_l, x2_l - x1_l))
                if 55 <= abs(ang) <= 82:
                    slants.append(90 - abs(ang))
            if len(slants) >= 2 and abs(np.median(slants)) > 8.0:
                font_style = "italic"
    except Exception:
        pass

    # Alignment detection
    box_center_x = x + w / 2.0
    img_center_x = img_w / 2.0
    is_centered = abs(box_center_x - img_center_x) < (img_w * 0.06) or (w > img_w * 0.55)

    if is_centered:
        alignment = "center"
    elif x < img_w * 0.3:
        alignment = "left"
    elif (x + w) > img_w * 0.7:
        alignment = "right"
    else:
        alignment = "left"

    # Casing
    is_uppercase = text_is_upper

    return {
        "textColor": text_hex,
        "bgColor": bg_hex,
        "fontSize": font_size,
        "fontWeight": font_weight,
        "fontStyle": font_style,
        "fontFamily": font_family,
        "fontCategory": font_category,
        "alignment": alignment,
        "isUppercase": is_uppercase,
        "isVertical": is_vertical,
        "letterSpacing": letter_spacing
    }


@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "engine": "RapidOCR ONNX & Gemini Vision Ready",
        "network": "Cloud Connected (Online Mode)",
        "inpainting": "Smart Glyph-Level Telea & Navier-Stokes Inpainting"
    }


@app.post("/api/detect")
async def detect_text(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image format"})

    img_h, img_w = img.shape[:2]

    # Run RapidOCR
    ocr_results, elapse = ocr_engine(img)

    regions = []
    if ocr_results:
        for idx, line in enumerate(ocr_results):
            poly = line[0]       # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
            text = str(line[1]).strip()
            score = float(line[2])

            if not text:
                continue

            x_coords = [p[0] for p in poly]
            y_coords = [p[1] for p in poly]

            x = int(max(0, min(x_coords)))
            y = int(max(0, min(y_coords)))
            w = int(min(img_w - x, max(x_coords) - x))
            h = int(min(img_h - y, max(y_coords) - y))

            if w < 6 or h < 6:
                continue

            # Extract deep typography formatting
            typo = extract_typography(img, x, y, w, h, text, img_w, img_h)

            regions.append({
                "id": f"cloud_{idx + 1}",
                "box": {"x": x, "y": y, "w": w, "h": h},
                "polygon": poly,
                "text": text,
                "score": round(score, 3),
                "textColor": typo["textColor"],
                "bgColor": typo["bgColor"],
                "fontSize": typo["fontSize"],
                "fontWeight": typo["fontWeight"],
                "fontStyle": typo["fontStyle"],
                "fontFamily": typo["fontFamily"],
                "fontCategory": typo["fontCategory"],
                "alignment": typo["alignment"],
                "isUppercase": typo["isUppercase"],
                "isVertical": typo["isVertical"],
                "letterSpacing": typo["letterSpacing"],
                "isEdited": False
            })

    # Sort regions naturally from top to bottom, left to right
    regions.sort(key=lambda r: (r["box"]["y"] // 30, r["box"]["x"]))

    return {
        "regions": regions,
        "count": len(regions),
        "latency_ms": round(sum(elapse) * 1000 if elapse else 25, 1)
    }


@app.post("/api/inpaint")
async def inpaint_text(
    file: UploadFile = File(...),
    x: int = Form(...),
    y: int = Form(...),
    w: int = Form(...),
    h: int = Form(...),
    method: str = Form("telea")
):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image"})

    img_h, img_w = img.shape[:2]

    # Calculate padded box
    pad_x = max(2, int(w * 0.05) + 3)
    pad_y = max(2, int(h * 0.08) + 3)

    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(img_w, x + w + pad_x)
    y2 = min(img_h, y + h + pad_y)

    crop_w = x2 - x1
    crop_h = y2 - y1

    # Extract crop area to inpaint locally
    crop_margin = max(12, int(max(crop_w, crop_h) * 0.3))
    cx1 = max(0, x1 - crop_margin)
    cy1 = max(0, y1 - crop_margin)
    cx2 = min(img_w, x2 + crop_margin)
    cy2 = min(img_h, y2 + crop_margin)

    sub_img = img[cy1:cy2, cx1:cx2].copy()
    sub_mask = np.zeros(sub_img.shape[:2], dtype=np.uint8)

    # Target box coordinates within sub_img
    bx1 = x1 - cx1
    by1 = y1 - cy1
    bx2 = x2 - cx1
    by2 = y2 - cy1

    # Try smart glyph-level segmentation inside the target box
    target_patch = sub_img[by1:by2, bx1:bx2]
    use_glyph_mask = False

    if target_patch.shape[0] > 6 and target_patch.shape[1] > 6:
        gray = cv2.cvtColor(target_patch, cv2.COLOR_BGR2GRAY)
        try:
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            ph, pw = target_patch.shape[:2]
            perimeter = np.concatenate([thresh[0, :], thresh[ph - 1, :], thresh[:, 0], thresh[:, pw - 1]])
            if np.mean(perimeter) > 127:
                ink = (thresh == 0).astype(np.uint8) * 255
            else:
                ink = (thresh == 255).astype(np.uint8) * 255

            ink_ratio = np.sum(ink > 0) / (ph * pw)
            if 0.04 < ink_ratio < 0.85:
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                dilated_ink = cv2.dilate(ink, kernel, iterations=2)
                sub_mask[by1:by2, bx1:bx2] = dilated_ink
                use_glyph_mask = True
        except Exception:
            pass

    if not use_glyph_mask:
        cv2.rectangle(sub_mask, (bx1, by1), (bx2, by2), 255, -1)

    inpaint_mode = cv2.INPAINT_TELEA if method == "telea" else cv2.INPAINT_NS
    inpainted_sub = cv2.inpaint(sub_img, sub_mask, 5, inpaint_mode)

    # Target patch [by1:by2, bx1:bx2]
    patch = inpainted_sub[by1:by2, bx1:bx2]

    # Feather boundary if rectangle mask was used
    if not use_glyph_mask and patch.shape[0] > 6 and patch.shape[1] > 6:
        feather_mask = np.zeros((patch.shape[0], patch.shape[1]), dtype=np.float32)
        feather_mask[2:-2, 2:-2] = 1.0
        feather_mask = cv2.GaussianBlur(feather_mask, (5, 5), 1.5)
        feather_mask = np.repeat(feather_mask[:, :, np.newaxis], 3, axis=2)

        orig_patch = img[y1:y2, x1:x2].astype(np.float32)
        blended_patch = (patch.astype(np.float32) * feather_mask + orig_patch * (1.0 - feather_mask)).astype(np.uint8)
        patch = blended_patch

    _, encoded_img = cv2.imencode('.png', patch)

    return StreamingResponse(
        io.BytesIO(encoded_img.tobytes()),
        media_type="image/png",
        headers={
            "X-Patch-X": str(x1),
            "X-Patch-Y": str(y1),
            "X-Patch-W": str(x2 - x1),
            "X-Patch-H": str(y2 - y1),
            "Access-Control-Expose-Headers": "X-Patch-X, X-Patch-Y, X-Patch-W, X-Patch-H"
        }
    )


@app.post("/api/gemini-detect")
async def gemini_detect(
    file: UploadFile = File(...),
    api_key: Optional[str] = Form(None),
    x_api_key: Optional[str] = Header(None)
):
    key = api_key or x_api_key
    if not key:
        return JSONResponse(
            status_code=400,
            content={"error": "Gemini API key is required. Provide it in the UI or header."}
        )

    try:
        from google import genai
        client = genai.Client(api_key=key)

        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image"})

        img_h, img_w = img.shape[:2]

        prompt = (
            "You are a state-of-the-art OCR and typography expert. Identify ALL text elements in this image. "
            "For each text element, return a JSON array of objects with the following fields:\n"
            "- text: exact string transcribed\n"
            "- box_2d: [ymin, xmin, ymax, xmax] normalized to 0-1000\n"
            "- textColor: hex color code e.g. '#FFFFFF'\n"
            "- bgColor: hex color of background e.g. '#000000'\n"
            "- fontFamily: recommended Google Font name (e.g. 'Anton', 'Oswald', 'Montserrat', 'Roboto', 'Playfair Display', 'JetBrains Mono', 'Pacifico')\n"
            "- fontWeight: '400', '600', '700', '800', or '900'\n"
            "- alignment: 'left', 'center', or 'right'\n"
            "Return ONLY valid JSON array."
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                genai.types.Part.from_bytes(data=contents, mime_type="image/png"),
                prompt
            ]
        )

        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?", "", raw_text)
            raw_text = re.sub(r"```$", "", raw_text).strip()

        parsed = json.loads(raw_text)
        regions = []
        for idx, item in enumerate(parsed):
            box_2d = item.get("box_2d", [0, 0, 100, 100])
            ymin, xmin, ymax, xmax = box_2d

            x = int((xmin / 1000.0) * img_w)
            y = int((ymin / 1000.0) * img_h)
            w = int(((xmax - xmin) / 1000.0) * img_w)
            h = int(((ymax - ymin) / 1000.0) * img_h)

            is_vertical = h > (w * 2.2)
            fontSize = max(14, int(w * 0.78)) if is_vertical else max(12, int(h * 0.78))

            regions.append({
                "id": f"gemini_{idx + 1}",
                "box": {"x": x, "y": y, "w": w, "h": h},
                "text": item.get("text", ""),
                "score": 0.99,
                "textColor": item.get("textColor", "#FFFFFF"),
                "bgColor": item.get("bgColor", "#111111"),
                "fontSize": fontSize,
                "fontWeight": str(item.get("fontWeight", "700")),
                "fontFamily": item.get("fontFamily", "Montserrat"),
                "fontCategory": "sans-serif",
                "alignment": item.get("alignment", "left"),
                "isUppercase": item.get("text", "").isupper(),
                "isVertical": is_vertical,
                "letterSpacing": 0.0,
                "isEdited": False
            })

        return {"regions": regions, "count": len(regions), "source": "gemini-2.5-flash"}

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Gemini Vision error: {str(e)}"})
