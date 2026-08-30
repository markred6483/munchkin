/**
 * LoginForm - Gestore del form di accesso al gioco
 */
export class LoginForm {
  constructor(containerSelector = null) {
    this._onLoginCallback = null;
    this._resolveContainer(containerSelector);
    this._initDOM();
    this._bindEvents();
  }

  /**
   * Determina e imposta l'elemento DOM del container.
   * @private
   */
  _resolveContainer(selector) {
    if (!selector) {
      this.container = document.createElement('div');
      document.body.appendChild(this.container);
    } else {
      this.container = typeof selector === 'string' ? document.querySelector(selector) : selector;
    }
    this.container.classList.add('login-container');
  }

  /**
   * Costruisce la struttura DOM del login.
   * @private
   */
  _initDOM() {
    this.container.innerHTML = `
      <div class="login-box">
        <h2 class="login-title">PeerJS Game</h2>
        <input type="text" id="peer-input" class="login-input" placeholder="Il tuo nome..." autocomplete="off" />
        <p class="login-hint">Premi Invio per entrare</p>
      </div>
    `;

    this.inputEl = this.container.querySelector('#peer-input');
  }

  /**
   * Configura gli eventi di input (Invio).
   * @private
   */
  _bindEvents() {
    this.inputEl.addEventListener('keydown', (evt) => {
      // Uso standard moderno di 'key' al posto del deprecato 'keyCode'
      if (evt.key === 'Enter') {
        const peerName = this.inputEl.value.trim();
        if (!peerName) {
          this.inputEl.value = "";
          return;
        }
        if (typeof this._onLoginCallback === 'function') {
          this._onLoginCallback(peerName);
        }
      }
    });
  }

  /**
   * Mostra il form di login e mette il focus sul campo di testo.
   */
  show() {
    this.container.style.display = 'flex';
    if (this.inputEl) {
      this.inputEl.value = "";
      this.inputEl.focus();
    }
  }

  /**
   * Nasconde il form di login.
   */
  hide() {
    this.container.style.display = 'none';
  }

  /**
   * Registra la callback da eseguire al submit del login.
   * @param {Function} callback
   */
  onLogin(callback) {
    if (typeof callback === 'function') {
      this._onLoginCallback = callback;
    }
  }
}