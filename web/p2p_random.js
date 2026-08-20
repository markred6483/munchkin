/**
 * P2PRandom - Serverless, Provably Fair Peer-to-Peer Random Number Generator
 *
 * Implements a 4-Phase Zero-Trust Cryptographic Protocol using WebCrypto (ECDSA P-256 / SHA-256):
 *   Phase 0: Lobby Lock & Ephemeral SPKI Public Key Consensus
 *   Phase 1: Secret Seed Generation & Hash Commitment
 *   Phase 2: Seed Contribution Exchange, Signature Verification & Full-Mesh Echo Gossip
 *   Phase 3: Reveal Phase, Hash/Signature Validation & XOR OTP Float Normalization
 *   Phase 4: Timeout Safeguards & Disconnect Detection
 */
export class P2PRandom {
  /**
   * @param {Object} p2pSocket - An instance of P2PSocket.
   * @param {number} [timeoutMs=5000] - Configurable protocol stage timeout in milliseconds.
   */
  constructor(p2pSocket, timeoutMs = 5000) {
    if (!p2pSocket) {
      throw new Error("P2PRandom constructor requires a valid P2PSocket instance.");
    }
    this.socket = p2pSocket;
    this.timeoutMs = timeoutMs;

    this.keyPair = null;
    this.publicKeys = {}; // friendlyName -> CryptoKey
    this.spkiKeys = {};   // friendlyName -> Hex string
    this.isInitialized = false;

    this.listeners = new Set();
    this.activeRounds = new Map(); // roundId -> RoundState object

    this._boundOnDataReceived = this._onDataReceived.bind(this);
    this.socket.addEventListener('onPeerDataReceived', this._boundOnDataReceived);
  }

  /**
   * Phase 0: Lobby Lock & Root of Trust Setup
   * Performs ephemeral key generation, SPKI broadcast, canonical lobby state hashing,
   * and multi-peer hash consensus verification before unlocking the game session.
   *
   * @returns {Promise<void>}
   */
  async init() {
    const myName = this.socket.getMyPeerName();
    if (!myName) {
      throw new Error("P2PSocket is not bound to a local peer name.");
    }

    const peerNames = this.socket.getPeerNames();

    // 1. WebCrypto Ephemeral Key Generation (ECDSA P-256 / SHA-256)
    this.keyPair = await window.crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );

    // 2. Export Local Public Key to SPKI format
    const spkiBuf = await window.crypto.subtle.exportKey("spki", this.keyPair.publicKey);
    const spkiHex = this._bufToHex(spkiBuf);

    // 3. Broadcast SPKI Key to all peers
    this.socket.broadcastData({
      type: 'KEY_EXCHANGE',
      sender: myName,
      spki: spkiHex
    });

    // 4. Collect SPKI Keys from connected peers
    const keyExMsgs = await this._collectFromPeers(
      peerNames,
      (msg) => msg.data && msg.data.type === 'KEY_EXCHANGE',
      this.timeoutMs,
      'Key Exchange'
    );

    // 5. Construct Canonical Lobby Map
    const lobbyMap = {};
    lobbyMap[myName] = spkiHex;
    for (const peerName of peerNames) {
      const msg = keyExMsgs.get(peerName);
      lobbyMap[peerName] = msg.data.spki;
    }

