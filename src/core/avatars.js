// Emoji avatars + unlock helpers.
// Rule: 2 avatars per Start Level (L0 => 2, L1 => 4, ...).

export const AVATARS = [
  // Faces
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃",
  "😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙",
  "😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔",
  "🤨","😐","😑","😶","🫥","😏","😒","🙄","😬","😮‍💨",
  "😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮",
  "🥵","🥶","😵","😵‍💫","🤯","😎","🥳","😈","👿","💀",

  // People / roles
  "👶","🧒","👦","👧","🧑","👨","👩","🧔","👨‍🦱","👩‍🦰",
  "🧙","🧚","🧛","🧟","🧞","🧜","🧝","🥷","🦸","🦹",

  // Animals
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
  "🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧",
  "🐦","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪲","🦋",

  // Nature
  "🌵","🌲","🌳","🌴","🌱","🍀","🌿","🌺","🌸","🌼",
  "🌙","⭐","🌟","✨","⚡","🔥","💧","❄️","🌈","☀️",

  // Objects / icons
  "🎯","🎮","🕹️","🎲","♟️","🧩","🎧","🎵","🎸","🥁",
  "📌","📎","💎","🔮","🧪","🧬","🛰️","🚀","🛸","🤖",
  "👾","🧠","🛡️","⚔️","🏹","🔫","💣","🧨","🔧","⚙️",

  // Symbols
  "❤️","🧡","💛","💚","💙","💜","🤍","🖤","💔","💥",
  "✅","❌","⚠️","💫","💤","🌀","👑","🏆","🥇","🔱",
];

export function getUnlockedAvatarCount(startLevel) {
  // Pixel PVE: all avatars are available immediately.
  // (startLevel kept for backward-compat and future gating if needed)
  return AVATARS.length;
}

export function isAvatarUnlocked(startLevel, avatarIndex) {
  const idx = avatarIndex | 0;
  if (idx < 0) return false;
  return idx < getUnlockedAvatarCount(startLevel);
}

export function clampAvatarIndex(startLevel, avatarIndex) {
  const idx = Math.max(0, avatarIndex | 0);
  const unlocked = getUnlockedAvatarCount(startLevel);
  // Keep within unlocked range; if somehow out-of-range, fall back to last unlocked.
  return Math.min(idx, Math.max(0, unlocked - 1));
}
