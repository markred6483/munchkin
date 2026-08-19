/**
 * GameBoard - Gestore del Tavolo di Gioco ad Altissime Prestazioni
 *
 * Implementa pan e zoom "Toward Cursor" esenti da layout thrashing,
 * supporta 5 livelli di zoom, scorciatoie tastiera orientate al cursore,
 * pinch-to-zoom, scroll nativo a 2 dita da trackpad e margini esterni simmetrici.
 */
export class GameBoard {
  /**
   * @param {Object} config
   * @param {string|HTMLElement} config.containerSelector - Elemento contenitore principale
   * @param {number} [config.width=5000] - Larghezza base del tavolo in px
   * @param {number} [config.height=5000] - Altezza base del tavolo in px
   * @param {number} [config.boardPadding=32] - Margine visivo esterno simmetrico in px
   * @param {number} [config.levelsCount=5] - Numero di livelli distinti di zoom
   * @param {number} [config.initialLevel=5] - Livello di zoom iniziale (default 5 = 100%)
   * @param {Function} [config.onZoomChange] - Callback attivata al cambio di zoom
   */
  constructor(config = {}) {
    if (!config.containerSelector) {
      this.container = document.createElement('div');
      document.body.appendChild(this.container);
    } else if (typeof config.containerSelector === 'string') {
      this.container = document.querySelector(config.containerSelector);
    } else {
      this.container = config.containerSelector;
    }

    if (!this.container) {
      throw new Error("GameBoard: Elemento contenitore non trovato.");
    }

    this.baseWidth = config.width || 5000;
    this.baseHeight = config.height || 5000;
    this.padding = config.boardPadding !== undefined ? config.boardPadding : 32;
    this.levelsCount = config.levelsCount || 5;
    this.currentLevel = config.initialLevel || 5;
    this.onZoomChange = config.onZoomChange || (() => {});

    // Sensibilità calibrata per il pinch-to-zoom / wheel continuo
    this.pinchSensitivity = 0.005;

    // Stato interno degli elementi DOM
    this.viewportEl = null;
    this.canvasEl = null;
    this.contentEl = null;

    // Stato dello zoom
    this.minScale = 1;
    this.maxScale = 1; // Corrisponde al livello massimo (100% / scala 1.0)
    this.currentScale = 1;

    // Tracciamento posizione del mouse per zoom da tastiera "Toward Cursor"
    this.currentMousePos = null;

    // Inizializzazione architettura
    this._initDOM();
    this._recalculateScaleLimits();

    // Imposta la scala iniziale al livello richiesto (default 5)
    this.currentScale = this._getScaleForLevel(this.currentLevel);
    this._applyScaleAndScroll(this.currentScale, null);

    // Centra il tavolo all'avvio
    this.centerBoard();

    // Event Listeners
    this._bindEvents();
    this.container.style.display = 'none';
  }

  /**
   * Costruisce la struttura DOM interna a doppio container con padding esterno.
   * @private
   */
  _initDOM() {
    this.container.classList.add('board-root');
    this.container.innerHTML = '';

    // Viewport per gestione scrollbar native e pan con 2 dita da trackpad
    this.viewportEl = document.createElement('div');
    this.viewportEl.className = 'board-viewport';

    // Canvas esterno per riservare lo spazio di scroll dinamico + margine esterno
    this.canvasEl = document.createElement('div');
    this.canvasEl.className = 'board-canvas';
    this.canvasEl.style.padding = `${this.padding}px`;

    // Layer di contenuto scalato via hardware-accelerated CSS transform
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'board-content';
    this.contentEl.style.width = `${this.baseWidth}px`;
    this.contentEl.style.height = `${this.baseHeight}px`;

    this.canvasEl.appendChild(this.contentEl);
    this.viewportEl.appendChild(this.canvasEl);
    this.container.appendChild(this.viewportEl);
  }

