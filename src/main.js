import { createGame } from "./core/gameLoop.js";
import { loadProgression } from "./core/progression.js";
import {
  handleMouseMove,
  handleMouseDown,
  handleMouseUp,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
} from "./core/mouseController.js";
import { initLobbyDom, tickLobbyDom } from "./ui/lobbyDom.js";
import { initHubNpcDom, tickHubNpcDom } from "./ui/hubNpcDom.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Improve mobile responsiveness (avoid double-tap zoom / gesture delays).
canvas.style.touchAction = "none";

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resize);
resize();

const progression = loadProgression();
const game = createGame(canvas, ctx, progression);

// DOM-based lobby menu (ported from Pixel PVP style)
initLobbyDom(game);

// Hub NPC interactions (Shop / Tier) during gameplay
initHubNpcDom(game);

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // Keep lobby DOM in sync with game state (visibility, counts, etc.)
  tickLobbyDom(game.state);

  game.update(dt);

  // Hub NPC DOM UI depends on proximity computed during update.
  tickHubNpcDom(game.state);
  game.render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// Desktop mouse
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  // Only update aim/move helpers during gameplay.
  if (game.state?.mode === "playing") {
    handleMouseMove(x, y);
  }
  if (game.handlePointerMove) {
    game.handlePointerMove(x, y);
  }
});

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (e.button === 0) {
    if (game.state?.mode === "playing") {
      handleMouseDown(0, x, y);
    }
  }
  if (game.handlePointerDown) {
    game.handlePointerDown(x, y);
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) {
    if (game.state?.mode === "playing") {
      handleMouseUp(0);
    }
    if (game.handlePointerUp) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      game.handlePointerUp(x, y);
    }
  }
});

// Touch (mobile dual-stick)
canvas.addEventListener(
  "touchstart",
  (e) => {
    const rect = canvas.getBoundingClientRect();
    const w = canvas.width;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      if (game.state?.mode === "playing") {
        handleTouchStart(t.identifier, x, y, w);
      }
      if (game.handlePointerDown) {
        game.handlePointerDown(x, y);
      }
    }
    e.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      if (game.state?.mode === "playing") {
        handleTouchMove(t.identifier, x, y);
      }
      if (game.handlePointerMove) {
        game.handlePointerMove(x, y);
      }
    }
    e.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener(
  "touchend",
  (e) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (game.state?.mode === "playing") {
        handleTouchEnd(t.identifier);
      }
      if (game.handlePointerUp) {
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;
        game.handlePointerUp(x, y);
      }
    }
    e.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener(
  "touchcancel",
  (e) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (game.state?.mode === "playing") {
        handleTouchEnd(t.identifier);
      }
      if (game.handlePointerUp) {
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;
        game.handlePointerUp(x, y);
      }
    }
    e.preventDefault();
  },
  { passive: false }
);
