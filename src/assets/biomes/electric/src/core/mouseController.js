// Centralized mouse + touch controller for aim & movement.

const state = {
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,

  moveTouchId: null,
  moveBaseX: 0,
  moveBaseY: 0,
  moveVecX: 0,
  moveVecY: 0,

  aimTouchId: null,
  aimBaseX: 0,
  aimBaseY: 0,
  aimVecX: 0,
  aimVecY: 0,
  controlMode: "oneHand",
};

const CONTROL_MODE_KEY = "btm_control_mode";
if (typeof window !== "undefined") {
  try {
    const savedMode = window.localStorage && window.localStorage.getItem(CONTROL_MODE_KEY);
    if (savedMode === "oneHand" || savedMode === "twoHand") {
      state.controlMode = savedMode;
    }
  } catch (e) {
    // ignore
  }
}


function isPortraitMobile() {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  const maxDim = Math.max(w, h);
  return h > w && maxDim < 900;
}


export function handleMouseMove(x, y) {
  state.mouseX = x;
  state.mouseY = y;
}

export function handleMouseDown(button, x, y) {
  if (button === 0) {
    state.mouseDown = true;
    state.mouseX = x;
    state.mouseY = y;
  }
}

export function handleMouseUp(button) {
  if (button === 0) {
    state.mouseDown = false;
  }
}

export function handleTouchStart(id, x, y, canvasWidth) {
  const useOneHand = state.controlMode === "oneHand";
  const isLeft = x < canvasWidth / 2;

  if (useOneHand) {
    // One-finger control: single move joystick anywhere on screen
    if (state.moveTouchId === null) {
      state.moveTouchId = id;
      state.moveBaseX = x;
      state.moveBaseY = y;
      state.moveVecX = 0;
      state.moveVecY = 0;
    }
    return;
  }

  // Two-hand dual-stick control: move + aim
  if (isLeft) {
    if (state.moveTouchId === null) {
      state.moveTouchId = id;
      state.moveBaseX = x;
      state.moveBaseY = y;
      state.moveVecX = 0;
      state.moveVecY = 0;
      return;
    }
    if (state.aimTouchId === null) {
      state.aimTouchId = id;
      state.aimBaseX = x;
      state.aimBaseY = y;
      state.aimVecX = 0;
      state.aimVecY = 0;
      return;
    }
  } else {
    if (state.aimTouchId === null) {
      state.aimTouchId = id;
      state.aimBaseX = x;
      state.aimBaseY = y;
      state.aimVecX = 0;
      state.aimVecY = 0;
      return;
    }
    if (state.moveTouchId === null) {
      state.moveTouchId = id;
      state.moveBaseX = x;
      state.moveBaseY = y;
      state.moveVecX = 0;
      state.moveVecY = 0;
      return;
    }
  }
}
export function handleTouchMove(id, x, y) {
  const useOneHand = state.controlMode === "oneHand";
  const maxDist = 80;

  if (useOneHand) {
    if (id === state.moveTouchId) {
      let dx = x - state.moveBaseX;
      let dy = y - state.moveBaseY;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        const n = Math.min(1, len / maxDist);
        dx = (dx / len) * n;
        dy = (dy / len) * n;
        state.moveVecX = dx;
        state.moveVecY = dy;
      } else {
        state.moveVecX = 0;
        state.moveVecY = 0;
      }
    }
    return;
  }

  if (id === state.moveTouchId) {
    let dx = x - state.moveBaseX;
    let dy = y - state.moveBaseY;
    const len = Math.hypot(dx, dy);
    if (len > 4) {
      const n = Math.min(1, len / maxDist);
      dx = (dx / len) * n;
      dy = (dy / len) * n;
      state.moveVecX = dx;
      state.moveVecY = dy;
    } else {
      state.moveVecX = 0;
      state.moveVecY = 0;
    }
  } else if (id === state.aimTouchId) {
    let dx = x - state.aimBaseX;
    let dy = y - state.aimBaseY;
    const len = Math.hypot(dx, dy);
    if (len > 4) {
      const n = Math.min(1, len / maxDist);
      dx = (dx / len) * n;
      dy = (dy / len) * n;
      state.aimVecX = dx;
      state.aimVecY = dy;
    } else {
      state.aimVecX = 0;
      state.aimVecY = 0;
    }
  }
}
export function handleTouchEnd(id) {
  const useOneHand = state.controlMode === "oneHand";

  if (id === state.moveTouchId) {
    state.moveTouchId = null;
    state.moveVecX = 0;
    state.moveVecY = 0;
    if (useOneHand) {
      // In one-finger mode there is no separate aim touch.
      return;
    }
  }

  if (id === state.aimTouchId) {
    state.aimTouchId = null;
    state.aimVecX = 0;
    state.aimVecY = 0;
  }
}
export function getMoveVectorFromPointer() {
  return { x: state.moveVecX, y: state.moveVecY };
}

