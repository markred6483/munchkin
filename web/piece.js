class BoardPiece {

    constructor(args = {}) {
        this._view = null; // TODO a <div> with the css class ".board-object" -> this must always be the root element of a BoardPiece
    }

    destroy() {
        /* TODO
            free up resources
            remove from parent
        */
    }

    moveTo(x, y) {
        /* TODO
            programmatically move the object smoothly (transition) on the board
            this is not "dragging"
        */
    }

    get view() {
        return this._view;
    }

    get contextMenu() {
        return null;
        /* TODO
            + button to "magnify" this Piece ("details" modal to be implemented later, for now this is just a no-action button)
            + button to "drag" this Piece (do not call moveTo)
              * highlighted when active
              * deactivated when pressed again
              * deactivated when this Piece is unselected
            + button to "remove" this Piece (aka "destroy")
        */
    }

    static createContextMenuItem({
            icon = '❓',
            tooltip = null, // null means no tooltip
            action = () => console.error('Undefined context menu action')
    } = {}) {
        return null; // TODO button
    }

}

class BoardCard extends BoardPiece {

    constructor(args = {}) {
        /* TODO
            args.front can be:
              - a string -> img.src = args.front -> this.front = img
              - an HTML element
              - null -> default simple placeholder
            args.back: same logic as front (slightly different placeholder though)
        */
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
        // TODO + button to "flip" this card
        return cm;
    }

    set front(front) {
        // TODO change the front side. The argument can be either a string (URL) or an HTML element.
    }

    set back(back) {
        // TODO change the back side. The argument can be either a string (URL) or an HTML element.
    }

    set faceUp(faceUp) { // true / false
        // TODO animation if it's to be flipped
    }

}

class BoardDice extends BoardPiece {

    get view() {
        const v = super.view;
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
        const v = super.view;
        // TODO
        return v;
    }

    get contextMenu() {
        const cm = super.contextMenu;
        /* TODO
            + button to "resize" this Piece from any angle and side
              * highlighted when active
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
            + button to "resize" this Piece from any angle and side
              * highlighted when active
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

    /*
    no changes are needed in the "move" event handling,
    because children's views are attached to the Area's view,
    so the "move together" thing comes "free"
    */
}