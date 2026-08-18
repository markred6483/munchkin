import { Peer } from 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm';


const ROOM_PREFIX = 'munchkin-with-friends-';
var peer = null; // https://peerjs.com/client/api/peer
var myPeerName = null;
const peers = {}; // https://peerjs.com/client/api/data-connection
const pendingPeers = {};

export function bindPeer(peerName) {
  const fullPeerName = ROOM_PREFIX + peerName;
  console.log('Binding peer "' + peerName + '" (full name: "' + fullPeerName + '")');
  if (peer && !peer.destroyed) { // TODO remove this after making sure it doesn't happen
    console.error("Peer was not null and not destroyed, destroying it now");
    peer.destroy();
  }
  peer = new Peer(fullPeerName);
  myPeerName = peerName;
  peer.on('open', (id) => {
    console.log("Peer ready to accept new connections");
    dispatchEventInternal('onPeerCreated', { fullName: fullPeerName, friendlyName: peerName, id: id });
  });
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      console.log("Peer already exists");
      peer.destroy();
      dispatchEventInternal('onErrorPeerAlreadyExists', { fullName: fullPeerName, friendlyName: peerName, error: err });
    } else if (err.type === 'peer-unavailable') {
      const index = err.message.indexOf(ROOM_PREFIX);
      if (index === -1) {
        console.error("Peer not found, error message does not contain ROOM_PREFIX");
      } else {
        const otherPeerName = err.message.slice(index + ROOM_PREFIX.length);
        const pending = pendingPeers[otherPeerName];
        if (!pending) {
          console.error("Peer not found, error message does not contain a valid peer name");
        } else {
          console.log('Peer not found: ' + otherPeerName);
          clearTimeout(pending.timeout);
          delete pendingPeers[otherPeerName];
          dispatchEventInternal('onErrorPeerNotFound', { friendlyName: otherPeerName, error: err, connection: pending.connection });
        }
      }
    } else {
      console.error(err);
      console.error(JSON.stringify(err));
    }
  });
  peer.on('connection', (conn) => {
    const otherFriendlyName = conn.peer.replace(ROOM_PREFIX, '');
    console.log('New connection from peer: ' + otherFriendlyName);
    setupConnectionInternal(conn);
  });
}

export function connectToPeer(peerName) {
  if (peerName == null)
    return;
  if (peers[peerName]) {
    if (peers[peerName].open)
      return;
    delete peers[peerName];
  }
  const peerFullName = ROOM_PREFIX + peerName;
  const initialConn = peer.connect(peerFullName);
  const timeout = setTimeout(
    () => {
      console.error("Connection to peer timed out: " + peerName);
      delete pendingPeers[peerName];
      dispatchEventInternal('onErrorPeerTimeoutOutgoingConnection', { friendlyName: peerName, connection: initialConn });
    }, 3000);
  pendingPeers[peerName] = { connection: initialConn, timeout: timeout };
  dispatchEventInternal('onPeerInitOutgoingConnection', { friendlyName: peerName, connection: initialConn });
  initialConn.on('open', () => {
    const pending = pendingPeers[peerName];
    if (!pending) {
      console.error("Connection to peer was already removed from pending, this should not happen: " + peerName);
      initialConn.close();
    } else {
      clearTimeout(pending.timeout);
      delete pendingPeers[peerName];
      dispatchEventInternal('onPeerOutgoingConnection', { friendlyName: peerName, connection: initialConn });
    }
  });
  setupConnectionInternal(initialConn);
}

function setupConnectionInternal(conn) {
  const peerName = conn.peer.replace(ROOM_PREFIX, '');
  conn.on('open', () => {
    console.log("Connected to peer: " + peerName);
    peers[peerName] = conn;
    dispatchEventInternal('onPeerNewConnection', { friendlyName: peerName, connection: conn });
  });
  conn.on('data', (data) => {
    console.log("Data received from peer: " + peerName)
    dispatchEventInternal('onPeerDataReceived', { friendlyName: peerName, data: data, connection: conn });
  });
  conn.on('close', () => {
    console.log("Connection closed: " + peerName)
    delete peers[peerName];
    dispatchEventInternal('onPeerCloseConnection', { friendlyName: peerName, connection: conn });
  });
  conn.on('error', (err) => {
    console.error(err);
    console.error(JSON.stringify(err));
  });
  console.log("Connection set up: " + peerName);
}

export function broadcastData(data) {
  if (!data["timestamp"])
    data["timestamp"] = Date.now();
  Object.values(peers).forEach((conn) => sendDataInternal(conn, data));
}

export function sendData(peerName, data) {
  if (!data["timestamp"])
    data["timestamp"] = Date.now();
  sendDataInternal(peers[peerName], data);
}

export function getPeerNames() {
    return Object.keys(peers);
}

export function getMyPeerName() {
  return myPeerName;
}

function sendDataInternal(conn, data) {
  if (conn.open)
    conn.send(data);
  else
    console.error("Connection to peer is not open, cannot send data: " + conn.peer);
}

function dispatchEventInternal(evtName, data) {
  window.dispatchEvent(new CustomEvent(evtName, { detail: data }));
}