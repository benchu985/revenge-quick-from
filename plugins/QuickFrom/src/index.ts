import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import patchMessageSheet from "./patches/messageSheet";
import patchProfileSheet from "./patches/profileSheet";
import patchAvatar from "./patches/avatarDoubleTap";
import Settings from "./Settings";

const unpatches: Array<(() => void) | null | undefined> = [];

function defaults() {
  const s = storage as any;
  if (s.doubleTapAvatar === undefined) s.doubleTapAvatar = true;
  if (s.messageSheet === undefined) s.messageSheet = true;
  if (s.profileSheet === undefined) s.profileSheet = true;
  if (s.preferUserId === undefined) s.preferUserId = true;
  if (s.includeChannel === undefined) s.includeChannel = false;
  if (s.doubleTapMs === undefined) s.doubleTapMs = 350;
  if (s.showToastOnSearch === undefined) s.showToastOnSearch = true;
}

export const onLoad = () => {
  try {
    defaults();
  } catch (e) {
    console.error("[QuickFrom] defaults", e);
  }

  // message sheet first — most reliable, lowest crash risk
  try {
    const u = patchMessageSheet();
    if (u) unpatches.push(u);
  } catch (e) {
    console.error("[QuickFrom] messageSheet", e);
  }

  try {
    const u = patchProfileSheet();
    if (u) unpatches.push(u);
  } catch (e) {
    console.error("[QuickFrom] profileSheet", e);
  }

  try {
    const ups = patchAvatar();
    if (Array.isArray(ups)) {
      for (const u of ups) if (u) unpatches.push(u);
    }
  } catch (e) {
    console.error("[QuickFrom] avatar", e);
  }

  try {
    showToast(
      "QuickFrom 已启动",
      getAssetIDByName("ic_search") ?? getAssetIDByName("Check"),
    );
  } catch {
    try {
      showToast("QuickFrom 已启动");
    } catch {}
  }

  console.log("[QuickFrom] loaded patches=", unpatches.length);
};

export const onUnload = () => {
  for (const u of unpatches) {
    try {
      u?.();
    } catch {}
  }
  unpatches.length = 0;
};

export const settings = Settings;
