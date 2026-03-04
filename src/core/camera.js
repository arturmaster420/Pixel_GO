export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;

    this.zoom = 1;

    // Pixel_GO: "top-behind" camera (MOBA-like).
    // We simulate pitch by compressing Y in render space.
    // 1.0 = pure top-down, 0.75..0.9 = angled.
    this.pitch = 0.84;

    this.positionLerp = 8;
    this.zoomLerp = 4;

    this._lastW = 0;
    this._lastH = 0;
    this._aspect = 1;
    this._isMobile = false;
    this._isLandscape = true;

    // Kept for backward-compat; unused in Pixel_GO.
    this._zoomLockRange = null;
  }

  _updateCanvasInfo() {
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;

    if (w === this._lastW && h === this._lastH) return;

    this._lastW = w;
    this._lastH = h;

    this._aspect = w / h;
    const maxDim = w > h ? w : h;
    this._isMobile = maxDim < 1000;
    this._isLandscape = this._aspect >= 1;
  }

  update(player, dt, state = null) {
    if (!player) return;
    this._updateCanvasInfo();

    const w = this._lastW;
    const h = this._lastH;

    // Pixel_GO: look-ahead ("camera shifted back") so more forward space is visible.
    // Forward direction is up = negative Y.
    const hubSide = (state && (state._hubSide | 0) > 0) ? (state._hubSide | 0) : 600;

    const roomSide = state && state.roomDirector && state.roomDirector.current
      ? (state.roomDirector.current.side || hubSide)
      : hubSide;

    const clamp = (n, a, b) => (n < a ? a : (n > b ? b : n));

    const lookAhead = clamp(180 + (roomSide - hubSide) * 0.05, 180, 420);

    const targetX = player.x;
    const targetY = player.y - lookAhead;

    const lerpPos = dt * this.positionLerp;
    const tPos = lerpPos > 1 ? 1 : lerpPos;

    this.x += (targetX - this.x) * tPos;
    this.y += (targetY - this.y) * tPos;

    // Pixel_GO: zoom depends on ROOM size (NOT player range).
    // Keep the platform large on screen: minimal padding + mild "fill" bias on wide screens
    // (so you don't see too much empty space on the sides).
    const pad = clamp(90 + roomSide * 0.02, 90, 240);
    const span = Math.max(1, roomSide + pad);

    const p = this.pitch || 1;
    // Because we scale Y by (zoom*pitch), the effective Y-fit zoom is (h/span)/pitch.
    const fitZoom = Math.min((w / span), ((h / span) / p));
    const fillZoom = Math.max((w / span), ((h / span) / p));

    // 0 on near-square screens; up to ~0.75 on very wide screens.
    const fillBias = clamp(((this._aspect - 1) / 1.3), 0, 1) * 0.75;
    let targetZoom = fitZoom + (fillZoom - fitZoom) * fillBias;

    // Clamps (prevents extreme zoom-in/out across devices)
    const MIN_ZOOM = this._isMobile ? 0.24 : 0.18;
    const MAX_ZOOM = this._isMobile ? 2.0 : 2.4;
    if (targetZoom < MIN_ZOOM) targetZoom = MIN_ZOOM;
    if (targetZoom > MAX_ZOOM) targetZoom = MAX_ZOOM;

    const lerpZoom = dt * this.zoomLerp;
    const tZoom = lerpZoom > 1 ? 1 : lerpZoom;

    this.zoom += (targetZoom - this.zoom) * tZoom;
  }

  applyTransform(ctx) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    const z = this.zoom || 1;
    const p = this.pitch || 1;
    ctx.scale(z, z * p);
    ctx.translate(-this.x, -this.y);
  }

  resetTransform(ctx) {
    ctx.restore();
  }

  // World-space viewport size in world units (accounts for pitch).
  getViewSizeWorld() {
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    const z = this.zoom || 1;
    const p = this.pitch || 1;
    return { w: w / z, h: h / (z * p) };
  }
}
