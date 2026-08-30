import { DeckRepository } from './db.js';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

// SVG Icon Helpers
const ICONS = {
  upload: `<svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  load: `<svg viewBox="0 0 24 24"><path d="M5 4h14v2H5V4zm0 10h4v6h6v-6h4l-7-7-7 7z"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`
};

/**
 * DeckManager - UI component and operational handler for decks and deck resources.
 */
export class DeckManager {
  constructor(containerSelector = null) {
    this.repo = new DeckRepository();
    this.callbacks = {
      descriptorUploaded: null,
      resourceUploaded: null,
      deckUploaded: null,
      deckSelected: null
    };

    this.expandedDeckId = null;
    this.expandedSectionKey = null; // Single active sub-section key e.g., "deckId:rules"
    this.selectedFiles = [];

    if (!containerSelector) {
      this.container = document.createElement('div');
      document.body.appendChild(this.container);
    } else if (typeof containerSelector === 'string') {
      this.container = document.querySelector(containerSelector);
    } else {
      this.container = containerSelector;
    }

    this._initDOM();
    this._bindEvents();
    this.refreshList();
  }

  _initDOM() {
    this.container.className = 'deck-manager-container';
    this.container.style.display = 'none';

    this.container.innerHTML = `
      <div class="deck-manager-box">
        <div class="deck-manager-header">
          <h3 class="deck-manager-title">Deck Manager</h3>
          <button class="deck-manager-btn-icon deck-manager-btn-close" id="deck-close-btn" title="Close">${ICONS.close}</button>
        </div>
        <div class="deck-manager-action-bar">
          <label class="deck-manager-file-label" for="deck-file-input">Choose .zip, .deck or folder...</label>
          <input type="file" id="deck-file-input" class="deck-manager-file-input" multiple webkitdirectory />
          <button class="deck-manager-btn-icon deck-manager-btn-upload" id="deck-upload-btn" title="Upload">${ICONS.upload}</button>
        </div>
        <div class="deck-manager-error" id="deck-error-msg"></div>
        <div class="deck-manager-list" id="deck-list-container"></div>
      </div>
    `;

    this.fileInput = this.container.querySelector('#deck-file-input');
    this.fileLabel = this.container.querySelector('.deck-manager-file-label');
    this.uploadBtn = this.container.querySelector('#deck-upload-btn');
    this.closeBtn = this.container.querySelector('#deck-close-btn');
    this.errorEl = this.container.querySelector('#deck-error-msg');
    this.listEl = this.container.querySelector('#deck-list-container');
  }

  _bindEvents() {
    this.fileLabel.addEventListener('click', () => {
      this.fileInput.value = '';
    });

    this.fileInput.addEventListener('change', (e) => {
      this.selectedFiles = Array.from(e.target.files);
      if (this.selectedFiles.length > 0) {
        this.fileLabel.textContent = `${this.selectedFiles.length} file(s) selected`;
      } else {
        this.fileLabel.textContent = 'Choose .zip, .deck or folder...';
      }
      this._hideError();
    });

    this.uploadBtn.addEventListener('click', () => this._handleUpload());
    this.closeBtn.addEventListener('click', () => this.hide());
  }

  _showError(msg) {
    this.errorEl.textContent = msg;
    this.errorEl.style.display = 'block';
  }

  _hideError() {
    this.errorEl.textContent = '';
    this.errorEl.style.display = 'none';
  }

  async _handleUpload() {
    this._hideError();
    if (!this.selectedFiles || this.selectedFiles.length === 0) {
      this._showError("Please select a deck file, folder, or zip archive.");
      return;
    }

    try {
      let descriptorObj = null;
      let resourceFilesMap = new Map();

      const isZip = this.selectedFiles.length === 1 && this.selectedFiles[0].name.endsWith('.zip');

      if (isZip) {
        const extracted = await this.extractDeckObject(this.selectedFiles[0]);
        descriptorObj = extracted.descriptor;
        for (const res of extracted.resources) {
          resourceFilesMap.set(res.uri, res.blob);
        }
      } else {
        const deckFiles = this.selectedFiles.filter(f => f.name.endsWith('.deck'));
        if (deckFiles.length === 0) {
          throw new Error("No .deck file found in selection.");
        }
        if (deckFiles.length > 1) {
          throw new Error("Multiple .deck files detected. Only one .deck descriptor is allowed.");
        }

        const deckFile = deckFiles[0];
        const deckText = await deckFile.text();
        descriptorObj = JSON.parse(deckText);

        const relativeFiles = new Map();
        for (const file of this.selectedFiles) {
          const path = file.webkitRelativePath || file.name;
          const cleanPath = path.includes('/') ? path.substring(path.indexOf('/') + 1) : path;
          relativeFiles.set(cleanPath, file);
          relativeFiles.set(file.name, file);
        }

        const requiredUris = this._getRequiredResourceUris(descriptorObj);
        for (const uri of requiredUris) {
          const matchedFile = relativeFiles.get(uri);
          if (!matchedFile) {
            throw new Error(`Missing referenced resource file: ${uri}`);
          }
          resourceFilesMap.set(uri, matchedFile);
        }
      }

      const descriptor = new DeckDescriptor(descriptorObj);

      if (await this.repo.hasDescriptor(descriptor.id)) {
        throw new Error(`Deck '${descriptor.id}' already exists on IndexedDB.`);
      }

      await this.repo.saveDescriptor(descriptor);
      if (this.callbacks.descriptorUploaded) {
        this.callbacks.descriptorUploaded(descriptor);
      }

      this.expandedDeckId = descriptor.id;
      this.expandedSectionKey = null;
      await this.refreshList();

      for (const [uri, blobOrFile] of resourceFilesMap.entries()) {
        const resource = new DeckResource({
          deck: descriptor.id,
          uri: uri,
          type: blobOrFile.type || 'application/octet-stream',
          blob: blobOrFile
        });
        await this.repo.saveResource(resource);
        if (this.callbacks.resourceUploaded) {
          this.callbacks.resourceUploaded(resource);
        }
        await this.refreshList();
      }

      if (this.callbacks.deckUploaded) {
        this.callbacks.deckUploaded(descriptor);
      }
    } catch (err) {
      this._showError(err.message);
    }
  }

  _getRequiredResourceUris(descriptor) {
    const uris = new Set();
    const isRemote = (uri) => uri && (uri.startsWith('http:') || uri.startsWith('https:'));

    if (descriptor.cover && !isRemote(descriptor.cover)) {
      uris.add(descriptor.cover);
    }
    if (Array.isArray(descriptor.rules)) {
      descriptor.rules.forEach(r => {
        if (r.uri && !isRemote(r.uri)) uris.add(r.uri);
      });
    }
    if (Array.isArray(descriptor.cards)) {
      descriptor.cards.forEach(c => {
        if (c.front && !isRemote(c.front)) uris.add(c.front);
        if (c.back && !isRemote(c.back)) uris.add(c.back);
      });
    }
    return uris;
  }

  async refreshList() {
    const descriptors = await this.repo.getAllDescriptors();
    this.listEl.innerHTML = '';

    if (descriptors.length === 0) {
      this.listEl.innerHTML = '<div class="deck-manager-empty">No decks available</div>';
      return;
    }

    for (const desc of descriptors) {
      const itemEl = document.createElement('div');
      itemEl.className = 'deck-manager-item';

      const resources = await this.repo.getResourcesByDeck(desc.id);
      const requiredUris = this._getRequiredResourceUris(desc);
      const isFullySaved = requiredUris.size === resources.length;

      // Primary header
      const headerEl = document.createElement('div');
      headerEl.className = 'deck-manager-item-header';

      const leftEl = document.createElement('div');
      leftEl.className = 'deck-manager-item-left';

      // All fields shown as key: value (excluding array attributes)
      const fieldsEl = document.createElement('div');
      fieldsEl.className = 'deck-manager-fields';
      Object.keys(desc).forEach(key => {
        if (key === 'cards' || key === 'rules') return;
        const line = document.createElement('div');
        line.className = 'deck-manager-field-line';
        const val = desc[key] !== null && desc[key] !== undefined ? desc[key] : '';
        line.innerHTML = `<span class="deck-manager-field-key">${key}:</span> ${val}`;
        fieldsEl.appendChild(line);
      });

      leftEl.appendChild(fieldsEl);

      const controlsEl = document.createElement('div');
      controlsEl.className = 'deck-manager-controls';

      const actionsEl = document.createElement('div');
      actionsEl.className = 'deck-manager-actions';

      if (isFullySaved) {
        const loadBtn = document.createElement('button');
        loadBtn.className = 'deck-manager-btn-icon deck-manager-btn-load';
        loadBtn.title = 'Load';
        loadBtn.innerHTML = ICONS.load;
        loadBtn.onclick = (e) => {
          e.stopPropagation();
          if (this.callbacks.deckSelected) this.callbacks.deckSelected(desc);
        };
        actionsEl.appendChild(loadBtn);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'deck-manager-btn-icon deck-manager-btn-delete';
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = ICONS.delete;
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        await this.repo.deleteResourcesByDeck(desc.id);
        await this.repo.deleteDescriptor(desc.id);
        if (this.expandedDeckId === desc.id) {
          this.expandedDeckId = null;
          this.expandedSectionKey = null;
        }
        this.refreshList();
      };
      actionsEl.appendChild(deleteBtn);

      const statusIcon = document.createElement('span');
      statusIcon.className = `deck-manager-icon ${isFullySaved ? 'deck-manager-icon-check' : 'deck-manager-icon-spinner'}`;
      statusIcon.innerHTML = isFullySaved ? '✓' : '';

      controlsEl.appendChild(actionsEl);
      controlsEl.appendChild(statusIcon);

      headerEl.appendChild(leftEl);
      headerEl.appendChild(controlsEl);
      itemEl.appendChild(headerEl);

      headerEl.onclick = () => {
        if (this.expandedDeckId === desc.id) {
          this.expandedDeckId = null;
          this.expandedSectionKey = null;
        } else {
          this.expandedDeckId = desc.id;
          this.expandedSectionKey = null;
        }
        this.refreshList();
      };

      // Expandable Sub-sections container
      if (this.expandedDeckId === desc.id) {
        const sectionsContainer = document.createElement('div');
        sectionsContainer.className = 'deck-manager-sections';

        // 1. Rules Section
        sectionsContainer.appendChild(
          this._createSubSection(desc.id, 'rules', `Rules (${desc.rules.length})`, () => {
            const list = document.createElement('div');
            list.className = 'deck-manager-sublist';
            desc.rules.forEach(rule => {
              const ruleEl = document.createElement('div');
              ruleEl.className = 'deck-manager-subitem';
              ruleEl.innerHTML = `
                <div class="deck-manager-fields">
                  ${rule.title ? `<div class="deck-manager-field-line"><span class="deck-manager-field-key">title:</span> ${rule.title}</div>` : ''}
                  ${rule.text ? `<div class="deck-manager-field-line"><span class="deck-manager-field-key">text:</span> ${rule.text}</div>` : ''}
                  ${rule.uri ? `<div class="deck-manager-field-line"><span class="deck-manager-field-key">uri:</span> ${rule.uri}</div>` : ''}
                </div>
              `;
              list.appendChild(ruleEl);
            });
            return list;
          })
        );

        // 2. Cards Section
        sectionsContainer.appendChild(
          this._createSubSection(desc.id, 'cards', `Cards (${desc.cards.length})`, () => {
            const list = document.createElement('div');
            list.className = 'deck-manager-sublist';
            desc.cards.forEach(card => {
              const cardEl = document.createElement('div');
              cardEl.className = 'deck-manager-subitem';
              cardEl.innerHTML = `
                <div class="deck-manager-fields">
                  <div class="deck-manager-field-line"><span class="deck-manager-field-key">id:</span> ${card.id}</div>
                  ${card.title ? `<div class="deck-manager-field-line"><span class="deck-manager-field-key">title:</span> ${card.title}</div>` : ''}
                  ${card.text ? `<div class="deck-manager-field-line"><span class="deck-manager-field-key">text:</span> ${card.text}</div>` : ''}
                  ${card.front ? `<div class="deck-manager-field-line"><span class="deck-manager-field-key">front:</span> ${card.front}</div>` : ''}
                  ${card.back ? `<div class="deck-manager-field-line"><span class="deck-manager-field-key">back:</span> ${card.back}</div>` : ''}
                </div>
              `;
              list.appendChild(cardEl);
            });
            return list;
          })
        );

        // 3. Resources Section
        sectionsContainer.appendChild(
          this._createSubSection(desc.id, 'resources', `Resources (${requiredUris.size})`, () => {
            const list = document.createElement('div');
            list.className = 'deck-manager-sublist';
            for (const uri of requiredUris) {
              const resItem = document.createElement('div');
              resItem.className = 'deck-manager-subitem';

              const res = resources.find(r => r.uri === uri);
              const isSaved = !!res;

              const leftBox = document.createElement('div');
              leftBox.className = 'deck-manager-subitem-left';

              const resFrame = document.createElement('div');
              resFrame.className = 'deck-manager-preview-frame';

              if (isSaved && res.blob) {
                const preview = document.createElement('img');
                preview.className = 'deck-manager-preview';
                preview.src = URL.createObjectURL(res.blob);
                resFrame.appendChild(preview);
              } else {
                resFrame.innerHTML = '<span class="deck-manager-preview-placeholder">N/A</span>';
              }

              leftBox.appendChild(resFrame);

              const infoBox = document.createElement('div');
              infoBox.className = 'deck-manager-fields';
              infoBox.innerHTML = `
                <div class="deck-manager-field-line"><span class="deck-manager-field-key">uri:</span> ${uri}</div>
                <div class="deck-manager-field-line"><span class="deck-manager-field-key">type:</span> ${res ? res.type : 'N/A'}</div>
              `;
              leftBox.appendChild(infoBox);

              const resIcon = document.createElement('span');
              resIcon.className = `deck-manager-icon ${isSaved ? 'deck-manager-icon-check' : 'deck-manager-icon-spinner'}`;
              resIcon.innerHTML = isSaved ? '✓' : '';

              resItem.appendChild(leftBox);
              resItem.appendChild(resIcon);
              list.appendChild(resItem);
            }
            return list;
          })
        );

        itemEl.appendChild(sectionsContainer);
      }

      this.listEl.appendChild(itemEl);
    }
  }

  _createSubSection(deckId, sectionType, title, contentBuilder) {
    const sectionKey = `${deckId}:${sectionType}`;
    const sectionEl = document.createElement('div');
    sectionEl.className = 'deck-manager-section';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'deck-manager-section-header';
    const isExpanded = this.expandedSectionKey === sectionKey;
    sectionHeader.innerHTML = `<span>${title}</span><span>${isExpanded ? '▲' : '▼'}</span>`;

    sectionHeader.onclick = (e) => {
      e.stopPropagation();
      if (this.expandedSectionKey === sectionKey) {
        this.expandedSectionKey = null;
      } else {
        this.expandedSectionKey = sectionKey;
      }
      this.refreshList();
    };

    sectionEl.appendChild(sectionHeader);

    if (isExpanded) {
      sectionEl.appendChild(contentBuilder());
    }

    return sectionEl;
  }

  async compressDeck(descriptor, resources) {
    const zip = new JSZip();
    zip.file(`${descriptor.id}.deck`, JSON.stringify(descriptor, null, 2));

    for (const res of resources) {
      zip.file(res.uri, res.blob);
    }

    return await zip.generateAsync({ type: 'blob' });
  }

  async extractDeckObject(zipFile) {
    if (!zipFile || !(zipFile instanceof Blob || zipFile instanceof File)) {
      throw new Error("Argument is not a valid zip blob/file.");
    }

    let zip;
    try {
      zip = await JSZip.loadAsync(zipFile);
    } catch (e) {
      throw new Error("Failed to extract file: Invalid zip format.");
    }

    let deckFileEntry = null;
    zip.forEach((relativePath, entry) => {
      if (relativePath.endsWith('.deck') && !entry.dir) {
        deckFileEntry = entry;
      }
    });

    if (!deckFileEntry) {
      throw new Error("Zip archive does not contain a .deck file.");
    }

    const deckText = await deckFileEntry.async('string');
    const descriptorObj = JSON.parse(deckText);

    const requiredUris = this._getRequiredResourceUris(descriptorObj);
    const resources = [];

    for (const uri of requiredUris) {
      const entry = zip.file(uri);
      if (entry) {
        const blob = await entry.async('blob');
        resources.push(new DeckResource({
          deck: descriptorObj.id,
          uri: uri,
          type: blob.type || 'application/octet-stream',
          blob: blob
        }));
      }
    }

    return {
      descriptor: new DeckDescriptor(descriptorObj),
      resources: resources
    };
  }

  onDeckDescriptorUploaded(callback) {
    this.callbacks.descriptorUploaded = callback;
  }

  onDeckResourceUploaded(callback) {
    this.callbacks.resourceUploaded = callback;
  }

  onDeckUploaded(callback) {
    this.callbacks.deckUploaded = callback;
  }

  onDeckSelected(callback) {
    this.callbacks.deckSelected = callback;
  }

  show() {
    this.container.style.display = 'flex';
  }

  hide() {
    this.container.style.display = 'none';
  }
}

export class DeckDescriptor {
  constructor(args = {}) {
    if (typeof args === 'string') args = JSON.parse(args);
    if (!args || !args.id) throw new Error(`Invalid deck: ${args}`);

    this.id = args.id;
    this.title = args.title || args.id || null;
    this.cover = args.cover || null;
    this.cards = [];
    this.rules = [];

    if (!args.cards) throw new Error(`Empty deck: ${args.id}`);
    const cardIds = new Set();
    for (let rawCard of args.cards) {
      const card = new CardDescriptor(rawCard);
      if (cardIds.has(card.id)) throw new Error(`Duplicate card: ${card.id}`);
      cardIds.add(card.id);
      this.cards.push(card);
    }

    if (args.rules) {
      const ruleUris = new Set();
      for (let rawRule of args.rules) {
        const rule = new RuleDescriptor(rawRule);
        if (rule.uri && ruleUris.has(rule.uri)) throw new Error(`Duplicate rule: ${rule.uri}`);
        if (rule.uri) ruleUris.add(rule.uri);
        this.rules.push(rule);
      }
    }
  }

  equals(other) {
    if (!(other instanceof DeckDescriptor)) return false;
    return JSON.stringify(this) === JSON.stringify(other);
  }
}

export class RuleDescriptor {
  constructor(args = {}) {
    if (typeof args === 'string') args = JSON.parse(args);
    if (!args || (!args.text && !args.uri) || (!args.title && !args.uri)) {
      throw new Error(`Invalid rule: ${JSON.stringify(args)}`);
    }
    this.title = args.title || null;
    this.text = args.text || null;
    this.uri = args.uri || null;
  }

  equals(other) {
    if (!(other instanceof RuleDescriptor)) return false;
    return JSON.stringify(this) === JSON.stringify(other);
  }
}

export class CardDescriptor {
  constructor(args = {}) {
    if (typeof args === 'string') args = JSON.parse(args);
    if (!args || !args.id || (!args.title && !args.text && !args.front)) {
      throw new Error(`Invalid card: ${JSON.stringify(args)}`);
    }
    this.id = args.id;
    this.title = args.title || null;
    this.text = args.text || null;
    this.front = args.front || null;
    this.back = args.back || null;
  }

  equals(other) {
    if (!(other instanceof CardDescriptor)) return false;
    return JSON.stringify(this) === JSON.stringify(other);
  }
}

export class DeckResource {
  constructor(args = {}) {
    if (typeof args === 'string') args = JSON.parse(args);
    if (!args || !args.deck || !args.uri || !args.type || !args.blob) {
      throw new Error(`Invalid resource: ${JSON.stringify(args)}`);
    }
    this.deck = args.deck;
    this.uri = args.uri;
    this.type = args.type;
    this.blob = args.blob;
  }

  equals(other) {
    if (!(other instanceof DeckResource)) return false;
    return this.deck === other.deck && this.uri === other.uri && this.type === other.type;
  }
}