/*
{
  title: "Deck Title",
  cover: "p2p:cover_image_of_the_deck.jpg",
  rules: [
    {
      "title": "Official EN/US"
      "text": null,
      "uri": "https://officialwebsite.com/rules_enUS.pdf"
    },
    {
      "title": null,
      "text": ".................",
      "uri": "p2p:rules_itIT.png"
  ],
  cards: [
    {
      "id": "T0101",
      "title": "Title of T01001",
      "text": "Text of T01001",
      "front": "p2p:front_of_T01001.png",
      "back": "p2p:back_of_T.png"
    },
    {
      "id": "D0101",
      "title": "Title of D01001",
      "text": "Text of D01001",
      "front": "p2p:front_of_D01001.png",
      "back": "p2p:back_of_D.png"
    },
    {
      "id": "D0102",
      "title": "Title of D01002",
      "text": "Text of D01002",
      "front": "p2p:front_of_D01002.png",
      "back": "p2p:back_of_D.png"
    }
  ]
}
*/
class DeckDescriptor {

    constructor(args = {}) {
        if (typeof args === 'string')
            args = JSON.parse(args);
        this.title = args.title ? args.title : null;
        this.cover = args.cover ? args.cover : null;
        this.cards = [];
        this.rules = [];
        if (!args.cards)
            throw new Error(`Empty deck: ${args.title}`);
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

}

class RuleDescriptor {

    constructor(args = {}) {
        if (typeof args === 'string')
            args = JSON.parse(args);
        if (!args || (!args.text && !args.uri))
            throw new Error(`Invalid rule: ${rule}`);
        this.title = args.title ? args.title : null;
        this.text = args.text ? args.text : null;
        this.uri = args.uri ? args.uri : null;
    }

}

class CardFile {

    constructor(args = {}) {
        if (typeof args === 'string')
            args = JSON.parse(args);
        if (!card || (!args.title && !args.text && !args.front))
            throw new Error(`Invalid card: ${card}`);
        this.title = args.title;
        this.text = args.text;
        this.front = args.front ? new ViewFile(args.front) : null;
        this.back = args.back ? new ViewFile(args.back) : null;
    }

}

/*
{
    "name": null,
    "type": null,
    "content": null,
    "uri": "https://officialwebsite.com/rules_enUS.pdf",
    "width": "500px",
    "height": "300px"
}
*/
class DeckResource {

    constructor(args = {}) {
        if (typeof args === 'string')
            args = JSON.parse(args);
        this.name = args.name;
        this.type = args.type;
        this.content = args.content;
        this.uri = args.uri;
        this.width = args.width;
        this.height = args.height;
    }

}