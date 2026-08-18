export class ChatWidget extends EventTarget {

  constructor(options = {}) {
    super(); // Initialize EventTarget

    this.target = options.target || document.body;
    this.activeRecipient = ChatWidget.MODE_BROADCAST;
    this.isOpen = true;

    // DOM elements references
    this.container = null;
    this.userListEl = null;
    this.historyListEl = null;
    this.modeLabelEl = null;
    this.textareaEl = null;
    this.contextMenuEl = null;
    this.selectedItemData = null;

    this._init();
  }

  _init() {
    this._createDOM();
    this._attachEventListeners();
    this._setupResizeX();
    this._setupResizeY();
  }

  _createDOM() {
    this.container = document.createElement('div');
    this.container.className = 'chat-container';

    this.container.innerHTML = `
      <div class="chat-resize-handle-x"></div>

      <header class="chat-header">
        <button class="chat-toggle-btn" title="Toggle Chat"></button>
        <button class="chat-add-btn" title="Add user">+</button>
        <input class="chat-add-input" title="User name" placeholder="Name of the user to add"></input>
      </header>

      <div class="chat-user-list-wrapper">
        <ul class="chat-list chat-user-list"></ul>
      </div>

      <div class="chat-splitter-y"></div>

      <div class="chat-history-wrapper">
        <ul class="chat-list chat-history-list"></ul>
      </div>

      <footer class="chat-footer">
        <div class="chat-input-container">
          <span class="chat-mode-label"></span>
          <textarea class="chat-textarea" rows="1" placeholder="Your message..."></textarea>
        </div>
      </footer>

      <div class="chat-context-menu">
        <button class="chat-context-menu-item" data-action="info">Info</button>
        <button class="chat-context-menu-item" data-action="whisper">Whisper</button>
      </div>
    `;

    this.target.appendChild(this.container);

    // Cache riferimenti
    this.userListEl = this.container.querySelector('.chat-user-list');
    this.historyListEl = this.container.querySelector('.chat-history-list');
    this.modeLabelEl = this.container.querySelector('.chat-mode-label');
    this.textareaEl = this.container.querySelector('.chat-textarea');
    this.contextMenuEl = this.container.querySelector('.chat-context-menu');
  }

  _attachEventListeners() {
    // Toggle open/close
    const toggleBtn = this.container.querySelector('.chat-toggle-btn');
    const closeSymbol = '❯❯';
    const openSymbol = '❮❮';
    toggleBtn.innerText = closeSymbol; // https://www.freecodecamp.org/news/smart-quotes-single-quote-and-double-quotation-mark-for-copy-paste/
    toggleBtn.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      this.container.classList.toggle('chat-closed', !this.isOpen);
      toggleBtn.innerText = this.isOpen ? closeSymbol : openSymbol;
      this.dispatchEvent(new CustomEvent('toggle', {
        detail: { isOpen: this.isOpen }
      }));
    });

    // Add user
    const addBtn = this.container.querySelector('.chat-add-btn');
    const addInput = this.container.querySelector('.chat-add-input');
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      addInput.style.display = 'block';
      addInput.focus();
    });
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = addInput.value.trim();
        addInput.style.display = 'none';
        addBtn.style.display = 'block';
        addInput.value = '';
        if (name)
          this.dispatchEvent(new CustomEvent('adduser', { detail: { name } }));
      }
    });

    // Textarea send & expand
    this.textareaEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = this.textareaEl.value.trim();
        if (text) {
          this._sendMessage(text, this.activeRecipient);
          this.textareaEl.value = '';
          this.textareaEl.style.height = 'auto';
        }
      }
    });

    this.textareaEl.addEventListener('input', () => {
      this.textareaEl.style.height = 'auto';
      this.textareaEl.style.height = `${this.textareaEl.scrollHeight}px`;
    });

    // Delegazione Eventi Click su liste per Menu Contestuale
    this.container.addEventListener('click', (e) => {
      const listItem = e.target.closest('.chat-user-item');
      if (listItem) {
        e.stopPropagation();
        this._showContextMenu(e.clientX, e.clientY, listItem);
      } else if (!e.target.closest('.chat-context-menu')) {
        this._hideContextMenu();
      }
    });

    // Azioni Menu Contestuale
    this.contextMenuEl.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (!action) return;

      if (action === 'info') {
        // Scatena evento Info
        this.dispatchEvent(new CustomEvent('info', {
          detail: { ...this.selectedItemData }
        }));
      } else if (action === 'whisper') {
        if (this.selectedItemData && this.selectedItemData.username) {
          this._setRecipient(this.selectedItemData.username);
        }
      }
      this._hideContextMenu();
    });

    // Mode change
    this._setRecipient(ChatWidget.MODE_BROADCAST);
    this.modeLabelEl.addEventListener('click', (e) => {
      this._setRecipient(ChatWidget.MODE_BROADCAST);
    });
  }

  /* --- Ridimensionamento Orizzontale (Bordo Sinistro) --- */
  _setupResizeX() {
    const handle = this.container.querySelector('.chat-resize-handle-x');
    let isResizing = false;

    handle.addEventListener('mousedown', () => {
      isResizing = true;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      this.container.style.width = `${newWidth}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  /* --- Ridimensionamento Verticale (Splitter) --- */
  _setupResizeY() {
    const splitter = this.container.querySelector('.chat-splitter-y');
    const topWrapper = this.container.querySelector('.chat-user-list-wrapper');
    const bottomWrapper = this.container.querySelector('.chat-history-wrapper');
    let isResizing = false;

    splitter.addEventListener('mousedown', () => {
      isResizing = true;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const containerRect = this.container.getBoundingClientRect();
      const topOffset = e.clientY - containerRect.top - 48;
      const totalHeight = topWrapper.offsetHeight + bottomWrapper.offsetHeight;

      let topPercentage = (topOffset / totalHeight) * 100;
      topPercentage = Math.max(15, Math.min(85, topPercentage));

      topWrapper.style.flex = `${topPercentage}`;
      bottomWrapper.style.flex = `${100 - topPercentage}`;
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  /* --- Gestione Menu Contestuale --- */
  _showContextMenu(x, y, listItem) {
    this.selectedItemData = {
      element: listItem,
      username: listItem.dataset.username || null,
      msgId: listItem.dataset.msgId || null
    };
    this.contextMenuEl.style.left = `${x}px`;
    this.contextMenuEl.style.top = `${y}px`;
    this.contextMenuEl.style.display = 'flex';
  }

  _hideContextMenu() {
    this.contextMenuEl.style.display = 'none';
    this.selectedItemData = null;
  }

  _setRecipient(name) {
    this.activeRecipient = name;
    if (name != ChatWidget.MODE_BROADCAST)
      this.modeLabelEl.innerText = `Whisper: ${name}`;
    else
      this.modeLabelEl.innerText = ChatWidget.MODE_BROADCAST.toString();
    this.dispatchEvent(new CustomEvent('recipientchange', {
      detail: { recipient: name }
    }));
  }

  _sendMessage(text, recipient) {
    const envelope = {
      timestamp: new Date(),
      sender: ChatWidget.ME,
      recipient: recipient,
      text: text
    }
    this._addMessage(envelope);
    this.dispatchEvent(new CustomEvent('sendmessage', { detail: envelope }));
  }

  _addMessage(msg) {
    const isRecipientMe = msg.recipient === ChatWidget.ME;
    const isSenderMe = msg.sender === ChatWidget.SENDER;
    msg.recipient = isRecipientMe ? ChatWidget.ME.toString() : msg.recipient;
    msg.sender = isSenderMe ? ChatWidget.ME.toString() : msg.sender;
    msg.timestamp = (msg.timestamp instanceof Date) ? msg.timestamp : new Date(msg.timestamp);
    const li = document.createElement('li');
    li.className = 'chat-list-item';
    li.dataset.msgId = msg.id || Date.now();
    li.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-badge chat-badge-time">${msg.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
        <span class="chat-badge chat-badge-sender">${msg.sender}</span>
        <span>&#10132;</span>
        <span class="chat-badge chat-badge-recipient">${msg.recipient}</span>
      </div>
      <div class="chat-msg-body">${msg.text}</div>
    `; // https://www.toptal.com/designers/htmlarrows/arrows/
    this.historyListEl.appendChild(li);
    this.historyListEl.parentElement.scrollTop = this.historyListEl.parentElement.scrollHeight;
  }

  /* --- API Pubbliche / Metodi per aggiornare lo Stato del Widget --- */

  receiveMessage(envelope) {
    this._addMessage(envelope);
  }

  addUser(user) {
    const li = document.createElement('li');
    li.className = 'chat-list-item chat-user-item';
    li.dataset.username = user.name;
    li.innerHTML = `
      <span class="chat-status-dot ${user.online ? '' : 'chat-offline'}"></span>
      <span class="chat-user-name">${user.name}</span>
    `;
    this.userListEl.appendChild(li);
  }

  removeUser(username) {
    this.userListEl.querySelector(`[data-username="${username}"]`).remove();
  }

  removeAllUsers() {
    this.userListEl.innerHTML = "";
  }

}

Object.defineProperty(ChatWidget, 'ME', {
    value: { toString: () => 'Me' },
    writable : false,
    enumerable : true,
    configurable : false
});

Object.defineProperty(ChatWidget, 'MODE_BROADCAST', {
    value: { toString: () => 'Broadcast' },
    writable : false,
    enumerable : true,
    configurable : false
});