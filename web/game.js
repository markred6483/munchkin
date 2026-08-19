import { P2PSocket } from './p2p.js';
import { ChatWidget } from './chat.js';

document.addEventListener('DOMContentLoaded', () => {

  const loginDiv = document.getElementById('login');
  const peerInput = document.getElementById('peer-input');
  const board = document.getElementById('board');
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
    board.style.display = 'none';
    chat.hide();
  }

  function showGame() {
    board.style.display = 'block';
    window.scrollTo(board.scrollWidth / 2 - document.body.scrollWidth / 2, board.scrollHeight / 2 - document.body.scrollHeight / 2);
    chat.show(); // TODO
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