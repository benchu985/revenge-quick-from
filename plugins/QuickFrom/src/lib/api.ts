import { findByProps, findByStoreName } from "@vendetta/metro";

function safeFindByProps(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

function safeStore(name: string) {
  try {
    return findByStoreName?.(name) ?? null;
  } catch {
    return null;
  }
}

/** Discord REST helper used by the client itself */
export function getHttp() {
  return (
    safeFindByProps("get", "post", "put", "patch", "del") ??
    safeFindByProps("get", "post", "put", "patch", "delete")
  );
}

export function getSelectedChannelId(): string | null {
  const store =
    safeStore("SelectedChannelStore") ??
    safeFindByProps("getChannelId", "getLastSelectedChannelId");
  return (
    store?.getChannelId?.() ??
    store?.getLastSelectedChannelId?.() ??
    null
  );
}

export function getSelectedGuildId(): string | null {
  const store =
    safeStore("SelectedGuildStore") ??
    safeFindByProps("getGuildId", "getLastSelectedGuildId");
  let gid =
    store?.getGuildId?.() ??
    store?.getLastSelectedGuildId?.() ??
    null;

  if (gid) return gid;

  // fallback via channel
  try {
    const ChannelStore =
      safeStore("ChannelStore") ?? safeFindByProps("getChannel");
    const cid = getSelectedChannelId();
    const ch = cid && ChannelStore?.getChannel?.(cid);
    if (ch?.guild_id) return ch.guild_id;
  } catch {}
  return null;
}

export function getChannel(channelId: string) {
  const ChannelStore =
    safeStore("ChannelStore") ?? safeFindByProps("getChannel");
  return ChannelStore?.getChannel?.(channelId) ?? null;
}

export type SearchHit = {
  id: string;
  channel_id: string;
  content: string;
  timestamp?: string;
  author?: any;
  hit?: boolean;
};

/**
 * Guild message search — same endpoint the official search UI uses.
 * GET /guilds/{id}/messages/search?author_id=...
 */
export async function searchAuthorMessages(opts: {
  guildId: string;
  authorId: string;
  channelId?: string | null;
  offset?: number;
  content?: string;
}): Promise<{ total: number; messages: SearchHit[]; raw: any }> {
  const http = getHttp();
  if (!http?.get) throw new Error("HTTP module missing");

  const params = new URLSearchParams();
  params.set("author_id", opts.authorId);
  if (opts.channelId) params.set("channel_id", opts.channelId);
  if (opts.content) params.set("content", opts.content);
  if (opts.offset) params.set("offset", String(opts.offset));
  // include NSFW channels when user can see them — client usually sends this
  params.set("include_nsfw", "true");

  const path = `/guilds/${opts.guildId}/messages/search?${params.toString()}`;
  const res = await http.get(path);
  const body = res?.body ?? res;

  const groups: any[] = body?.messages ?? [];
  const flat: SearchHit[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    // prefer the message marked hit, else first
    const hit =
      group.find((m: any) => m?.hit) ??
      group[Math.floor(group.length / 2)] ??
      group[0];
    if (hit?.id) flat.push(hit);
  }

  return {
    total: body?.total_results ?? flat.length,
    messages: flat,
    raw: body,
  };
}

/** Jump to a message in-app (or open URL fallback). */
export function jumpToMessage(
  guildId: string | null | undefined,
  channelId: string,
  messageId: string,
) {
  const g = guildId || "@me";

  // 1) transitionToGuild / jumpToMessage style
  const nav =
    safeFindByProps("transitionToGuild") ??
    safeFindByProps("transitionTo") ??
    safeFindByProps("selectChannel");
  try {
    if (nav?.transitionToGuild) {
      nav.transitionToGuild(g === "@me" ? null : g, channelId, messageId);
      return true;
    }
  } catch {}

  try {
    if (nav?.selectChannel) {
      nav.selectChannel({
        guildId: g === "@me" ? null : g,
        channelId,
        messageId,
        jumpType: "OPTIMISTIC_CLICK",
      });
      return true;
    }
  } catch {}

  // 2) MessageActions.jumpToMessage
  const msgActions =
    safeFindByProps("jumpToMessage") ??
    safeFindByProps("jumpToMessage", "fetchMessages");
  try {
    msgActions?.jumpToMessage?.({
      channelId,
      messageId,
      flash: true,
      params: { offset: 0 },
    });
    return true;
  } catch {}

  // 3) deep link
  try {
    const { openURL } = safeFindByProps("openURL") ?? {};
    const urlMod = safeFindByProps("openUrl");
    const link = `https://discord.com/channels/${g}/${channelId}/${messageId}`;
    if (urlMod?.openUrl) {
      urlMod.openUrl(link);
      return true;
    }
    if (openURL) {
      openURL(link);
      return true;
    }
  } catch {}

  return false;
}
