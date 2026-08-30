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
   * Aggancia o crea il container per il login.
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
   * Genera il markup dell'interfaccia.
   * @private
   */
  _initDOM() {
    this.container.innerHTML = `
      <div class="login-box">
        <h2 class="login-title">PeerJS Game</h2>
        <input type="text" id="peer-input" class="login-input" placeholder="Il tuo nome..." autocomplete="off" spellcheck="false" />
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
      if (evt.key === 'Enter') {
        const peerName = this.inputEl.value.trim();
        if (!peerName) {
          this.inputEl.value = '';
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
      this.inputEl.value = '';
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