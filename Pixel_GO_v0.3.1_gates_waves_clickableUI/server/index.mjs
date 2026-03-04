import { WebSocketServer } from "ws";

// Lightweight relay server for Co-op (no PvP).
// World simulation runs on the room host client; server routes inputs and snapshots.

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const MAX_PLAYERS = 7;

const wss = new WebSocketServer({ port: PORT });

/** @type {Map<string, any>} */
const rooms = new Map();
let nextClientId = 1;

function now() {
  return Date.now();
}

function send(ws, msg) {
  if (!ws || ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // ignore
  }
}

function broadcast(room, msg, exceptId = null) {
  for (const [id, client] of room.clients) {
    if (exceptId && id === exceptId) continue;
    send(client.ws, msg);
  }
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid confusing chars
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return code;
}

function getOrCreateRoom(code) {
  const c = (code || "").trim().toUpperCase();
  const roomCode = c && c.length ? c : makeRoomCode();
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      code: roomCode,
      hostId: null,
      createdAt: now(),
      clients: new Map(), // id -> {ws, nickname, lastSeen}
      lastSnapshotAt: 0,
    });
  }
  return rooms.get(roomCode);
}

function roomInfo(room) {
  const players = [];
  for (const [id, c] of room.clients) {
    players.push({ id, nickname: c.nickname || "Player", avatarIndex: (c.avatarIndex||0), auraId: (c.auraId||0), ready: !!c.ready, isHost: id === room.hostId });
  }
  return {
    type: "roomInfo",
    roomCode: room.code,
    maxPlayers: MAX_PLAYERS,
    players,
    hostId: room.hostId,
  };
}

function cleanupEmptyRooms() {
  for (const [code, room] of rooms) {
    if (!room.clients || room.clients.size === 0) {
      rooms.delete(code);
    }
  }
}

function pickFastJoinRoom() {
  for (const room of rooms.values()) {
    if (room.clients.size > 0 && room.clients.size < MAX_PLAYERS && room.hostId) {
      return room;
    }
  }
  return null;
}

