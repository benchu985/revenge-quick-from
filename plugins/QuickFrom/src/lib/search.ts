import { findByProps, findByName } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import ResultsPage from "../ResultsPage";
import { getUserId, getUserTag } from "./user";
export { getUserId, getUserTag };

export type QuickFromSettings = {
  doubleTapAvatar: boolean;
  messageSheet: boolean;
  profileSheet: boolean;
  preferUserId: boolean;
  includeChannel: boolean;
  doubleTapMs: number;
  showToastOnSearch: boolean;
};

export const settings = storage as QuickFromSettings;

export function ensureDefaults() {
  if (settings.doubleTapAvatar === undefined) settings.doubleTapAvatar = true;
  if (settings.messageSheet === undefined) settings.messageSheet = true;
  if (settings.profileSheet === undefined) settings.profileSheet = true;
  if (settings.preferUserId === undefined) settings.preferUserId = true; // id more reliable
  if (settings.includeChannel === undefined) settings.includeChannel = false;
  if (settings.doubleTapMs === undefined) settings.doubleTapMs = 350;
  if (settings.showToastOnSearch === undefined) settings.showToastOnSearch = true;
}

function safeFindByProps(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

function safeFindByName(name: string, def = false) {
  try {
    return findByName(name, def);
  } catch {
    return null;
  }
}

export function buildFromQuery(user: any): string {
  ensureDefaults();
  const id = getUserId(user);
  const tag = getUserTag(user);

  if (settings.preferUserId && id) return `from:${id}`;
  if (tag) {
    const needsQuote = /[\s:]/.test(tag);
    return needsQuote ? `from:"${tag}"` : `from:${tag}`;
  }
  if (id) return `from:${id}`;
  return "from:";
}

/** Open our own results page (does NOT rely on native search UI). */
export function openFromSearch(user: any): boolean {
  ensureDefaults();
  const id = getUserId(user);
  if (!id && !getUserTag(user)) {
    showToast(
      "QuickFrom: 拿不到用户信息",
      getAssetIDByName("ic_close_circle") ?? getAssetIDByName("Close"),
    );
    return false;
  }

  const Navigation =
    safeFindByProps("push", "pushLazy", "pop") ??
    safeFindByProps("push", "pop");
  const Navigator =
    safeFindByName("Navigator") ??
    safeFindByProps("Navigator")?.Navigator;
  const modalCloseButton =
    safeFindByProps("getRenderCloseButton")?.getRenderCloseButton ??
    safeFindByProps("getHeaderCloseButton")?.getHeaderCloseButton;

  if (!Navigation?.push || !Navigator) {
    showToast(
      "QuickFrom: 找不到导航模块",
      getAssetIDByName("ic_close_circle") ?? getAssetIDByName("Close"),
    );
    console.error("[QuickFrom] Navigation/Navigator missing", {
      Navigation: !!Navigation,
      Navigator: !!Navigator,
    });
    return false;
  }

  const title = `from:${getUserTag(user) || id}`;

  const screen = () =>
    React.createElement(Navigator, {
      initialRouteName: "QuickFromResults",
      goBackOnBackPress: true,
      screens: {
        QuickFromResults: {
          title,
          headerLeft: modalCloseButton
            ? modalCloseButton(() => Navigation.pop())
            : undefined,
          render: () => React.createElement(ResultsPage, { user }),
        },
      },
    });

  try {
    Navigation.push(screen);
    if (settings.showToastOnSearch) {
      showToast(
        `搜索 ${title}`,
        getAssetIDByName("ic_search") ?? getAssetIDByName("SearchIcon"),
      );
    }
    return true;
  } catch (e) {
    console.error("[QuickFrom] Navigation.push failed", e);
    // some builds want component class not function
    try {
      Navigation.push(screen as any, {});
      return true;
    } catch (e2) {
      console.error("[QuickFrom] push retry failed", e2);
      showToast(
        "打开结果页失败: " + String(e2)?.slice(0, 80),
        getAssetIDByName("ic_close_circle"),
      );
      return false;
    }
  }
}

export function isDoubleTap(key: string): boolean {
  ensureDefaults();
  const now = Date.now();
  const store = (isDoubleTap as any)._last ?? ((isDoubleTap as any)._last = {});
  const prev = store[key] ?? 0;
  store[key] = now;
  return now - prev <= (settings.doubleTapMs || 350);
}
