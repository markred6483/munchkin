import { bindPeer } from '/munchkin/web/p2p.js';
import { connectToPeer } from '/munchkin/web/p2p.js';
import { sendData } from '/munchkin/web/p2p.js';
import { broadcastData } from '/munchkin/web/p2p.js';
import { getPeerNames } from '/munchkin/web/p2p.js';
import { getMyPeerName } from '/munchkin/web/p2p.js';

import { ChatWidget } from './chat.js';

document.addEventListener('DOMContentLoaded', () => {

  const loginDiv = document.getElementById('login');
  const peerInput = document.getElementById('peer-input');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let roomName = null;
  let peerName = null;
  let chat = new ChatWidget();

  function hideLogin() {
    loginDiv.style.display = 'none';
  }

  function showLogin() {
    login.style.display = 'block';
    peerInput.focus();
  }

  function hideGame() {
    canvas.style.display = 'none';
    chat.hide();
  }

  function showGame() {
    canvas.style.display = 'block';
    chat.show();
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

  chat.addEventListener('adduser', (evt) => {
    connectToPeer(evt.detail.name);
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
      broadcastData(data);
    } else {
      data.broadcast = false;
      sendData(envelope.recipient, data);
    }
  });

  window.addEventListener('onPeerCreated', function(evt) {
    showGame();
    // TODO set me
  });

  window.addEventListener('onErrorPeerAlreadyExists', function(evt) {
    showLogin();
    alert('Peer name "' + evt.detail.friendlyName + '" already exists, choose another one');
  });

  window.addEventListener('onErrorPeerNotFound', function(evt) {
    // TODO feedback to chat
    alert('Room "' + evt.detail.friendlyName + '" not found, choose another one');
  });

  window.addEventListener('onErrorPeerTimeoutOutgoingConnection', function(evt) {
    // TODO
    alert('Connection to room "' + evt.detail.friendlyName + '" timed out, try again');
  });

  window.addEventListener('onPeerNewConnection', function(evt) {
    chat.addUser({ name: evt.detail.friendlyName, online: true });
    sendData(evt.detail.friendlyName, { type: "REQ_PEER_LIST" });
  });

  window.addEventListener('onPeerCloseConnection', function(evt) {
    chat.removeUser(evt.detail.friendlyName);
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