import { WORLD_SQUARE_HALF } from "./zoneController.js";

// World 2.0 bounds — centered at (0,0), square outer bounds.
// Pixel_GO overrides these with dynamic room bounds.
export const WORLD_HALF_SIZE = WORLD_SQUARE_HALF;

// Keep legacy exports (some render code uses WORLD_WIDTH/WORLD_HEIGHT)
export const WORLD_WIDTH = WORLD_HALF_SIZE * 2;
export const WORLD_HEIGHT = WORLD_HALF_SIZE * 2;

let _dynamicWorldBounds = null;

/**
 * Pixel_GO: set dynamic bounds (typically the current room, or union of current+next during transition).
 * Pass null to restore default world bounds.
 */
export function setDynamicWorldBounds(bounds) {
  if (!bounds) {
    _dynamicWorldBounds = null;
    return;
  }
  _dynamicWorldBounds = {
    minX: Number(bounds.minX) || 0,
    maxX: Number(bounds.maxX) || 0,
    minY: Number(bounds.minY) || 0,
    maxY: Number(bounds.maxY) || 0,
  };
}

export function getWorldBounds() {
  if (_dynamicWorldBounds) return _dynamicWorldBounds;
  return {
    minX: -WORLD_HALF_SIZE,
    maxX: WORLD_HALF_SIZE,
    minY: -WORLD_HALF_SIZE,
    maxY: WORLD_HALF_SIZE,
  };
}
