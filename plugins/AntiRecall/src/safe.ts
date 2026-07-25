/**
 * AntiRecall v2
 * Persist only message edits and deletions. It deliberately does not hook
 * action sheets, does not process MESSAGE_CREATE, and batches disk writes.
 */
import { findByProps } from "@vendetta/metro";
import { FluxDispatcher, React, ReactNative } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";

type Revision = { at: number; kind: string; content: string };
type ArchiveItem = {
  id: string;
  channelId: string;
  guildId?: string;
  author: string;
  createdAt?: string;
  latest: string;
  deleted?: boolean;
  deletedAt?: number;
  revisions: Revision[];
  updatedAt: number;
};

var unpatch: (() => void) | null = null;
var pending: Record<string, ArchiveItem> = {};
var flushTimer: any = null;
var STORE_KEY = "antiRecallArchiveV2";

function archive(): Record<string, ArchiveItem> {
  var root: any = storage as any;
  var value = root[STORE_KEY];
  return value && typeof value === "object" ? value : {};
}

function key(channelId: any, messageId: any): string {
  return String(channelId) + ":" + String(messageId);
}

function text(message: any): string {
  return message && typeof message.content === "string" ? message.content : "";
}

function author(message: any): string {
  var user = message && message.author;
  return (user && (user.global_name || user.globalName || user.username)) || "未知用户";
}

function append(item: ArchiveItem, content: string, kind: string, at: number) {
  var last = item.revisions[item.revisions.length - 1];
  if (!last || last.content !== content) item.revisions.push({ at: at, kind: kind, content: content });
}

function makeItem(message: any, channelId: string, now: number): ArchiveItem {
  return {
    id: String(message.id),
    channelId: channelId,
    guildId: message.guild_id || message.guildId,
    author: author(message),
    createdAt: message.timestamp,
    latest: text(message),
    revisions: [{ at: now, kind: "原始内容", content: text(message) }],
    updatedAt: now,
  };
}

function enqueue(item: ArchiveItem) {
  pending[key(item.channelId, item.id)] = item;
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 2000);
}

function flush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  var keys = Object.keys(pending);
  if (!keys.length) return;
  var next = Object.assign({}, archive(), pending);
  pending = {};
  (storage as any)[STORE_KEY] = next;
}

function cachedMessage(channelId: any, messageId: any): any {
  try {
    var messages: any = findByProps("getMessage", "getMessages") || findByProps("_channelMessages");
    if (messages && messages.getMessage) return messages.getMessage(channelId, messageId);
    if (messages && messages._channelMessages) return messages._channelMessages.get(channelId)?.get(messageId);
  } catch (e) {}
  return null;
}

function previous(channelId: string, message: any, now: number): ArchiveItem {
  var id = String(message.id);
  var item = pending[key(channelId, id)] || archive()[key(channelId, id)];
  return item ? Object.assign({}, item, { revisions: (item.revisions || []).slice() }) : makeItem(message, channelId, now);
}

function handleUpdate(event: any) {
  var changed = event && event.message;
  if (!changed || !changed.id) return;
  var channelId = String(changed.channel_id || event.channelId || event.channel_id || "");
  if (!channelId) return;
  var old = cachedMessage(channelId, changed.id);
  if (!old || text(old) === text(changed)) return;
  var now = Date.now();
  var item = previous(channelId, old, now);
  append(item, text(old), "编辑前", now);
  append(item, text(changed), "编辑后", now);
  item.latest = text(changed);
  item.updatedAt = now;
  enqueue(item);
}

function handleDelete(event: any) {
  var id = event && (event.id || event.message_id);
  var channelId = event && (event.channelId || event.channel_id);
  if (!id || !channelId) return;
  var old = cachedMessage(channelId, id);
  if (!old) return;
  var now = Date.now();
  var item = previous(String(channelId), old, now);
  append(item, text(old), "撤回前", now);
  item.latest = text(old);
  item.deleted = true;
  item.deletedAt = now;
  item.updatedAt = now;
  enqueue(item);
}

function ArchiveSettings() {
  var View = ReactNative.View;
  var Text = ReactNative.Text;
  var FlatList = ReactNative.FlatList;
  var Pressable = ReactNative.Pressable;
  var state = React.useState(0);
  var refresh = state[1];
  var items: ArchiveItem[] = Object.keys(archive()).map(function (k) { return archive()[k]; });
  items.sort(function (a, b) { return b.updatedAt - a.updatedAt; });

  return React.createElement(View, { style: { flex: 1, backgroundColor: "#313338" } },
    React.createElement(View, { style: { flexDirection: "row", padding: 12, backgroundColor: "#2b2d31" } },
      React.createElement(Text, { style: { flex: 1, color: "#b5bac1" } }, "已归档 " + items.length + " 条编辑/撤回记录"),
      React.createElement(Pressable, { onPress: function () { refresh(function (n: number) { return n + 1; }); }, style: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: "#5865f2" } },
        React.createElement(Text, { style: { color: "#fff", fontWeight: "700" } }, "刷新"))
    ),
    React.createElement(FlatList, {
      data: items,
      keyExtractor: function (item: ArchiveItem) { return key(item.channelId, item.id); },
      renderItem: function (info: any) {
        var item: ArchiveItem = info.item;
        return React.createElement(View, { style: { padding: 14, borderBottomWidth: 6, borderBottomColor: "#2b2d31" } },
          React.createElement(Text, { style: { color: item.deleted ? "#f23f43" : "#f2f3f5", fontSize: 16, fontWeight: "700" } }, item.author + (item.deleted ? " · 已撤回" : " · 已编辑")),
          item.revisions.map(function (version, index) {
            return React.createElement(Text, { key: String(index), style: { color: "#b5bac1", marginTop: 6, lineHeight: 19 } }, version.kind + "\n" + (version.content || "(无文字内容)"));
          })
        );
      },
      ListEmptyComponent: React.createElement(Text, { style: { color: "#b5bac1", textAlign: "center", marginTop: 48 } }, "尚未记录到编辑或撤回消息"),
    })
  );
}

export function onLoad() {
  var dispatcher: any = FluxDispatcher || findByProps("dispatch", "subscribe");
  if (!dispatcher || !dispatcher.dispatch) throw new Error("FluxDispatcher not found");
  unpatch = before("dispatch", dispatcher, function (args: any[]) {
    try {
      var event = args[0];
      if (!event || event.otherPluginBypass) return;
      if (event.type === "MESSAGE_UPDATE") handleUpdate(event);
      if (event.type === "MESSAGE_DELETE") handleDelete(event);
    } catch (e) {
      console.error("[AntiRecall] archive event error", e);
    }
  });
  try { showToast("AntiRecall v2 已启动：仅归档编辑和撤回"); } catch (e) {}
}

export function onUnload() {
  flush();
  try { if (unpatch) unpatch(); } catch (e) {}
  unpatch = null;
}

export const settings = ArchiveSettings;
