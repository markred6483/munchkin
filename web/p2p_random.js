/**
 * P2PRandom
 *
 * Implements a provably fair, multi-party distributed random number generator
 * over a serverless P2P mesh (via P2PSocket).
 *
 * Cryptographic Mechanics:
 * 1. Key Exchange: Ephemeral ECDSA (P-256) keypairs generated per client.
 * 2. Commit Phase: SHA-256 commitment of high-entropy secret seed broadcasted with signature.
 * 3. Gossip & Lock Phase: Signed cross-verification (echo) of commitments across all peers.
 * 4. Reveal Phase: Plaintext secrets revealed, validated against commitments and signatures.
 * 5. Extraction: XOR/SHA-256 entropy combination extracted into a float in [0, 1).
 */
export class P2PRandom {
  /**
   * @param {P2PSocket} p2pSocket - Instance of P2PSocket
   * @param {Object} [options={}]
   * @param {number} [options.timeoutMs=10000] - Timeout in ms for round completion
   */
  constructor(p2pSocket, options = {}) {
    this.socket = p2pSocket;
    this.timeoutMs = options.timeoutMs || 10000;

    this.keyPair = null;
    this.myPubKeyJWK = null;
    this.peerKeys = {}; // friendlyName -> CryptoKey
    this.activeRounds = {}; // roundId -> RoundState

    this._bindSocketEvents();
    this.ready = this._initKeys();
  }

  /**
   * Public method to generate a provably fair random float in [0, 1).
   * @returns {Promise<number>} Random float >= 0 and < 1
   */
  async random() {
    await this.ready;

    const peerNames = this.socket.getPeerNames();
    const myName = this.socket.getMyPeerName();

    // Solo fallback: if no peers connected, return local cryptographic random
    if (!peerNames || peerNames.length === 0) {
      return this._generateLocalRandom();
    }

    const participants = [myName, ...peerNames].sort();
    const roundId = "RAND_ROUND_" + myName + "_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

    await this._ensureKeys(participants);

    const round = this._getOrCreateRound(roundId, participants);

    // Announce round initialization to peers
    const initPayload = {
      type: "RAND_INIT_ROUND",
      roundId,
      initiator: myName,
      participants,
      timestamp: Date.now()
    };
    initPayload.signature = await this._signPayload(initPayload);
    this.socket.broadcastData(initPayload);

    // Start local commitment phase
    await this._executeCommitPhase(roundId);

    return round.promise;
  }

  /* ========================================================================= */
  /*                             INITIALIZATION                                */
  /* ========================================================================= */

  async _initKeys() {
    this.keyPair = await window.crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true, // TODO set to false
      ["sign", "verify"]
    );
    this.myPubKeyJWK = await window.crypto.subtle.exportKey("jwk", this.keyPair.publicKey);

