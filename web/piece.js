import { getDomId } from './utils.js';

export class BoardPiece { // TODO? should not export this

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
                // TODO? el.setPointerCapture(e.pointerId);
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
            // TODO? try { el.releasePointerCapture(pointerId); } catch (err) {}
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
        /* TODO solve these issues:
            1) the duration of the animation is defined twice (here and in the CSS)
            2) if a piece is moved twice in less than 300ms, the 2nd animation gets interrupted and the piece is moved suddenly
            3) the duration of the animation is hard-coded instead of being dynamic (based on the distance)
        */
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
        // TODO? free up resources
        this._board.notify(this, 'remove');
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
        const v = super._view;
        /* TODO
            + front
            + back
        */
        return v;
    }

    get contextMenu() {
        const cm = super.contextMenu;
        /* TODO
            + button to "flip" this card
        */
        return cm;
    }

    set faceUp(faceUp) { // true / false
        // TODO animation if it's to be flipped
    }

}


class BoardDice extends BoardPiece {

    constructor(args = {}) {
        super(args);
        // TODO
    }

    get view() {
        const v = super._view;
        // TODO
        return v;
    }

    get contextMenu() {
        const cm = super.contextMenu;
        // TODO + button to "roll" this dice
        return cm;
    }

    roll() {
        // TODO start rolling animation
        setTimeout(() => this.value = Math.floor(Math.random() * 6) + 1, 3000);
    }

    set value(value) {
        // TODO stop rolling animation, if any
        // TODO change the value of the dice
    }

}

class BoardNote extends BoardPiece {

    // TODO This is a multiline unicode text
    // TODO scrollbars appear if the text doesn't fit in the box

    constructor(args = {}) {
        super(args);
        /*
          args = {
            text: 'any string' | null, // default = ''
            style: 'N' | 'B', // default = 'N'
            size: 'S' | 'M' | 'L' | null, // default = 'M'
            align: 'L' | 'C' | 'R' | null // default = 'C'
          }
          # if args.text is null or undefined,
          ## it means this is being created by the user:
          ## text can be edited right away (initial write mode)
          ## without the need of the user to select the action within the context menu
          # if args.text is not null and is not undefined,
          ## it means this is being created programmatically:
          ## to edit it the user have to select the action withing the context menu (initial read mode)
        */
    }

    get view() {
        const v = super._view;
        // TODO
        return v;
    }

    get contextMenu() {
        const cm = super.contextMenu;
        /* TODO
            + button to "resize" this Piece from any angle and any side
              * highlighted when active (resize-mode)
              * deactivated when pressed again
              * deactivated when this Piece is unselected
            + button to "edit" the text
              * highlighted when active (edit-mode)
              * deactivated when pressed again
              * deactivated when the Piece is unselected
              * deactivated when "Enter" is pressed
            + button to toggle normal/bold style
            + button to toggle small/medium/big size
        */
        return cm;
    }

    set text(text) {
        // TODO change content
    }

    set style(style) {
        // TODO bold/normal
    }

    set size(size) {
        // TODO small/medium/big
    }

    set align(align) {
        // TODO left/center/right
    }

}

class BoardArea extends BoardPiece {
    /*
    Area is a special piece:
    - TODO children move together with the Area, but can still be selected and moved individually
    - TODO other pieces can be attached (becoming children) to it by moving them fully inside the Area
    - TODO other pieces can be detached (no longer children) from it by moving them even partially outside of the Area
    - TODO destroying an Area destroys the children too
    - TODO when selecting the Area, all the children appear selected
    */

    get contextMenu() {
        const cm = super.contextMenu;
        /* TODO
            + button to "resize" this Piece from any angle and any side
              * highlighted when active (resize-mode)
              * deactivated when pressed again
              * deactivated when this Piece is unselected
        */
        return cm;
    }

    addChild(piece) {
        // TODO append piece to this BoardArea's view
    }

    removeChild(piece) {
        // TODO
    }

}