wss.on("connection", (ws) => {
  const clientId = String(nextClientId++);
  const client = {
    id: clientId,
    ws,
    nickname: "Player",
    avatarIndex: 0,
    auraId: 0,
    ready: false,
    roomCode: null,
    isHost: false,
    lastSeen: now(),
  };

  send(ws, { type: "hello", clientId, maxPlayers: MAX_PLAYERS, port: PORT });

  ws.on("message", (data) => {
    client.lastSeen = now();
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }

    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "ping") {
      send(ws, { type: "pong", t: now() });
      return;
    }

    if (msg.type === "host") {
      const room = getOrCreateRoom(msg.roomCode);

      // If room already has a host, reject host request.
      if (room.hostId && room.hostId !== clientId) {
        send(ws, { type: "error", code: "ROOM_HAS_HOST", message: "Room already has a host" });
        return;
      }

      if (room.clients.size >= MAX_PLAYERS && !room.clients.has(clientId)) {
        send(ws, { type: "error", code: "ROOM_FULL", message: "Room is full" });
        return;
      }

      client.nickname = (msg.nickname || client.nickname || "Player").toString().slice(0, 16);
      client.avatarIndex = typeof msg.avatarIndex === "number" ? (msg.avatarIndex|0) : (client.avatarIndex||0);
      client.auraId = typeof msg.auraId === "number" ? (msg.auraId|0) : (client.auraId||0);
      client.ready = false;
      client.roomCode = room.code;
      client.isHost = true;

      room.hostId = clientId;
      room.clients.set(clientId, { ws, nickname: client.nickname, avatarIndex: client.avatarIndex||0, auraId: client.auraId||0, ready: !!client.ready, lastSeen: client.lastSeen });

      send(ws, { type: "joined", roomCode: room.code, playerId: clientId, isHost: true, maxPlayers: MAX_PLAYERS });
      broadcast(room, roomInfo(room));
      return;
    }

    if (msg.type === "join") {
      const code = (msg.roomCode || "").toString().trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || !room.hostId) {
        send(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "Room not found" });
        return;
      }
      if (room.clients.size >= MAX_PLAYERS && !room.clients.has(clientId)) {
        send(ws, { type: "error", code: "ROOM_FULL", message: "Room is full" });
        return;
      }

      client.nickname = (msg.nickname || client.nickname || "Player").toString().slice(0, 16);
      client.avatarIndex = typeof msg.avatarIndex === "number" ? (msg.avatarIndex|0) : (client.avatarIndex||0);
      client.auraId = typeof msg.auraId === "number" ? (msg.auraId|0) : (client.auraId||0);
      client.ready = false;
      client.roomCode = room.code;
      client.isHost = false;

      room.clients.set(clientId, { ws, nickname: client.nickname, avatarIndex: client.avatarIndex||0, auraId: client.auraId||0, ready: !!client.ready, lastSeen: client.lastSeen });
      send(ws, { type: "joined", roomCode: room.code, playerId: clientId, isHost: false, maxPlayers: MAX_PLAYERS, hostId: room.hostId });
      broadcast(room, roomInfo(room));
      // notify host that a new player joined
      const host = room.clients.get(room.hostId);
      if (host) send(host.ws, { type: "playerJoined", playerId: clientId, nickname: client.nickname });
      return;
    }

    if (msg.type === "fastJoin") {
      const room = pickFastJoinRoom();
      if (room) {
        if (room.clients.size >= MAX_PLAYERS) {
          send(ws, { type: "error", code: "ROOM_FULL", message: "Room is full" });
          return;
        }
        client.nickname = (msg.nickname || client.nickname || "Player").toString().slice(0, 16);
        client.avatarIndex = typeof msg.avatarIndex === "number" ? (msg.avatarIndex|0) : (client.avatarIndex||0);
        client.auraId = typeof msg.auraId === "number" ? (msg.auraId|0) : (client.auraId||0);
        client.ready = false;
        client.roomCode = room.code;
        client.isHost = false;
        room.clients.set(clientId, { ws, nickname: client.nickname, avatarIndex: client.avatarIndex||0, auraId: client.auraId||0, ready: !!client.ready, lastSeen: client.lastSeen });
        send(ws, { type: "joined", roomCode: room.code, playerId: clientId, isHost: false, maxPlayers: MAX_PLAYERS, hostId: room.hostId });
        broadcast(room, roomInfo(room));
        const host = room.clients.get(room.hostId);
        if (host) send(host.ws, { type: "playerJoined", playerId: clientId, nickname: client.nickname });
        return;
      }

      // No open room exists: create a new one and make this client host.
      const newRoom = getOrCreateRoom("");
      client.nickname = (msg.nickname || client.nickname || "Player").toString().slice(0, 16);
      client.avatarIndex = typeof msg.avatarIndex === "number" ? (msg.avatarIndex|0) : (client.avatarIndex||0);
      client.auraId = typeof msg.auraId === "number" ? (msg.auraId|0) : (client.auraId||0);
      client.ready = false;
      client.roomCode = newRoom.code;
      client.isHost = true;
      newRoom.hostId = clientId;
      newRoom.clients.set(clientId, { ws, nickname: client.nickname, avatarIndex: client.avatarIndex||0, auraId: client.auraId||0, ready: !!client.ready, lastSeen: client.lastSeen });
      send(ws, { type: "joined", roomCode: newRoom.code, playerId: clientId, isHost: true, maxPlayers: MAX_PLAYERS });
      broadcast(newRoom, roomInfo(newRoom));
      return;
    }

    // From here: messages require a room.
    const roomCode = client.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    
    if (msg.type === "setProfile") {
      const room = rooms.get(client.roomCode || "");
      if (!room) return;
      const c = room.clients.get(clientId);
      if (!c) return;
      if (typeof msg.nickname === "string" && msg.nickname.trim().length) {
        client.nickname = msg.nickname.trim().slice(0, 16);
        c.nickname = client.nickname;
      }
      if (typeof msg.avatarIndex === "number") {
        client.avatarIndex = msg.avatarIndex|0;
        c.avatarIndex = client.avatarIndex;
      }
      if (typeof msg.auraId === "number") {
        client.auraId = msg.auraId|0;
        c.auraId = client.auraId;
      }
      broadcast(room, roomInfo(room));
      return;
    }

    if (msg.type === "ready") {
      const room = rooms.get(client.roomCode || "");
      if (!room) return;
      const c = room.clients.get(clientId);
      if (!c) return;
      client.ready = !!msg.ready;
      c.ready = client.ready;
      broadcast(room, roomInfo(room));
      return;
    }