    // Synchronize keys with existing peers
    const existingPeers = this.socket.getPeerNames();
    for (const peerName of existingPeers) {
      this._sendKeyExchange(peerName);
    }
  }

  _bindSocketEvents() {
    this.socket.addEventListener("onPeerDataReceived", (e) => {
      const { friendlyName, data } = e.detail;
      this._handlePeerData(friendlyName, data);
    });

    this.socket.addEventListener("onPeerNewConnection", (e) => {
      const { friendlyName } = e.detail;
      this._sendKeyExchange(friendlyName);
    });

    this.socket.addEventListener("onPeerCloseConnection", (e) => {
      const { friendlyName } = e.detail;
      delete this.peerKeys[friendlyName];
      this._handlePeerDisconnected(friendlyName);
    });
  }

  /* ========================================================================= */
  /*                            KEY EXCHANGE PHASE                             */
  /* ========================================================================= */

  async _sendKeyExchange(targetPeer) {
    await this.ready;
    const payload = {
      type: "RAND_KEY_EXCHANGE",
      sender: this.socket.getMyPeerName(),
      pubKey: this.myPubKeyJWK,
      timestamp: Date.now()
    };
    payload.signature = await this._signPayload(payload);
    this.socket.sendData(targetPeer, payload);
  }

  async _handleKeyExchange(sender, data) {
    try {
      const importedKey = await window.crypto.subtle.importKey(
        "jwk",
        data.pubKey,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"]
      );

      // Verify signature on key exchange packet using exported public key
      const tempKeys = { ...this.peerKeys, [sender]: importedKey };
      const isValid = await this._verifyPayloadWithKey(data, importedKey);

      if (!isValid) {
        console.error("RAND_KEY_EXCHANGE: Invalid signature from " + sender);
        return;
      }

      this.peerKeys[sender] = importedKey;

      // Reply with key exchange if peer key was not stored yet
      if (!data.isReply) {
        const replyPayload = {
          type: "RAND_KEY_EXCHANGE",
          sender: this.socket.getMyPeerName(),
          pubKey: this.myPubKeyJWK,
          isReply: true,
          timestamp: Date.now()
        };
        replyPayload.signature = await this._signPayload(replyPayload);
        this.socket.sendData(sender, replyPayload);
      }
    } catch (err) {
      console.error("RAND_KEY_EXCHANGE Error:", err);
    }
  }

  async _ensureKeys(participants) {
    const myName = this.socket.getMyPeerName();
    for (const p of participants) {
      if (p !== myName && !this.peerKeys[p]) {
        this._sendKeyExchange(p);
      }
    }
  }

  /* ========================================================================= */
  /*                           MESSAGE ROUTING & ROUND                         */
  /* ========================================================================= */

  async _handlePeerData(sender, data) {
    if (!data || typeof data.type !== "string" || !data.type.startsWith("RAND_")) {
      return; // Ignore non-RNG messages
    }

    if (data.type === "RAND_KEY_EXCHANGE") {
      await this._handleKeyExchange(sender, data);
      return;
    }

    // Verify payload signature against stored peer public key
    const isValid = await this._verifyPayload(sender, data);
    if (!isValid) {
      console.error(`P2PRandom: Signature verification failed for message ${data.type} from ${sender}`);
      if (data.roundId && this.activeRounds[data.roundId]) {
        this._abortRound(this.activeRounds[data.roundId], `Invalid signature from ${sender}`);
      }
      return;
    }

    switch (data.type) {
      case "RAND_INIT_ROUND":
        await this._handleInitRound(sender, data);
        break;
      case "RAND_COMMIT":
        await this._handleCommit(sender, data);
        break;
      case "RAND_GOSSIP_COMMIT":
        await this._handleGossipCommit(sender, data);
        break;
      case "RAND_REVEAL":
        await this._handleReveal(sender, data);
        break;
      case "RAND_GOSSIP_REVEAL":
        await this._handleGossipReveal(sender, data);
        break;
    }
  }

  _getOrCreateRound(roundId, participants) {
    if (this.activeRounds[roundId]) {
      return this.activeRounds[roundId];
    }

    let resolvePromise, rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const round = {
      roundId,
      participants: [...participants].sort(),
      secretEntropyHex: null,
      commitmentHex: null,
      status: "INIT",
      commits: {}, // peerName -> commitmentHex
      gossipedCommits: {}, // originalSender -> { gossipSender: commitmentHex }
      reveals: {}, // peerName -> secretEntropyHex
      gossipedReveals: {}, // originalSender -> { gossipSender: secretEntropyHex }
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      timeoutTimer: null
    };

    round.timeoutTimer = setTimeout(() => {
      this._abortRound(round, "Round timed out waiting for peers");
    }, this.timeoutMs);

    this.activeRounds[roundId] = round;
    return round;
  }

  _abortRound(round, reason) {
    if (round.status === "FAILED" || round.status === "COMPLETED") return;
    round.status = "FAILED";
    clearTimeout(round.timeoutTimer);
    delete this.activeRounds[round.roundId];
    round.reject(new Error(`P2PRandom [${round.roundId}]: ${reason}`));
  }

  _handlePeerDisconnected(friendlyName) {
    for (const roundId in this.activeRounds) {
      const round = this.activeRounds[roundId];
      if (round.participants.includes(friendlyName)) {
        this._abortRound(round, `Peer ${friendlyName} disconnected during round`);
      }
    }
  }

  /* ========================================================================= */
  /*                            COMMIT & GOSSIP PHASE                          */
  /* ========================================================================= */

  async _handleInitRound(sender, data) {
    const round = this._getOrCreateRound(data.roundId, data.participants);
    if (round.status === "INIT") {
      await this._executeCommitPhase(data.roundId);
    }
  }

  async _executeCommitPhase(roundId) {
    const round = this.activeRounds[roundId];
    if (!round || round.status !== "INIT") return;

    round.status = "COMMITTING";

    // Generate local 32-byte high-entropy random secret
    const secretBytes = new Uint8Array(32);
    window.crypto.getRandomValues(secretBytes);
    round.secretEntropyHex = this._arrayBufferToHex(secretBytes.buffer);

    // Calculate SHA-256 commitment hash
    round.commitmentHex = await this._hashSHA256(round.secretEntropyHex);

    const myName = this.socket.getMyPeerName();
    round.commits[myName] = round.commitmentHex;

    const commitPayload = {
      type: "RAND_COMMIT",
      roundId,
      sender: myName,
      commitment: round.commitmentHex,
      timestamp: Date.now()
    };
    commitPayload.signature = await this._signPayload(commitPayload);

    this.socket.broadcastData(commitPayload);
    this._checkCommitPhaseComplete(round);
  }

  async _handleCommit(sender, data) {
    const round = this._getOrCreateRound(data.roundId, [sender]);
    round.commits[sender] = data.commitment;

    // Echo / Gossip received commitment to all other peers for consensus
    const myName = this.socket.getMyPeerName();
    const gossipPayload = {
      type: "RAND_GOSSIP_COMMIT",
      roundId: data.roundId,
      originalSender: sender,
      gossipSender: myName,
      commitPayload: data,
      timestamp: Date.now()
    };
    gossipPayload.signature = await this._signPayload(gossipPayload);
    this.socket.broadcastData(gossipPayload);

    this._checkCommitPhaseComplete(round);
  }

  async _handleGossipCommit(sender, data) {
    const round = this.activeRounds[data.roundId];
    if (!round) return;

    const { originalSender, commitPayload } = data;

    // Verify signature of original sender inside gossip wrapper
    const isOriginalValid = await this._verifyPayload(originalSender, commitPayload);
    if (!isOriginalValid) {
      this._abortRound(round, `Equivocation alert: invalid nested commit signature from ${originalSender}`);
      return;
    }

    if (!round.gossipedCommits[originalSender]) {
      round.gossipedCommits[originalSender] = {};
    }
    round.gossipedCommits[originalSender][sender] = commitPayload.commitment;

    // Equivocation Check: Compare gossiped commit with direct commit
    if (round.commits[originalSender] && round.commits[originalSender] !== commitPayload.commitment) {
      this._abortRound(round, `Equivocation caught! ${originalSender} sent conflicting commitments.`);
      return;
    }

    this._checkCommitPhaseComplete(round);
  }

  _checkCommitPhaseComplete(round) {
    if (round.status !== "COMMITTING") return;

    // Check if direct commitments received from all participants
    const hasAllDirect = round.participants.every(p => round.commits[p] !== undefined);
    if (!hasAllDirect) return;

    // Check if gossip entries match direct entries
    for (const p of round.participants) {
      const directCommit = round.commits[p];
      const gossipMap = round.gossipedCommits[p] || {};
      for (const gossipSender in gossipMap) {
        if (gossipMap[gossipSender] !== directCommit) {
          this._abortRound(round, `Consensus failed: ${p}'s commitment mismatched via ${gossipSender}`);
          return;
        }
      }
    }

    // Commit Phase Locked Successfully -> Move to Reveal Phase
    this._executeRevealPhase(round.roundId);
  }

  /* ========================================================================= */
  /*                            REVEAL & VERIFY PHASE                          */
  /* ========================================================================= */

  async _executeRevealPhase(roundId) {
    const round = this.activeRounds[roundId];
    if (!round || round.status !== "COMMITTING") return;

    round.status = "REVEALING";

    const myName = this.socket.getMyPeerName();
    round.reveals[myName] = round.secretEntropyHex;

    const revealPayload = {
      type: "RAND_REVEAL",
      roundId,
      sender: myName,
      secretEntropyHex: round.secretEntropyHex,
      timestamp: Date.now()
    };
    revealPayload.signature = await this._signPayload(revealPayload);

    this.socket.broadcastData(revealPayload);
    this._checkRevealPhaseComplete(round);
  }

  async _handleReveal(sender, data) {
    const round = this.activeRounds[data.roundId];
    if (!round) return;

    // Verify secret matches previously locked commitment hash
    const calculatedHash = await this._hashSHA256(data.secretEntropyHex);
    if (calculatedHash !== round.commits[sender]) {
      this._abortRound(round, `Cheating detected! ${sender}'s revealed secret does not match commitment.`);
      return;
    }

    round.reveals[sender] = data.secretEntropyHex;

    // Gossip revealed seed to all other peers
    const myName = this.socket.getMyPeerName();
    const gossipPayload = {
      type: "RAND_GOSSIP_REVEAL",
      roundId: data.roundId,
      originalSender: sender,
      gossipSender: myName,
      revealPayload: data,
      timestamp: Date.now()
    };
    gossipPayload.signature = await this._signPayload(gossipPayload);
    this.socket.broadcastData(gossipPayload);

    this._checkRevealPhaseComplete(round);
  }

  async _handleGossipReveal(sender, data) {
    const round = this.activeRounds[data.roundId];
    if (!round) return;

    const { originalSender, revealPayload } = data;

    const isOriginalValid = await this._verifyPayload(originalSender, revealPayload);
    if (!isOriginalValid) {
      this._abortRound(round, `Equivocation alert: invalid nested reveal signature from ${originalSender}`);
      return;
    }

    if (!round.gossipedReveals[originalSender]) {
      round.gossipedReveals[originalSender] = {};
    }
    round.gossipedReveals[originalSender][sender] = revealPayload.secretEntropyHex;

    // Equivocation Check: Compare gossiped reveal with direct reveal
    if (round.reveals[originalSender] && round.reveals[originalSender] !== revealPayload.secretEntropyHex) {
      this._abortRound(round, `Equivocation caught! ${originalSender} sent conflicting reveals.`);
      return;
    }

    this._checkRevealPhaseComplete(round);
  }

  async _checkRevealPhaseComplete(round) {
    if (round.status !== "REVEALING") return;

    const hasAllReveals = round.participants.every(p => round.reveals[p] !== undefined);
    if (!hasAllReveals) return;

    // Confirm consensus across all gossiped reveals
    for (const p of round.participants) {
      const directReveal = round.reveals[p];
      const gossipMap = round.gossipedReveals[p] || {};
      for (const gossipSender in gossipMap) {
        if (gossipMap[gossipSender] !== directReveal) {
          this._abortRound(round, `Consensus failed: ${p}'s revealed secret mismatched via ${gossipSender}`);
          return;
        }
      }
    }

    // Complete round and resolve float
    round.status = "COMPLETED";
    clearTimeout(round.timeoutTimer);
    delete this.activeRounds[round.roundId];

    const resultFloat = await this._computeFinalRandom(round);
    round.resolve(resultFloat);
  }

  /* ========================================================================= */
  /*                            ENTROPY EXTRACTION                             */
  /* ========================================================================= */

  async _computeFinalRandom(round) {
    // Sort participant reveals alphabetically to ensure deterministic string concatenation
    const sortedSecrets = round.participants.map(p => round.reveals[p]).join("");
    const combinedHashHex = await this._hashSHA256(sortedSecrets);

    // Extract first 14 hex characters (56 bits)
    const subHex = combinedHashHex.substring(0, 14);
    const bigIntVal = BigInt("0x" + subHex);

    // Mask to 53 bits (IEEE 754 mantissa double-precision maximum integer representation)
    const mask53 = (1n << 53n) - 1n;
    const mantissa53 = bigIntVal & mask53;

    // Divide by 2^53 (9007199254740992) to scale into range [0, 1)
    return Number(mantissa53) / 9007199254740992;
  }

  _generateLocalRandom() {
    const buffer = new Uint32Array(2);
    window.crypto.getRandomValues(buffer);
    const high = BigInt(buffer[0] & 0x1fffff); // 21 bits
    const low = BigInt(buffer[1]); // 32 bits
    const mantissa53 = (high << 32n) | low;
    return Number(mantissa53) / 9007199254740992;
  }

  /* ========================================================================= */
  /*                        CRYPTOGRAPHIC HELPER METHODS                       */
  /* ========================================================================= */

  async _signPayload(payload) {
    const jsonStr = this._canonicalize(payload);
    const encoded = new TextEncoder().encode(jsonStr);
    const signatureBuf = await window.crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      this.keyPair.privateKey,
      encoded
    );
    return this._arrayBufferToHex(signatureBuf);
  }

  async _verifyPayload(sender, data) {
    if (!data || !data.signature) return false;
    const pubKey = this.peerKeys[sender];
    if (!pubKey) return false;
    return this._verifyPayloadWithKey(data, pubKey);
  }

  async _verifyPayloadWithKey(data, pubKey) {
    const jsonStr = this._canonicalize(data);
    const encoded = new TextEncoder().encode(jsonStr);
    const sigBuf = this._hexToArrayBuffer(data.signature);

    try {
      return await window.crypto.subtle.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        pubKey,
        sigBuf,
        encoded
      );
    } catch (err) {
      console.error("Signature verification error:", err);
      return false;
    }
  }

  _canonicalize(obj) {
    const clone = { ...obj };
    delete clone.signature;
    const sortedKeys = Object.keys(clone).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
      sortedObj[key] = clone[key];
    }
    return JSON.stringify(sortedObj);
  }

  async _hashSHA256(input) {
    let buffer;
    if (typeof input === "string") {
      buffer = new TextEncoder().encode(input);
    } else if (input instanceof ArrayBuffer) {
      buffer = input;
    } else if (ArrayBuffer.isView(input)) {
      buffer = input.buffer;
    }
    const hashBuf = await window.crypto.subtle.digest("SHA-256", buffer);
    return this._arrayBufferToHex(hashBuf);
  }

  _arrayBufferToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  _hexToArrayBuffer(hex) {
    const bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes.buffer;
  }
}