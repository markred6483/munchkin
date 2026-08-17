import { bindPeer } from '/munchkin/web/p2p.js';
import { connectToPeer } from '/munchkin/web/p2p.js';
import { sendData } from '/munchkin/web/p2p.js';
import { getPeerNames } from '/munchkin/web/p2p.js';
import { getMyPeerName } from '/munchkin/web/p2p.js';

document.addEventListener('DOMContentLoaded', () => {

  const loginDiv = document.getElementById('login');
  const peerInput = document.getElementById('peer-input');
  const lobbyDiv = document.getElementById('lobby');
  const roomInput = document.getElementById('room-input');
  const playersUl = document.getElementById('player-list');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let roomName = null;
  let peerName = null;

  function hideLogin() {
    loginDiv.style.display = 'none';
  }

  function showLogin() {
    login.style.display = 'block';
    peerInput.focus();
  }

  function hideLobby() {
    lobbyDiv.style.display = 'none';
  }

  function showLobby() {
    lobbyDiv.style.display = 'block';
    roomInput.focus();
  }

  function hideGame() {
    canvas.style.display = 'none';
  }

  function showGame() {
    canvas.style.display = 'block';
  }

  peerInput.addEventListener('keydown', (evt) => {
    if (evt.keyCode === 13) {
      peerName = peerInput.value.trim();
      if (peerName.length == 0) {
        peerInput.value = "";
        return;
      }
      hideLogin();
      bindPeer(peerName);
    }
  });

  roomInput.addEventListener('keydown', (evt) => {
    if (evt.keyCode === 13) {
      hideLobby();
      showGame();
      roomName = roomInput.value.trim();
      roomName = roomName.length == 0 ? null : roomName;
      if (roomName)
        connectToPeer(roomName);
      else
        console.log("No room name provided");
    }
  });

  window.addEventListener('onPeerCreated', function(evt) {
    showLobby();
    showGame();
    const li = document.createElement("li");
    li.innerText = evt.detail.friendlyName;
    li.style.fontWeight = "bold";
    playersUl.appendChild(li);
  });

  window.addEventListener('onErrorPeerAlreadyExists', function(evt) {
    showLogin();
    alert('Peer name "' + evt.detail.friendlyName + '" already exists, choose another one');
  });

  window.addEventListener('onErrorPeerNotFound', function(evt) {
    hideGame();
    showLobby();
    alert('Room "' + evt.detail.friendlyName + '" not found, choose another one');
  });

  window.addEventListener('onErrorPeerTimeoutOutgoingConnection', function(evt) {
    hideGame();
    showLobby();
    alert('Connection to room "' + evt.detail.friendlyName + '" timed out, try again');
  });

  window.addEventListener('onPeerNewConnection', function(evt) {
    const li = document.createElement("li");
    li.innerText = evt.detail.friendlyName;
    playersUl.appendChild(li);
    sendData(evt.detail.friendlyName, { type: "REQ_PEER_LIST" });
  });

  window.addEventListener('onPeerCloseConnection', function(evt) {
    const lis = playersUl.children;
    for (let i = 0; i < lis.length; i++) {
      const li = lis[i];
      if (li.innerText === evt.detail.friendlyName) {
        li.remove();
        return;
      }
    }
  });

  window.addEventListener('onPeerDataReceived', function(evt) {
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
        sendData(envelope.friendlyName, { type: "PEER_LIST", peers: getPeerNames() });
        break;
      case "PEER_LIST":
        const myPeerName = getMyPeerName();
        const peerNames = getPeerNames();
        data.peers.forEach((peerName) => {
          if (peerName !== myPeerName && !peerNames.includes(peerName))
            connectToPeer(peerName);
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

  // --- LOGICA INPUT & CANVAS ---
  canvas.addEventListener('mousemove', (evt) => {
    if (!peer || !players[peer.id]) return;

    const rect = canvas.getBoundingClientRect();
    const myPosPayload = {
      id: peer.id,
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
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

});