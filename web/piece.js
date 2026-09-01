class BoardPiece {

    constructor(args = {}) {
        this._view = null; // TODO a <div> with the css class ".board-object" -> this must always be the root element of a BoardPiece
    }

    on(event, callback) {
        // TODO
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
            + 🔍 button to "magnify" this Piece ("details" modal to be implemented later, for now this is just a no-action button)
            + ✋ button to "drag" this Piece (do not call moveTo)
              * highlighted when active
              * deactivated when pressed again
              * deactivated when this Piece is unselected
            + 🗑️ button to "remove" this Piece (aka "destroy")
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
        /* TODO
            + 🔄 button to "flip" this card
        */
        return cm;
    }

    set faceUp(faceUp) { // true / false
        // TODO animation if it's to be flipped
    }

}