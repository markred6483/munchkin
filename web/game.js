import { Peer } from 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';

// Elementi DOM
const lobbyEl = document.getElementById('lobby');
const roomInput = document.getElementById('room-input');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');

const myIdEl = document.getElementById('my-id');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let peer = null;
let conn = null;
const otherPlayerPos = { x: -100, y: -100 };

// Prefix per evitare collisioni di ID con altri utenti su PeerJS Cloud
const ROOM_PREFIX = 'mio-gioco-p2p-';

// 1. CREA UNA NUOVA STANZA (HOST)
btnCreate.addEventListener('click', () => {
  let roomId = roomInput.value.trim();

  // Se l'utente non inserisce un nome, ne generiamo uno casuale
  if (!roomId) {
    roomId = 'stanza-' + Math.random().toString(36).substring(2, 7);
  }

  const fullRoomId = ROOM_PREFIX + roomId;
  statusEl.innerText = `Creazione stanza "${roomId}" in corso...`;

  // Creiamo l'host specificando l'ID della stanza
  peer = new Peer(fullRoomId);

  peer.on('open', (id) => {
    hideLobby();
    myIdEl.innerText = `${id.replace(ROOM_PREFIX, '')} (HOST)`;
    statusEl.innerText = `Stanza "${roomId}" creata! In attesa dell'altro giocatore...`;
    statusEl.style.color = '#007acc';
  });

  // Ascolta le connessioni dei client
  peer.on('connection', (incomingConn) => {
    conn = incomingConn;
    setupConnection(conn);
  });

  // Se la stanza con quel nome esiste già
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      statusEl.innerText = `Errore: La stanza "${roomId}" esiste già. Scegli un altro nome o fai "Unisciti".`;
      statusEl.style.color = 'red';
      showLobby();
    }
  });
});

// 2. UNISCITI A UNA STANZA ESISTENTE (GUEST)
btnJoin.addEventListener('click', () => {
  const roomId = roomInput.value.trim();

  if (!roomId) {
    alert('Inserisci il nome della stanza a cui vuoi unirti!');
    return;
  }

  const fullRoomId = ROOM_PREFIX + roomId;
  statusEl.innerText = `Ricerca della stanza "${roomId}"...`;

  // Creiamo un client con ID casuale
  peer = new Peer();

  peer.on('open', (myId) => {
    hideLobby();
    myIdEl.innerText = `${myId} (GUEST)`;

    // Ci connettiamo all'Host usando il nome della stanza
    conn = peer.connect(fullRoomId);
    setupConnection(conn);
  });

  peer.on('error', (err) => {
    statusEl.innerText = `Impossibile connettersi alla stanza "${roomId}". Verifica che il nome sia corretto.`;
    statusEl.style.color = 'red';
    showLobby();
  });
});

// CONFIGURAZIONE DELLA CONNESSIONE P2P
function setupConnection(connection) {
  connection.on('open', () => {
    statusEl.innerText = 'CONNESSO! Muovi il mouse per giocare.';
    statusEl.style.color = 'green';
    canvas.style.display = 'block'; // Mostra il canvas solo a connessione avvenuta
  });

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

// INTERFACCIA
function hideLobby() {
  lobbyEl.style.display = 'none';
}

function showLobby() {
  lobbyEl.style.display = 'block';
  canvas.style.display = 'none';
}

// LOGICA CANVAS E INPUT
canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const myPos = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };

  if (conn && conn.open) {
    conn.send(myPos);
  }

  draw(myPos);
});

function draw(myPos = null) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Altro giocatore (Rosso)
  ctx.beginPath();
  ctx.arc(otherPlayerPos.x, otherPlayerPos.y, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#ff4757';
  ctx.fill();

  // Giocatore locale (Verde)
  if (myPos) {
    ctx.beginPath();
    ctx.arc(myPos.x, myPos.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#2ed573';
    ctx.fill();
  }
}