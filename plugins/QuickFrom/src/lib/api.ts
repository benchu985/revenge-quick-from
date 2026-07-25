import { findByProps, findByStoreName } from "@vendetta/metro";

function fp(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

function store(name: string) {
  try {
    return findByStoreName?.(name) ?? null;
  } catch {
    return null;
  }
}

export function getHttp() {
  return (
    fp("get", "post", "put", "patch", "del") ??
    fp("get", "post", "put", "patch", "delete")
  );
}

export function getSelectedChannelId(): string | null {
  const s = store("SelectedChannelStore") ?? fp("getChannelId");
  try {
    return s?.getChannelId?.() ?? s?.getLastSelectedChannelId?.() ?? null;
  } catch {
    return null;
  }
}

export function getSelectedGuildId(): string | null {
  const s = store("SelectedGuildStore") ?? fp("getGuildId");
  try {
    let gid = s?.getGuildId?.() ?? s?.getLastSelectedGuildId?.() ?? null;
    if (gid) return gid;
    const ChannelStore = store("ChannelStore") ?? fp("getChannel");
    const cid = getSelectedChannelId();
    const ch = cid && ChannelStore?.getChannel?.(cid);
    return ch?.guild_id ?? null;
  } catch {
    return null;
  }
}

export type SearchHit = {
  id: string;
  channel_id: string;
  content: string;
  timestamp?: string;
  author?: any;
  hit?: boolean;
};

export async function searchAuthorMessages(opts: {
  guildId: string;
  authorId: string;
  channelId?: string | null;
  offset?: number;
  content?: string;
}): Promise<{ total: number; messages: SearchHit[] }> {
  const http = getHttp();
  if (!http?.get) throw new Error("HTTP module missing");

  const params = new URLSearchParams();
  params.set("author_id", opts.authorId);
  if (opts.channelId) params.set("channel_id", opts.channelId);
  if (opts.content) params.set("content", opts.content);
  if (opts.offset) params.set("offset", String(opts.offset));
  params.set("include_nsfw", "true");

  const res = await http.get(
    `/guilds/${opts.guildId}/messages/search?${params.toString()}`,
  );
  const body = res?.body ?? res;
  const groups: any[] = body?.messages ?? [];
  const flat: SearchHit[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const hit =
      group.find((m: any) => m?.hit) ??
      group[Math.floor(group.length / 2)] ??
      group[0];
    if (hit?.id) flat.push(hit);
  }
  return {
    total: body?.total_results ?? flat.length,
    messages: flat,
  };
}

export function jumpToMessage(
  guildId: string | null | undefined,
  channelId: string,
  messageId: string,
) {
  const g = guildId || "@me";
  const nav =
    fp("transitionToGuild") ?? fp("transitionTo") ?? fp("selectChannel");
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
  try {
    const msg = fp("jumpToMessage");
    msg?.jumpToMessage?.({
      channelId,
      messageId,
      flash: true,
      params: { offset: 0 },
    });
    return true;
  } catch {}
  try {
    const urlMod = fp("openUrl");
    const link = `https://discord.com/channels/${g}/${channelId}/${messageId}`;
    if (urlMod?.openUrl) {
      urlMod.openUrl(link);
      return true;
    }
  } catch {}
  return false;
}
