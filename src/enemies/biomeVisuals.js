function hsla(h, s, l, a) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

export function biomeStyleForKey(biomeKey = '') {
  const key = String(biomeKey || '').toLowerCase();
  const map = {
    electric: {
      key,
      hue: 190,
      fill: 'rgba(76,236,255,0.96)',
      glow: 'rgba(90,245,255,0.28)',
      edge: 'rgba(180,252,255,0.95)',
      dark: 'rgba(12,34,42,0.90)',
      role: 'spark',
      eliteRole: 'storm',
    },
    fire: {
      key,
      hue: 18,
      fill: 'rgba(255,126,74,0.96)',
      glow: 'rgba(255,124,52,0.28)',
      edge: 'rgba(255,208,120,0.95)',
      dark: 'rgba(56,18,10,0.90)',
      role: 'brute',
      eliteRole: 'crusher',
    },
    ice: {
      key,
      hue: 210,
      fill: 'rgba(126,178,255,0.96)',
      glow: 'rgba(138,192,255,0.26)',
      edge: 'rgba(230,247,255,0.95)',
      dark: 'rgba(18,34,58,0.88)',
      role: 'guard',
      eliteRole: 'warden',
    },
    dark: {
      key,
      hue: 282,
      fill: 'rgba(188,126,255,0.94)',
      glow: 'rgba(174,108,255,0.24)',
      edge: 'rgba(236,195,255,0.92)',
      dark: 'rgba(26,12,36,0.92)',
      role: 'stalker',
      eliteRole: 'reaper',
    },
    light: {
      key,
      hue: 52,
      fill: 'rgba(255,228,126,0.98)',
      glow: 'rgba(255,236,136,0.28)',
      edge: 'rgba(255,252,228,0.96)',
      dark: 'rgba(78,58,14,0.86)',
      role: 'weaver',
      eliteRole: 'oracle',
    },
    neutral: {
      key: 'neutral',
      hue: 340,
      fill: 'rgba(255,95,111,0.92)',
      glow: 'rgba(255,95,111,0.22)',
      edge: 'rgba(255,180,190,0.95)',
      dark: 'rgba(50,14,20,0.88)',
      role: 'basic',
      eliteRole: 'elite',
    },
  };
  return map[key] || map.neutral;
}

export function biomeKeyFromKind(kind = '') {
  const k = String(kind || '').toLowerCase();
  if (k.includes('electric')) return 'electric';
  if (k.includes('fire')) return 'fire';
  if (k.includes('ice')) return 'ice';
  if (k.includes('dark')) return 'dark';
  if (k.includes('light')) return 'light';
  return '';
}

export function biomeRoleFromKind(kind = '') {
  const k = String(kind || '').toLowerCase();
  if (!k) return '';
  if (k.includes('storm')) return 'storm';
  if (k.includes('crusher')) return 'crusher';
  if (k.includes('warden')) return 'warden';
  if (k.includes('reaper')) return 'reaper';
  if (k.includes('oracle')) return 'oracle';
  if (k.includes('spark')) return 'spark';
  if (k.includes('brute')) return 'brute';
  if (k.includes('guard')) return 'guard';
  if (k.includes('stalker')) return 'stalker';
  if (k.includes('weaver')) return 'weaver';
  const biomeKey = biomeKeyFromKind(k);
  const style = biomeStyleForKey(biomeKey);
  return k.includes('elite') ? (style.eliteRole || style.role || 'basic') : (style.role || 'basic');
}

