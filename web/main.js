import { P2PSocket } from './p2p.js';
import { P2PRandom } from './p2p_random.js';
import { ChatWidget } from './chat.js';
import { GameBoard } from './board.js';
import { LoginForm } from './login.js';

export var p2pRandom;

document.addEventListener('DOMContentLoaded', () => {

  const login = new LoginForm();
  const board = new GameBoard({
    containerSelector: null,
    width: 5000,
    height: 5000,
    levelsCount: 5,
    initialLevel: 5
  });
  const chat = new ChatWidget();
  const socket = new P2PSocket();

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
  }

  // Gestione evento login tramite il componente LoginForm
  login.onLogin((peerName) => {
    login.hide();
    socket.bindPeer(peerName);
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
    login.show();
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
    p2pRandom = new P2PRandom(socket);
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
    }
  });

  // Mostra il login all'avvio
  login.show();

});