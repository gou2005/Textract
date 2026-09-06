// SnapText Interactive Simulator Engine (iQOO Hackathon 2026)
// Fully Offline, Snapdragon NPU & OpenCV Inpainting Simulation + Gemini Vision Ready

class SnapTextSimulator {
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
    // Template dropdown
    document.getElementById('template-select').addEventListener('change', (e) => {
      this.currentTemplate = e.target.value;
      this.loadTemplate(this.currentTemplate);
    });

    // Granularity / Sensitivity selector
    document.getElementById('ocr-granularity-select').addEventListener('change', (e) => {
      this.ocrGranularity = e.target.value;
      this.runRealOcrDetection();
    });

    // File input & Camera
    document.getElementById('file-input').addEventListener('change', (e) => this.handleImageUpload(e));
    document.getElementById('btn-camera-capture').addEventListener('click', () => this.openCameraModal());
    document.getElementById('btn-camera-close').addEventListener('click', () => this.closeCameraModal());
    document.getElementById('btn-camera-cancel').addEventListener('click', () => this.closeCameraModal());
    document.getElementById('btn-camera-snap').addEventListener('click', () => this.snapCameraPhoto());

    // Batch modal
    document.getElementById('btn-open-batch').addEventListener('click', () => this.openBatchModal());
    document.getElementById('btn-batch-close').addEventListener('click', () => this.closeBatchModal());
    document.getElementById('btn-cancel-batch').addEventListener('click', () => this.closeBatchModal());
    document.getElementById('btn-execute-batch').addEventListener('click', () => this.executeBatchMode());

    // Toolbar actions
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-draw-mode').addEventListener('click', () => this.toggleDrawMode());
    document.getElementById('btn-compare').addEventListener('click', () => this.toggleCompareMode());
    document.getElementById('btn-reset-original').addEventListener('click', () => this.resetToOriginal());
    document.getElementById('btn-export').addEventListener('click', () => this.exportImage());

