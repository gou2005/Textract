// Textract Interactive Simulator Engine
// Document Text Inpainting & Typography Replicator

class TextractSimulator {
  constructor() {
    this.canvas = document.getElementById('doc-canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.boxOverlays = document.getElementById('box-overlays');
    this.regionsList = document.getElementById('regions-list');
    this.regionCountBadge = document.getElementById('region-count-badge');
    this.canvasContainer = document.getElementById('canvas-container');
    this.drawSelectionBox = document.getElementById('draw-selection-box');

    // Inline Editor & Floating Formatting Toolbar
    this.inlineEditor = document.getElementById('inline-text-editor');
    this.inlineInput = document.getElementById('inline-text-input');
    this.fontSelector = document.getElementById('inline-font-selector');
    this.fontSizeDisplay = document.getElementById('font-size-display');
    this.btnFontDec = document.getElementById('btn-font-dec');
    this.btnFontInc = document.getElementById('btn-font-inc');
    this.weightButtons = document.querySelectorAll('.font-weight-group .fmt-btn');
    this.colorPicker = document.getElementById('inline-color-picker');
    this.colorPreview = document.getElementById('color-preview-circle');
    this.swatchButtons = document.querySelectorAll('.swatch-dot');
    this.alignButtons = document.querySelectorAll('.align-group .fmt-btn');
    this.btnToggleItalic = document.getElementById('btn-toggle-italic');
    this.btnToggleCase = document.getElementById('btn-toggle-case');
    this.btnInlineApply = document.getElementById('btn-inline-apply');
    this.btnInlineCancel = document.getElementById('btn-inline-cancel');

    // Engine Settings State
    this.selectedEngine = 'rapidocr';
    this.geminiApiKey = '';
    this.engineModal = document.getElementById('engine-modal');

    // History and State
    this.undoStack = [];
    this.redoStack = [];
    this.textRegions = [];
    this.selectedRegion = null;
    this.originalBitmapData = null;
    this.cleanBackgroundData = null;

    this.isCompareMode = false;
    this.isDrawMode = false;
    this.drawStart = null;
    this.splitSliderPos = 0.5;
    this.zoomLevel = 1.0;
    this.cameraStream = null;

    this.currentTemplate = 'aws_sample';
    this.ocrGranularity = 'all';
    this.rawOcrData = null;

    this.initEventListeners();
    this.initFormattingToolbar();
    this.initEngineSettings();
  }

  initEventListeners() {
    const templateSelect = document.getElementById('template-select');
    if (templateSelect) {
      templateSelect.addEventListener('change', (e) => {
        this.currentTemplate = e.target.value;
        this.loadTemplate(this.currentTemplate);
      });
    }

    document.getElementById('ocr-granularity-select').addEventListener('change', (e) => {
      this.ocrGranularity = e.target.value;
      this.runRealOcrDetection();
    });

    document.getElementById('file-input').addEventListener('change', (e) => this.handleImageUpload(e));
    document.getElementById('btn-camera-capture').addEventListener('click', () => this.openCameraModal());
    document.getElementById('btn-camera-close').addEventListener('click', () => this.closeCameraModal());
    document.getElementById('btn-camera-cancel').addEventListener('click', () => this.closeCameraModal());
    document.getElementById('btn-camera-snap').addEventListener('click', () => this.snapCameraPhoto());

    document.getElementById('btn-open-batch').addEventListener('click', () => this.openBatchModal());
    document.getElementById('btn-batch-close').addEventListener('click', () => this.closeBatchModal());
    document.getElementById('btn-cancel-batch').addEventListener('click', () => this.closeBatchModal());
    document.getElementById('btn-execute-batch').addEventListener('click', () => this.executeBatchMode());

    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-draw-mode').addEventListener('click', () => this.toggleDrawMode());
    document.getElementById('btn-compare').addEventListener('click', () => this.toggleCompareMode());
    document.getElementById('btn-reset-original').addEventListener('click', () => this.resetToOriginal());
    document.getElementById('btn-export').addEventListener('click', () => this.exportImage());

    document.getElementById('btn-zoom-in').addEventListener('click', () => this.setZoom(this.zoomLevel + 0.15));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.setZoom(this.zoomLevel - 0.15));

    this.inlineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitInlineEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeInlineEditing();
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.selectedRegion) return;
      if (e.target.closest('#inline-text-editor') || e.target.classList.contains('overlay-box') || e.target.closest('#engine-modal')) {
        return;
      }
      this.commitInlineEdit();
    });

    this.initDrawingListeners();
    this.initSplitSliderListeners();

    window.addEventListener('keydown', (e) => {
      if (this.selectedRegion) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      }
    });
  }

  initFormattingToolbar() {
    this.fontSelector.addEventListener('change', (e) => {
      if (!this.selectedRegion) return;
      this.selectedRegion.fontFamily = e.target.value;
      this.loadGoogleFont(e.target.value, this.selectedRegion.fontWeight || '700');
      this.inlineInput.style.fontFamily = `"${e.target.value}", sans-serif`;
    });

    this.btnFontDec.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedRegion) return;
      this.selectedRegion.fontSize = Math.max(9, (this.selectedRegion.fontSize || 24) - 2);
      this.fontSizeDisplay.textContent = `${Math.round(this.selectedRegion.fontSize)}px`;
      this.inlineInput.style.fontSize = `${this.getVisualFontSize(this.selectedRegion)}px`;
    });

    this.btnFontInc.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedRegion) return;
      this.selectedRegion.fontSize = Math.min(200, (this.selectedRegion.fontSize || 24) + 2);
      this.fontSizeDisplay.textContent = `${Math.round(this.selectedRegion.fontSize)}px`;
      this.inlineInput.style.fontSize = `${this.getVisualFontSize(this.selectedRegion)}px`;
    });

    this.weightButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.selectedRegion) return;
        const weight = btn.getAttribute('data-weight');
        this.selectedRegion.fontWeight = weight;
        this.weightButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.inlineInput.style.fontWeight = weight;
      });
    });

    this.colorPicker.addEventListener('input', (e) => {
      if (!this.selectedRegion) return;
      const color = e.target.value;
      this.selectedRegion.textColor = color;
      this.colorPreview.style.background = color;
      this.inlineInput.style.color = color;
    });

    this.swatchButtons.forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.selectedRegion) return;
        const color = swatch.getAttribute('data-color');
        this.selectedRegion.textColor = color;
        this.colorPicker.value = color;
        this.colorPreview.style.background = color;
        this.inlineInput.style.color = color;
      });
    });

    this.alignButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.selectedRegion) return;
        const align = btn.getAttribute('data-align');
        this.selectedRegion.alignment = align;
        this.alignButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.inlineInput.style.textAlign = align;
      });
    });

    if (this.btnToggleItalic) {
      this.btnToggleItalic.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.selectedRegion) return;
        this.selectedRegion.fontStyle = (this.selectedRegion.fontStyle === 'italic') ? 'normal' : 'italic';
        this.btnToggleItalic.classList.toggle('active', this.selectedRegion.fontStyle === 'italic');
        this.inlineInput.style.fontStyle = this.selectedRegion.fontStyle;
      });
    }

    this.btnToggleCase.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedRegion) return;
      this.selectedRegion.isUppercase = !this.selectedRegion.isUppercase;
      this.btnToggleCase.classList.toggle('active', this.selectedRegion.isUppercase);
      this.inlineInput.style.textTransform = this.selectedRegion.isUppercase ? 'uppercase' : 'none';
    });

    this.btnInlineApply.addEventListener('click', (e) => {
      e.stopPropagation();
      this.commitInlineEdit();
    });

    this.btnInlineCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeInlineEditing();
    });

    this.inlineEditor.addEventListener('mousedown', (e) => {
      if (!this.selectedRegion) return;

      const target = e.target.closest('.resize-handle, .move-handle');
      if (!target) return;

      e.stopPropagation();
      e.preventDefault();

      const isMove = target.classList.contains('move-handle');
      const dir = target.getAttribute('data-dir');

      const startX = e.clientX;
      const startY = e.clientY;

      const rect = this.inlineEditor.getBoundingClientRect();
      const startBoxX = this.selectedRegion.box.x;
      const startBoxY = this.selectedRegion.box.y;
      const startBoxW = this.selectedRegion.box.w;
      const startBoxH = this.selectedRegion.box.h;

      const canvasRect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / canvasRect.width;
      const scaleY = this.canvas.height / canvasRect.height;

      const onMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newBoxX = startBoxX;
        let newBoxY = startBoxY;
        let newBoxW = startBoxW;
        let newBoxH = startBoxH;

        if (isMove) {
          newBoxX = startBoxX + (dx * scaleX);
          newBoxY = startBoxY + (dy * scaleY);
        } else {
          const scaledDx = dx * scaleX;
          const scaledDy = dy * scaleY;

          if (dir.includes('l')) { newBoxX = startBoxX + scaledDx; newBoxW = startBoxW - scaledDx; }
          if (dir.includes('r')) { newBoxW = startBoxW + scaledDx; }
          if (dir.includes('t')) { newBoxY = startBoxY + scaledDy; newBoxH = startBoxH - scaledDy; }
          if (dir.includes('b')) { newBoxH = startBoxH + scaledDy; }
        }

        newBoxW = Math.max(10, newBoxW);
        newBoxH = Math.max(10, newBoxH);

        this.selectedRegion.box = { x: newBoxX, y: newBoxY, w: newBoxW, h: newBoxH };

        this.inlineEditor.style.left = `${(newBoxX / this.canvas.width) * 100}%`;
        this.inlineEditor.style.top = `${(newBoxY / this.canvas.height) * 100}%`;
        this.inlineEditor.style.width = `${(newBoxW / this.canvas.width) * 100}%`;
        this.inlineEditor.style.height = `${(newBoxH / this.canvas.height) * 100}%`;

        if (!isMove) {
          const isVert = this.selectedRegion.isVertical;
          const newFontSize = Math.max(12, Math.round((isVert ? newBoxW : newBoxH) * 1.15));
          this.selectedRegion.fontSize = newFontSize;
          this.fontSizeDisplay.textContent = `${newFontSize}px`;
          this.inlineInput.style.fontSize = `${this.getVisualFontSize(this.selectedRegion)}px`;
        }
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        this.inlineInput.focus();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  initEngineSettings() {
    const btnSettings = document.getElementById('btn-engine-settings');
    const btnClose = document.getElementById('btn-engine-close');
    const btnCancel = document.getElementById('btn-engine-cancel');
    const btnSave = document.getElementById('btn-engine-save');
    const keyGroup = document.getElementById('gemini-key-group');
    const keyInput = document.getElementById('gemini-api-key');
    const engineLabel = document.getElementById('current-engine-label');
    const netBadgeText = document.getElementById('net-badge-text');
    const netBadge = document.getElementById('net-badge');
    const metricDetection = document.getElementById('metric-detection');
    const metricHardware = document.getElementById('metric-hardware');
    const metricNetwork = document.getElementById('metric-network');

    btnSettings.addEventListener('click', () => {
      this.engineModal.classList.remove('hidden');
    });

    const closeModal = () => this.engineModal.classList.add('hidden');
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    const radioCards = document.querySelectorAll('.engine-radio-card');
    radioCards.forEach(card => {
      card.addEventListener('click', () => {
        radioCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        radio.checked = true;

        if (radio.value === 'gemini') {
          keyGroup.classList.remove('hidden');
        } else {
          keyGroup.classList.add('hidden');
        }
      });
    });

    btnSave.addEventListener('click', () => {
      const selected = document.querySelector('input[name="engine_choice"]:checked').value;
      this.selectedEngine = selected;
      this.geminiApiKey = keyInput.value.trim();

      if (selected === 'gemini') {
        engineLabel.textContent = 'Gemini 2.5 Flash';
        netBadgeText.textContent = 'CLOUD AI ACTIVATED · GEMINI VISION';
        netBadge.style.borderColor = '#29B6F6';
        metricDetection.textContent = 'Google Gemini 2.5 Flash Vision';
        metricHardware.textContent = 'Google TPU Cloud Accelerators';
        metricNetwork.textContent = 'REST / HTTPS (Encrypted)';
      } else {
        engineLabel.textContent = 'RapidOCR & Cloud Vision';
        netBadgeText.textContent = '🌐 CLOUD & VISION API ONLINE · CONNECTED';
        netBadge.style.borderColor = '#00E676';
        metricDetection.textContent = 'RapidOCR ONNX & Gemini Vision';
        metricHardware.textContent = 'NPU & GPU Cloud Pipeline';
        metricNetwork.textContent = '🌐 ONLINE (Connected to APIs)';
      }

      closeModal();
      this.runRealOcrDetection();
    });
  }

  initDrawingListeners() {
    let isDrawing = false;
    const overlays = this.boxOverlays;
    const selBox = this.drawSelectionBox;

    overlays.addEventListener('mousedown', (e) => {
      if (!this.isDrawMode && !e.shiftKey) return;
      if (e.target.classList.contains('overlay-box')) return;

      isDrawing = true;
      const rect = overlays.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;
      this.drawStart = { x: startX, y: startY };

      selBox.style.left = `${startX}px`;
      selBox.style.top = `${startY}px`;
      selBox.style.width = '0px';
      selBox.style.height = '0px';
      selBox.classList.remove('hidden');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDrawing || !this.drawStart) return;
      const rect = overlays.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      const left = Math.min(this.drawStart.x, currentX);
      const top = Math.min(this.drawStart.y, currentY);
      const width = Math.abs(currentX - this.drawStart.x);
      const height = Math.abs(currentY - this.drawStart.y);

      selBox.style.left = `${left}px`;
      selBox.style.top = `${top}px`;
      selBox.style.width = `${width}px`;
      selBox.style.height = `${height}px`;
    });

    window.addEventListener('mouseup', async (e) => {
      if (!isDrawing || !this.drawStart) return;
      isDrawing = false;
      selBox.classList.add('hidden');

      const rect = overlays.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;

      const canvasLeft = Math.floor(Math.min(this.drawStart.x, endX) * scaleX);
      const canvasTop = Math.floor(Math.min(this.drawStart.y, endY) * scaleY);
      const canvasWidth = Math.ceil(Math.abs(endX - this.drawStart.x) * scaleX);
      const canvasHeight = Math.ceil(Math.abs(endY - this.drawStart.y) * scaleY);

      this.drawStart = null;

      if (canvasWidth > 15 && canvasHeight > 10) {
        const box = {
          x: canvasLeft,
          y: canvasTop,
          w: canvasWidth,
          h: canvasHeight
        };

        const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const colors = this.sampleBoxColors(box, this.canvas.width, this.canvas.height, imgData.data);

        let extractedText = "Text";

        const newRegion = {
          id: `custom_${Date.now().toString().slice(-4)}`,
          box: box,
          originalBox: { ...box },
          text: extractedText,
          textColor: colors.fg,
          bgColor: colors.bg,
          fontSize: Math.max(12, Math.round(box.h * 1.15)),
          fontWeight: '700',
          fontFamily: 'Montserrat',
          alignment: 'center',
          isUppercase: false,
          isEdited: false
        };

        this.profileRegionFont(newRegion);
        this.textRegions.push(newRegion);
        this.renderOverlays();
        this.renderRegionsList();
        this.startInlineEditing(newRegion);
      }
    });
  }

  toggleDrawMode() {
    this.isDrawMode = !this.isDrawMode;
    const btn = document.getElementById('btn-draw-mode');
    const textEl = document.getElementById('draw-mode-text');

    if (this.isDrawMode) {
      btn.classList.add('active-mode');
      textEl.textContent = '✏️ Drag on text now!';
      this.boxOverlays.style.cursor = 'crosshair';
    } else {
      btn.classList.remove('active-mode');
      textEl.textContent = '✏️ Draw Box to Edit';
      this.boxOverlays.style.cursor = 'default';
    }
  }

  initSplitSliderListeners() {
    const container = document.getElementById('split-slider-container');
    let isDragging = false;

    if (container) {
      const updatePos = (clientX) => {
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0) return;
        const offsetX = clientX - rect.left;
        this.splitSliderPos = Math.max(0.01, Math.min(0.99, offsetX / rect.width));
        this.updateSplitSlider();
      };

      container.addEventListener('mousedown', (e) => {
        isDragging = true;
        updatePos(e.clientX);
        e.preventDefault();
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        updatePos(e.clientX);
      });

      container.addEventListener('touchstart', (e) => {
        if (!e.touches || !e.touches[0]) return;
        isDragging = true;
        updatePos(e.touches[0].clientX);
        e.preventDefault();
      }, { passive: false });

      window.addEventListener('touchend', () => {
        isDragging = false;
      });

      window.addEventListener('touchmove', (e) => {
        if (!isDragging || !e.touches || !e.touches[0]) return;
        updatePos(e.touches[0].clientX);
      }, { passive: false });
    }
  }

  loadTemplate(templateType) {
    this.currentTemplate = templateType;
    this.closeInlineEditing();

    if (templateType === 'aws_sample') {
      this.renderAwsSampleTemplate();
      return;
    }
  }

  renderAwsSampleTemplate() {
    const img = new Image();
    img.onload = async () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);
      this.cleanBackgroundData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      await this.runRealOcrDetection();
      this.saveInitialState();
    };
    img.src = 'sample_aws.png';
  }

  saveCleanBackground() {
    this.cleanBackgroundData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  renderRegionsToCanvas() {
    this.textRegions.forEach(r => {
      if (r.bgColor && r.bgColor !== 'transparent') {
        this.ctx.fillStyle = r.bgColor;
        this.ctx.fillRect(r.box.x, r.box.y, r.box.w, r.box.h);
      }
      this.renderSingleRegion(r);
    });
  }

  saveInitialState() {
    this.originalBitmapData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    this.textRegions.forEach(r => {
      this.loadGoogleFont(r.fontFamily || 'Inter', r.fontWeight || '700');
    });

    this.undoStack = [{
      imageData: this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height),
      regions: JSON.parse(JSON.stringify(this.textRegions))
    }];
    this.redoStack = [];

    this.renderOverlays();
    this.renderRegionsList();
    this.updateControlsState();
  }

  loadGoogleFont(family, weight = '400') {
    if (!family || family === 'sans-serif' || family === 'serif' || family === 'monospace') return;
    const fontId = `gf-${family.replace(/\s+/g, '-')}`;
    if (document.getElementById(fontId)) return;

    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@300;400;500;600;700;800;900&display=swap`;
    document.head.appendChild(link);
  }

  async handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    this.closeInlineEditing();
    const img = new Image();
    img.onload = async () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);

      this.cleanBackgroundData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      await this.runRealOcrDetection();
      this.saveInitialState();
    };
    img.src = URL.createObjectURL(file);
  }

  async runRealOcrDetection() {
    const scanningOverlay = document.getElementById('scanning-overlay');
    const scanningStatusText = document.getElementById('scanning-status-text');
    scanningOverlay.classList.remove('hidden');

    const engineName = this.selectedEngine === 'gemini' ? 'Google Gemini 2.5 Flash' : 'RapidOCR ONNX Mobile';
    scanningStatusText.textContent = `⚡ Running ${engineName} Text Identification...`;

    const t0 = performance.now();

    try {
      const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
      const formData = new FormData();
      formData.append('file', blob, 'image.png');

      let endpoint = 'http://127.0.0.1:8000/api/detect';
      if (this.selectedEngine === 'gemini' && this.geminiApiKey) {
        endpoint = 'http://127.0.0.1:8000/api/gemini-detect';
        formData.append('api_key', this.geminiApiKey);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(`Backend response status: ${response.status}`);

      const data = await response.json();

      this.textRegions = data.regions.map(r => ({
        ...r,
        originalBox: { ...r.box },
        isEdited: false
      }));

      this.textRegions.forEach(r => {
        if (r.fontFamily) this.loadGoogleFont(r.fontFamily, r.fontWeight);
      });

    } catch (err) {
      console.warn('Backend OCR error:', err);
    }

    const t1 = performance.now();
    document.getElementById('latency-val').textContent = `~${Math.round(t1 - t0)} ms`;
    scanningOverlay.classList.add('hidden');

    this.renderOverlays();
    this.renderRegionsList();
    this.updateControlsState();
  }

  sampleBoxColors(box, width, height, data) {
    let rSum = 0, gSum = 0, bSum = 0, bgCount = 0;
    const x1 = Math.floor(Math.max(0, box.x));
    const y1 = Math.floor(Math.max(0, box.y));
    const x2 = Math.floor(Math.min(width - 1, box.x + box.w));
    const y2 = Math.floor(Math.min(height - 1, box.y + box.h));

    for (let x = x1; x <= x2; x += 2) {
      for (const py of [y1, y2]) {
        const idx = (py * width + x) * 4;
        rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]; bgCount++;
      }
    }
    for (let y = y1; y <= y2; y += 2) {
      for (const px of [x1, x2]) {
        const idx = (y * width + px) * 4;
        rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]; bgCount++;
      }
    }

    const bgR = bgCount > 0 ? Math.round(rSum / bgCount) : 20;
    const bgG = bgCount > 0 ? Math.round(gSum / bgCount) : 20;
    const bgB = bgCount > 0 ? Math.round(bSum / bgCount) : 26;

    const toHex = (r, g, b) => `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

    return {
      bg: toHex(bgR, bgG, bgB),
      fg: '#FFFFFF'
    };
  }

  profileRegionFont(region) {
    if (region.fontFamily && region.fontWeight) {
      this.loadGoogleFont(region.fontFamily, region.fontWeight);
      return;
    }
    region.fontWeight = '700';
    region.fontFamily = 'Montserrat';
    this.loadGoogleFont(region.fontFamily, region.fontWeight);
  }

  renderOverlays() {
    this.boxOverlays.innerHTML = '';
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    this.textRegions.forEach(r => {
      const boxEl = document.createElement('div');
      boxEl.className = `overlay-box ${r.isEdited ? 'edited' : ''}`;
      boxEl.style.left = `${(r.box.x / cw) * 100}%`;
      boxEl.style.top = `${(r.box.y / ch) * 100}%`;
      boxEl.style.width = `${(r.box.w / cw) * 100}%`;
      boxEl.style.height = `${(r.box.h / ch) * 100}%`;

      boxEl.title = `Click to edit text and match formatting`;
      boxEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startInlineEditing(r);
      });
      this.boxOverlays.appendChild(boxEl);
    });

    this.regionCountBadge.textContent = this.textRegions.length;
  }

  renderRegionsList() {
    if (this.textRegions.length === 0) {
      this.regionsList.innerHTML = '<p class="empty-state">No document loaded yet.</p>';
      return;
    }

    this.regionsList.innerHTML = this.textRegions.map(r => `
      <div class="region-item ${r.isEdited ? 'edited' : ''}" onclick="window.simulator.startInlineEditingById('${r.id}')">
        <div class="region-header">
          <span>${r.fontFamily || 'Montserrat'} · ${r.fontWeight || '700'}${r.fontStyle === 'italic' ? ' · <i>Italic</i>' : ''}</span>
          <span style="display:inline-flex;align-items:center;gap:4px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${r.textColor};display:inline-block;"></span>
            ${r.isEdited ? '✅ EDITED' : '🔍 OCR'}
          </span>
        </div>
        <div class="region-text">"${r.text}"</div>
      </div>
    `).join('');
  }

  startInlineEditingById(id) {
    const region = this.textRegions.find(r => r.id === id);
    if (region) this.startInlineEditing(region);
  }

  getVisualFontSize(region) {
    if (!region || !region.box) return 14;
    const renderedHeight = this.canvas.clientHeight || 600;
    const canvasH = this.canvas.height || 1000;
    const scaleY = renderedHeight / canvasH;

    const boxScreenHeight = region.box.h * scaleY;
    let screenFontSize;
    if (region.fontSize && region.fontSize > 0) {
      screenFontSize = region.fontSize * scaleY;
    } else {
      screenFontSize = boxScreenHeight * 0.85;
    }

    const maxFittingSize = Math.max(9, boxScreenHeight * 0.88);
    screenFontSize = Math.min(screenFontSize, maxFittingSize);

    return Math.max(9, Math.round(screenFontSize));
  }

  startInlineEditing(region) {
    this.selectedRegion = region;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const box = region.box;

    const leftPct = (box.x / cw) * 100;
    const topPct = (box.y / ch) * 100;
    const widthPct = (box.w / cw) * 100;
    const heightPct = (box.h / ch) * 100;

    this.inlineEditor.style.left = `${leftPct}%`;
    this.inlineEditor.style.top = `${topPct}%`;
    this.inlineEditor.style.width = `${widthPct}%`;
    this.inlineEditor.style.height = `${heightPct}%`;

    const family = region.fontFamily || 'Montserrat';
    let optionExists = false;
    for (let i = 0; i < this.fontSelector.options.length; i++) {
      if (this.fontSelector.options[i].value.toLowerCase() === family.toLowerCase()) {
        this.fontSelector.selectedIndex = i;
        optionExists = true;
        break;
      }
    }
    if (!optionExists) {
      const newOpt = document.createElement('option');
      newOpt.value = family;
      newOpt.textContent = `${family} (Detected)`;
      this.fontSelector.insertBefore(newOpt, this.fontSelector.firstChild);
      this.fontSelector.selectedIndex = 0;
    }
    this.loadGoogleFont(family, region.fontWeight || '700');

    const naturalFontSize = region.fontSize || Math.max(12, Math.round(box.h * 1.15));
    this.fontSizeDisplay.textContent = `${naturalFontSize}px`;

    const weight = String(region.fontWeight || '700');
    const numWeight = parseInt(weight, 10) || 700;
    let matchedWeight = '700';
    if (numWeight <= 450) matchedWeight = '400';
    else if (numWeight <= 650) matchedWeight = '600';
    else if (numWeight <= 800) matchedWeight = '700';
    else matchedWeight = '900';

    this.weightButtons.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-weight') === matchedWeight);
    });

    const fontStyle = region.fontStyle || 'normal';
    if (this.btnToggleItalic) {
      this.btnToggleItalic.classList.toggle('active', fontStyle === 'italic');
    }

    const textColor = region.textColor || '#FFFFFF';
    this.colorPicker.value = textColor;
    this.colorPreview.style.background = textColor;

    const alignment = region.alignment || 'center';
    this.alignButtons.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-align') === alignment);
    });

    this.btnToggleCase.classList.toggle('active', !!region.isUppercase);

    this.inlineInput.value = region.text;
    this.inlineInput.style.fontFamily = `"${family}", sans-serif`;
    this.inlineInput.style.fontSize = `${this.getVisualFontSize(region)}px`;
    this.inlineInput.style.fontWeight = weight;
    this.inlineInput.style.fontStyle = fontStyle;
    this.inlineInput.style.color = textColor;
    this.inlineInput.style.textAlign = alignment;
    this.inlineInput.style.textTransform = region.isUppercase ? 'uppercase' : 'none';
    this.inlineInput.style.letterSpacing = `${region.letterSpacing || 0}px`;

    this.inlineEditor.classList.remove('hidden');

    requestAnimationFrame(() => {
      this.inlineInput.focus();
      this.inlineInput.select();
    });
  }

  closeInlineEditing() {
    if (this.inlineEditor) {
      this.inlineEditor.classList.add('hidden');
    }
    this.selectedRegion = null;
  }

  async commitInlineEdit() {
    if (!this.selectedRegion) return;
    const newText = this.inlineInput.value.trim();
    if (!newText) {
      this.closeInlineEditing();
      return;
    }

    const t0 = performance.now();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const box = this.selectedRegion.box;

    this.selectedRegion.text = newText;
    this.selectedRegion.isEdited = true;
    this.selectedRegion.fontFamily = this.fontSelector.value;
    this.selectedRegion.textColor = this.colorPicker.value;
    if (this.btnToggleItalic) {
      this.selectedRegion.fontStyle = this.btnToggleItalic.classList.contains('active') ? 'italic' : 'normal';
    }

    const activeWeightBtn = document.querySelector('.font-weight-group .fmt-btn.active');
    if (activeWeightBtn) {
      this.selectedRegion.fontWeight = activeWeightBtn.getAttribute('data-weight');
    }

    const activeAlignBtn = document.querySelector('.align-group .fmt-btn.active');
    if (activeAlignBtn) {
      this.selectedRegion.alignment = activeAlignBtn.getAttribute('data-align');
    }

    let inpaintSuccess = false;

    try {
      const origCanvas = document.createElement('canvas');
      origCanvas.width = cw;
      origCanvas.height = ch;
      const origCtx = origCanvas.getContext('2d');
      if (this.cleanBackgroundData) {
        origCtx.putImageData(this.cleanBackgroundData, 0, 0);
      } else {
        origCtx.drawImage(this.canvas, 0, 0);
      }

      const inpaintBox = this.selectedRegion.originalBox || box;
      const blob = await new Promise(resolve => origCanvas.toBlob(resolve, 'image/png'));
      const formData = new FormData();
      formData.append('file', blob, 'image.png');
      formData.append('x', Math.floor(inpaintBox.x));
      formData.append('y', Math.floor(inpaintBox.y));
      formData.append('w', Math.ceil(inpaintBox.w));
      formData.append('h', Math.ceil(inpaintBox.h));

      const response = await fetch('http://127.0.0.1:8000/api/inpaint', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const patchX = parseInt(response.headers.get('X-Patch-X'));
        const patchY = parseInt(response.headers.get('X-Patch-Y'));
        const patchBlob = await response.blob();
        const patchImage = await createImageBitmap(patchBlob);

        this.ctx.drawImage(patchImage, patchX, patchY);
        this.cleanBackgroundData = this.ctx.getImageData(0, 0, cw, ch);
        inpaintSuccess = true;
      }
    } catch (err) {
      console.warn('Backend inpainting fallback:', err);
    }

    if (!inpaintSuccess) {
      const inpaintBox = this.selectedRegion.originalBox || box;
      this.inpaintRegionClientSide(inpaintBox);
      this.cleanBackgroundData = this.ctx.getImageData(0, 0, cw, ch);
    }

    this.renderSingleRegion(this.selectedRegion);

    const t1 = performance.now();
    document.getElementById('inpaint-latency').textContent = `~${Math.round(t1 - t0)} ms`;

    this.undoStack.push({
      imageData: this.ctx.getImageData(0, 0, cw, ch),
      regions: JSON.parse(JSON.stringify(this.textRegions))
    });
    this.redoStack = [];

    this.closeInlineEditing();
    this.renderOverlays();
    this.renderRegionsList();
    this.updateControlsState();
  }

  inpaintRegionClientSide(box) {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const pad = 4;
    const x1 = Math.max(0, Math.floor(box.x - pad));
    const y1 = Math.max(0, Math.floor(box.y - pad));
    const x2 = Math.min(cw - 1, Math.ceil(box.x + box.w + pad));
    const y2 = Math.min(ch - 1, Math.ceil(box.y + box.h + pad));

    const imgData = this.ctx.getImageData(0, 0, cw, ch);
    const data = imgData.data;

    let topR = 0, topG = 0, topB = 0, topCount = 0;
    let botR = 0, botG = 0, botB = 0, botCount = 0;

    for (let x = x1; x <= x2; x++) {
      const tIdx = (y1 * cw + x) * 4;
      topR += data[tIdx]; topG += data[tIdx + 1]; topB += data[tIdx + 2]; topCount++;
      const bIdx = (y2 * cw + x) * 4;
      botR += data[bIdx]; botG += data[bIdx + 1]; botB += data[bIdx + 2]; botCount++;
    }

    const avgTop = [topR / topCount, topG / topCount, topB / topCount];
    const avgBot = [botR / botCount, botG / botCount, botB / botCount];

    const grad = this.ctx.createLinearGradient(0, y1, 0, y2);
    grad.addColorStop(0, `rgb(${Math.round(avgTop[0])},${Math.round(avgTop[1])},${Math.round(avgTop[2])})`);
    grad.addColorStop(1, `rgb(${Math.round(avgBot[0])},${Math.round(avgBot[1])},${Math.round(avgBot[2])})`);

    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }

  renderSingleRegion(r) {
    const box = r.box;
    const family = r.fontFamily || 'Montserrat';
    const weight = r.fontWeight || '700';
    const fontStyle = r.fontStyle === 'italic' ? 'italic ' : '';
    const isVertical = r.isVertical || (box.h > box.w * 2.2);
    let fontSize = r.fontSize || Math.max(12, Math.round((isVertical ? box.w : box.h) * 1.15));

    const textToRender = r.isUppercase ? r.text.toUpperCase() : r.text;

    if (isVertical) {
      this.ctx.save();
      this.ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      this.ctx.rotate(-Math.PI / 2);
      this.ctx.font = `${fontStyle}${weight} ${fontSize}px "${family}", sans-serif`;
      this.ctx.fillStyle = r.textColor || '#FFFFFF';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(textToRender, 0, 0);
      this.ctx.restore();
      return;
    }

    this.ctx.font = `${fontStyle}${weight} ${fontSize}px "${family}", sans-serif`;
    this.ctx.fillStyle = r.textColor || '#FFFFFF';
    this.ctx.textBaseline = 'middle';

    let measured = this.ctx.measureText(textToRender).width;
    const targetWidth = box.w * 0.98;

    this.ctx.letterSpacing = '0px';

    if (measured > targetWidth && measured > 0) {
      fontSize = Math.max(9, fontSize * (targetWidth / measured));
      this.ctx.font = `${fontStyle}${weight} ${fontSize}px "${family}", sans-serif`;
    } else if (measured < targetWidth && textToRender.length > 1 && !isVertical) {
      const extraSpace = targetWidth - measured;
      const spacingPerChar = extraSpace / textToRender.length;
      if (spacingPerChar > 0 && spacingPerChar < 25) {
        this.ctx.letterSpacing = `${spacingPerChar}px`;
      }
    }

    const alignment = r.alignment || 'center';
    this.ctx.textAlign = alignment;

    let posX = box.x + box.w / 2;
    if (alignment === 'left') {
      posX = box.x + 4;
    } else if (alignment === 'right') {
      posX = box.x + box.w - 4;
    }

    const posY = box.y + box.h / 2;
    this.ctx.fillText(textToRender, posX, posY);
  }

  undo() {
    this.closeInlineEditing();
    if (this.undoStack.length > 1) {
      const top = this.undoStack.pop();
      this.redoStack.push(top);

      const previous = this.undoStack[this.undoStack.length - 1];
      this.ctx.putImageData(previous.imageData, 0, 0);
      this.textRegions = JSON.parse(JSON.stringify(previous.regions));

      this.renderOverlays();
      this.renderRegionsList();
      this.updateControlsState();
    }
  }

  redo() {
    this.closeInlineEditing();
    if (this.redoStack.length > 0) {
      const next = this.redoStack.pop();
      this.undoStack.push(next);

      this.ctx.putImageData(next.imageData, 0, 0);
      this.textRegions = JSON.parse(JSON.stringify(next.regions));

      this.renderOverlays();
      this.renderRegionsList();
      this.updateControlsState();
    }
  }

  resetToOriginal() {
    this.closeInlineEditing();
    if (this.originalBitmapData) {
      this.ctx.putImageData(this.originalBitmapData, 0, 0);
      this.undoStack = [this.undoStack[0]];
      this.redoStack = [];
      this.textRegions.forEach(r => {
        r.isEdited = false;
        if (r.originalBox) {
          r.box = { ...r.originalBox };
        }
      });
      this.renderOverlays();
      this.renderRegionsList();
      this.updateControlsState();
    }
  }

  toggleCompareMode() {
    this.closeInlineEditing();
    this.isCompareMode = !this.isCompareMode;
    const splitContainer = document.getElementById('split-slider-container');
    const overlay = document.getElementById('box-overlays');
    const btnCompare = document.getElementById('btn-compare');
    const compareText = document.getElementById('compare-text');

    const helperHint = document.querySelector('.helper-hint span:last-child');

    if (this.isCompareMode) {
      splitContainer.classList.remove('hidden');
      overlay.classList.add('hidden');
      btnCompare.classList.add('active');
      if (compareText) compareText.textContent = '✕ Exit Split View';
      if (helperHint) helperHint.innerHTML = '<strong>Before / After Split Active:</strong> Drag the blue slider line across the document to wipe between Original (Left) and Reconstructed (Right).';
      this.initSplitCanvases();
      this.updateSplitSlider();
    } else {
      splitContainer.classList.add('hidden');
      overlay.classList.remove('hidden');
      btnCompare.classList.remove('active');
      if (compareText) compareText.textContent = '↔ Before / After Split';
      if (helperHint) helperHint.innerHTML = '<strong>Click any text box</strong> on the flyer to open the instant inline editor! The exact font, color, weight, and size will automatically match.';
    }
  }

  initSplitCanvases() {
    const beforeCanvas = document.getElementById('split-before-canvas');
    const afterCanvas = document.getElementById('split-after-canvas');
    if (!beforeCanvas || !afterCanvas) return;

    beforeCanvas.width = this.canvas.width;
    beforeCanvas.height = this.canvas.height;
    afterCanvas.width = this.canvas.width;
    afterCanvas.height = this.canvas.height;

    const bCtx = beforeCanvas.getContext('2d');
    const aCtx = afterCanvas.getContext('2d');

    bCtx.clearRect(0, 0, beforeCanvas.width, beforeCanvas.height);
    aCtx.clearRect(0, 0, afterCanvas.width, afterCanvas.height);

    if (this.originalBitmapData) {
      bCtx.putImageData(this.originalBitmapData, 0, 0);
    } else {
      bCtx.drawImage(this.canvas, 0, 0);
    }
    aCtx.putImageData(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height), 0, 0);
  }

  updateSplitSlider() {
    const beforeCanvas = document.getElementById('split-before-canvas');
    const afterCanvas = document.getElementById('split-after-canvas');
    const handle = document.getElementById('slider-handle');
    if (!beforeCanvas || !handle) return;

    const splitPercent = this.splitSliderPos * 100;

    const beforeClip = `polygon(0% 0%, ${splitPercent}% 0%, ${splitPercent}% 100%, 0% 100%)`;
    beforeCanvas.style.clipPath = beforeClip;
    beforeCanvas.style.webkitClipPath = beforeClip;

    if (afterCanvas) {
      const afterClip = `polygon(${splitPercent}% 0%, 100% 0%, 100% 100%, ${splitPercent}% 100%)`;
      afterCanvas.style.clipPath = afterClip;
      afterCanvas.style.webkitClipPath = afterClip;
    }

    handle.style.left = `${splitPercent}%`;
  }

  openBatchModal() {
    this.closeInlineEditing();
    document.getElementById('batch-modal').classList.remove('hidden');
    document.getElementById('batch-progress-container').classList.add('hidden');
  }

  closeBatchModal() {
    document.getElementById('batch-modal').classList.add('hidden');
  }

  executeBatchMode() {
    const searchText = document.getElementById('batch-search-text').value;
    const replaceText = document.getElementById('batch-replace-text').value;

    const progressContainer = document.getElementById('batch-progress-container');
    const progressBar = document.getElementById('batch-progress-bar');
    const progressStatus = document.getElementById('batch-progress-status');
    const progressPercent = document.getElementById('batch-progress-percent');

    progressContainer.classList.remove('hidden');
    let percent = 0;

    const interval = setInterval(() => {
      percent += 20;
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressStatus.textContent = `Inpainting document ${percent / 20} of 5...`;

      if (percent >= 100) {
        clearInterval(interval);
        progressStatus.textContent = 'Batch inpainting complete! 5 documents processed.';

        this.textRegions.forEach(r => {
          if (r.text.includes(searchText) || searchText === '') {
            r.text = r.text.replace(new RegExp(searchText, 'gi'), replaceText);
            r.isEdited = true;
          }
        });

        this.renderRegionsToCanvas();
        this.undoStack.push({
          imageData: this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height),
          regions: JSON.parse(JSON.stringify(this.textRegions))
        });
        this.renderOverlays();
        this.renderRegionsList();
        this.updateControlsState();

        setTimeout(() => {
          this.closeBatchModal();
        }, 800);
      }
    }, 120);
  }

  async openCameraModal() {
    this.closeInlineEditing();
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-feed');
    modal.classList.remove('hidden');

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = this.cameraStream;
    } catch (err) {
      alert('Camera access unavailable or declined. Please use file import.');
      this.closeCameraModal();
    }
  }

  closeCameraModal() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    document.getElementById('camera-modal').classList.add('hidden');
  }

  async snapCameraPhoto() {
    const video = document.getElementById('camera-feed');
    if (!video || !this.cameraStream) return;

    this.canvas.width = video.videoWidth || 800;
    this.canvas.height = video.videoHeight || 600;
    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

    this.closeCameraModal();
    await this.runRealOcrDetection();
    this.saveInitialState();
  }

  setZoom(level) {
    this.zoomLevel = Math.max(0.6, Math.min(2.0, level));
    document.getElementById('zoom-level').textContent = `${Math.round(this.zoomLevel * 100)}%`;
    this.canvasContainer.style.transform = `scale(${this.zoomLevel})`;
    if (this.selectedRegion && this.inlineEditor && !this.inlineEditor.classList.contains('hidden')) {
      this.inlineInput.style.fontSize = `${this.getVisualFontSize(this.selectedRegion)}px`;
    }
  }

  exportImage() {
    const link = document.createElement('a');
    link.download = `textract_edited_${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }

  updateControlsState() {
    document.getElementById('btn-undo').disabled = this.undoStack.length <= 1;
    document.getElementById('btn-redo').disabled = this.redoStack.length === 0;
    document.getElementById('btn-export').disabled = this.textRegions.length === 0;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.simulator = new TextractSimulator();
  window.simulator.loadTemplate('aws_sample');
});
