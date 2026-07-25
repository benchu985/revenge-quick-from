import { logger } from "@vendetta";
import { ensureDefaults } from "./lib/search";
import patchAvatarDoubleTap from "./patches/avatarDoubleTap";
import patchMessageSheet from "./patches/messageSheet";
import patchProfileSheet from "./patches/profileSheet";
import Settings from "./Settings";

const unpatches: Array<(() => void) | null | undefined | (() => void)[]> = [];

export const onLoad = () => {
  ensureDefaults();

  try {
    unpatches.push(...patchAvatarDoubleTap());
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

  logger?.info?.("[QuickFrom] loaded");
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