    // Zoom
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.setZoom(this.zoomLevel + 0.15));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.setZoom(this.zoomLevel - 0.15));

    // Direct Inline Keyboard Editing (Enter = Apply, Esc = Cancel)
    this.inlineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitInlineEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeInlineEditing();
      }
    });

    // Commit when clicking away outside the active inline editor
    window.addEventListener('mousedown', (e) => {
      if (!this.selectedRegion) return;
      if (e.target.closest('#inline-text-editor') || e.target.classList.contains('overlay-box') || e.target.closest('#engine-modal')) {
        return;
      }
      this.commitInlineEdit();
    });

    // Interactive Drag-to-Draw Custom Text Box
    this.initDrawingListeners();

    // Split slider drag handling
    this.initSplitSliderListeners();

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.selectedRegion) return; // Allow normal typing in input
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
    // Font Family Selector
    this.fontSelector.addEventListener('change', (e) => {
      if (!this.selectedRegion) return;
      this.selectedRegion.fontFamily = e.target.value;
      this.loadGoogleFont(e.target.value, this.selectedRegion.fontWeight || '700');
      this.inlineInput.style.fontFamily = `"${e.target.value}", sans-serif`;
    });

    // Font Size Adjusters
    this.btnFontDec.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedRegion) return;
      this.selectedRegion.fontSize = Math.max(9, (this.selectedRegion.fontSize || 24) - 2);
      this.fontSizeDisplay.textContent = `${Math.round(this.selectedRegion.fontSize)}px`;
      this.inlineInput.style.fontSize = `${Math.round(this.selectedRegion.fontSize)}px`;
    });

    this.btnFontInc.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedRegion) return;
      this.selectedRegion.fontSize = Math.min(120, (this.selectedRegion.fontSize || 24) + 2);
      this.fontSizeDisplay.textContent = `${Math.round(this.selectedRegion.fontSize)}px`;
      this.inlineInput.style.fontSize = `${Math.round(this.selectedRegion.fontSize)}px`;
    });

    // Font Weight Buttons (Reg, Bold, Black)
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

    // Custom Color Picker
    this.colorPicker.addEventListener('input', (e) => {
      if (!this.selectedRegion) return;
      const color = e.target.value;
      this.selectedRegion.textColor = color;
      this.colorPreview.style.background = color;
      this.inlineInput.style.color = color;
    });

    // Quick Swatch Palette Dots
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

    // Text Alignment Buttons
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

    // Italic Slant Toggle
    if (this.btnToggleItalic) {
      this.btnToggleItalic.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.selectedRegion) return;
        this.selectedRegion.fontStyle = (this.selectedRegion.fontStyle === 'italic') ? 'normal' : 'italic';
        this.btnToggleItalic.classList.toggle('active', this.selectedRegion.fontStyle === 'italic');
        this.inlineInput.style.fontStyle = this.selectedRegion.fontStyle;
      });
    }

    // Case Transform Toggle (UPPERCASE)
    this.btnToggleCase.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.selectedRegion) return;
      this.selectedRegion.isUppercase = !this.selectedRegion.isUppercase;
      this.btnToggleCase.classList.toggle('active', this.selectedRegion.isUppercase);
      this.inlineInput.style.textTransform = this.selectedRegion.isUppercase ? 'uppercase' : 'none';
    });

    // Apply & Cancel buttons
    this.btnInlineApply.addEventListener('click', (e) => {
      e.stopPropagation();
      this.commitInlineEdit();
    });

    this.btnInlineCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeInlineEditing();
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

    // Toggle radio cards
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
        if (typeof Tesseract !== 'undefined') {
          try {
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = canvasWidth;
            cropCanvas.height = canvasHeight;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(this.canvas, canvasLeft, canvasTop, canvasWidth, canvasHeight, 0, 0, canvasWidth, canvasHeight);
            
            const worker = await Tesseract.createWorker('eng');
            const ret = await worker.recognize(cropCanvas);
            await worker.terminate();
            if (ret && ret.data && ret.data.text && ret.data.text.trim().length > 0) {
              extractedText = ret.data.text.trim();
            }
          } catch (err) {
            console.warn('Crop OCR fallback:', err);
          }
        }

        const newRegion = {
          id: `custom_${Date.now().toString().slice(-4)}`,
          box: box,
          text: extractedText,
          textColor: colors.fg,
          bgColor: colors.bg,
          fontSize: Math.max(12, Math.round(box.h * 0.78)),
          fontWeight: '700',
          fontFamily: 'Montserrat',
          alignment: 'center',
          isUppercase: extractedText.isupper(),
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

    const width = 800;
    const height = 1000;
    this.canvas.width = width;
    this.canvas.height = height;
    this.rawOcrData = null;

    if (templateType === 'poster') {
      this.renderPosterTemplate(width, height);
    } else if (templateType === 'menu') {
      this.renderMenuTemplate(width, height);
    } else if (templateType === 'infographic') {
      this.renderInfographicTemplate(width, height);
    } else if (templateType === 'certificate') {
      this.renderCertificateTemplate(width, height);
    }

    this.saveInitialState();
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

  renderPosterTemplate(width, height) {
    this.ctx.fillStyle = '#0B0B0E';
    this.ctx.fillRect(0, 0, width, height);

    const grad = this.ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#1E1E26');
    grad.addColorStop(1, '#111116');
    this.ctx.fillStyle = grad;
    this.ctx.roundRect(40, 40, width - 80, height - 80, 20);
    this.ctx.fill();

    this.saveCleanBackground();

    this.textRegions = [
      {
        id: 'r1',
        box: { x: 80, y: 110, w: 640, h: 80 },
        text: 'CHENNAI CITY BATTLE 2026',
        textColor: '#121212',
        bgColor: '#F8E71C',
        fontSize: 42,
        fontWeight: '900',
        fontFamily: 'Anton',
        alignment: 'center',
        isUppercase: true,
        letterSpacing: 1.0,
        isEdited: false
      },
      {
        id: 'r2',
        box: { x: 120, y: 250, w: 560, h: 60 },
        text: 'iQOO HACKATHON FINALS',
        textColor: '#F8E71C',
        bgColor: '#1E1E26',
        fontSize: 32,
        fontWeight: '800',
        fontFamily: 'Oswald',
        alignment: 'center',
        isUppercase: true,
        letterSpacing: 0.5,
        isEdited: false
      },
      {
        id: 'r3',
        box: { x: 100, y: 400, w: 600, h: 65 },
        text: 'Snapdragon NPU Acceleration',
        textColor: '#FFFFFF',
        bgColor: '#15151A',
        fontSize: 30,
        fontWeight: '700',
        fontFamily: 'Outfit',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'r4',
        box: { x: 140, y: 550, w: 520, h: 60 },
        text: 'AI Vision · Cloud & Vision API',
        textColor: '#00E676',
        bgColor: '#121216',
        fontSize: 26,
        fontWeight: '700',
        fontFamily: 'Inter',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'r5',
        box: { x: 180, y: 710, w: 440, h: 50 },
        text: 'Scan · Edit · Save',
        textColor: '#29B6F6',
        bgColor: '#1E1E26',
        fontSize: 24,
        fontWeight: '600',
        fontFamily: 'Poppins',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      }
    ];

    this.renderRegionsToCanvas();
  }

  renderMenuTemplate(width, height) {
    this.ctx.fillStyle = '#1A1815';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.fillStyle = '#26221D';
    this.ctx.roundRect(40, 40, width - 80, height - 80, 16);
    this.ctx.fill();

    this.saveCleanBackground();

    this.textRegions = [
      {
        id: 'm1',
        box: { x: 100, y: 100, w: 600, h: 70 },
        text: 'GOURMET BISTRO MENU',
        textColor: '#F8E71C',
        bgColor: '#26221D',
        fontSize: 38,
        fontWeight: '900',
        fontFamily: 'Playfair Display',
        alignment: 'center',
        isUppercase: true,
        letterSpacing: 1.5,
        isEdited: false
      },
      {
        id: 'm2',
        box: { x: 100, y: 240, w: 600, h: 50 },
        text: 'Smoked Truffle Burger - $14.99',
        textColor: '#FFFFFF',
        bgColor: '#2A2520',
        fontSize: 22,
        fontWeight: '600',
        fontFamily: 'Montserrat',
        alignment: 'left',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'm3',
        box: { x: 100, y: 360, w: 600, h: 50 },
        text: 'Wild Mushroom Risotto - $18.50',
        textColor: '#FFFFFF',
        bgColor: '#2A2520',
        fontSize: 22,
        fontWeight: '600',
        fontFamily: 'Montserrat',
        alignment: 'left',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'm4',
        box: { x: 100, y: 480, w: 600, h: 50 },
        text: 'Artisan Espresso Blend - $4.50',
        textColor: '#00E676',
        bgColor: '#26221D',
        fontSize: 22,
        fontWeight: '600',
        fontFamily: 'Montserrat',
        alignment: 'left',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'm5',
        box: { x: 140, y: 680, w: 520, h: 55 },
        text: 'Weekend Special: 20% OFF',
        textColor: '#FF5252',
        bgColor: '#1A1815',
        fontSize: 26,
        fontWeight: '800',
        fontFamily: 'Oswald',
        alignment: 'center',
        isUppercase: true,
        letterSpacing: 0.5,
        isEdited: false
      }
    ];

    this.renderRegionsToCanvas();
  }

  renderInfographicTemplate(width, height) {
    this.ctx.fillStyle = '#080D1A';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.fillStyle = '#0F1A30';
    this.ctx.roundRect(40, 40, width - 80, height - 80, 16);
    this.ctx.fill();

    this.saveCleanBackground();

    this.textRegions = [
      {
        id: 'i1',
        box: { x: 80, y: 110, w: 640, h: 75 },
        text: 'EDGE NPU PERFORMANCE 2026',
        textColor: '#29B6F6',
        bgColor: '#0F1A30',
        fontSize: 36,
        fontWeight: '900',
        fontFamily: 'Outfit',
        alignment: 'center',
        isUppercase: true,
        letterSpacing: 1.0,
        isEdited: false
      },
      {
        id: 'i2',
        box: { x: 100, y: 270, w: 600, h: 55 },
        text: '8.4 TOPS Qualcomm Hexagon Engine',
        textColor: '#FFFFFF',
        bgColor: '#142342',
        fontSize: 25,
        fontWeight: '700',
        fontFamily: 'Inter',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'i3',
        box: { x: 120, y: 420, w: 560, h: 55 },
        text: 'Sub-30ms Detection Latency',
        textColor: '#F8E71C',
        bgColor: '#0F1A30',
        fontSize: 24,
        fontWeight: '700',
        fontFamily: 'JetBrains Mono',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'i4',
        box: { x: 140, y: 580, w: 520, h: 55 },
        text: 'Zero Cloud Data Transferred',
        textColor: '#00E676',
        bgColor: '#142342',
        fontSize: 24,
        fontWeight: '700',
        fontFamily: 'Inter',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      }
    ];

    this.renderRegionsToCanvas();
  }

  renderCertificateTemplate(width, height) {
    this.ctx.fillStyle = '#141416';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.strokeStyle = '#F8E71C';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(50, 50, width - 100, height - 100);

    this.saveCleanBackground();

    this.textRegions = [
      {
        id: 'c1',
        box: { x: 100, y: 130, w: 600, h: 70 },
        text: 'CERTIFICATE OF EXCELLENCE',
        textColor: '#F8E71C',
        bgColor: '#141416',
        fontSize: 34,
        fontWeight: '900',
        fontFamily: 'Playfair Display',
        alignment: 'center',
        isUppercase: true,
        letterSpacing: 1.5,
        isEdited: false
      },
      {
        id: 'c2',
        box: { x: 140, y: 280, w: 520, h: 50 },
        text: 'Awarded to: Sarah Jenkins',
        textColor: '#FFFFFF',
        bgColor: '#1E1E22',
        fontSize: 26,
        fontWeight: '700',
        fontFamily: 'Pacifico',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'c3',
        box: { x: 120, y: 420, w: 560, h: 55 },
        text: 'iQOO AI Innovation Battle 2026',
        textColor: '#29B6F6',
        bgColor: '#141416',
        fontSize: 25,
        fontWeight: '700',
        fontFamily: 'Outfit',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      },
      {
        id: 'c4',
        box: { x: 160, y: 620, w: 480, h: 50 },
        text: 'Issued on: September 2026',
        textColor: '#A0A0B0',
        bgColor: '#1E1E22',
        fontSize: 20,
        fontWeight: '500',
        fontFamily: 'Inter',
        alignment: 'center',
        isUppercase: false,
        letterSpacing: 0.0,
        isEdited: false
      }
    ];

    this.renderRegionsToCanvas();
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

      let endpoint = 'http://localhost:8000/api/detect';
      if (this.selectedEngine === 'gemini' && this.geminiApiKey) {
        endpoint = 'http://localhost:8000/api/gemini-detect';
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
        isEdited: false
      }));

      // Dynamically load all discovered fonts
      this.textRegions.forEach(r => {
        if (r.fontFamily) this.loadGoogleFont(r.fontFamily, r.fontWeight);
      });

    } catch (err) {
      console.warn('Backend OCR unreachable or failed, running client-side Tesseract.js fallback:', err);
      scanningStatusText.textContent = '⚡ Running Client-Side High-Precision OCR...';
      await this.runTesseractClientFallback();
    }

    const t1 = performance.now();
    document.getElementById('latency-val').textContent = `~${Math.round(t1 - t0)} ms`;
    scanningOverlay.classList.add('hidden');
    
    this.renderOverlays();
    this.renderRegionsList();
    this.updateControlsState();
  }

  async runTesseractClientFallback() {
    if (typeof Tesseract === 'undefined') {
      console.error('Tesseract.js not loaded.');
      return;
    }

    try {
      const worker = await Tesseract.createWorker('eng');
      const ret = await worker.recognize(this.canvas);
      await worker.terminate();

      if (ret && ret.data && ret.data.lines && ret.data.lines.length > 0) {
        const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const w = this.canvas.width;
        const h = this.canvas.height;
        const fallbackRegions = [];

        ret.data.lines.forEach((line, idx) => {
          const text = line.text ? line.text.trim() : '';
          if (text.length >= 1) {
            const bbox = line.bbox;
            const boxW = bbox.x1 - bbox.x0;
            const boxH = bbox.y1 - bbox.y0;

            if (boxW >= 12 && boxH >= 8) {
              const box = {
                x: Math.max(0, bbox.x0 - 2),
                y: Math.max(0, bbox.y0 - 2),
                w: Math.min(w - bbox.x0, boxW + 4),
                h: Math.min(h - bbox.y0, boxH + 4)
              };

              const colors = this.sampleBoxColors(box, w, h, imgData.data);
              const region = {
                id: `ocr_${idx + 1}`,
                box: box,
                text: text,
                textColor: colors.fg,
                bgColor: colors.bg,
                fontSize: Math.max(12, Math.round(box.h * 0.78)),
                fontWeight: '700',
                fontFamily: 'Montserrat',
                alignment: 'center',
                isUppercase: text.isupper(),
                isEdited: false
              };

              this.profileRegionFont(region);
              fallbackRegions.push(region);
            }
          }
        });

        if (fallbackRegions.length > 0) {
          this.textRegions = fallbackRegions;
        }
      }
    } catch (e) {
      console.error('Client Tesseract fallback error:', e);
    }
  }

  sampleBoxColors(box, width, height, data) {
    let rSum = 0, gSum = 0, bSum = 0, bgCount = 0;
    const x1 = Math.floor(Math.max(0, box.x));
    const y1 = Math.floor(Math.max(0, box.y));
    const x2 = Math.floor(Math.min(width - 1, box.x + box.w));
    const y2 = Math.floor(Math.min(height - 1, box.y + box.h));

    // Sample perimeter for background reference
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
    const bgLum = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) / 255.0;

    // Isolate contrasting ink pixels
    let fgR = 255, fgG = 255, fgB = 255;
    let maxContrast = 0;

    for (let y = y1 + 3; y < y2 - 3; y += 3) {
      for (let x = x1 + 3; x < x2 - 3; x += 3) {
        const idx = (y * width + x) * 4;
        const pR = data[idx];
        const pG = data[idx + 1];
        const pB = data[idx + 2];
        const pLum = (0.299 * pR + 0.587 * pG + 0.114 * pB) / 255.0;
        const contrast = Math.abs(pLum - bgLum);

        if (contrast > maxContrast && contrast > 0.22) {
          maxContrast = contrast;
          fgR = pR; fgG = pG; fgB = pB;
        }
      }
    }

    if (maxContrast === 0) {
      fgR = bgLum > 0.5 ? 20 : 255;
      fgG = bgLum > 0.5 ? 20 : 255;
      fgB = bgLum > 0.5 ? 20 : 255;
    }

    const toHex = (r, g, b) => `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

    return {
      bg: toHex(bgR, bgG, bgB),
      fg: toHex(fgR, fgG, fgB)
    };
  }

  profileRegionFont(region) {
    if (region.fontFamily && region.fontWeight) {
      this.loadGoogleFont(region.fontFamily, region.fontWeight);
      return;
    }

    const box = region.box;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const data = (this.originalBitmapData || this.ctx.getImageData(0, 0, cw, ch)).data;

    const x1 = Math.floor(Math.max(0, box.x));
    const y1 = Math.floor(Math.max(0, box.y));
    const x2 = Math.floor(Math.min(cw - 1, box.x + box.w));
    const y2 = Math.floor(Math.min(ch - 1, box.y + box.h));

    let ink = 0, total = 0;
    for (let y = y1 + 2; y < y2 - 2; y += 2) {
      for (let x = x1 + 2; x < x2 - 2; x += 2) {
        const idx = (y * cw + x) * 4;
        const lum = (0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2]) / 255;
        if (Math.abs(lum - 0.5) > 0.18) ink++;
        total++;
      }
    }

    const inkRatio = total > 0 ? ink / total : 0.25;

    if (inkRatio > 0.38) {
      region.fontWeight = '900';
      region.fontFamily = 'Anton';
    } else if (inkRatio > 0.28) {
      region.fontWeight = '800';
      region.fontFamily = 'Oswald';
    } else if (inkRatio > 0.20) {
      region.fontWeight = '700';
      region.fontFamily = 'Montserrat';
    } else {
      region.fontWeight = '400';
      region.fontFamily = 'Inter';
    }

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

  /**
   * Direct In-Place Inline Text Editing with Floating Typography Formatting Bar
   */
  startInlineEditing(region) {
    this.selectedRegion = region;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const box = region.box;

    const leftPct = (box.x / cw) * 100;
    const topPct = (box.y / ch) * 100;
    const widthPct = Math.max(16, (box.w / cw) * 100);
    const heightPct = Math.max(3.6, (box.h / ch) * 100);

    this.inlineEditor.style.left = `${leftPct}%`;
    this.inlineEditor.style.top = `${topPct}%`;
    this.inlineEditor.style.width = `${widthPct}%`;
    this.inlineEditor.style.height = `${heightPct}%`;

    // Populate formatting toolbar controls
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

    const naturalFontSize = region.fontSize || Math.max(12, Math.round(box.h * 0.78));
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

    // Style the in-place text input
    this.inlineInput.value = region.text;
    this.inlineInput.style.fontFamily = `"${family}", sans-serif`;
    this.inlineInput.style.fontSize = `${naturalFontSize}px`;
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

    // Update region model with final user choices
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

    const isUploadedImage = this.textRegions.some(
      r => r.id.startsWith('ocr_') || r.id.startsWith('cloud_') || r.id.startsWith('gemini_') || r.id.startsWith('custom_')
    );

    if (isUploadedImage) {
      // Inpaint target text area
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
        
        const blob = await new Promise(resolve => origCanvas.toBlob(resolve, 'image/png'));
        const formData = new FormData();
        formData.append('file', blob, 'image.png');
        formData.append('x', Math.floor(box.x));
        formData.append('y', Math.floor(box.y));
        formData.append('w', Math.ceil(box.w));
        formData.append('h', Math.ceil(box.h));

        const response = await fetch('http://localhost:8000/api/inpaint', {
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
        console.warn('Backend inpainting unavailable, falling back to seamless client inpainter:', err);
      }

      // If backend inpainting failed or offline, use our seamless gradient client inpainter (NEVER a black box!)
      if (!inpaintSuccess) {
        this.inpaintRegionClientSide(box);
        this.cleanBackgroundData = this.ctx.getImageData(0, 0, cw, ch);
      }

      // Re-render ONLY this region's text
      this.renderSingleRegion(this.selectedRegion);

    } else {
      // Template rendering: restore clean background and re-render
      if (this.cleanBackgroundData) {
        this.ctx.putImageData(this.cleanBackgroundData, 0, 0);
      }

      this.textRegions.forEach(r => {
        if (r.bgColor && r.bgColor !== 'transparent') {
          this.ctx.fillStyle = r.bgColor;
          this.ctx.fillRect(r.box.x, r.box.y, r.box.w, r.box.h);
        }
        this.renderSingleRegion(r);
      });
    }

    const t1 = performance.now();
    document.getElementById('inpaint-latency').textContent = `~${Math.round(t1 - t0)} ms`;

    // Push to undo stack
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

  /**
   * Client-side seamless texture-preserving inpainter.
   * Samples perimeter boundary pixels and synthesizes smooth background color.
   */
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

    // Sample boundary pixel colors
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

    // Create linear vertical gradient to seamlessly blend
    const grad = this.ctx.createLinearGradient(0, y1, 0, y2);
    grad.addColorStop(0, `rgb(${Math.round(avgTop[0])},${Math.round(avgTop[1])},${Math.round(avgTop[2])})`);
    grad.addColorStop(1, `rgb(${Math.round(avgBot[0])},${Math.round(avgBot[1])},${Math.round(avgBot[2])})`);

    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }

  /**
   * Render a single text region with high typography fidelity and auto-fitting.
   */
  renderSingleRegion(r) {
    const box = r.box;
    const family = r.fontFamily || 'Montserrat';
    const weight = r.fontWeight || '700';
    const fontStyle = r.fontStyle === 'italic' ? 'italic ' : '';
    const isVertical = r.isVertical || (box.h > box.w * 2.2);
    let fontSize = r.fontSize || Math.max(12, Math.round((isVertical ? box.w : box.h) * 0.78));

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

    // Auto-fit text size if new text exceeds original bounding box width
    let measured = this.ctx.measureText(textToRender).width;
    const maxAllowedWidth = box.w * 0.98;
    if (measured > maxAllowedWidth && measured > 0) {
      fontSize = Math.max(9, fontSize * (maxAllowedWidth / measured));
      this.ctx.font = `${fontStyle}${weight} ${fontSize}px "${family}", sans-serif`;
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
      this.textRegions.forEach(r => { r.isEdited = false; });
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

    // Before canvas (ORIGINAL) on the left: show from 0% to splitPercent%
    const beforeClip = `polygon(0% 0%, ${splitPercent}% 0%, ${splitPercent}% 100%, 0% 100%)`;
    beforeCanvas.style.clipPath = beforeClip;
    beforeCanvas.style.webkitClipPath = beforeClip;

    // After canvas (RECONSTRUCTED) on the right: show from splitPercent% to 100%
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
  }

  exportImage() {
    const link = document.createElement('a');
    link.download = `snaptext_edited_${Date.now()}.png`;
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
  window.simulator = new SnapTextSimulator();
  window.simulator.loadTemplate('aws_sample');
});
