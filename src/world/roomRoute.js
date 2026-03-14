function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

export const SOCKET_VECTORS = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
  E: { dx: 1, dy: 0 },
  NW: { dx: -1, dy: -1 },
  NE: { dx: 1, dy: -1 },
  SW: { dx: -1, dy: 1 },
  SE: { dx: 1, dy: 1 },
  inner_left: { dx: -1, dy: 0 },
  inner_right: { dx: 1, dy: 0 },
  upper_offset: { dx: 0, dy: -1 },
  lower_offset: { dx: 0, dy: 1 },
};

const OPPOSITE = {
  N: 'S',
  S: 'N',
  W: 'E',
  E: 'W',
  NW: 'SE',
  NE: 'SW',
  SW: 'NE',
  SE: 'NW',
  inner_left: 'inner_right',
  inner_right: 'inner_left',
  upper_offset: 'lower_offset',
  lower_offset: 'upper_offset',
};

const PRIMARY_EDGE = {
  N: 'N',
  S: 'S',
  W: 'W',
  E: 'E',
  NW: 'N',
  NE: 'N',
  SW: 'S',
  SE: 'S',
  inner_left: 'W',
  inner_right: 'E',
  upper_offset: 'N',
  lower_offset: 'S',
};

export function normalizeSocket(socket = '', fallback = 'N') {
  const key = String(socket || '').trim();
  return SOCKET_VECTORS[key] ? key : fallback;
}

export function socketVector(socket = '', fallback = 'N') {
  return SOCKET_VECTORS[normalizeSocket(socket, fallback)] || SOCKET_VECTORS[fallback] || SOCKET_VECTORS.N;
}

export function oppositeSocket(socket = '', fallback = 'S') {
  const key = normalizeSocket(socket, fallback);
  return OPPOSITE[key] || fallback;
}

export function primaryEdgeForSocket(socket = '', fallback = 'N') {
  const key = normalizeSocket(socket, fallback);
  return PRIMARY_EDGE[key] || fallback;
}

export function socketFamily(socket = '') {
  const key = normalizeSocket(socket, 'N');
  if (key === 'inner_left' || key === 'inner_right') return 'horizontal_offset';
  if (key === 'upper_offset' || key === 'lower_offset') return 'vertical_offset';
  if (key.length === 2 && key !== 'NW' && key !== 'NE' && key !== 'SW' && key !== 'SE') return 'cardinal';
  if (key === 'N' || key === 'S' || key === 'W' || key === 'E') return 'cardinal';
  return 'diagonal';
}

export function resolveSocketPoint(bounds, centerX = 0, centerY = 0, socket = 'N', { outside = 0, offsetScale = 0.22 } = {}) {
  if (!bounds) return { x: centerX, y: centerY };
  const key = normalizeSocket(socket, 'N');
  const minX = Number(bounds.minX) || 0;
  const maxX = Number(bounds.maxX) || 0;
  const minY = Number(bounds.minY) || 0;
  const maxY = Number(bounds.maxY) || 0;
  const cx = Number.isFinite(Number(centerX)) ? Number(centerX) : (minX + maxX) * 0.5;
  const cy = Number.isFinite(Number(centerY)) ? Number(centerY) : (minY + maxY) * 0.5;
  const offX = (maxX - minX) * clamp(offsetScale, 0.08, 0.34);
  const offY = (maxY - minY) * clamp(offsetScale, 0.08, 0.34);

  switch (key) {
    case 'N': return { x: cx, y: minY - outside };
    case 'S': return { x: cx, y: maxY + outside };
    case 'W': return { x: minX - outside, y: cy };
    case 'E': return { x: maxX + outside, y: cy };
    case 'NW': return { x: minX - outside, y: minY - outside };
    case 'NE': return { x: maxX + outside, y: minY - outside };
    case 'SW': return { x: minX - outside, y: maxY + outside };
    case 'SE': return { x: maxX + outside, y: maxY + outside };
    case 'inner_left': return { x: minX - outside, y: cy - offY };
    case 'inner_right': return { x: maxX + outside, y: cy + offY };
    case 'upper_offset': return { x: cx + offX, y: minY - outside };
    case 'lower_offset': return { x: cx - offX, y: maxY + outside };
    default: return { x: cx, y: minY - outside };
  }
}

export function primaryDirKeyFromVector(dx = 0, dy = -1) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (!x && !y) return 'N';
  if (x > 0 && y < 0) return 'NE';
  if (x < 0 && y < 0) return 'NW';
  if (x > 0 && y > 0) return 'SE';
  if (x < 0 && y > 0) return 'SW';
  if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'E' : 'W';
  return y >= 0 ? 'S' : 'N';
}
