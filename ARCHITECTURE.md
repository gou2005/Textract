# System Architecture & Technical Specification

## 1. High-Level Modular Design

```
+-----------------------------------------------------------------------------+
|                             MAIN ACTIVITY & UI LAYER                        |
|                                                                             |
|  +-------------------------+  +----------------------+  +----------------+  |
|  | InteractiveCanvas.kt    |  | TextEditBottomSheet  |  | CompareSlider  |  |
|  +-------------------------+  +----------------------+  +----------------+  |
|                                                                             |
|                                 OfflineBadge.kt                             |
+--------------------------------------+--------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------+
|                               VIEWMODEL LAYER                               |
|                                                                             |
|                          DocumentEditorViewModel.kt                         |
|     (Manages Bitmap Buffer Stack, Undo History, Processing States)          |
+--------------------------------------+--------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------+
|                               PIPELINE ENGINE                               |
|                                                                             |
|  +----------------------+   +-----------------------+   +----------------+  |
|  | PaddleOcrEngine      |   | OpenCvInpainter       |   | ColorSampler   |  |
|  | (ONNX INT8 + NNAPI)  |   | (cv2.inpaint Telea)   |   | (K-Means/Ring) |  |
|  +----------------------+   +-----------------------+   +----------------+  |
|                                                                             |
|                          TextCanvasRenderer.kt                              |
|                   (Android Canvas Font & Layout Engine)                     |
+-----------------------------------------------------------------------------+
```

---

## 2. Pipeline Execution Steps

### Step A: Image Import & Tensor Preprocessing
1. Image loaded from `PickVisualMedia` or `ACTION_IMAGE_CAPTURE`.
2. Bitmap normalized and scaled to nearest 32-pixel multiple dimensions ($W \times H$).
3. Converted to Float32 Tensor: Shape `[1, 3, H, W]`, RGB normalized with mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`.

### Step B: Text Detection & Recognition (ONNX Runtime + NNAPI)
1. Tensor fed into **PP-OCRv5 Mobile Detection Model** (`det_model.onnx`).
2. NNAPI execution provider offloads matrix multiplications to Snapdragon Hexagon NPU.
3. Probability map thresholded at $0.3$ to generate text contour polygons / bounding boxes.
4. Bounding box regions cropped, warped (if rotated), and fed to **PP-OCRv5 Recognition Model** (`rec_model.onnx`).
5. Output decoded via CTC decoder into text string + confidence score.

### Step C: Background Inpainting (OpenCV Android SDK)
1. When user selects a text region and enters replacement text:
2. Create a binary mask ($M$) matching input image dimensions.
3. Draw white filled polygon over the target text bounding box dilated by 3–5 pixels (to cover anti-aliased glyph edges).
4. Execute OpenCV `Photo.inpaint(srcMat, maskMat, dstMat, 3.0, Photo.INPAINT_TELEA)`.
5. Fast Marching Method propagates outer pixel colors inward along level-set lines, leaving the surrounding graphic background intact.

### Step D: Typography Synthesis & Canvas Re-render
1. **Color Sampling:** Extract ring of pixels around bounding box perimeter. Calculate average or dominant RGB color for foreground text and background contrast.
2. **Text Measurement:** Measure target bounding box height ($H_{box}$) and width ($W_{box}$).
3. **Dynamic Font Sizing:** Compute `Paint.textSize` so replacement text fits within $W_{box}$ and baseline aligns with $H_{box}$.
4. **Drawing:** Render text onto the inpainted bitmap using Android `Canvas.drawText()`.

---

## 3. Non-Destructive Multi-Edit Undo Stack

To allow unlimited undo/redo without accumulated pixel degradation:

```kotlin
data class EditSnapshot(
    val id: String = UUID.randomUUID().toString(),
    val bitmap: Bitmap,
    val textRegions: List<TextRegion>,
    val actionDescription: String
)

class EditHistoryManager {
    private val undoStack = ArrayDeque<EditSnapshot>()
    private val redoStack = ArrayDeque<EditSnapshot>()

    fun push(snapshot: EditSnapshot) {
        undoStack.addLast(snapshot)
        redoStack.clear()
    }

    fun undo(): EditSnapshot? {
        if (undoStack.size > 1) {
            val current = undoStack.removeLast()
            redoStack.addLast(current)
            return undoStack.last()
        }
        return null
    }

    fun redo(): EditSnapshot? {
        if (redoStack.isNotEmpty()) {
            val next = redoStack.removeLast()
            undoStack.addLast(next)
            return next
        }
        return null
    }
}
```

---

## 4. Manifest Zero Network Assurance

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.iqoo.doceditor">

    <!-- STRICT PRIVACY: NO INTERNET PERMISSION IS REQUESTED OR DECLARED -->

    <uses-permission android:name="android.permission.RECORD_AUDIO" /> <!-- For on-device SpeechRecognizer -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" android:maxSdkVersion="34" />

    <application
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="SnapText IQOO"
        android:supportsRtl="true"
        android:theme="@style/Theme.SnapText">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```
