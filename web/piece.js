export class BoardPiece { // TODO should not export this

    constructor(args = {}) {
        this._view = document.createElement('div');
        this._view.className = 'board-piece';
        this._dragMode = false;
        this._dragState = null;
        this._board = null;
        this._view.addEventListener('board-pointerdown', (e) => {
            if (e.detail.target !== this._view)
                this.deselect();
            else if (!this._dragMode) {
                this.select();
            } else {
                // TODO? el.setPointerCapture(e.pointerId);
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
            // TODO? try { el.releasePointerCapture(pointerId); } catch (err) {}
            this._dragState = null;
            this._board.dispatchEvent(this, 'move', { x: this.left, y: this.top });
        });
    }

    // TODO events

    select() {
        this._board.select(this);
        this._board.createContextMenu(this);
    }

    deselect() {
        this._dragMode = false;
        this._board.deselect(this);
    }

    moveTo(x, y) {
        if (x < 0 || y < 0 || (x + this.width) > this._board.width || (y + this.height) > this._board.height)
            throw new Error("GameBoard: Impossibile spostare l'oggetto fuori dai confini del tavolo.");
        this._view.classList.add('board-piece--smooth-move');
        this._view.style.left = `${x}px`;
        this._view.style.top = `${y}px`;
        setTimeout(() => this._view.classList.remove('board-piece--smooth-move'), 300); // TODO duration should be dynamic and match the CSS transition duration
    }

    set boardInterface(board) {
        this._board = board;
    }

    get view() {
        return this._view;
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
        // TODO? free up resources
    }

    get contextMenu() {
        const menu = document.createElement('div');
        menu.className = 'board-context-menu';
        menu.appendChild(BoardPiece.createContextMenuItem({
            icon: '🔍', tooltip: 'Detail' })); // TODO LATER, NOT NOW: implement Detail Modal
        menu.appendChild(BoardPiece.createContextMenuItem({
            icon: '✋', tooltip: 'Drag',
            action: (e) => {
                this._dragMode = !this._dragMode;
                e.target.classList.toggle('board-context-menu__button--active', this._dragMode);
            }
        }));
        menu.appendChild(BoardPiece.createContextMenuItem({
            icon: '🗑️', tooltip: 'Remove', additionalClass: 'board-context-menu__button--remove',
            action: () => this.destroy() }));
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
            btn.classList.add('board-context-menu__button--remove');
        btn.innerText = icon;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            action(e);
        });
        return btn;
    }

}

class BoardCard extends BoardPiece {

    constructor(args = {}) {
        super(args);
        /* TODO
            args.front can be:
              - a string -> img.src = args.front -> this.front = img
              - an HTML element
              - null -> default simple placeholder
            args.back: same logic as front (slightly different placeholder though)
        */
    }

    destroy() {
        super.destroy();
        // TODO free up resources
    }

    get view() {
        const v = super.view;
        /* TODO
            + front
            + back
        */
        return v;
    }

    get contextMenu() {
        const cm = super.contextMenu;
        /* TODO
            + 🔄 button to "flip" this card
        */
        return cm;
    }

    set faceUp(faceUp) { // true / false
        // TODO animation if it's to be flipped
    }

}