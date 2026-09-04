import { P2PSocket } from './p2p.js';
import { P2PRandom } from './p2p_random.js';
import { ChatWidget } from './chat.js';
import { GameBoard } from './board.js';
import { BoardCard } from './piece.js';
import { LoginForm } from './login.js';
import { DeckManager } from './deck.js';

export var p2pRandom;

document.addEventListener('DOMContentLoaded', () => {

//  const login = new LoginForm();
  const board = new GameBoard({
    containerSelector: null,
    width: 5000,
    height: 5000,
    levelsCount: 5,
    initialLevel: 5
  });
  const chat = new ChatWidget();
  const socket = new P2PSocket();

  board.on('select', e => console.log(`piece ${e.piece.id} selected`));
  board.on('deselect', e => console.log(`piece ${e.piece.id} deselected`));
  board.on('detail', e => console.log(`piece ${e.piece.id} details modal`));
  board.on('drag', e => console.log(`piece ${e.piece.id} dragged to ${e.piece.left};${e.piece.top}`));
  board.on('remove', e => console.log(`piece ${e.piece.id} removed`));
  board.on('flip', e => console.log(`piece ${e.piece.id} flipped faceUp: ${e.piece.isFaceUp}`));
  showGame();

  function hideGame() {
    board.hide();
    chat.hide();
  }

  function showGame() {
    board.show();
//    chat.show();
//    let deckManager = new DeckManager();
//    deckManager.show();

    // Example 1: BoardCard with custom HTML element content
    const cardContent = document.createElement('div');
    cardContent.innerHTML = `
      <div class="game-card__title">Carta Centro</div>
      <div class="game-card__body">Coordinate: (2410, 2375)</div>
    `;
    let card1 = new BoardCard({
      front: cardContent
    });
    board.placePiece(card1);
    card1.left = 2410;
    card1.top = 2375;

    // Example 2: BoardCard with image URLs for front and back
//    let card2 = new BoardCard({
//      front: 'https://via.placeholder.com/180x250/6366f1/ffffff?text=Front',
//      back: 'https://via.placeholder.com/180x250/312e81/ffffff?text=Back'
//    });
//    board.placePiece(card2);
//    card2.left = 2620;
//    card2.top = 2375;

    // Example 3: BoardCard relying on default placeholders
    let card3 = new BoardCard();
    board.placePiece(card3);
    card3.left = 2830;
    card3.top = 2375;

//    setTimeout(() => card2.moveTo(2000, 2000), 1000);
  }

  // Gestione evento login tramite il componente LoginForm
//  login.onLogin((peerName) => {
//    login.hide();
//    socket.bindPeer(peerName);
//  });

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
//  login.show();

});