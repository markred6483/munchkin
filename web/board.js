/**
 * GameBoard - Gestore del Tavolo di Gioco ad Altissime Prestazioni
 *
 * Implementa pan e zoom "Toward Cursor" esenti da layout thrashing,
 * supporta 5 livelli di zoom, scorciatoie tastiera, pinch-to-zoom da trackpad
 * e mantiene la navigazione nativa delle scrollbar.
 */
export class GameBoard {
  /**
   * @param {Object} config
   * @param {string|HTMLElement} config.containerSelector - Elemento contenitore principale
   * @param {number} [config.width=5000] - Larghezza base del tavolo in px
   * @param {number} [config.height=5000] - Altezza base del tavolo in px
   * @param {number} [config.levelsCount=5] - Numero di livelli distinti di zoom
   * @param {number} [config.initialLevel=5] - Livello di zoom iniziale (default 5 = 100%)
   * @param {Function} [config.onZoomChange] - Callback attivata al cambio di zoom
   */
  constructor(config = {}) {
    this.container = typeof config.containerSelector === 'string'
      ? document.querySelector(config.containerSelector)
      : config.containerSelector;

    if (!this.container) {
      throw new Error("GameBoard: Elemento contenitore non trovato.");
    }

    this.baseWidth = config.width || 5000;
    this.baseHeight = config.height || 5000;
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

    // Flag per evitare race conditions/thrashing durante i gesture
    this.isUpdating = false;

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
  }

  /**
   * Costruisce la struttura DOM interna a doppio container.
   * @private
   */
  _initDOM() {
    this.container.classList.add('board-root');
    this.container.innerHTML = '';

    // Viewport per gestione scrollbar native
    this.viewportEl = document.createElement('div');
    this.viewportEl.className = 'board-viewport';

    // Canvas esterno per riservare lo spazio di scroll dinamico
    this.canvasEl = document.createElement('div');
    this.canvasEl.className = 'board-canvas';

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
   * Calcola la scala minima (Livello 1) per far aderire perfettamente il tavolo al viewport.
   * @private
   */
  _recalculateScaleLimits() {
    const vw = this.viewportEl.clientWidth;
    const vh = this.viewportEl.clientHeight;

    if (vw === 0 || vh === 0) return;

    // Il livello 1 adatta l'intero tavolo al viewport corrente
    const scaleX = vw / this.baseWidth;
    const scaleY = vh / this.baseHeight;

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
   * Applica atomica la trasformazione CSS e aggiorna il layout di scroll.
   * EVITA LAYOUT THRASHING aggiornando width/height e scroll in una singola passata sincrona.
   * @private
   */
  _applyScaleAndScroll(newScale, focalPoint) {
    const oldScale = this.currentScale;
    this.currentScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

    if (Math.abs(oldScale - this.currentScale) < 0.00001 && focalPoint !== null) {
      return;
    }

    // Coordinate punto focale rispetto al viewport
    const focusX = focalPoint ? focalPoint.x : this.viewportEl.clientWidth / 2;
    const focusY = focalPoint ? focalPoint.y : this.viewportEl.clientHeight / 2;

    // Posizione del punto focale sul layer di contenuto non scalato (coordinate mondo)
    const currentScrollLeft = this.viewportEl.scrollLeft;
    const currentScrollTop = this.viewportEl.scrollTop;

    const worldX = (currentScrollLeft + focusX) / oldScale;
    const worldY = (currentScrollTop + focusY) / oldScale;

    // 1. Aggiorna la scala sul layer trasformato (accelerazione GPU)
    this.contentEl.style.transform = `scale(${this.currentScale})`;

    // 2. Aggiorna lo spazio del canvas nativo per consentire alle scrollbar di adattarsi
    const newCanvasWidth = this.baseWidth * this.currentScale;
    const newCanvasHeight = this.baseHeight * this.currentScale;
    this.canvasEl.style.width = `${newCanvasWidth}px`;
    this.canvasEl.style.height = `${newCanvasHeight}px`;

    // 3. Ricalcola la nuova posizione di scroll per mantenere fisso il punto sotto il cursore
    const newScrollLeft = (worldX * this.currentScale) - focusX;
    const newScrollTop = (worldY * this.currentScale) - focusY;

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
    // Gestione Zoom tramite Wheel o Touchpad Pinch
    this.viewportEl.addEventListener('wheel', (e) => {
      // Blocca il comportamento di zoom nativo del browser se si preme CTRL o si fa un pinch
      if (e.ctrlKey || Math.abs(e.deltaY) < 50) {
        e.preventDefault();

        const rect = this.viewportEl.getBoundingClientRect();
        const focalPoint = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };

        // Calibrazione delta per massima morbidezza
        const zoomFactor = Math.exp(-e.deltaY * this.pinchSensitivity);
        const targetScale = this.currentScale * zoomFactor;

        this._applyScaleAndScroll(targetScale, focalPoint);
      }
    }, { passive: false });

    // Gestione Scorciatoie da Tastiera
    window.addEventListener('keydown', (e) => {
      // Ignora se l'utente sta digitando in un input
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

    // Resize Handler con ricalcolo dei limiti
    window.addEventListener('resize', () => {
      const oldMinScale = this.minScale;
      this._recalculateScaleLimits();

      // Se eravamo al minimo, mantieni la nuova scala minima aggiornata
      if (this.currentScale <= oldMinScale) {
        this.currentScale = this.minScale;
      }
      this._applyScaleAndScroll(this.currentScale, null);
    });
  }

  // --- METODI PUBBLICI ---

  /**
   * Incrementa lo zoom di 1 livello verso il centro del viewport.
   */
  zoomIn() {
    const targetLevel = Math.min(this.levelsCount, this.currentLevel + 1);
    this.setZoomLevel(targetLevel);
  }

  /**
   * Decrementa lo zoom di 1 livello verso il centro del viewport.
   */
  zoomOut() {
    const targetLevel = Math.max(1, this.currentLevel - 1);
    this.setZoomLevel(targetLevel);
  }

  /**
   * Imposta direttamente un livello di zoom discreto (1-5).
   * @param {number} level
   */
  setZoomLevel(level) {
    const targetScale = this._getScaleForLevel(level);
    this._applyScaleAndScroll(targetScale, null);
  }

  /**
   * Centra il tavolo orizzontalmente e verticalmente nel viewport.
   */
  centerBoard() {
    const scaledWidth = this.baseWidth * this.currentScale;
    const scaledHeight = this.baseHeight * this.currentScale;

    const viewportWidth = this.viewportEl.clientWidth;
    const viewportHeight = this.viewportEl.clientHeight;

    this.viewportEl.scrollLeft = Math.max(0, (scaledWidth - viewportWidth) / 2);
    this.viewportEl.scrollTop = Math.max(0, (scaledHeight - viewportHeight) / 2);
  }

  /**
   * Restituisce il layer interno dove appendere gli elementi di gioco (es. carte).
   * @returns {HTMLElement}
   */
  getContentContainer() {
    return this.contentEl;
  }
}