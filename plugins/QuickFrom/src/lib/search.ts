import { storage } from "@vendetta/plugin";
import { getUserId, getUserTag } from "./user";

export { getUserId, getUserTag };
export { openFromSearch } from "./openResults";

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
  if (settings.preferUserId === undefined) settings.preferUserId = true;
  if (settings.includeChannel === undefined) settings.includeChannel = false;
  if (settings.doubleTapMs === undefined) settings.doubleTapMs = 350;
  if (settings.showToastOnSearch === undefined)
    settings.showToastOnSearch = true;
}

export function buildFromQuery(user: any): string {
  ensureDefaults();
  const id = getUserId(user);
  const tag = getUserTag(user);
  if (settings.preferUserId && id) return `from:${id}`;
  if (tag) {
    return /[\s:]/.test(tag) ? `from:"${tag}"` : `from:${tag}`;
  }
  if (id) return `from:${id}`;
  return "from:";
}
