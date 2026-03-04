// Lightweight WS client for Co-op.
// Host simulates the world and broadcasts snapshots; joiners send only input.

export function getDefaultWsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const host = location.hostname || "localhost";
  return `${proto}://${host}:8080`;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function createNetClient() {
  const net = {
    ws: null,
    url: null,
    status: "offline", // offline|connecting|connected|error
    error: null,
    playerId: null,
    roomCode: null,
    isHost: false,
    maxPlayers: 7,
    roomPlayers: [],
    ready: false,
    pingMs: 0,
    _pingSentAt: 0,
    _pingTimer: 0,

    latestSnapshot: null,
    latestPlayerState: null, // high-frequency players-only state

    remoteInputs: new Map(), // host-only: playerId -> input
    onMessage: null,
  };

  function send(msg) {
    if (!net.ws || net.ws.readyState !== 1) return;
    try {
      net.ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  net.connect = function connect(url) {
    if (net.ws && (net.ws.readyState === 0 || net.ws.readyState === 1)) {
      return;
    }
    net.url = url || getDefaultWsUrl();
    net.status = "connecting";
    net.error = null;
    net.latestSnapshot = null;
    net.remoteInputs.clear();

    const ws = new WebSocket(net.url);
    net.ws = ws;

    ws.onopen = () => {
      net.status = "connected";
      net.error = null;
    };

    ws.onmessage = (ev) => {
      const msg = safeJsonParse(String(ev.data));
      if (!msg || !msg.type) return;

      if (msg.type === "hello") {
        net.maxPlayers = msg.maxPlayers || net.maxPlayers;
        return;
      }

      if (msg.type === "joined") {
        net.playerId = msg.playerId;
        net.roomCode = msg.roomCode;
        net.isHost = !!msg.isHost;
        net.maxPlayers = msg.maxPlayers || net.maxPlayers;
      }

      if (msg.type === "roomInfo") {
        net.roomPlayers = Array.isArray(msg.players) ? msg.players : [];
      }


      if (msg.type === "pong") {
        const dt = performance.now() - (net._pingSentAt || performance.now());
        net.pingMs = Math.max(0, Math.round(dt));
      }
      if (msg.type === "snapshot") {
        net.latestSnapshot = msg.snapshot;
      }

      if (msg.type === "pstate") {
        net.latestPlayerState = msg.state;
      }

      if (msg.type === "input") {
        // forwarded to host
        if (msg.from) {
          net.remoteInputs.set(String(msg.from), msg.input || {});
        }
      }

      if (msg.type === "error") {
        net.error = msg.message || msg.code || "error";
      }

      if (msg.type === "hostLeft") {
        net.error = "Host left";
        net.roomCode = null;
        net.playerId = null;
        net.isHost = false;
        net.roomPlayers = [];
      }

      if (typeof net.onMessage === "function") {
        net.onMessage(msg);
      }
    };

    ws.onclose = () => {
      net.status = "offline";
      net.ws = null;
      net.playerId = null;
      net.roomCode = null;
      net.isHost = false;
      net.roomPlayers = [];
      net.latestSnapshot = null;
      net.remoteInputs.clear();
    };

    ws.onerror = () => {
      net.status = "error";
      net.error = "WS error";
    };
  };

  net.disconnect = function disconnect() {
    if (net.ws) {
      try {
        net.ws.close();
      } catch {
        // ignore
      }
    }
    net.ws = null;
    net.status = "offline";
    net.error = null;
    net.playerId = null;
    net.roomCode = null;
    net.isHost = false;
    net.roomPlayers = [];
    net.latestSnapshot = null;
    net.remoteInputs.clear();
  };

  net.host = function host(roomCode, nickname, avatarIndex, auraId) {
    send({ type: "host", roomCode, nickname, avatarIndex, auraId });
  };

  net.join = function join(roomCode, nickname, avatarIndex, auraId) {
    send({ type: "join", roomCode, nickname, avatarIndex, auraId });
  };

  net.fastJoin = function fastJoin(nickname, avatarIndex, auraId) {
    send({ type: "fastJoin", nickname, avatarIndex, auraId });
  };

  net.sendInput = function sendInput(input) {
    send({ type: "input", input });
  };

  net.sendSnapshot = function sendSnapshot(snapshot) {
    send({ type: "snapshot", snapshot });
  };

  net.sendPlayerState = function sendPlayerState(state) {
    send({ type: "pstate", state });
  };

  net.startRun = function startRun() {
    send({ type: "startRun" });
  };

  net.setProfile = function setProfile(nickname, avatarIndex, auraId) {
    send({ type: "setProfile", nickname, avatarIndex, auraId });
  };

  net.setReady = function setReady(ready) {
    net.ready = !!ready;
    send({ type: "ready", ready: !!ready });
  };

  // Joiner -> host messages that go through WS relay
  net.sendMeta = function sendMeta(meta) {
    send({ type: "syncMeta", meta: meta || null });
  };

  net.requestRespawn = function requestRespawn(meta) {
    send({ type: "respawn", meta: meta || null });
  };

  // --- Run upgrade flow (host-authoritative) ---
  // Host broadcasts pause/resume; host sends choices to a target player.
  // Joiner sends only the picked choice id back to the host.
  net.sendRunPause = function sendRunPause(reason, byId) {
    send({ type: "runPause", reason: reason || "levelUp", by: byId != null ? String(byId) : undefined });
  };

  net.sendRunResume = function sendRunResume() {
    send({ type: "runResume" });
  };

  net.sendRunChoices = function sendRunChoices(toId, choices, metaText) {
    send({
      type: "runChoices",
      to: toId != null ? String(toId) : "",
      choices: Array.isArray(choices) ? choices : [],
      metaText: metaText || "",
    });
  };

  net.sendRunPick = function sendRunPick(choiceId) {
    send({ type: "runPick", choiceId: choiceId || "" });
  };

  // Joiner -> host: ask the host to send us run-upgrade choices.
  net.sendRunRequest = function sendRunRequest() {
    send({ type: "runRequest" });
  };

  // Host -> joiner: credit persistent coins (meta-currency) to a specific client.
  // Used when a joiner picks up a coin orb (host is authoritative for world pickup).
  net.sendCoinGain = function sendCoinGain(toId, amount) {
    send({ type: "coinGain", to: toId != null ? String(toId) : "", amount: Number(amount || 0) });
  };

  return net;
}
