import { warmHubAssets } from './world/hub/hubAssets.js';
import { warmHubWalkMask } from './world/hub/hubWalkMask.js';
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

function clientToCanvasXY(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width || 1);
  const scaleY = canvas.height / (rect.height || 1);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function resize() {
  // Use the actual CSS size of the canvas (100vw/100vh) to avoid mobile viewport quirks.
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
}

window.addEventListener("resize", resize);
resize();

warmHubAssets();
warmHubWalkMask();

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
  const pos = clientToCanvasXY(e.clientX, e.clientY);
  const x = pos.x;
  const y = pos.y;
  // Only update aim/move helpers during gameplay.
  if (game.state?.mode === "playing") {
    handleMouseMove(x, y);
  }
  if (game.handlePointerMove) {
    game.handlePointerMove(x, y);
  }
});

canvas.addEventListener("mousedown", (e) => {
  const pos = clientToCanvasXY(e.clientX, e.clientY);
  const x = pos.x;
  const y = pos.y;
  // Let game UI consume clicks first (e.g., gate buttons).
  const consumed = game.handlePointerDown ? (game.handlePointerDown(x, y) === true) : false;
  if (!consumed && e.button === 0) {
    if (game.state?.mode === "playing") {
      handleMouseDown(0, x, y);
    }
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) {
    if (game.state?.mode === "playing") {
      handleMouseUp(0);
    }
    if (game.handlePointerUp) {
      const pos = clientToCanvasXY(e.clientX, e.clientY);
      const x = pos.x;
      const y = pos.y;
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
      const pos = clientToCanvasXY(t.clientX, t.clientY);
      const x = pos.x;
      const y = pos.y;
      // Let game UI consume taps first (e.g., gate buttons), so joysticks don't steal them.
      const consumed = game.handlePointerDown ? (game.handlePointerDown(x, y) === true) : false;
      if (!consumed && game.state?.mode === "playing") {
        handleTouchStart(t.identifier, x, y, w);
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
      const pos = clientToCanvasXY(t.clientX, t.clientY);
      const x = pos.x;
      const y = pos.y;
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
        const pos = clientToCanvasXY(t.clientX, t.clientY);
      const x = pos.x;
      const y = pos.y;
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
        const pos = clientToCanvasXY(t.clientX, t.clientY);
      const x = pos.x;
      const y = pos.y;
        game.handlePointerUp(x, y);
      }
    }
    e.preventDefault();
  },
  { passive: false }
);