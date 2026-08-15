import { Peer } from 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';

document.addEventListener('DOMContentLoaded', () => {

  const lobbyEl = document.getElementById('lobby');
  const roomInput = document.getElementById('room-input');
  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');

  const myIdEl = document.getElementById('my-id');
  const statusEl = document.getElementById('status');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let peer = null;

  // Connessioni P2P dirette attive con tutti gli altri giocatori
  const directConnections = {};

  // Posizioni di tutti i giocatori { peerId: { id, x, y, color } }
  const players = {};

  const ROOM_PREFIX = 'mio-gioco-p2p-mesh-v2-';

  // Genera un colore univoco per questo client
  const myColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

  // Helper per inizializzare il proprio payload locale prima di inviarlo
  function getMyPayload(x = 100, y = 100) {
    return {
      id: peer ? peer.id : null,
      x: x,
      y: y,
      color: myColor
    };
  }

  // 1. CREA STANZA (HOST INIZIALE)
  btnCreate.addEventListener('click', () => {
    let roomId = roomInput.value.trim() || 'stanza-' + Math.random().toString(36).substring(2, 7);
    const fullRoomId = ROOM_PREFIX + roomId;

    statusEl.innerText = `Creazione stanza "${roomId}" in corso...`;

    if (peer) peer.destroy();
    peer = new Peer(fullRoomId);

    peer.on('open', (id) => {
      // Inizializza la posizione locale standard per il giocatore
      players[id] = getMyPayload(150, 150);

      hideLobby();
      myIdEl.innerText = `${id.replace(ROOM_PREFIX, '')} (HOST INIZIALE)`;
      statusEl.innerText = `Stanza creata! In attesa di altri giocatori...`;
      statusEl.style.color = '#007acc';
      canvas.style.display = 'block';
      draw();
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        statusEl.innerText = `La stanza "${roomId}" esiste già. Scegli un altro nome o fai "Unisciti".`;
        statusEl.style.color = 'red';
        showLobby();
      }
    });
  });

  // 2. UNISCITI A STANZA (GUEST)
  btnJoin.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    if (!roomId) return alert('Inserisci il nome della stanza!');

    const fullRoomId = ROOM_PREFIX + roomId;
    statusEl.innerText = `Connessione alla stanza "${roomId}"...`;

    if (peer) peer.destroy();
    peer = new Peer();

    peer.on('open', (myId) => {
      // Inizializza la posizione locale standard per il giocatore
      players[myId] = getMyPayload(200, 200);

      hideLobby();
      myIdEl.innerText = `${myId} (GIOCATORE)`;

      // Ci connettiamo prima all'Host iniziale per entrare nella rete Mesh
      const initialConn = peer.connect(fullRoomId);
      setupConnection(initialConn);
    });

    peer.on('connection', (conn) => {
      // Connessioni in arrivo da altri Guest della rete Mesh
      setupConnection(conn);
    });

    peer.on('error', () => {
      statusEl.innerText = `Impossibile trovare la stanza "${roomId}".`;
      statusEl.style.color = 'red';
      showLobby();
    });
  });

  // --- GESTIONE DELLE CONNESSIONI DIRETTE P2P ---
  function setupConnection(conn) {
    conn.on('open', () => {
      directConnections[conn.peer] = conn;

      // Mostriamo il canvas a chiunque si connetta
      canvas.style.display = 'block';

      // Invia la nostra posizione iniziale al nuovo partecipante
      if (peer && players[peer.id]) {
        conn.send(players[peer.id]);
      }

      // Invia l'elenco dei nodi noti per stabilire la Mesh
      const knownPeerIds = Object.keys(directConnections);
      conn.send({ type: 'PEER_LIST', peers: knownPeerIds });

      updateStatus();
    });

    conn.on('data', (data) => {
      // Caso A: Riceviamo l'elenco dei peer della stanza
      if (data.type === 'PEER_LIST') {
        data.peers.forEach((peerId) => {
          if (peerId !== peer.id && !directConnections[peerId]) {
            const newConn = peer.connect(peerId);
            setupConnection(newConn);
          }
        });
        return;
      }

      // Caso B: Riceviamo l'aggiornamento della posizione
      players[data.id] = data;
      draw();
    });

    conn.on('close', () => {
      delete directConnections[conn.peer];
      delete players[conn.peer];
      updateStatus();
      draw();
    });
  }

  // BROADCAST DIRETTO A TUTTI I PEER
  function sendToAllPeers(payload) {
    Object.values(directConnections).forEach((conn) => {
      if (conn.open) {
        conn.send(payload);
      }
    });
  }

  // --- LOGICA INPUT & CANVAS ---
  canvas.addEventListener('mousemove', (event) => {
    if (!peer || !players[peer.id]) return;

    const rect = canvas.getBoundingClientRect();
    const myPosPayload = {
      id: peer.id,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      color: myColor
    };

    players[peer.id] = myPosPayload;
    sendToAllPeers(myPosPayload);
    draw();
  });

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    Object.values(players).forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#2ed573';
      ctx.fill();

      // Disegna un bordo nero attorno al proprio pallino locale
      if (p.id === peer?.id) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.stroke();
      }
      ctx.closePath();
    });
  }

  function updateStatus() {
    const totalCount = Object.keys(directConnections).length + 1;
    statusEl.innerText = `Connessioni dirette P2P: ${totalCount - 1} | Giocatori totali: ${totalCount}`;
    statusEl.style.color = 'green';
  }

  function hideLobby() { lobbyEl.style.display = 'none'; }
  function showLobby() { lobbyEl.style.display = 'block'; canvas.style.display = 'none'; }
});