    // 6. Compute Hash of Canonical Lobby State JSON
    const canonicalLobbyStr = this._canonicalJson(lobbyMap);
    const lobbyHashBuf = await window.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalLobbyStr)
    );
    const myLobbyHash = this._bufToHex(lobbyHashBuf);

    // 7. Broadcast Lobby Hash Consensus Commitment
    this.socket.broadcastData({
      type: 'LOBBY_HASH',
      sender: myName,
      hash: myLobbyHash
    });

    // 8. Collect Lobby Hashes from all peers
    const hashMsgs = await this._collectFromPeers(
      peerNames,
      (msg) => msg.data && msg.data.type === 'LOBBY_HASH',
      this.timeoutMs,
      'Lobby Hash Consensus'
    );

    // 9. Validate Consensus across all peers
    for (const [peerName, msg] of hashMsgs.entries()) {
      if (msg.data.hash !== myLobbyHash) {
        throw new Error(`Lobby consensus failure: Hash mismatch from peer "${peerName}"`);
      }
    }

    // 10. Import CryptoKeys into Local Key Ring
    this.publicKeys = {};
    this.spkiKeys = lobbyMap;

    for (const [pName, hexKey] of Object.entries(lobbyMap)) {
      const rawBuf = this._hexToBuf(hexKey);
      const importedKey = await window.crypto.subtle.importKey(
        "spki",
        rawBuf,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"]
      );
      this.publicKeys[pName] = importedKey;
    }

    this.isInitialized = true;
  }

  /**
   * Initiates a provably fair cryptographic random roll.
   * Executes commitment, seed contribution exchange, cross-echo gossip, and verification.
   *
   * @returns {Promise<number>} Resolves to a float in range [0, 1)
   */
  async random() {
    if (!this.isInitialized) {
      throw new Error("P2PRandom is not initialized. Call init() first.");
    }

    const peerNames = this.socket.getPeerNames();
    const myPeerName = this.socket.getMyPeerName();

    // Solo Mode Fallback (0 peers)
    if (peerNames.length === 0) {
      const seed = window.crypto.getRandomValues(new Uint8Array(32));
      return this._seedToFloat(seed);
    }

    const roundId = `${myPeerName}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const roundState = this._createRoundState(roundId, myPeerName, true);
    this.activeRounds.set(roundId, roundState);

    try {
      return await this._executeRollingRound(roundState);
    } finally {
      this.activeRounds.delete(roundId);
    }
  }

  // =========================================================================
  // PROTOCOL EXECUTION ENGINES
  // =========================================================================

  /**
   * Internal execution pipeline for the peer initiating the roll.
   */
  async _executeRollingRound(roundState) {
    const myPeerName = this.socket.getMyPeerName();

    // Phase 1: Commitment Generation
    const seed_a = window.crypto.getRandomValues(new Uint8Array(32));
    const seed_a_hex = this._bufToHex(seed_a);

    roundState.rawSeedBuf = seed_a;
    roundState.rawSeedHex = seed_a_hex;

    const hash_a_buf = await window.crypto.subtle.digest("SHA-256", seed_a);
    const hash_a_hex = this._bufToHex(hash_a_buf);

    const sig_a_buf = await window.crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      this.keyPair.privateKey,
      hash_a_buf
    );
    const sig_a_hex = this._bufToHex(sig_a_buf);

    const payloadA = {
      type: 'COMMIT',
      roundId: roundState.roundId,
      hash: hash_a_hex,
      signature: sig_a_hex,
      sender: myPeerName
    };

    // Record local commitment payload
    const keyA = `COMMIT:${myPeerName}`;
    roundState.payloads.set(keyA, payloadA);
    roundState.seeds.set(myPeerName, seed_a);
    const pHashA = await this._hashPayload(payloadA);
    roundState.payloadHashes.set(keyA, pHashA);

    // Broadcast Commitment
    this.socket.broadcastData(payloadA);

    // Await protocol completion promise (Phase 2 gossip verification & Phase 3 reveal)
    return await roundState.promise;
  }

  /**
   * Internal execution pipeline for non-rolling peers reacting to a roll commitment.
   */
  async _handleNonRollingRound(roundState, initialCommitMsg) {
    // Process initial COMMIT payload
    await this._processMessageForRound(roundState, initialCommitMsg);

    if (roundState.rejected || roundState.resolved) return;

    const myPeerName = this.socket.getMyPeerName();

    // Phase 2: Generate Seed Contribution
    const seed_b_i = window.crypto.getRandomValues(new Uint8Array(32));
    const seed_b_i_hex = this._bufToHex(seed_b_i);

    const sig_b_i_buf = await window.crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      this.keyPair.privateKey,
      seed_b_i
    );
    const sig_b_i_hex = this._bufToHex(sig_b_i_buf);

    const payloadB = {
      type: 'SEED_CONTRIBUTION',
      roundId: roundState.roundId,
      seed: seed_b_i_hex,
      signature: sig_b_i_hex,
      sender: myPeerName
    };

    // Store local payload B
    const keyB = `SEED_CONTRIBUTION:${myPeerName}`;
    roundState.payloads.set(keyB, payloadB);
    roundState.seeds.set(myPeerName, seed_b_i);
    const pHashB = await this._hashPayload(payloadB);
    roundState.payloadHashes.set(keyB, pHashB);

    // Broadcast Contribution to all peers
    this.socket.broadcastData(payloadB);

    // Evaluate state completion with buffered messages
    this._checkRoundCompletion(roundState);
  }

  /**
   * Processes incoming socket messages sequentially within a round state queue.
   */
  async _processMessageForRound(roundState, msg) {
    if (roundState.resolved || roundState.rejected) return;

    const { sender, data } = msg;
    const { type } = data;

    try {
      if (type === 'COMMIT') {
        const key = `COMMIT:${sender}`;
        if (roundState.payloads.has(key)) return;

        const senderPublicKey = this.publicKeys[sender];
        if (!senderPublicKey) {
          throw new Error(`Unknown public key for peer "${sender}"`);
        }

        const hashBuf = this._hexToBuf(data.hash);
        const sigBuf = this._hexToBuf(data.signature);

        const isValid = await window.crypto.subtle.verify(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          senderPublicKey,
          sigBuf,
          hashBuf
        );

        if (!isValid) {
          throw new Error(`Invalid COMMIT signature from peer "${sender}"`);
        }

        roundState.payloads.set(key, data);
        const pHash = await this._hashPayload(data);
        roundState.payloadHashes.set(key, pHash);

        // Broadcast Echo gossip payload
        if (sender !== this.socket.getMyPeerName()) {
          this.socket.broadcastData({
            type: 'ECHO',
            roundId: roundState.roundId,
            originalSender: sender,
            targetPayloadType: 'COMMIT',
            payloadHash: pHash,
            sender: this.socket.getMyPeerName()
          });
        }

        this._verifyEchoesForPayload(roundState, key, pHash);

      } else if (type === 'SEED_CONTRIBUTION') {
        const key = `SEED_CONTRIBUTION:${sender}`;
        if (roundState.payloads.has(key)) return;

        const senderPublicKey = this.publicKeys[sender];
        if (!senderPublicKey) {
          throw new Error(`Unknown public key for peer "${sender}"`);
        }

        const seedBuf = this._hexToBuf(data.seed);
        const sigBuf = this._hexToBuf(data.signature);

        const isValid = await window.crypto.subtle.verify(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          senderPublicKey,
          sigBuf,
          seedBuf
        );

        if (!isValid) {
          throw new Error(`Invalid SEED_CONTRIBUTION signature from peer "${sender}"`);
        }

        roundState.payloads.set(key, data);
        roundState.seeds.set(sender, seedBuf);
        const pHash = await this._hashPayload(data);
        roundState.payloadHashes.set(key, pHash);

        // Broadcast Echo gossip payload
        if (sender !== this.socket.getMyPeerName()) {
          this.socket.broadcastData({
            type: 'ECHO',
            roundId: roundState.roundId,
            originalSender: sender,
            targetPayloadType: 'SEED_CONTRIBUTION',
            payloadHash: pHash,
            sender: this.socket.getMyPeerName()
          });
        }

        this._verifyEchoesForPayload(roundState, key, pHash);

      } else if (type === 'ECHO') {
        const key = `${data.targetPayloadType}:${data.originalSender}`;
        if (!roundState.echoes.has(key)) {
          roundState.echoes.set(key, new Map());
        }
        const echoMap = roundState.echoes.get(key);
        echoMap.set(sender, data.payloadHash);

        // Immediate hash matching cross-verification
        if (roundState.payloadHashes.has(key)) {
          const expectedHash = roundState.payloadHashes.get(key);
          if (data.payloadHash !== expectedHash) {
            throw new Error(`Equivocation detected: Peer "${sender}" sent mismatched echo hash for payload from "${data.originalSender}"`);
          }
        }

      } else if (type === 'REVEAL') {
        const key = `REVEAL:${sender}`;
        if (roundState.payloads.has(key)) return;

        const commitPayload = roundState.payloads.get(`COMMIT:${sender}`);
        if (!commitPayload) {
          roundState.pendingReveal = data;
          return;
        }

        const rawSeedBuf = this._hexToBuf(data.rawSeed);
        const computedHashBuf = await window.crypto.subtle.digest("SHA-256", rawSeedBuf);
        const computedHashHex = this._bufToHex(computedHashBuf);

        if (computedHashHex !== commitPayload.hash) {
          throw new Error(`Reveal seed hash mismatch from peer "${sender}"`);
        }

        roundState.payloads.set(key, data);
        roundState.seeds.set(sender, rawSeedBuf);
      }

      // Flush buffered Reveal payload if dependencies are resolved
      if (roundState.pendingReveal && roundState.payloads.has(`COMMIT:${roundState.rollingPeer}`)) {
        const pending = roundState.pendingReveal;
        delete roundState.pendingReveal;
        await this._processMessageForRound(roundState, { sender: pending.sender, data: pending });
      }

      this._checkRoundCompletion(roundState);

    } catch (err) {
      if (!roundState.rejected && !roundState.resolved) {
        roundState.rejected = true;
        if (roundState.timer) clearTimeout(roundState.timer);
        roundState.reject(err);
      }
    }
  }

  /**
   * Cross-checks buffered echo hashes against direct payload hash to detect equivocation.
   */
  _verifyEchoesForPayload(roundState, key, expectedHash) {
    if (!roundState.echoes.has(key)) return;
    const echoMap = roundState.echoes.get(key);
    for (const [echoSender, echoHash] of echoMap.entries()) {
      if (echoHash !== expectedHash) {
        throw new Error(`Equivocation detected: Peer "${echoSender}" sent mismatched echo hash for payload "${key}"`);
      }
    }
  }

  /**
   * Evaluates completion conditions for the current protocol state.
   */
  _checkRoundCompletion(roundState) {
    if (roundState.resolved || roundState.rejected) return;

    const { rollingPeer, isInitiator, allPeers } = roundState;
    const myPeerName = this.socket.getMyPeerName();
    const N = allPeers.length;

    // 1. Validate direct COMMIT payload presence
    if (!roundState.payloads.has(`COMMIT:${rollingPeer}`)) return;

    // 2. Validate direct SEED_CONTRIBUTION payload presence from all non-rolling peers
    const nonRollingPeers = allPeers.filter(p => p !== rollingPeer);
    for (const nr of nonRollingPeers) {
      if (!roundState.payloads.has(`SEED_CONTRIBUTION:${nr}`)) return;
    }

    // 3. Validate ECHO full-mesh gossip presence for COMMIT
    if (!this._hasAllEchoes(roundState, `COMMIT:${rollingPeer}`, rollingPeer, N)) return;

    // 4. Validate ECHO full-mesh gossip presence for all SEED_CONTRIBUTIONS
    for (const nr of nonRollingPeers) {
      if (!this._hasAllEchoes(roundState, `SEED_CONTRIBUTION:${nr}`, nr, N)) return;
    }

    // Initiator Transition: Phase 2 -> Phase 3 REVEAL
    if (isInitiator && !roundState.phase2Completed) {
      roundState.phase2Completed = true;

      this.socket.broadcastData({
        type: 'REVEAL',
        roundId: roundState.roundId,
        rawSeed: roundState.rawSeedHex,
        sender: myPeerName
      });

      const seedList = [roundState.rawSeedBuf];
      for (const nr of nonRollingPeers) {
        seedList.push(roundState.seeds.get(nr));
      }

      const finalSeed = this._xorSeeds(seedList);
      const floatVal = this._seedToFloat(finalSeed);

      roundState.resolved = true;
      if (roundState.timer) clearTimeout(roundState.timer);
      roundState.resolve(floatVal);
      return;
    }

    // Non-Initiator Transition: Validate REVEAL and Finalize
    if (!isInitiator) {
      if (!roundState.payloads.has(`REVEAL:${rollingPeer}`)) return;

      const rawSeedA = roundState.seeds.get(rollingPeer);
      if (!rawSeedA) return;

      const seedList = [rawSeedA];
      for (const nr of nonRollingPeers) {
        seedList.push(roundState.seeds.get(nr));
      }

      const finalSeed = this._xorSeeds(seedList);
      const floatVal = this._seedToFloat(finalSeed);

      roundState.resolved = true;
      if (roundState.timer) clearTimeout(roundState.timer);
      roundState.resolve(floatVal);
    }
  }

  /**
   * Helper to evaluate echo count threshold for a payload.
   */
  _hasAllEchoes(roundState, payloadKey, originalSender, N) {
    const myPeerName = this.socket.getMyPeerName();
    const expectedEchoCount = (myPeerName === originalSender) ? (N - 1) : (N - 2);

    const echoMap = roundState.echoes.get(payloadKey);
    if (!echoMap) return expectedEchoCount === 0;

    let count = 0;
    for (const [echoSender] of echoMap.entries()) {
      if (echoSender !== originalSender && echoSender !== myPeerName) {
        count++;
      }
    }

    return count >= expectedEchoCount;
  }

  // =========================================================================
  // STATE MANAGEMENT & EVENT DISPATCHING
  // =========================================================================

  /**
   * Factory function that constructs and tracks a round state object.
   */
  _createRoundState(roundId, rollingPeer, isInitiator) {
    const peerNames = this.socket.getPeerNames();
    const myPeerName = this.socket.getMyPeerName();
    const allPeers = Array.from(new Set([myPeerName, ...peerNames])).sort();

    let resolveFn, rejectFn;
    const promise = new Promise((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const roundState = {
      roundId,
      rollingPeer,
      isInitiator,
      peerNames,
      allPeers,
      payloads: new Map(),
      payloadHashes: new Map(),
      echoes: new Map(),
      seeds: new Map(),
      processingQueue: Promise.resolve(),
      resolved: false,
      rejected: false,
      phase2Completed: false,
      promise,
      resolve: resolveFn,
      reject: rejectFn,
      timer: null
    };

    // Phase 4 Safeguard: Timeout trigger
    roundState.timer = setTimeout(() => {
      if (!roundState.resolved && !roundState.rejected) {
        roundState.rejected = true;
        const missingPeers = this._getMissingPeersInfo(roundState);
        rejectFn(new Error(`Timeout in round "${roundId}": Non-responsive peer(s) [${missingPeers}]`));
      }
    }, this.timeoutMs);

    // Phase 4 Safeguard: Disconnect handling
    roundState.onPeerClose = (evt) => {
      const closedPeer = evt.detail.friendlyName;
      if (peerNames.includes(closedPeer) && !roundState.resolved && !roundState.rejected) {
        roundState.rejected = true;
        if (roundState.timer) clearTimeout(roundState.timer);
        rejectFn(new Error(`Peer "${closedPeer}" disconnected during round "${roundId}"`));
      }
    };

    this.socket.addEventListener('onPeerCloseConnection', roundState.onPeerClose);

    promise.finally(() => {
      if (roundState.timer) clearTimeout(roundState.timer);
      this.socket.removeEventListener('onPeerCloseConnection', roundState.onPeerClose);
      this.activeRounds.delete(roundId);
    });

    return roundState;
  }

  /**
   * Identifies non-responsive peers during a timeout event.
   */
  _getMissingPeersInfo(roundState) {
    const missing = new Set();
    const { rollingPeer, allPeers, isInitiator } = roundState;

    if (!roundState.payloads.has(`COMMIT:${rollingPeer}`)) {
      missing.add(rollingPeer);
    }

    const nonRolling = allPeers.filter(p => p !== rollingPeer);
    for (const nr of nonRolling) {
      if (!roundState.payloads.has(`SEED_CONTRIBUTION:${nr}`)) {
        missing.add(nr);
      }
    }

    if (!isInitiator && !roundState.payloads.has(`REVEAL:${rollingPeer}`)) {
      missing.add(rollingPeer);
    }

    return missing.size > 0 ? Array.from(missing).join(', ') : 'network delay';
  }

  /**
   * Central socket data event router.
   */
  _onDataReceived(evt) {
    const { friendlyName, data } = evt.detail || {};
    if (!friendlyName || !data) return;

    const msg = { sender: friendlyName, data };

    // Dispatch to generic dynamic listeners (e.g. init step)
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(msg);
      } catch (err) {
        console.error("Error in listener execution:", err);
      }
    }

    // Dispatch to active round processing pipeline
    if (this.isInitialized && data.roundId) {
      this._routeRoundMessage(msg);
    }
  }

  /**
   * Routes messages to specific active round queues or initializes background reaction.
   */
  _routeRoundMessage(msg) {
    const { roundId, type } = msg.data;
    if (!roundId) return;

    let roundState = this.activeRounds.get(roundId);

    if (!roundState) {
      if (type === 'COMMIT' && msg.sender !== this.socket.getMyPeerName()) {
        roundState = this._createRoundState(roundId, msg.sender, false);
        this.activeRounds.set(roundId, roundState);

        this._handleNonRollingRound(roundState, msg).catch((err) => {
          if (!roundState.rejected && !roundState.resolved) {
            roundState.rejected = true;
            roundState.reject(err);
          }
        });
      }
      return;
    }

    // Queue sequential processing to prevent state race conditions
    roundState.processingQueue = roundState.processingQueue
      .then(() => this._processMessageForRound(roundState, msg))
      .catch((err) => {
        if (!roundState.rejected && !roundState.resolved) {
          roundState.rejected = true;
          if (roundState.timer) clearTimeout(roundState.timer);
          roundState.reject(err);
        }
      });
  }

  /**
   * Helper to collect specific socket messages from a set of peers with timeout/disconnect guards.
   */
  _collectFromPeers(expectedPeers, filterFn, timeoutMs, actionName) {
    if (expectedPeers.length === 0) {
      return Promise.resolve(new Map());
    }

    return new Promise((resolve, reject) => {
      const results = new Map();
      const pending = new Set(expectedPeers);

      const timer = setTimeout(() => {
        cleanup();
        const missing = Array.from(pending).join(', ');
        reject(new Error(`Timeout waiting for [${actionName}] from peer(s): ${missing}`));
      }, timeoutMs);

      const listener = (msg) => {
        try {
          if (pending.has(msg.sender) && filterFn(msg)) {
            results.set(msg.sender, msg);
            pending.delete(msg.sender);
            if (pending.size === 0) {
              cleanup();
              resolve(results);
            }
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      const peerCloseListener = (evt) => {
        const closedPeer = evt.detail.friendlyName;
        if (pending.has(closedPeer)) {
          cleanup();
          reject(new Error(`Peer "${closedPeer}" disconnected during ${actionName}`));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(listener);
        this.socket.removeEventListener('onPeerCloseConnection', peerCloseListener);
      };

      this.listeners.add(listener);
      this.socket.addEventListener('onPeerCloseConnection', peerCloseListener);
    });
  }

  // =========================================================================
  // CRYPTOGRAPHIC MATH & UTILITY HELPERS
  // =========================================================================

  /**
   * Element-by-element XOR One-Time Pad seed mixing.
   */
  _xorSeeds(seedArray) {
    const finalSeed = new Uint8Array(32);
    for (const seed of seedArray) {
      for (let i = 0; i < 32; i++) {
        finalSeed[i] ^= seed[i];
      }
    }
    return finalSeed;
  }

  /**
   * Normalizes a 32-byte mixed seed to a uniform float in range [0, 1) using 64-bit BigInt math.
   */
  _seedToFloat(seed) {
    const view = new DataView(seed.buffer, seed.byteOffset, 8);
    const bigIntValue = view.getBigUint64(0, false); // Big-Endian
    return Number(bigIntValue) / 18446744073709551616; // Divide by 2^64
  }

  /**
   * Computes SHA-256 hash of a payload's canonical JSON string.
   */
  async _hashPayload(payload) {
    const str = this._canonicalJson(payload);
    const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return this._bufToHex(buf);
  }

  /**
   * Deterministic, key-sorted JSON serialization.
   */
  _canonicalJson(obj) {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this._canonicalJson(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + this._canonicalJson(obj[k])).join(',') + '}';
  }

  /**
   * Converts ArrayBuffer/Uint8Array to a hex string.
   */
  _bufToHex(buf) {
    const u8 = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < u8.length; i++) {
      hex += u8[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /**
   * Converts a hex string to a Uint8Array.
   */
  _hexToBuf(hex) {
    if (hex.length % 2 !== 0) {
      throw new Error("Invalid hex string length");
    }
    const u8 = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      u8[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return u8;
  }
}