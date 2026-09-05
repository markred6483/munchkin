import { getDomId } from './utils.js';

export class BoardPiece {

    constructor(args = {}) {
        this._view = document.createElement('div');
        this._view.id = getDomId(args.id);
        this._view.className = 'board-piece';
        this._dragMode = false;
        this._dragState = null;
        this._board = null;
        this._view.addEventListener('board-pointerdown', (e) => {
            if (e.detail.target !== this._view)
                this.deselect();
            else if (!this._dragMode)
                this.select();
            else {
                this._view.classList.add('board-piece--dragging');
                this._dragState = {
                    offsetX: this.left - e.detail.x,
                    offsetY: this.top - e.detail.y
                };
            }
        });
        this._view.addEventListener('board-pointermove', (e) => {
            if (!this._dragState) return;
            this.left = Math.max(0, Math.min(this._board.width - this.width, e.detail.x + this._dragState.offsetX));
            this.top = Math.max(0, Math.min(this._board.height - this.height, e.detail.y + this._dragState.offsetY));
            this._board.updateContextMenu(this);
        });
        this._view.addEventListener('board-pointerup', (e) => {
            if (!this._dragState) return;
            this._dragState = null;
            this._view.classList.remove('board-piece--dragging');
            this._board.notify(this, 'drag');
        });
    }

    select() {
        this._view.classList.add('board-piece--selected');
        this._board.select(this);
        this._board.createContextMenu(this);
        this._board.notify(this, 'select');
    }

    deselect() {
        this._dragMode = false;
        this._view.classList.remove('board-piece--selected', 'board-piece--draggable');
        this._board.deselect(this);
        this._board.notify(this, 'deselect');
    }

    moveTo(x, y) {
        if (x < 0 || y < 0 || (x + this.width) > this._board.width || (y + this.height) > this._board.height)
            throw new Error("GameBoard: Impossibile spostare l'oggetto fuori dai confini del tavolo.");
        this._view.classList.add('board-piece--smooth-move');
        this._view.style.left = `${x}px`;
        this._view.style.top = `${y}px`;
        setTimeout(() => this._view.classList.remove('board-piece--smooth-move'), 300);
        this._board.notify(this, 'move');
    }

    set boardInterface(board) {
        this._board = board;
    }

    get view() {
        return this._view;
    }

    get id() {
        return this._view.id;
    }

    get width() {
        return this._view.offsetWidth;
    }

    get height() {
        return this._view.offsetHeight;
    }

    get left() {
        return parseFloat(this._view.style.left) || 0;
    }

    set left(left) {
        this._view.style.left = left + 'px';
    }

    get top() {
        return parseFloat(this._view.style.top) || 0;
    }

    set top(top) {
        this._view.style.top = top + 'px';
    }

    show() {
        this._view.style.display = 'block';
    }

    hide() {
        this._view.style.display = 'none';
    }

    destroy() {
        this._view.remove();
        this._board.removeContextMenu(this);
        this._board.deselect(this);
        this._board.notify(this, 'remove');
        this._board = null;
    }

    get contextMenu() {
        const menu = document.createElement('div');
        menu.className = 'board-context-menu';
        menu.appendChild(BoardPiece.createContextMenuItem({
            icon: '🔍', tooltip: 'Detail',
            action: (e) => this._board.notify(this, 'detail')
        }));
        menu.appendChild(BoardPiece.createContextMenuItem({
            icon: '✋', tooltip: 'Drag',
            action: (e) => {
                this._dragMode = !this._dragMode;
                e.target.classList.toggle('board-context-menu__button--active', this._dragMode);
                this._view.classList.toggle('board-piece--draggable', this._dragMode);
            }
        }));
        menu.appendChild(BoardPiece.createContextMenuItem({
            icon: '🗑️', tooltip: 'Remove', additionalClass: 'board-context-menu__button--remove',
            action: () => this.destroy()
        }));
        return menu;
    }

    static createContextMenuItem({
        icon = '❓', tooltip = null, additionalClass = null,
        action = () => console.error('Undefined context menu action')
    } = {}) {
        const btn = document.createElement('button');
        btn.className = 'board-context-menu__button';
        if (tooltip)
            btn.title = tooltip;
        if (additionalClass)
            btn.classList.add(additionalClass);
        btn.innerText = icon;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            action(e);
        });
        return btn;
    }

}

export class BoardCard extends BoardPiece {

    constructor(args = {}) {
        super(args);
        this._view.classList.add('board-card');
        this._isFaceUp = true;

        this._innerElement = document.createElement('div');
        this._innerElement.className = 'board-card__inner';

        this._frontElement = this._createCardFace(args.front, 'front');
        this._backElement = this._createCardFace(args.back, 'back');

        this._innerElement.appendChild(this._frontElement);
        this._innerElement.appendChild(this._backElement);
        this._view.appendChild(this._innerElement);
    }

    _createCardFace(content, faceType) {
        const face = document.createElement('div');
        face.className = `board-card__face board-card__face--${faceType}`;

        if (content instanceof Blob) {
            const img = document.createElement('img');
            const objectUrl = URL.createObjectURL(content);
            img.onload = () => URL.revokeObjectURL(objectUrl);
            img.src = objectUrl;
            img.className = 'board-card__image';
            face.appendChild(img);
        } else if (typeof content === 'string') {
            const img = document.createElement('img');
            img.src = content;
            img.className = 'board-card__image';
            face.appendChild(img);
        } else if (content instanceof HTMLElement) {
            face.appendChild(content);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = `board-card__placeholder board-card__placeholder--${faceType}`;
            placeholder.innerText = faceType === 'front' ? 'Card Front' : 'Card Back';
            face.appendChild(placeholder);
        }

        return face;
    }

    destroy() {
        if (this._frontElement) this._frontElement.innerHTML = '';
        if (this._backElement) this._backElement.innerHTML = '';
        this._frontElement = null;
        this._backElement = null;
        this._innerElement = null;
        super.destroy();
    }

    get contextMenu() {
        const cm = super.contextMenu;
        const flipBtn = BoardPiece.createContextMenuItem({
            icon: '🔄', tooltip: 'Flip',
            action: () => this.flip()
        });
        cm.appendChild(flipBtn);
        return cm;
    }

    flip() {
        this.isFaceUp = !this.isFaceUp;
        if (this._board) {
            this._board.notify(this, 'flip');
        }
    }

    get isFaceUp() {
        return this._isFaceUp;
    }

    set isFaceUp(isFaceUp) {
        if (this._isFaceUp === isFaceUp) return;
        this._isFaceUp = isFaceUp;
        this._view.classList.toggle('board-card--flipped', !this._isFaceUp);
    }

}