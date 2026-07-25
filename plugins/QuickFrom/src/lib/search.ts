import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, ReactNative, clipboard } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";

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
  if (settings.preferUserId === undefined) settings.preferUserId = false;
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

function safeFindByStore(name: string) {
  try {
    return findByStoreName?.(name) ?? null;
  } catch {
    return null;
  }
}

export function getUserTag(user: any): string {
  if (!user) return "";
  const username = user.username ?? user.user?.username ?? "";
  const disc = user.discriminator ?? user.user?.discriminator;
  if (disc && disc !== "0" && disc !== "0000") {
    return `${username}#${disc}`;
  }
  return username;
}

export function getUserId(user: any): string | null {
  return (
    user?.id ??
    user?.userId ??
    user?.user?.id ??
    user?.author?.id ??
    null
  );
}

export function buildFromQuery(user: any): string {
  ensureDefaults();
  const id = getUserId(user);
  const tag = getUserTag(user);

  let fromPart: string;
  if (settings.preferUserId && id) {
    fromPart = `from:${id}`;
  } else if (tag) {
    const needsQuote = /[\s:]/.test(tag);
    fromPart = needsQuote ? `from:"${tag}"` : `from:${tag}`;
  } else if (id) {
    fromPart = `from:${id}`;
  } else {
    fromPart = "from:";
  }

  if (!settings.includeChannel) return fromPart;

  try {
    const SelectedChannelStore =
      safeFindByStore("SelectedChannelStore") ??
      safeFindByProps("getChannelId", "getLastSelectedChannelId");
    const channelId =
      SelectedChannelStore?.getChannelId?.() ??
      SelectedChannelStore?.getLastSelectedChannelId?.();
    if (channelId) return `${fromPart} in:${channelId}`;
  } catch {}

  return fromPart;
}

function copyText(text: string) {
  try {
    clipboard?.setString?.(text);
    return;
  } catch {}
  try {
    ReactNative?.Clipboard?.setString?.(text);
  } catch {}
}

/**
 * Open Discord search with from: query. Multi-fallback for module renames.
 */
export function openFromSearch(user: any): boolean {
  ensureDefaults();
  const query = buildFromQuery(user);
  if (!query || query === "from:") {
    showToast(
      "QuickFrom: 拿不到用户信息",
      getAssetIDByName("ic_close_circle") ?? getAssetIDByName("Close"),
    );
    return false;
  }

  const tried: string[] = [];

  const searchUi =
    safeFindByProps("openSearch") ??
    safeFindByProps("openSearch", "dismissSearch") ??
    safeFindByProps("openSearch", "closeSearch");

  if (searchUi?.openSearch) {
    tried.push("openSearch");
    for (const arg of [
      { query },
      query,
      { searchQuery: query, queryString: query },
    ] as any[]) {
      try {
        searchUi.openSearch(arg);
        notify(query);
        return true;
      } catch {}
    }
  }

  const searchActions =
    safeFindByProps("search", "setQuery") ??
    safeFindByProps("setSearchQuery") ??
    safeFindByProps("updateSearchQuery") ??
    safeFindByProps("setQueryString");

  if (searchActions) {
    tried.push("searchActions");
    try {
      searchActions.setSearchQuery?.(query);
      searchActions.updateSearchQuery?.(query);
      searchActions.setQueryString?.(query);
      searchActions.setQuery?.(query);
      searchActions.search?.(query);
      searchUi?.openSearch?.();
      notify(query);
      return true;
    } catch {}
  }

  const dispatcher = FluxDispatcher ?? safeFindByProps("dispatch", "subscribe");
  if (dispatcher?.dispatch) {
    tried.push("FluxDispatcher");
    for (const p of [
      { type: "SEARCH_SET_QUERY", query },
      { type: "SEARCH_QUERY_UPDATED", query },
      { type: "SEARCH_START", query },
      { type: "SEARCH_MODAL_OPEN", query },
      { type: "LAYER_PUSH", layer: "SEARCH", query },
    ]) {
      try {
        dispatcher.dispatch(p);
      } catch {}
    }
    try {
      searchUi?.openSearch?.({ query });
      notify(query);
      return true;
    } catch {}
  }

  const Navigation =
    safeFindByProps("push", "pushLazy", "pop") ??
    safeFindByProps("push", "back");
  if (Navigation?.push) {
    tried.push("Navigation");
    try {
      Navigation.push("Search", { query });
      notify(query);
      return true;
    } catch {}
    try {
      Navigation.push("GuildSearch", { queryString: query });
      notify(query);
      return true;
    } catch {}
  }

  // clipboard fallback
  copyText(query);
  showToast(
    `已复制 ${query}，打开搜索粘贴即可`,
    getAssetIDByName("ic_copy_message_link") ??
      getAssetIDByName("CopyIcon") ??
      getAssetIDByName("ic_search"),
  );
  console.log("[QuickFrom] fallback clipboard. tried:", tried.join(","), "query:", query);
  return true;
}

function notify(query: string) {
  if (!settings.showToastOnSearch) return;
  showToast(
    `搜索 ${query}`,
    getAssetIDByName("ic_search") ?? getAssetIDByName("SearchIcon"),
  );
}

export function isDoubleTap(key: string): boolean {
  ensureDefaults();
  const now = Date.now();
  const store = (isDoubleTap as any)._last ?? ((isDoubleTap as any)._last = {});
  const prev = store[key] ?? 0;
  store[key] = now;
  return now - prev <= (settings.doubleTapMs || 350);
}
