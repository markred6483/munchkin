import { Peer } from 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm';

export class P2PSocket extends EventTarget {

  constructor(options = {}) {
    super();
    this.namesPrefix = 'p2p-friends-';
    this.myPeerName = null;
    this.myPeer = null; // https://peerjs.com/client/api/peer
    this.peers = {}; // https://peerjs.com/client/api/data-connection
    this.pendingPeers = {}; // { peerName: { connection, timeout } }
  }

  bindPeer(peerName) {
    const fullPeerName = this.namesPrefix + peerName;
    console.log('Binding peer "' + peerName + '" (full name: "' + fullPeerName + '")');
    if (this.myPeer && !this.myPeer.destroyed) { // TODO remove this after making sure it doesn't happen
      console.error("Peer was not null and not destroyed, destroying it now");
      this.myPeer.destroy();
    }
    this.myPeer = new Peer(fullPeerName);
    this.myPeerName = peerName;
    this.myPeer.on('open', (id) => {
      console.log("Peer ready to accept new connections");
      this._dispatchEvent('onPeerCreated', { fullName: fullPeerName, friendlyName: peerName, id: id });
    });
    this.myPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        console.log("Peer already exists");
        this.myPeer.destroy();
        this._dispatchEvent('onErrorPeerAlreadyExists', { fullName: fullPeerName, friendlyName: peerName, error: err });
      } else if (err.type === 'peer-unavailable') {
        const index = err.message.indexOf(this.namesPrefix);
        if (index === -1) {
          console.error("Peer not found, error message does not contain namesPrefix");
        } else {
          const otherPeerName = err.message.slice(index + this.namesPrefix.length);
          const pending = this.pendingPeers[otherPeerName];
          if (!pending) {
            console.error("Peer not found, error message does not contain a valid peer name");
          } else {
            console.log('Peer not found: ' + otherPeerName);
            clearTimeout(pending.timeout);
            delete this.pendingPeers[otherPeerName];
            this._dispatchEvent('onErrorPeerNotFound', { friendlyName: otherPeerName, error: err, connection: pending.connection });
          }
        }
      } else {
        console.error(err);
        console.error(JSON.stringify(err));
      }
    });
    this.myPeer.on('connection', (conn) => {
      const otherFriendlyName = conn.peer.replace(this.namesPrefix, '');
      console.log('New connection from peer: ' + conn.peer);
      this._setupConnection(conn);
    });
  }

  connectToPeer(peerName) {
    if (peerName == null)
      return;
    if (this.peers[peerName]) {
      if (this.peers[peerName].open)
        return;
      delete this.peers[peerName];
    }
    const peerFullName = this.namesPrefix + peerName;
    const initialConn = this.myPeer.connect(peerFullName);
    const timeout = setTimeout(
      () => {
        console.error("Connection to peer timed out: " + peerName);
        delete this.pendingPeers[peerName];
        this._dispatchEvent('onErrorPeerTimeoutOutgoingConnection', { friendlyName: peerName, connection: initialConn });
      }, 3000);
    this.pendingPeers[peerName] = { connection: initialConn, timeout: timeout };
    this._dispatchEvent('onPeerInitOutgoingConnection', { friendlyName: peerName, connection: initialConn });
    initialConn.on('open', () => {
      const pending = this.pendingPeers[peerName];
      if (!pending) {
        console.error("Connection to peer was already removed from pending, this should not happen: " + peerName);
        initialConn.close();
      } else {
        clearTimeout(pending.timeout);
        delete this.pendingPeers[peerName];
        this._dispatchEvent('onPeerOutgoingConnection', { friendlyName: peerName, connection: initialConn });
      }
    });
    this._setupConnection(initialConn);
  }

  broadcastData(data) {
    if (!data["timestamp"])
      data["timestamp"] = Date.now();
    Object.values(this.peers).forEach((conn) => this._sendData(conn, data));
  }

  sendData(peerName, data) {
    if (!data["timestamp"])
      data["timestamp"] = Date.now();
    this._sendData(this.peers[peerName], data);
  }

  getPeerNames() {
    return Object.keys(this.peers);
  }

  getMyPeerName() {
    return this.myPeerName;
  }

  _setupConnection(conn) {
    const peerName = conn.peer.replace(this.namesPrefix, '');
    conn.on('open', () => {
      console.log("Connected to peer: " + conn.peer);
      this.peers[peerName] = conn;
      this._dispatchEvent('onPeerNewConnection', { friendlyName: peerName, connection: conn });
    });
    conn.on('data', (data) => {
      console.log("Received data " + data.type + " from peer: " + conn.peer);
      this._dispatchEvent('onPeerDataReceived', { friendlyName: peerName, data: data, connection: conn });
    });
    conn.on('close', () => {
      console.log("Connection closed: " + conn.peer)
      delete this.peers[peerName];
      this._dispatchEvent('onPeerCloseConnection', { friendlyName: peerName, connection: conn });
    });
    conn.on('error', (err) => {
      console.error(err);
      console.error(JSON.stringify(err));
    });
    console.log("Connection set up: " + conn.peer);
  }

  _sendData(conn, data) {
    if (!conn.open) {
      console.error("Connection to peer is not open, cannot send data: " + conn.peer);
      return;
    }
    console.log("Sending data " + data.type + " to peer: " + conn.peer);
    conn.send(data);
  }

  _dispatchEvent(evtName, data) {
    this.dispatchEvent(new CustomEvent(evtName, { detail: data }));
  }

}