  /**
   * Calcola la scala minima (Livello 1) per far aderire il tavolo al viewport
   * garantendo il margine simmetrico (boardPadding) su tutti e 4 i lati.
   * @private
   */
  _recalculateScaleLimits() {
    const vw = this.viewportEl.clientWidth;
    const vh = this.viewportEl.clientHeight;

    if (vw === 0 || vh === 0) return;

    // Sottrae il doppio del padding per lasciare lo spazio esatto sui 4 lati
    const availableWidth = Math.max(100, vw - this.padding * 2);
    const availableHeight = Math.max(100, vh - this.padding * 2);

    const scaleX = availableWidth / this.baseWidth;
    const scaleY = availableHeight / this.baseHeight;

    this.minScale = Math.min(scaleX, scaleY);
    this.maxScale = 1.0; // Il livello 5 è sempre al 100% della dimensione nativa

    // Assicura che la scala corrente rimanga all'interno dei nuovi limiti durante il resize
    this.currentScale = Math.max(this.minScale, Math.min(this.maxScale, this.currentScale));
  }

  /**
   * Mappa un livello discreto (1-5) a un fattore di scala continuo.
   * @private
   */
  _getScaleForLevel(level) {
    const clampedLevel = Math.max(1, Math.min(this.levelsCount, level));
    if (this.levelsCount === 1) return this.maxScale;

    const step = (this.maxScale - this.minScale) / (this.levelsCount - 1);
    return this.minScale + step * (clampedLevel - 1);
  }

  /**
   * Trova il livello discreto più vicino al valore di scala corrente.
   * @private
   */
  _getLevelFromScale(scale) {
    if (this.maxScale === this.minScale) return 1;
    const ratio = (scale - this.minScale) / (this.maxScale - this.minScale);
    const level = Math.round(ratio * (this.levelsCount - 1)) + 1;
    return Math.max(1, Math.min(this.levelsCount, level));
  }

  /**
   * Restituisce le coordinate correnti del punto focale per lo zoom:
   * 1. Se fornito esplicitamente, usa il focalPoint passato.
   * 2. Se il mouse si trova dentro il viewport, usa le sue coordinate (Toward Cursor).
   * 3. Altrimenti ripiega sul centro del viewport.
   * @private
   */
  _getEffectiveFocalPoint(focalPoint) {
    if (focalPoint) return focalPoint;

    if (this.currentMousePos) {
      const rect = this.viewportEl.getBoundingClientRect();
      const x = this.currentMousePos.x - rect.left;
      const y = this.currentMousePos.y - rect.top;

      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        return { x, y };
      }
    }

