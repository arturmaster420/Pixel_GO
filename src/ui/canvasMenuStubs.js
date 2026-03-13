// Minimal stubs for deprecated canvas menu pieces.
// The project uses the DOM lobby as the only active menu.
// We keep these exports so older code paths (e.g. state.mode === "settings") remain safe no-ops.

export function renderSettingsMenu(ctx, state) {
  // no-op
}

export function handleSettingsClick(x, y, state) {
  return null;
}
