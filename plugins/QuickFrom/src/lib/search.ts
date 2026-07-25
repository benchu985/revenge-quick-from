import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";

export type QuickFromSettings = {
  /** double-tap avatar to search */
  doubleTapAvatar: boolean;
  /** add row on message long-press sheet */
  messageSheet: boolean;
  /** add row on user profile / avatar action sheet */
  profileSheet: boolean;
  /** use user id in from: (more precise) or username */
  preferUserId: boolean;
  /** include current channel filter: in:channel */
  includeChannel: boolean;
  /** double-tap window ms */
  doubleTapMs: number;
  /** show toast when search opens */
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
  // new username system: globalName / username without discriminator
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
    // Discord accepts from:userid on mobile in many builds
    fromPart = `from:${id}`;
  } else if (tag) {
    // quote if spaces / special chars
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

/**
 * Open Discord's in-guild / channel search with a prefilled query.
 * Multiple fallbacks because module names shift across Discord mobile builds.
 */
export function openFromSearch(user: any): boolean {
  ensureDefaults();
  const query = buildFromQuery(user);
  if (!query || query === "from:") {
    showToast("QuickFrom: 拿不到用户信息", getAssetIDByName("ic_close_circle") ?? getAssetIDByName("Close"));
    return false;
  }

  const tried: string[] = [];

  // 1) Dedicated Search UI module (common on mobile)
  const searchUi =
    safeFindByProps("openSearch") ??
    safeFindByProps("openSearch", "dismissSearch") ??
    safeFindByProps("openSearch", "closeSearch");
  if (searchUi?.openSearch) {
    tried.push("openSearch");
    try {
      // various signatures across builds
      searchUi.openSearch({ query });
      notify(query);
      return true;
    } catch {}
    try {
      searchUi.openSearch(query);
      notify(query);
      return true;
    } catch {}
    try {
      searchUi.openSearch({ searchQuery: query, queryString: query });
      notify(query);
      return true;
    } catch {}
  }

  // 2) Search actions / store
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
      // open UI after setting query
      searchUi?.openSearch?.();
      notify(query);
      return true;
    } catch {}
  }

  // 3) FluxDispatcher routes used by Discord mobile search
  const dispatcher = FluxDispatcher ?? safeFindByProps("dispatch", "subscribe");
  if (dispatcher?.dispatch) {
    tried.push("FluxDispatcher");
    const payloads = [
      { type: "SEARCH_SET_QUERY", query },
      { type: "SEARCH_QUERY_UPDATED", query },
      { type: "SEARCH_START", query },
      { type: "SEARCH_MODAL_OPEN", query },
      { type: "LAYER_PUSH", layer: "SEARCH", query },
    ];
    for (const p of payloads) {
      try {
        dispatcher.dispatch(p);
      } catch {}
    }
    // still try openSearch after dispatch
    try {
      searchUi?.openSearch?.({ query });
      notify(query);
      return true;
    } catch {}
  }

  // 4) Navigation to Search screen with params
  const Navigation =
    safeFindByProps("push", "pushLazy", "pop") ??
    safeFindByProps("push", "back");
  const Navigator =
    safeFindByProps("Navigator")?.Navigator ??
    null;
  if (Navigation?.push) {
    tried.push("Navigation");
    try {
      // Some builds expose a SearchResults / GuildSearch route
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

  // 5) Last resort: clipboard + toast (user pastes into search)
  try {
    const { clipboard } = require("@vendetta/metro/common");
    clipboard?.setString?.(query);
  } catch {
    try {
      ReactNative.Clipboard?.setString?.(query);
    } catch {}
  }

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

/** Double-tap tracker keyed by user id / avatar instance */
const lastTap: Record<string, number> = {};

export function isDoubleTap(key: string): boolean {
  ensureDefaults();
  const now = Date.now();
  const prev = lastTap[key] ?? 0;
  lastTap[key] = now;
  return now - prev <= (settings.doubleTapMs || 350);
}