    return {
      x: this.viewportEl.clientWidth / 2,
      y: this.viewportEl.clientHeight / 2
    };
  }

  /**
   * Applica in modo atomico la trasformazione CSS e aggiorna il layout di scroll.
   * Tenendo conto del padding per mantenere il punto fisso sotto il cursore.
   * @private
   */
  _applyScaleAndScroll(newScale, focalPoint) {
    const oldScale = this.currentScale;
    this.currentScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

    if (Math.abs(oldScale - this.currentScale) < 0.00001 && focalPoint !== null) {
      return;
    }

    const focus = this._getEffectiveFocalPoint(focalPoint);

    // Coordinate correnti di scroll
    const currentScrollLeft = this.viewportEl.scrollLeft;
    const currentScrollTop = this.viewportEl.scrollTop;

    // Posizione del punto focale sul layer di contenuto non scalato (coordinate mondo)
    const worldX = (currentScrollLeft + focus.x - this.padding) / oldScale;
    const worldY = (currentScrollTop + focus.y - this.padding) / oldScale;

    // 1. Aggiorna la scala sul layer trasformato (accelerazione GPU)
    this.contentEl.style.transform = `scale(${this.currentScale})`;

    // 2. Aggiorna lo spazio del canvas nativo per consentire alle scrollbar di adattarsi
    const newCanvasWidth = this.baseWidth * this.currentScale;
    const newCanvasHeight = this.baseHeight * this.currentScale;
    this.canvasEl.style.width = `${newCanvasWidth}px`;
    this.canvasEl.style.height = `${newCanvasHeight}px`;

    // 3. Ricalcola la posizione di scroll tenendo conto del padding fisso
    const newScrollLeft = (worldX * this.currentScale) + this.padding - focus.x;
    const newScrollTop = (worldY * this.currentScale) + this.padding - focus.y;

    this.viewportEl.scrollLeft = newScrollLeft;
    this.viewportEl.scrollTop = newScrollTop;

    // Aggiorna il livello discreto e notifica la callback
    this.currentLevel = this._getLevelFromScale(this.currentScale);
    this.onZoomChange(this.currentLevel, this.currentScale);
  }

  /**
   * Configurazione completa degli eventi per supporto Mouse, Trackpad, Tastiera e Resize.
   * @private
   */
  _bindEvents() {
    this.viewportEl.addEventListener('mousemove', (e) => {
      this.currentMousePos = { x: e.clientX, y: e.clientY };
    });

    this.viewportEl.addEventListener('mouseleave', () => {
      this.currentMousePos = null;
    });

    this.viewportEl.addEventListener('wheel', (e) => {
      const isPinchGesture = e.ctrlKey;

      if (isPinchGesture) {
        e.preventDefault();

        const rect = this.viewportEl.getBoundingClientRect();
        const focalPoint = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };

        const zoomFactor = Math.exp(-e.deltaY * this.pinchSensitivity);
        const targetScale = this.currentScale * zoomFactor;

        this._applyScaleAndScroll(targetScale, focalPoint);
      }
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          this.zoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          this.zoomOut();
        }
      } else {
        if (e.key === '+' || e.key === '=') {
          this.zoomIn();
        } else if (e.key === '-') {
          this.zoomOut();
        }
      }
    });

    window.addEventListener('resize', () => {
      const oldMinScale = this.minScale;
      this._recalculateScaleLimits();

      if (this.currentScale <= oldMinScale) {
        this.currentScale = this.minScale;
      }
      this._applyScaleAndScroll(this.currentScale, null);
    });
  }

  // --- METODI PUBBLICI ---

  /**
   * Incrementa lo zoom di 1 livello (orientato al cursore se presente, altrimenti al centro).
   */
  zoomIn() {
    const targetLevel = Math.min(this.levelsCount, this.currentLevel + 1);
    this.setZoomLevel(targetLevel);
  }

  /**
   * Decrementa lo zoom di 1 livello (orientato al cursore se presente, altrimenti al centro).
   */
  zoomOut() {
    const targetLevel = Math.max(1, this.currentLevel - 1);
    this.setZoomLevel(targetLevel);
  }

  /**
   * Imposta direttamente un livello di zoom discreto (1-5).
   * @param {number} level
   * @param {Object} [focalPoint] - Punto focale opzionale {x, y}
   */
  setZoomLevel(level, focalPoint = null) {
    const targetScale = this._getScaleForLevel(level);
    this._applyScaleAndScroll(targetScale, focalPoint);
  }

  /**
   * Centra il tavolo orizzontalmente e verticalmente nel viewport inclusi i margini.
   */
  centerBoard() {
    const totalWidth = (this.baseWidth * this.currentScale) + (this.padding * 2);
    const totalHeight = (this.baseHeight * this.currentScale) + (this.padding * 2);

    const viewportWidth = this.viewportEl.clientWidth;
    const viewportHeight = this.viewportEl.clientHeight;

    this.viewportEl.scrollLeft = Math.max(0, (totalWidth - viewportWidth) / 2);
    this.viewportEl.scrollTop = Math.max(0, (totalHeight - viewportHeight) / 2);
  }

  /**
   * Restituisce il layer interno dove appendere gli elementi di gioco (es. carte).
   * @returns {HTMLElement}
   */
  getContentContainer() {
    return this.contentEl;
  }

  show() {
    this.container.style.display = 'block';
  }

  hide() {
    this.container.style.display = 'none';
  }

}