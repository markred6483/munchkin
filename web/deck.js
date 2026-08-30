import { DeckRepository } from './db.js';
// TODO more imports if necessary

export class DeckManager {

  // TODO documentation-like comments

  // TODO create the widget's DOM elements
  // - dom elements must be created in this class
  // - styles must be defined in the deck.css file; all the css classes should start with the prefix ".deck-manager-"
  // - base styles must be similar to the LoginForm's styles
  // - this widget must be hidden initially
  // - the widget has the following elements:
  //   - at the bottom, a list of decks available on IndexedDB
  //     - each list's item represents a DeckDescriptor saved on IndexedDB
  //       - show all the fields of the DeckDescriptor as "fieldName: value"
  //       - show a green mark icon on the right if the deck is fully saved on IndexedDB, a loading icon otherwise
  //       - show a "load" button on the left of the check mark/loading icon only if the deck is fully loaded
  //       - show a "delete" button below the "load" button
  //     - "No decks available" message if no DeckDescriptor has been saved on IndexedDB
  //     - each list's item can be expanded into a sub-list and collapsed
  //       - every list's item must be collapsed initially
  //       - only one sub-list can be expanded at once, if another one is expanded, the previous one gets collapsed
  //       - lazy-load (create) the sub-list's items only when expanding the list's item
  //       - destroy the sub-list's items when collapsing the list's item
  //       - each sub-list's item represents a DeckResource
  //         - show a green mark icon on the right if the resource is saved on IndexedDB, loading icon otherwise
  //         - show a small preview of the blob on the left
  //           - all the previews must have the same fixed max-width and max-height
  //           - the preview must keep the correct width-height ratio
  //         - show all the "basic" fields (not the blob) of the DeckResource as "fieldName: value"
  //         - show a green mark on the right if the DeckResource has been saved on IndexedDB, a loading mark otherwise
  //   - on top, an action "bar" with:
  //     - a file selection input on the left, to let the user select a "deck" from the filesystem
  //       - the user can select a folder containing a .deck file representing a DeckDescriptor object and many PDFs or images (many types supported) representing the all the DeckResources referenced by the DeckDescriptor
  //       - the user can select a .zip file containing a .deck file representing a DeckDescriptor object and many PDFs or images (many types supported) representing all the DeckResources referenced by the DeckDescriptor
  //       - the user can select a list of files: a .deck file and all the DeckResources referenced by the DeckDescriptor
  //       - if more than one .deck file is present, prompt an Error integrated in the widget
  //       - if some DeckResources referenced by the DeckDescriptor are not present in the files, prompt an Error integrated in the widget
  //       - if some selected files are not referenced by the DeckDescriptor, ignore them, filter them out
  //     - an "upload" button on the right of the file input, to start the saving process
  //       - save the DeckDescriptor and its DeckResources on IndexedDB
  //       - show the new "pending" deck in the list of decks when the DeckDescriptor has been saved even if all or some DeckResources are still to be saved
  //       - the new shown deck list item must be expanded to show all the DeckResources associated
  //     - a "close" button on the right, to hide the widget
  // - take care of the validation of DeckDescriptors and DeckResources

  // public methods

  compressDeck(descriptor, resources) {
    // TODO
    // compress (zip) an instance of DeckDescriptor and many instances of DeckResource into a .zip file (blob)
  }

  extractDeckObject(zip) {
    // TODO
    // extract (unzip) a DeckObject and many DeckResources objects from a .zip file (blob)
    // if the argument is not a .zip file, throw error
    // if the .zip file doesn't contain a .deck file, throw error
    // if the .zip file contains files not referenced in the .deck file, ignore them
  }

  onDeckDescriptorUploaded(callback) {
    // TODO
    // called when a DeckDescriptor object has been saved on IndexedDB
    // callback takes a DeckDescriptor argument
  }

  onDeckResourceUploaded(callback) {
    // TODO
    // called when a DeckResource object has been saved on IndexedDB
    // callback takes a DeckResource argument
  }

  onDeckUploaded(callback) {
    // TODO
    // called when the DeckDescriptor and all of its DeckResources of a Deck have been saved on IndexedDB
    // callback takes a DeckDescriptor argument
  }

  onDeckSelected(callback) {
    // TODO
    // called when the user clicks on "load" for a specific deck that is already saved on IndexedDB
    // callback takes a DeckDescriptor argument
  }

