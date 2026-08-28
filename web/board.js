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
    this.zoomIndicatorEl = null;

    this.touchStartDist = 0;

    // Stato dello zoom
    this.minScale = 1;
    this.maxScale = 1; // Corrisponde al livello massimo (100% / scala 1.0)
    this.currentScale = 1;

    // Tracciamento posizione del mouse per zoom da tastiera "Toward Cursor"
    this.currentMousePos = null;

    // Gestione Selezione, Menù Contestuale e Dragging Oggetti
    this.selectedObject = null;
    this.contextMenuEl = null;
    this.isDraggingMode = false;
    this.activeDragState = null;
    this.eventListeners = {
      delete: [],
      move: []
    };

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
   * Costruisce la struttura DOM interna a doppio container con padding esterno
   * e inietta il menu di controllo zoom.
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

    // Creazione del Menù UI Zoom (figlio di .board-root)
    const uiOverlay = document.createElement('div');
    uiOverlay.className = 'game-ui-overlay';

    const btnZoomOut = document.createElement('button');
    btnZoomOut.className = 'game-ui-overlay__button';
    btnZoomOut.title = 'Zoom Out (-)';
    btnZoomOut.innerHTML = '<span class="game-ui-overlay__icon">-</span>';
    btnZoomOut.addEventListener('click', () => this.zoomOut());

    this.zoomIndicatorEl = document.createElement('span');
    this.zoomIndicatorEl.className = 'game-ui-overlay__info';

    const btnZoomIn = document.createElement('button');
    btnZoomIn.className = 'game-ui-overlay__button';
    btnZoomIn.title = 'Zoom In (+)';
    btnZoomIn.innerHTML = '<span class="game-ui-overlay__icon">+</span>';
    btnZoomIn.addEventListener('click', () => this.zoomIn());

    const btnCenter = document.createElement('button');
    btnCenter.className = 'game-ui-overlay__button';
    btnCenter.title = 'Centra Vista';
    btnCenter.innerHTML = '<span class="game-ui-overlay__icon">🎯</span>';
    btnCenter.addEventListener('click', () => this.centerBoard());

    uiOverlay.appendChild(btnZoomOut);
    uiOverlay.appendChild(this.zoomIndicatorEl);
    uiOverlay.appendChild(btnZoomIn);
    uiOverlay.appendChild(btnCenter);

    this.container.appendChild(uiOverlay);
  }

  /**
   * Calcola la scala minima (Livello 1) per far aderire il tavolo al viewport
   * garantendo il margine simmetrico (boardPadding) su tutti e 4 i lati.
   * @private
   */
  _recalculateScaleLimits() {
    const vw = this.viewportEl.clientWidth || window.innerWidth;
    const vh = this.viewportEl.clientHeight || window.innerHeight;

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
   * Tenendo conto del padding e dell'eventuale offset di centraggio visivo (margin: auto).
   * @private
   */
  _applyScaleAndScroll(newScale, focalPoint) {
    const oldScale = this.currentScale;
    this.currentScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

    if (Math.abs(oldScale - this.currentScale) < 0.00001 && focalPoint !== null) {
      return;
    }

    const focus = this._getEffectiveFocalPoint(focalPoint);

    // 1. Calcola l'offset di centraggio visivo generato da `margin: auto` nello stato precedente
    const oldCanvasTotalWidth = (this.baseWidth * oldScale) + (this.padding * 2);
    const oldCanvasTotalHeight = (this.baseHeight * oldScale) + (this.padding * 2);

    const oldOffsetX = Math.max(0, (this.viewportEl.clientWidth - oldCanvasTotalWidth) / 2);
    const oldOffsetY = Math.max(0, (this.viewportEl.clientHeight - oldCanvasTotalHeight) / 2);

    // Coordinate correnti di scroll
    const currentScrollLeft = this.viewportEl.scrollLeft;
    const currentScrollTop = this.viewportEl.scrollTop;

    // 2. Calcola le coordinate mondo compensando sia il padding che l'offset di centraggio visivo
    const worldX = (currentScrollLeft + focus.x - oldOffsetX - this.padding) / oldScale;
    const worldY = (currentScrollTop + focus.y - oldOffsetY - this.padding) / oldScale;

    // 3. Aggiorna la scala sul layer trasformato (accelerazione GPU)
    this.contentEl.style.transform = `scale(${this.currentScale})`;

    // 4. Aggiorna lo spazio del canvas nativo per consentire alle scrollbar di adattarsi
    const newCanvasWidth = this.baseWidth * this.currentScale;
    const newCanvasHeight = this.baseHeight * this.currentScale;
    this.canvasEl.style.width = `${newCanvasWidth}px`;
    this.canvasEl.style.height = `${newCanvasHeight}px`;

    // 5. Calcola l'offset di centraggio visivo per il NUOVO stato di scala
    const newCanvasTotalWidth = newCanvasWidth + (this.padding * 2);
    const newCanvasTotalHeight = newCanvasHeight + (this.padding * 2);

    const newOffsetX = Math.max(0, (this.viewportEl.clientWidth - newCanvasTotalWidth) / 2);
    const newOffsetY = Math.max(0, (this.viewportEl.clientHeight - newCanvasTotalHeight) / 2);

    // 6. Ricalcola la posizione di scroll sottrandone il nuovo offset visivo
    const newScrollLeft = (worldX * this.currentScale) + this.padding + newOffsetX - focus.x;
    const newScrollTop = (worldY * this.currentScale) + this.padding + newOffsetY - focus.y;

    this.viewportEl.scrollLeft = newScrollLeft;
    this.viewportEl.scrollTop = newScrollTop;

    // Aggiorna il livello discreto
    this.currentLevel = this._getLevelFromScale(this.currentScale);

    // Aggiorna la UI interna
    if (this.zoomIndicatorEl) {
      const percentage = Math.round(this.currentScale * 100);
      this.zoomIndicatorEl.textContent = `Lvl ${this.currentLevel}/${this.levelsCount} (${percentage}%)`;
    }

    // Mantiene la posizione aggiornata del menù contestuale non scalato
    if (this.selectedObject) {
      this._updateContextMenuPosition();
    }

    // Notifica la callback esterna
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

    this.viewportEl.addEventListener('scroll', () => {
      if (this.selectedObject) {
        this._updateContextMenuPosition();
      }
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

    const handleResize = () => {
      const oldMinScale = this.minScale;
      this._recalculateScaleLimits();

      if (this.currentScale <= oldMinScale) {
        this.currentScale = this.minScale;
      }
      this._applyScaleAndScroll(this.currentScale, null);
    };

    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    // Gestione Pinch-to-Zoom nativo su Mobile (Zoom-In & Zoom-Out)
    this.viewportEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this.touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    this.viewportEl.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault(); // Impedisce lo zoom della pagina intera

        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );

        const delta = currentDist - this.touchStartDist;
        const threshold = 35; // Soglia sensibilità pinch mobile

        if (Math.abs(delta) > threshold) {
          // Centro tra le due dita per ancorare lo zoom
          const touchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const touchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const rect = this.viewportEl.getBoundingClientRect();

          const targetPoint = {
            x: touchCenterX - rect.left,
            y: touchCenterY - rect.top
          };

          if (delta > 0) {
            this.zoomIn(targetPoint);
          } else {
            this.zoomOut(targetPoint);
          }

          this.touchStartDist = currentDist; // Aggiorna la distanza base
        }
      }
    }, { passive: false });

    // Gestione Selezione Oggetti, Deselezione e Trascinamento (PC e Touch)
    this.contentEl.addEventListener('pointerdown', (e) => {
      const targetObj = e.target.closest('.board-object');
      if (targetObj) {
        e.stopPropagation();
        this._selectObject(targetObj);

        if (this.isDraggingMode) {
          this._startDragging(targetObj, e);
        }
      } else {
        if (!e.target.closest('.board-context-menu')) {
          this._deselectObject();
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.activeDragState) {
        this._handleDragging(e);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.activeDragState) {
        this._stopDragging(e);
      }
    });
  }

  /**
   * Seleziona un oggetto sul tavolo e mostra il menù contestuale.
   * @private
   */
  _selectObject(el) {
    if (this.selectedObject === el) return;
    this._deselectObject();

    this.selectedObject = el;
    this.selectedObject.classList.add('board-object--selected');
    this._createContextMenu(el);
  }

  /**
   * Deseleziona l'oggetto corrente e rimuove il menù contestuale.
   * @private
   */
  _deselectObject() {
    if (this.selectedObject) {
      this.selectedObject.classList.remove('board-object--selected');
      this.selectedObject = null;
    }
    this.isDraggingMode = false;
    this._removeContextMenu();
  }

  /**
   * Crea e posiziona il menù contestuale sopra l'oggetto in un layer non soggetto a zoom (.board-root).
   * @private
   */
  _createContextMenu(el) {
    this._removeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'board-context-menu';

    // Bottone Dettaglio (TODO)
    const btnDetails = document.createElement('button');
    btnDetails.className = 'board-context-menu__button';
    btnDetails.title = 'Details';
    btnDetails.innerHTML = '🔍';
    btnDetails.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: implementare versione ingrandita dell'oggetto
      this._deselectObject();
    });

    // Bottone Sposta
    const btnMove = document.createElement('button');
    btnMove.className = 'board-context-menu__button';
    btnMove.title = 'Move object';
    btnMove.innerHTML = '✋';
    btnMove.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isDraggingMode = true;
      btnMove.classList.add('board-context-menu__button--active');
    });

    menu.appendChild(btnDetails);

    // Bottone Elimina (visibile solo se presente la classe .removable-board-object)
    if (el.classList.contains('removable-board-object')) {
      const btnDelete = document.createElement('button');
      btnDelete.className = 'board-context-menu__button board-context-menu__button--delete';
      btnDelete.title = 'Delete object';
      btnDelete.innerHTML = '🗑️';
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeBoardObject(el);
      });
      menu.appendChild(btnDelete);
    }

    menu.appendChild(btnMove);

    // Append a .board-root per prevenire lo zoom del menù
    this.container.appendChild(menu);
    this.contextMenuEl = menu;

    this._updateContextMenuPosition();
  }

  /**
   * Aggiorna la posizione dello schermo per il menù contestuale non scalato.
   * @private
   */
  _updateContextMenuPosition() {
    if (!this.contextMenuEl || !this.selectedObject) return;

    const el = this.selectedObject;
    const objRect = el.getBoundingClientRect();
    const rootRect = this.container.getBoundingClientRect();

    const left = objRect.left - rootRect.left + (objRect.width / 2);
    const top = objRect.top - rootRect.top;

    this.contextMenuEl.style.left = `${left}px`;
    this.contextMenuEl.style.top = `${top}px`;
  }

  /**
   * Rimuove il menù contestuale attivo dal DOM.
   * @private
   */
  _removeContextMenu() {
    if (this.contextMenuEl) {
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
    }
  }

  /**
   * Avvia il trascinamento dell'oggetto tenendo conto della scala e dei limiti.
   * @private
   */
  _startDragging(el, e) {
    el.setPointerCapture(e.pointerId);
    const initialLeft = parseFloat(el.style.left) || 0;
    const initialTop = parseFloat(el.style.top) || 0;

    this.activeDragState = {
      el,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialLeft,
      initialTop
    };
  }

  /**
   * Gestisce lo spostamento fluido mantenendo l'oggetto nei confini di .board-content.
   * @private
   */
  _handleDragging(e) {
    if (!this.activeDragState) return;

    const { el, startX, startY, initialLeft, initialTop } = this.activeDragState;

    // Delta di spostamento corretto in base allo zoom del tavolo
    const deltaX = (e.clientX - startX) / this.currentScale;
    const deltaY = (e.clientY - startY) / this.currentScale;

    let targetLeft = initialLeft + deltaX;
    let targetTop = initialTop + deltaY;

    // Vincolo dei confini del tavolo (.board-content)
    const objWidth = el.offsetWidth;
    const objHeight = el.offsetHeight;

    targetLeft = Math.max(0, Math.min(this.baseWidth - objWidth, targetLeft));
    targetTop = Math.max(0, Math.min(this.baseHeight - objHeight, targetTop));

    el.style.left = `${targetLeft}px`;
    el.style.top = `${targetTop}px`;

    // Aggiorna la posizione visiva del menù contestuale fisso
    this._updateContextMenuPosition();
  }

  /**
   * Termina il trascinamento, notifica gli ascoltatori dell'evento move e chiude la selezione.
   * @private
   */
  _stopDragging(e) {
    if (!this.activeDragState) return;

    const { el, pointerId } = this.activeDragState;
    try {
      el.releasePointerCapture(pointerId);
    } catch (err) {}

    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;

    this._triggerEvent('move', { el, x, y });

    this.activeDragState = null;
    this._deselectObject();
  }

  /**
   * Scatena i callback registrati agli eventi di sistema.
   * @private
   */
  _triggerEvent(eventName, data) {
    if (this.eventListeners[eventName]) {
      this.eventListeners[eventName].forEach(cb => cb(data));
    }
  }

  // --- METODI PUBBLICI ---

  /**
   * Registra una funzione callback per un evento di sistema ('remove' o 'move').
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    if (this.eventListeners[eventName] && typeof callback === 'function') {
      this.eventListeners[eventName].push(callback);
    }
  }

  /**
   * Elimina un oggetto dal tavolo e notifica gli ascoltatori.
   * @param {string|HTMLElement} target - ID o elemento DOM dell'oggetto.
   */
  removeBoardObject(target) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;

    if (!el.classList.contains('removable-board-object')) {
      throw new Error("GameBoard: Impossibile eliminare un oggetto privo della classe '.removable-board-object'.");
    }

    this._deselectObject();
    el.remove();

    this._triggerEvent('remove', { el });
  }

  /**
   * Sposta un oggetto programmaticamente con animazione fluida.
   * @param {string|HTMLElement} target - ID o elemento DOM dell'oggetto.
   * @param {number} x - Nuova posizione coordinata X.
   * @param {number} y - Nuova posizione coordinata Y.
   */
  moveBoardObject(target, x, y) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) {
      throw new Error("GameBoard: Oggetto specificato per lo spostamento non trovato.");
    }

    const objWidth = el.offsetWidth;
    const objHeight = el.offsetHeight;

    // Controllo dei limiti di .board-content
    if (x < 0 || y < 0 || (x + objWidth) > this.baseWidth || (y + objHeight) > this.baseHeight) {
      throw new Error("GameBoard: Impossibile spostare l'oggetto fuori dai confini del tavolo.");
    }

    el.classList.add('board-object--smooth-move');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    // Notifica l'evento
    this._triggerEvent('move', { el, x, y });

    setTimeout(() => {
      el.classList.remove('board-object--smooth-move');
    }, 300);

    this._deselectObject();
  }

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