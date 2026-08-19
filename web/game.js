import { P2PSocket } from './p2p.js';
import { ChatWidget } from './chat.js';
import { GameBoard } from './board.js';

document.addEventListener('DOMContentLoaded', () => {

  const loginDiv = document.getElementById('login');
  const peerInput = document.getElementById('peer-input');
  const board = new GameBoard({
    containerSelector: null,
    width: 5000,
    height: 5000,
    levelsCount: 5,
    initialLevel: 5, // Avvio a Livello 5 (100% Zoom)
    onZoomChange: (level, scale) => {
      const percentage = Math.round(scale * 100);
      document.getElementById('zoom-indicator').textContent = `Lvl ${level}/5 (${percentage}%)`;
    }
  });
  const chat = new ChatWidget();
  const socket = new P2PSocket();

  function hideLogin() {
    loginDiv.style.display = 'none';
  }

  function showLogin() {
    login.style.display = 'block';
    peerInput.focus();
  }

  function hideGame() {
    board.hide();
    chat.hide();
  }

  function showGame() {
    board.show();
    chat.show();
    // Inserimento elementi di esempio (Carte di Gioco) posizionati in modo assoluto
    const content = board.getContentContainer();

    const card1 = document.createElement('div');
    card1.className = 'game-card';
    card1.style.left = '2400px';
    card1.style.top = '2375px';
    card1.innerHTML = `
      <div class="game-card__title">Carta Centro</div>
      <div class="game-card__body">Coordinate: (2400, 2375)</div>
    `;

    const card2 = document.createElement('div');
    card2.className = 'game-card';
    card2.style.left = '2620px';
    card2.style.top = '2375px';
    card2.style.background = 'linear-gradient(135deg, #ec4899, #d946ef)';
    card2.innerHTML = `
      <div class="game-card__title">Carta Incantesimo</div>
      <div class="game-card__body">Coordinate: (2620, 2375)</div>
    `;

    content.appendChild(card1);
    content.appendChild(card2);

    document.getElementById('btn-zoom-in').addEventListener('click', () => board.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => board.zoomOut());
    document.getElementById('btn-center').addEventListener('click', () => board.centerBoard());
  }

  peerInput.addEventListener('keydown', (evt) => {
    if (evt.keyCode === 13) {
      const peerName = peerInput.value.trim();
      if (peerName.length == 0) {
        peerInput.value = "";
        return;
      }
      hideLogin();
      socket.bindPeer(peerName);
    }
  });

  chat.addEventListener('adduser', (evt) => {
    socket.connectToPeer(evt.detail);
  });

  chat.addEventListener('sendmessage', (evt) => {
    const envelope = evt.detail;
    const data = {
      type: "CHAT",
      timestamp: envelope.timestamp,
      text: envelope.text
    };
    if (envelope.recipient == ChatWidget.BROADCAST) {
      data.broadcast = true;
      socket.broadcastData(data);
    } else {
      data.broadcast = false;
      socket.sendData(envelope.recipient, data);
    }
  });

  socket.addEventListener('onPeerCreated', function(evt) {
    showGame();
    chat.setMe(evt.detail.friendlyName);
  });

  socket.addEventListener('onErrorPeerAlreadyExists', function(evt) {
    showLogin();
    alert('Peer name "' + evt.detail.friendlyName + '" already exists, choose another one');
  });

  socket.addEventListener('onErrorPeerNotFound', function(evt) {
    // TODO feedback to chat
    alert('Room "' + evt.detail.friendlyName + '" not found, choose another one');
  });

  socket.addEventListener('onErrorPeerTimeoutOutgoingConnection', function(evt) {
    // TODO feedback to chat
    alert('Connection to room "' + evt.detail.friendlyName + '" timed out, try again');
  });

  socket.addEventListener('onPeerNewConnection', function(evt) {
    chat.addUser({ name: evt.detail.friendlyName, online: true });
    socket.sendData(evt.detail.friendlyName, { type: "REQ_PEER_LIST" });
  });

  socket.addEventListener('onPeerCloseConnection', function(evt) {
    chat.removeUser(evt.detail.friendlyName);
  });

  socket.addEventListener('onPeerDataReceived', function(evt) {
    const envelope = evt.detail;
    const data = envelope.data;
    const type = data.type;
    switch (type) {
      case "PING":
        // TODO
        break;
      case "PONG":
        // TODO
        break;
      case "REQ_PEER_LIST":
        socket.sendData(envelope.friendlyName, { type: "PEER_LIST", peers: socket.getPeerNames() });
        break;
      case "PEER_LIST":
        const myPeerName = socket.getMyPeerName();
        const peerNames = socket.getPeerNames();
        data.peers.forEach((peerName) => {
          if (peerName !== myPeerName && !peerNames.includes(peerName))
            socket.connectToPeer(peerName);
        });
        break;
      case "CHAT":
        chat.receiveMessage({
          timestamp: data.timestamp,
          text: data.text,
          recipient: data.broadcast ? ChatWidget.BROADCAST : ChatWidget.ME,
          sender: envelope.friendlyName
        });
        break;
      default:
        console.error('Unknown "' + type + '" payload type');
    }
  });

  showLogin();

  // Posizioni di tutti i giocatori { peerId: { id, x, y, color } }
  const players = {};

  // Genera un colore univoco per questo client
  const myColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'); // TODO use player's name to generate the color

  // Helper per inizializzare il proprio payload locale prima di inviarlo
  function getMyPayload(x = 100, y = 100) {
    return {
      id: peer ? peer.id : null,
      x: x,
      y: y,
      color: myColor
    };
  }

  function importImg(src) {
    const img = document.createElement('img');
    img.src = src;
    board.appendChild(img);
  }

  // TODO actual game
  // --- LOGICA INPUT & CANVAS ---
//  canvas.addEventListener('mousemove', (evt) => {
//    if (!peer || !players[peer.id]) return;
//
//    const rect = canvas.getBoundingClientRect();
//    const myPosPayload = {
//      id: peer.id,
//      x: evt.clientX - rect.left,
//      y: evt.clientY - rect.top,
//      color: myColor
//    };
//
//    players[peer.id] = myPosPayload;
//    sendToAllPeers(myPosPayload);
//    draw();
//  });

});