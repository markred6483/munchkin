import { Peer } from 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';

const myIdEl = document.getElementById('my-id');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let conn = null;
const otherPlayerPos = { x: -100, y: -100 };

// 1. Controlliamo se c'è un ID stanza nell'URL (dopo il simbolo #)
const roomIdFromUrl = window.location.hash.substring(1);

if (!roomIdFromUrl) {
  // --- RUOLO: HOST ---
  // Generiamo un ID univoco casuale per la nostra stanza
  const newRoomId = 'stanza-' + Math.random().toString(36).substring(2, 7);

  // Aggiorniamo l'URL della pagina senza ricaricarla
  window.location.hash = newRoomId;

  const hostPeer = new Peer(newRoomId);

  hostPeer.on('open', (id) => {
    myIdEl.innerText = `${id} (Sei l'HOST)`;
    statusEl.innerHTML = `Stanza creata! Apri questa pagina in un'altra scheda o invia il link:<br><strong>${window.location.href}</strong>`;
    statusEl.style.color = '#007acc';
  });

  // Aspettiamo che il client (Guest) si connetta
  hostPeer.on('connection', (incomingConn) => {
    conn = incomingConn;
    setupConnection(conn);
  });

} else {
  // --- RUOLO: GUEST (GIOCHATORE 2) ---
  const guestPeer = new Peer();

  guestPeer.on('open', (myId) => {
    myIdEl.innerText = `${myId} (Sei il GUEST)`;
    statusEl.innerText = `Connessione in corso all'host (${roomIdFromUrl})...`;

    // Ci connettiamo direttamente all'ID preso dall'URL
    conn = guestPeer.connect(roomIdFromUrl);
    setupConnection(conn);
  });
}

// Configurazione comune della connessione P2P
function setupConnection(connection) {
  connection.on('open', () => {
    statusEl.innerText = 'CONNESSO! Muovi il mouse sul canvas per giocare.';
    statusEl.style.color = 'green';
  });

  // Ricezione dati dall'altro giocatore
  connection.on('data', (data) => {
    otherPlayerPos.x = data.x;
    otherPlayerPos.y = data.y;
    draw();
  });

  connection.on('close', () => {
    statusEl.innerText = 'L\'altro giocatore si è disconnesso.';
    statusEl.style.color = 'orange';
  });
}

// GESTIONE CANVAS E INPUT MOUSE
canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const myPos = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };

  // Se la connessione è attiva, invia i dati
  if (conn && conn.open) {
    conn.send(myPos);
  }

  draw(myPos);
});

function draw(myPos = null) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Disegna l'altro giocatore (pallino rosso)
  ctx.beginPath();
  ctx.arc(otherPlayerPos.x, otherPlayerPos.y, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#ff4757';
  ctx.fill();

  // Disegna il giocatore locale (pallino verde)
  if (myPos) {
    ctx.beginPath();
    ctx.arc(myPos.x, myPos.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#2ed573';
    ctx.fill();
  }
}