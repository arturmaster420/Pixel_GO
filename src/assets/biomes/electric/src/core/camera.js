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
    const clamp = (n, a, b) => (n < a ? a : (n > b ? b : n));

    const room = state?.roomDirector?.current || null;
    const isHub = !!(room && (room.index | 0) <= 0);
    const roomSide = room?.side || ((state && (state._hubSide | 0) > 0) ? (state._hubSide | 0) : 600);
    const bounds = room?.bounds || null;
    const spanW = bounds ? Math.max(1, (bounds.maxX - bounds.minX)) : roomSide;
    const spanH = bounds ? Math.max(1, (bounds.maxY - bounds.minY)) : roomSide;
    const span = Math.max(1, spanW, spanH);

    // Hub camera: keep the hero scene tighter instead of fitting the whole HUB.
    const lookAhead = isHub
      ? clamp(28 + span * 0.012, 28, 42)
      : clamp(92 + span * 0.055, 92, 210);

    const targetX = player.x;
    const targetY = player.y - lookAhead;

    const lerpPos = dt * this.positionLerp;
    const tPos = lerpPos > 1 ? 1 : lerpPos;

    this.x += (targetX - this.x) * tPos;
    this.y += (targetY - this.y) * tPos;

    const pad = isHub
      ? clamp(54 + span * 0.06, 54, 94)
      : clamp(72 + span * 0.075, 72, 180);
    const targetSpan = Math.max(span + pad, spanW * 1.02, spanH * 1.08);

    const p = this.pitch || 1;
    const fitZoom = Math.min((w / targetSpan), ((h / targetSpan) / p));
    const fillZoom = Math.max((w / targetSpan), ((h / targetSpan) / p));

    const fillBias = clamp(((this._aspect - 1) / 1.5), 0, 1) * (isHub ? 0.42 : 0.50);
    let targetZoom = fitZoom + (fillZoom - fitZoom) * fillBias;

    // In HUB we intentionally stop fitting the whole arena to screen.
    // User request: camera should be about 2x closer to the hero there.
    if (isHub) targetZoom *= 2.0;

    const MIN_ZOOM = this._isMobile ? 0.34 : 0.28;
    const MAX_ZOOM = this._isMobile ? 2.1 : 2.6;
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
