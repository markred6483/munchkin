class BottoneSpeciale extends HTMLElement {
  constructor() {
    super();
    // Inizializza lo Shadow DOM per incapsulare stile e struttura
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // Il rendering del DOM e gli event listener si mettono qui
    this.shadowRoot.innerHTML = `
      <style>
        button { background-color: #007bff; color: white; padding: 10px; border: none; }
      </style>
      <button><slot>Cliccami</slot></button>
    `;

    this.shadowRoot.querySelector('button').addEventListener('click', () => {
      console.log('Bottone speciale cliccato!');
    });
  }

  saluta() {
    alert('Ciao!');
  }
}

//customElements.define('bottone-speciale', BottoneSpeciale);

function getTotalAncestorScroll(element) {
  let top = 0;
  let left = 0;
  for (let current = element.parentElement; current; current = current.parentElement) {
    top += current.scrollTop;
    left += current.scrollLeft;
  }
  return { top, left };
}