export function isFiringActive() {
  const useOneHand = state.controlMode === "oneHand";

  if (useOneHand) {
    // One-hand auto-fire: firing is gated by aimDir & cooldown,
    // not by holding mouse or touch.
    return true;
  }
  // Two-hand / classic: fire only while mouse or aim-stick is active.
  return state.mouseDown || state.aimTouchId !== null;
}



export function getAimDirectionForPlayer(player, camera, canvas, enemies, attackRange, timeNow = 0) {
  const useOneHand = state.controlMode === "oneHand";

  // One-hand auto-aim mode: Targeting 2.0 (smart priority)
  if (useOneHand) {
    const hasEnemies = Array.isArray(enemies) && enemies.length > 0;
    const maxRange = attackRange && attackRange > 0 ? attackRange : 0;

    if (!hasEnemies || maxRange <= 0) return null;

    const maxR2 = maxRange * maxRange;
    const recentWindow = 3.0;

    const isValid = (e) => {
      if (!e || e.hp <= 0) return false;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > maxR2) return false;
      // If this enemy is no longer present in enemies array, treat as invalid
      // (prevents focusing dead/stale references).
      if (enemies.indexOf(e) === -1) return false;
      return true;
    };

    // 1) lastPlayerTarget (recent)
    if (
      player.lastPlayerTarget &&
      typeof player.lastPlayerTargetAt === "number" &&
      timeNow - player.lastPlayerTargetAt <= recentWindow &&
      isValid(player.lastPlayerTarget)
    ) {
      const dx = player.lastPlayerTarget.x - player.x;
      const dy = player.lastPlayerTarget.y - player.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }

    // 2) lastAttacker (recent)
    if (
      player.lastAttacker &&
      typeof player.lastAttackerAt === "number" &&
      timeNow - player.lastAttackerAt <= recentWindow &&
      isValid(player.lastAttacker)
    ) {
      const dx = player.lastAttacker.x - player.x;
      const dy = player.lastAttacker.y - player.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }

    // 3) lowest HP% in range, tie → nearest
    let best = null;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > maxR2) continue;

      const maxHp = e.maxHp > 0 ? e.maxHp : 1;
      const hpPct = e.hp / maxHp;

      if (
        !best ||
        hpPct < best.hpPct - 1e-6 ||
        (Math.abs(hpPct - best.hpPct) <= 1e-6 && d2 < best.d2)
      ) {
        best = { e, hpPct, d2, dx, dy };
      }
    }

    if (best) {
      const len = Math.sqrt(best.d2) || 1;
      return { x: best.dx / len, y: best.dy / len };
    }

    // No valid target in range — no aim (no shots).
    return null;
  }

// Touch right-stick aim (mobile dual-stick)
  if (state.aimTouchId !== null) {
    const dx = state.aimVecX;
    const dy = state.aimVecY;
    const len = Math.hypot(dx, dy);
    if (len > 0.1) {
      return { x: dx / len, y: dy / len };
    }
  }

  // Mouse aim (PC / desktop)
  const w = canvas.width;
  const h = canvas.height;

  // Pixel_GO camera may use pitch (non-uniform Y scale).
  const zoomX = (camera.zoom || 1);
  const zoomY = (camera.zoom || 1) * (camera.pitch || 1);

  const wx =
    (state.mouseX - w / 2) / zoomX + camera.x;
  const wy =
    (state.mouseY - h / 2) / zoomY + camera.y;

  let dx = wx - player.x;
  let dy = wy - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return null;
  dx /= len;
  dy /= len;
  return { x: dx, y: dy };
}

export function setControlMode(mode) {
  // Normalize external names into internal oneHand / twoHand
  if (mode === "oneHand" || mode === "portraitAuto") {
    state.controlMode = "oneHand";
  } else if (mode === "twoHand" || mode === "classic") {
    state.controlMode = "twoHand";
  } else {
    return;
  }

  if (typeof window !== "undefined") {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(CONTROL_MODE_KEY, state.controlMode);
      }
    } catch (e) {
      // ignore
    }
  }
}

export function getControlMode() {
  if (!state.controlMode) {
    state.controlMode = "oneHand";
  }
  return state.controlMode;
}