  show() {
    // TODO
  }

  hide() {
    // TODO
  }

  // TODO other public methods if necessary or useful

}

/*
{
  "id": "deck01",
  "title": "Deck Title",
  "cover": "cover_image_of_the_deck.jpg",
  "rules": [
    {
      "title": "Official EN/US"
      "text": null,
      "uri": "https://officialwebsite.com/rules_enUS.pdf"
    },
    {
      "title": null,
      "text": "............",
      "uri": "rules_itIT.jpg"
    },
    {
      "title": null,
      "text": null,
      "uri": "rules_frFR.pdf"
    }
  ],
  cards: [
    {
      "id": "T001",
      "title": "Title of T001",
      "text": "Text of T001",
      "front": "front_of_T001.png",
      "back": "back_of_T.png"
    },
    {
      "id": "D001",
      "title": "Title of D001",
      "text": "Text of D001",
      "front": "front_of_D001.png",
      "back": "back_of_D.png"
    },
    {
      "id": "D002",
      "title": "Title of D002",
      "text": "Text of D002",
      "front": "front_of_D002.png",
      "back": "back_of_D.png"
    },
    {
      "id": "D003",
      "title": "Title of D002",
      "text": "Text of D002",
      "front": "front_of_D002.png",
      "back": "back_of_D.png"
    }
  ]
}
*/
class DeckDescriptor {

    constructor(args = {}) {
        if (typeof args === 'string')
            args = JSON.parse(args);
        if (!args.id)
            throw new Error(`Invalid deck: ${args}`);
        this.title = args.title || args.id || null;
        this.cover = args.cover || null;
        this.cards = [];
        this.rules = [];
        if (!args.cards)
            throw new Error(`Empty deck: ${args.id}`);
        const cards = new Set();
        for (const card of args.cards) {
            card = new CardDescriptor(card);
            if (cards.has(card.id))
                throw new Error(`Duplicate card: ${card.id}`);
            cards.add(card.id);
            this.cards.push(card);
        }
        if (!args.rules)
            return;
        const rules = new Set();
        for (let rule of args.rules) {
            rule = new RuleDescriptor(rule);
            if (rules.has(rule.uri))
                throw new Error(`Duplicate rule: ${rule.uri}`);
            rules.add(rule.uri);
            this.rules.push(rule);
        }
    }

    equals(other) {
        return false; // TODO deep equality check
    }

}

class RuleDescriptor {

    constructor(args = {}) {
        if (typeof args === 'string')
            args = JSON.parse(args);
        if (!args || (!args.text && !args.uri) || (!args.title && !args.uri))
            throw new Error(`Invalid rule: ${args}`);
        this.title = args.title || null;
        this.text = args.text || null;
        this.uri = args.uri || null; // URI: if it doesn't start with "http:" or "https:" it's a DockResource reference
    }

    equals(other) {
        return false; // TODO deep equality check
    }

}

class CardDescriptor {

    constructor(args = {}) {
        if (typeof args === 'string')
            args = JSON.parse(args);
        if (!card || !card.id || (!args.title && !args.text && !args.front))
            throw new Error(`Invalid card: ${args}`);
        this.id = args.id;
        this.title = args.title || null;
        this.text = args.text || null;
        this.front = args.front || null; // URI: if it doesn't start with "http:" or "https:" it's a DockResource reference
        this.back = args.back || null; // URI: if it doesn't start with "http:" or "https:" it's a DockResource reference
    }

    equals(other) {
        return false; // TODO deep equality check
    }

}

/*
{
    "type": "image/jpeg",
    "blob": "............",
    "uri": "deck01/rules_itIT.jpg",
}
{
    "type": "application/pdf",
    "blob": "............",
    "uri": "deck01/rules_frFR.pdf",
}
{
    "type": "image/png",
    "blob": "............",
    "uri": "deck01/front_of_T001.png",
}
{
    "type": "image/png",
    "blob": "............",
    "uri": "deck01/back_of_T.png",
}
*/
class DeckResource {

    constructor(args = {}) {
        if (typeof args === 'string')
            args = JSON.parse(args);
        if (!args.deck || !args.uri || !args.type || !args.blob)
            throw new Error(`Invalid resource: ${args}`);
        this.deck = args.deck;
        this.uri = args.uri;
        this.type = args.type;
        this.blob = args.blob;
    }

    equals(other) {
        return false; // TODO deep equality check
    }

}