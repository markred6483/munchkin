/**
 * LoginForm - Gestore del form di accesso al gioco
 */
export class LoginForm {
  constructor(containerSelector = null) {
    this._onLoginCallback = null;

    if (!containerSelector) {
      this.container = document.createElement('div');
      this.container.className = 'login-container';
      document.body.appendChild(this.container);
    } else if (typeof containerSelector === 'string') {
      this.container = document.querySelector(containerSelector);
    } else {
      this.container = containerSelector;
    }

    this._initDOM();
    this._bindEvents();
  }

  /**
   * Costruisce la struttura DOM del login.
   * @private
   */
  _initDOM() {
    this.container.classList.add('login-container');
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
      if (evt.key === 'Enter' || evt.keyCode === 13) {
        const peerName = this.inputEl.value.trim();
        if (peerName.length === 0) {
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