function drawStar(ctx, points, outerR, innerR) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawBody(ctx, role, r) {
  if (role === 'spark') {
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.02);
    ctx.lineTo(r * 0.82, 0);
    ctx.lineTo(0, r * 1.02);
    ctx.lineTo(-r * 0.82, 0);
    ctx.closePath();
  } else if (role === 'storm') {
    drawStar(ctx, 3, r * 1.06, r * 0.52);
  } else if (role === 'brute') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.82, -r * 0.30);
    ctx.lineTo(-r * 0.46, -r * 0.90);
    ctx.lineTo(r * 0.46, -r * 0.90);
    ctx.lineTo(r * 0.82, -r * 0.30);
    ctx.lineTo(r * 0.74, r * 0.58);
    ctx.lineTo(0, r * 0.98);
    ctx.lineTo(-r * 0.74, r * 0.58);
    ctx.closePath();
  } else if (role === 'crusher') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.96, -r * 0.08);
    ctx.lineTo(-r * 0.56, -r * 0.90);
    ctx.lineTo(r * 0.56, -r * 0.90);
    ctx.lineTo(r * 0.96, -r * 0.08);
    ctx.lineTo(r * 0.62, r * 0.94);
    ctx.lineTo(-r * 0.62, r * 0.94);
    ctx.closePath();
  } else if (role === 'guard') {
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.02);
    ctx.lineTo(r * 0.78, -r * 0.18);
    ctx.lineTo(r * 0.40, r * 0.94);
    ctx.lineTo(-r * 0.40, r * 0.94);
    ctx.lineTo(-r * 0.78, -r * 0.18);
    ctx.closePath();
  } else if (role === 'warden') {
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.08);
    ctx.lineTo(r * 0.92, -r * 0.24);
    ctx.lineTo(r * 0.60, r * 0.90);
    ctx.lineTo(0, r * 1.08);
    ctx.lineTo(-r * 0.60, r * 0.90);
    ctx.lineTo(-r * 0.92, -r * 0.24);
    ctx.closePath();
  } else if (role === 'stalker') {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.88, Math.PI * 0.20, Math.PI * 1.80, false);
    ctx.arc(r * 0.28, 0, r * 0.62, Math.PI * 1.55, Math.PI * 0.45, true);
    ctx.closePath();
  } else if (role === 'reaper') {
    ctx.beginPath();
    ctx.arc(-r * 0.18, 0, r * 0.94, Math.PI * 0.14, Math.PI * 1.86, false);
    ctx.arc(r * 0.34, 0, r * 0.70, Math.PI * 1.48, Math.PI * 0.52, true);
    ctx.closePath();
  } else if (role === 'weaver') {
    drawStar(ctx, 4, r, r * 0.46);
  } else if (role === 'oracle') {
    drawStar(ctx, 5, r * 1.04, r * 0.40);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawFace(ctx, role, r, t, style) {
  ctx.fillStyle = style.dark;
  if (role === 'spark' || role === 'storm') {
    ctx.fillRect(-r * 0.24, -r * 0.22, r * 0.18, r * 0.18);
    ctx.fillRect(r * 0.06, -r * 0.22, r * 0.18, r * 0.18);
    ctx.fillRect(-r * 0.12, 0.02, r * 0.24, r * 0.14);
  } else if (role === 'brute' || role === 'crusher') {
    ctx.fillRect(-r * 0.36, -r * 0.22, r * 0.18, r * 0.18);
    ctx.fillRect(r * 0.18, -r * 0.22, r * 0.18, r * 0.18);
    ctx.fillRect(-r * 0.22, 0.10, r * 0.44, r * 0.14);
  } else if (role === 'guard' || role === 'warden') {
    ctx.fillRect(-r * 0.24, -r * 0.18, r * 0.16, r * 0.16);
    ctx.fillRect(r * 0.08, -r * 0.18, r * 0.16, r * 0.16);
    ctx.fillRect(-r * 0.14, 0.04, r * 0.28, r * 0.12);
  } else if (role === 'stalker' || role === 'reaper') {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.34, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (role === 'weaver' || role === 'oracle') {
    const pulse = 0.72 + 0.28 * Math.sin(t * (role === 'oracle' ? 3.8 : 3.0));
    ctx.fillStyle = hsla(style.hue, 12, 100, 0.96 * pulse);
    ctx.fillRect(-r * 0.12, -r * 0.30, r * 0.24, r * 0.60);
    ctx.fillRect(-r * 0.30, -r * 0.12, r * 0.60, r * 0.24);
  }
}

function drawAccent(ctx, role, r, t, style, isBasic, isElite) {
  ctx.strokeStyle = style.edge;
  ctx.fillStyle = style.edge;
  ctx.lineWidth = Math.max(1.5, r * (isBasic ? 0.09 : 0.11));

  if (role === 'spark') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
    for (let k = 0; k < 2; k++) {
      const a = t * 2.8 + k * Math.PI * 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.10 + 0.10 * pulse), a, a + 0.9);
      ctx.stroke();
    }
  } else if (role === 'storm') {
    const pulse = 0.55 + 0.45 * Math.sin(t * 5.8);
    for (let i = 0; i < 3; i++) {
      const a = t * 2.4 + i * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22);
      ctx.lineTo(Math.cos(a) * r * (1.08 + 0.10 * pulse), Math.sin(a) * r * (1.08 + 0.10 * pulse));
      ctx.stroke();
    }
  } else if (role === 'brute') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.52, -r * 0.88);
    ctx.lineTo(-r * 0.26, -r * 1.12);
    ctx.lineTo(-r * 0.14, -r * 0.76);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.52, -r * 0.88);
    ctx.lineTo(r * 0.26, -r * 1.12);
    ctx.lineTo(r * 0.14, -r * 0.76);
    ctx.stroke();
  } else if (role === 'crusher') {
    ctx.strokeRect(-r * 0.54, -r * 0.48, r * 1.08, r * 0.22);
    ctx.strokeRect(-r * 0.34, 0.18, r * 0.68, r * 0.16);
  } else if (role === 'guard') {
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + i * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16);
      ctx.lineTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
      ctx.stroke();
    }
  } else if (role === 'warden') {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, -Math.PI * 0.86, -Math.PI * 0.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, r * 0.10, r * 0.64, Math.PI * 0.14, Math.PI * 0.86);
    ctx.stroke();
  } else if (role === 'stalker') {
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    ctx.arc(-r * 0.08, 0, r * 1.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = hsla(style.hue, 85, 72, 0.8);
    ctx.beginPath();
    ctx.arc(r * 0.08, 0, r * 0.58, Math.PI * 0.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (role === 'reaper') {
    ctx.globalAlpha = 0.20;
    ctx.beginPath();
    ctx.arc(-r * 0.16, 0, r * 1.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(r * 0.14, 0, r * 0.68, Math.PI * 0.18, Math.PI * 1.82);
    ctx.stroke();
  } else if (role === 'weaver') {
    for (let i = 0; i < 4; i++) {
      const a = t * 0.7 + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.20, Math.sin(a) * r * 0.20);
      ctx.lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
      ctx.stroke();
    }
  } else if (role === 'oracle') {
    for (let i = 0; i < 5; i++) {
      const a = t * 0.8 + (i * Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
      ctx.lineTo(Math.cos(a) * r * 1.18, Math.sin(a) * r * 1.18);
      ctx.stroke();
    }
  }

  if (isElite) {
    ctx.strokeStyle = hsla(style.hue, 100, 96, 0.92);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.22, -Math.PI * 0.62, Math.PI * 0.62);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.34, Math.PI * 0.38, Math.PI * 1.62);
    ctx.stroke();
  }
}

export function renderBiomeUnit(ctx, self, biomeKey = '', opts = {}) {
  const style = biomeStyleForKey(biomeKey);
  const role = opts.role || (opts.isElite ? style.eliteRole : style.role) || 'basic';
  const r = Number(opts.radius || self.radius || 20) || 20;
  const t = Number(opts.time ?? self._vfxT ?? 0);
  const isBasic = !!opts.isBasic;
  const isElite = !!opts.isElite;
  const ang = Number(self._renderAngle || 0);

  ctx.save();
  ctx.translate(self.x, self.y);
  ctx.rotate(ang);

  ctx.fillStyle = style.glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * ((isElite ? 1.58 : 1.42) + (isBasic ? 0.02 : 0.08) * Math.sin(t * 2.5)), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hsla(style.hue, 80, isBasic ? 22 : 18, 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = style.fill;
  drawBody(ctx, role, r);

  ctx.strokeStyle = hsla(style.hue, 90, 96, 0.24);
  ctx.lineWidth = Math.max(1.2, r * 0.08);
  drawBody(ctx, role, r * 0.94);
  ctx.stroke();

  ctx.fillStyle = hsla(style.hue, 78, 70, isBasic ? 0.20 : 0.24);
  ctx.beginPath();
  ctx.arc(-r * 0.14, -r * 0.16, r * 0.52, 0, Math.PI * 2);
  ctx.fill();

  drawAccent(ctx, role, r, t, style, isBasic, isElite);
  drawFace(ctx, role, r, t, style);

  ctx.restore();
}
