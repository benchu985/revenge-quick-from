import { logger } from "@vendetta";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { ensureDefaults } from "./lib/search";
import patchAvatarDoubleTap from "./patches/avatarDoubleTap";
import patchMessageSheet from "./patches/messageSheet";
import patchProfileSheet from "./patches/profileSheet";
import Settings from "./Settings";

const unpatches: Array<(() => void) | null | undefined | (() => void)[]> = [];

export const onLoad = () => {
  try {
    ensureDefaults();
  } catch (e) {
    console.error("[QuickFrom] ensureDefaults", e);
  }

  try {
    const ups = patchAvatarDoubleTap();
    if (Array.isArray(ups)) unpatches.push(...ups);
  } catch (e) {
    logger?.error?.("[QuickFrom] avatar patch failed", e);
    console.error("[QuickFrom] avatar patch failed", e);
  }

  try {
    unpatches.push(patchMessageSheet());
  } catch (e) {
    logger?.error?.("[QuickFrom] message sheet failed", e);
    console.error("[QuickFrom] message sheet failed", e);
  }

  try {
    unpatches.push(patchProfileSheet());
  } catch (e) {
    logger?.error?.("[QuickFrom] profile sheet failed", e);
    console.error("[QuickFrom] profile sheet failed", e);
  }

  try {
    showToast(
      "QuickFrom 已启动",
      getAssetIDByName("ic_search") ?? getAssetIDByName("Check"),
    );
  } catch {}

  logger?.info?.("[QuickFrom] loaded");
  console.log("[QuickFrom] loaded, patches:", unpatches.length);
};

export const onUnload = () => {
  for (const u of unpatches) {
    try {
      if (Array.isArray(u)) u.forEach((fn) => fn?.());
      else u?.();
    } catch {}
  }
  unpatches.length = 0;
};

export const settings = Settings;