if (msg.type === "input") {
      // Forward player input to host only.
      if (!room.hostId) return;
      const host = room.clients.get(room.hostId);
      if (!host) return;
      // Attach sender id
      send(host.ws, { type: "input", from: clientId, input: msg.input || {} });
      return;
    }

    if (msg.type === "syncMeta") {
      // Forward player meta/progression sync to host only.
      if (!room.hostId) return;
      const host = room.clients.get(room.hostId);
      if (!host) return;
      send(host.ws, { type: "syncMeta", from: clientId, meta: msg.meta || null });
      return;
    }

    if (msg.type === "respawn") {
      // Forward respawn request (after death overlay) to host only.
      if (!room.hostId) return;
      const host = room.clients.get(room.hostId);
      if (!host) return;
      send(host.ws, { type: "respawn", from: clientId, meta: msg.meta || null });
      return;
    }

    // --- Run upgrade flow (host-authoritative) ---


if (msg.type === "runRequest") {
  // Forward run-upgrade request to host only.
  if (!room.hostId) return;
  const host = room.clients.get(room.hostId);
  if (!host) return;
  send(host.ws, { type: "runRequest", from: clientId });
  return;
}

    if (msg.type === "runPick") {
      // Forward chosen upgrade to host only.
      if (!room.hostId) return;
      const host = room.clients.get(room.hostId);
      if (!host) return;
      send(host.ws, { type: "runPick", from: clientId, choiceId: msg.choiceId || "" });
      return;
    }

    if (msg.type === "runPause" || msg.type === "runResume" || msg.type === "runChoices") {
      // Only host can broadcast pause/resume/choices.
      if (clientId !== room.hostId) return;
      broadcast(room, { ...msg });
      return;
    }

    if (msg.type === "coinGain") {
      // Only host can credit persistent coins to a joiner.
      if (clientId !== room.hostId) return;
      const to = (msg.to != null ? String(msg.to) : "");
      const amount = Number(msg.amount || 0);
      if (!to || !Number.isFinite(amount) || amount === 0) return;
      const target = room.clients.get(to);
      if (!target) return;
      send(target.ws, { type: "coinGain", to, amount });
      return;
    }

    if (msg.type === "pstate") {
      // Only host can broadcast player state updates (high frequency, small payload).
      if (clientId !== room.hostId) return;
      broadcast(room, { type: "pstate", state: msg.state || null }, null);
      return;
    }

    if (msg.type === "snapshot") {
      // Only host can broadcast snapshots.
      if (clientId !== room.hostId) return;
      room.lastSnapshotAt = now();
      broadcast(room, { type: "snapshot", snapshot: msg.snapshot || null }, null);
      return;
    }

    if (msg.type === "startRun") {
      if (clientId !== room.hostId) return;
      broadcast(room, { type: "startRun" });
      return;
    }
  });

  ws.on("close", () => {
    const roomCode = client.roomCode;
    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.clients.delete(client.id);

      // If host left, close the room (simple MVP behavior).
      if (room.hostId === client.id) {
        broadcast(room, { type: "hostLeft" }, null);
        rooms.delete(roomCode);
      } else {
        broadcast(room, roomInfo(room));
      }
    }
    cleanupEmptyRooms();
  });
});

// Keep-alive cleanup for dead sockets
setInterval(() => {
  cleanupEmptyRooms();
}, 10_000);

console.log(`[COOP] WS relay server listening on ws://0.0.0.0:${PORT} (max ${MAX_PLAYERS} players/room)`);
