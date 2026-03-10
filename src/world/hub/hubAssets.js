import hubArchUrl from "../../assets/hub/hub_arch_base_4k.png";
import hubSpaceBgUrl from "../../assets/hub/hub_space_bg_4k.jpg";
import hubCoreGlowUrl from "../../assets/hub/hub_core_glow.png";
import hubPortalBeamUrl from "../../assets/hub/hub_portal_beam.png";
import hubSparkUrl from "../../assets/hub/hub_spark.png";

const HUB_ASSET_URLS = {
  arch: hubArchUrl,
  bg: hubSpaceBgUrl,
  coreGlow: hubCoreGlowUrl,
  portalBeam: hubPortalBeamUrl,
  spark: hubSparkUrl,
};

const textureCache = new Map();

export function getHubTexture(url) {
  if (!url) return null;
  let entry = textureCache.get(url);
  if (entry) return entry;
  const img = new Image();
  entry = { img, loaded: false, url };
  img.onload = () => { entry.loaded = true; };
  img.onerror = () => { entry.loaded = false; entry.error = true; };
  img.src = url;
  textureCache.set(url, entry);
  return entry;
}

export function getHubAssetSet() {
  return {
    arch: getHubTexture(HUB_ASSET_URLS.arch),
    bg: getHubTexture(HUB_ASSET_URLS.bg),
    coreGlow: getHubTexture(HUB_ASSET_URLS.coreGlow),
    portalBeam: getHubTexture(HUB_ASSET_URLS.portalBeam),
    spark: getHubTexture(HUB_ASSET_URLS.spark),
  };
}

export function warmHubAssets() {
  return getHubAssetSet();
}

export { HUB_ASSET_URLS };
