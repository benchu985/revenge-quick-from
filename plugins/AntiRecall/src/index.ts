/**
 * AntiRecall — locally preserves messages received while this plugin is active.
 * Records are written to vendetta.plugin.storage and are retained until manually
 * removed from plugin storage/app data.
 */
import { findByName, findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";

type Version = { at: number; content: string; kind: string };
type Entry = {
  id: string;
  channelId: string;
  guildId?: string;
  author: string;
  authorId?: string;
  createdAt?: string;
  latest: string;
  attachments: Array<{ name: string; url: string }>;
  history: Version[];
  deleted?: boolean;
  deletedAt?: number;
  lastSeen: number;
};

var cleanups: Array<() => void> = [];
var C = {
  bg: "#313338",
  panel: "#2b2d31",
  input: "#1e1f22",
  border: "#1e1f22",
  text: "#f2f3f5",
  muted: "#b5bac1",
  faint: "#949ba4",
  accent: "#5865f2",
  danger: "#f23f43",
  success: "#23a55a",
};

function store(): Record<string, Entry> {
  var root: any = storage as any;
  if (!root.antiRecall || typeof root.antiRecall !== "object") root.antiRecall = {};
  return root.antiRecall as Record<string, Entry>;
}

function write(next: Record<string, Entry>) {
  (storage as any).antiRecall = next;
}

function textOf(message: any): string {
  return (message && message.content) || "";
}

function authorOf(message: any): string {
  var a = message && message.author;
  return (a && (a.global_name || a.globalName || a.username)) || "未知用户";
}

function toAttachments(message: any): Array<{ name: string; url: string }> {
  var out: Array<{ name: string; url: string }> = [];
  var items = (message && message.attachments) || [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item && (item.url || item.proxy_url)) {
      out.push({ name: item.filename || "附件", url: item.url || item.proxy_url });
    }
  }
  return out;
}

function keyOf(channelId: any, id: any) {
  return String(channelId || "unknown") + ":" + String(id || "unknown");
}

function capture(message: any, eventKind?: string) {
  if (!message || !message.id) return;
  var id = String(message.id);
  var channelId = String(message.channel_id || message.channelId || "unknown");
  var key = keyOf(channelId, id);
  var old = store()[key];
  var now = Date.now();
  var content = textOf(message);
  var next = Object.assign({}, store());

  if (!old) {
    next[key] = {
      id: id,
      channelId: channelId,
      guildId: message.guild_id || message.guildId,
      author: authorOf(message),
      authorId: message.author && message.author.id,
      createdAt: message.timestamp,
      latest: content,
      attachments: toAttachments(message),
      history: [{ at: now, content: content, kind: eventKind || "收到" }],
      lastSeen: now,
    };
    write(next);
    return;
  }

  var history = (old.history || []).slice();
  if (content !== old.latest) {
    history.push({ at: now, content: content, kind: eventKind || "编辑后" });
  }
  next[key] = Object.assign({}, old, {
    guildId: message.guild_id || message.guildId || old.guildId,
    author: authorOf(message) || old.author,
    authorId: (message.author && message.author.id) || old.authorId,
    latest: content,
    attachments: toAttachments(message).length ? toAttachments(message) : old.attachments,
    history: history,
    lastSeen: now,
  });
  write(next);
}

function markDeleted(payload: any) {
  if (!payload) return;
  var id = payload.id || payload.message_id || (payload.message && payload.message.id);
  var channelId =
    payload.channelId || payload.channel_id || (payload.message && payload.message.channel_id);
  if (!id || !channelId) return;
  var key = keyOf(channelId, id);
  var current = store()[key];
  if (!current) return;
  var next = Object.assign({}, store());
  next[key] = Object.assign({}, current, { deleted: true, deletedAt: Date.now(), lastSeen: Date.now() });
  write(next);
}

function markBulkDeleted(payload: any) {
  var ids = payload && (payload.ids || payload.message_ids);
  if (!ids || !ids.length) return;
  for (var i = 0; i < ids.length; i++) {
    markDeleted({
      id: ids[i],
      channelId: payload.channelId || payload.channel_id,
    });
  }
}

function fmt(ts: any): string {
  try {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    function p(n: number) { return n < 10 ? "0" + n : String(n); }
    return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  } catch (e) { return ""; }
}

function ArchivePage(props: { channelId?: string; messageId?: string }) {
  var View = ReactNative.View;
  var Text = ReactNative.Text;
  var FlatList = ReactNative.FlatList;
  var Pressable = ReactNative.Pressable;
  var refreshState = React.useState(0);
  var refresh = refreshState[1];
  var all = store();
  var rows: Entry[] = [];
  var keys = Object.keys(all);
  for (var i = 0; i < keys.length; i++) {
    var entry = all[keys[i]];
    if (props.channelId && entry.channelId !== props.channelId) continue;
    if (props.messageId && entry.id !== props.messageId) continue;
    rows.push(entry);
  }
  rows.sort(function (a, b) { return b.lastSeen - a.lastSeen; });

  function row(item: Entry) {
    var state = item.deleted ? "已撤回" : item.history.length > 1 ? "已编辑 " + (item.history.length - 1) + " 次" : "已保存";
    var color = item.deleted ? C.danger : item.history.length > 1 ? C.accent : C.success;
    var versions: any[] = [];
    for (var j = 0; j < item.history.length; j++) {
      var v = item.history[j];
      versions.push(React.createElement(Text, {
        key: "v" + j,
        style: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
      }, "版本 " + (j + 1) + " · " + fmt(v.at) + "\n" + (v.content || "(无文字内容)")));
    }
    return React.createElement(View, {
      style: { backgroundColor: C.bg, borderBottomWidth: 8, borderBottomColor: C.panel, paddingHorizontal: 16, paddingVertical: 12 },
    },
      React.createElement(View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 4 } },
        React.createElement(Text, { style: { color: C.text, fontSize: 16, fontWeight: "700", flex: 1 } }, item.author),
        React.createElement(Text, { style: { color: color, fontSize: 12, fontWeight: "700" } }, state)
      ),
      React.createElement(Text, { style: { color: C.faint, fontSize: 12, marginBottom: 6 } }, fmt(item.createdAt) + "  ·  " + item.channelId),
      versions,
      item.attachments && item.attachments.length ? React.createElement(Text, { style: { color: C.faint, fontSize: 12, marginTop: 6 } }, "附件：" + item.attachments.map(function (a) { return a.name; }).join("、")) : null
    );
  }

  return React.createElement(View, { style: { flex: 1, backgroundColor: C.bg } },
    React.createElement(View, { style: { backgroundColor: C.panel, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: "row", alignItems: "center" } },
      React.createElement(Text, { style: { color: C.muted, fontSize: 13, flex: 1 } }, "本地记录 " + rows.length + " 条 · 不会自动过期"),
      React.createElement(Pressable, { onPress: function () { refresh(function (x: number) { return x + 1; }); }, style: { backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 } },
        React.createElement(Text, { style: { color: "#fff", fontWeight: "700", fontSize: 12 } }, "刷新")
      ),
    ),
    React.createElement(FlatList, {
      data: rows,
      keyExtractor: function (item: Entry) { return item.channelId + ":" + item.id; },
      renderItem: function (info: any) { return row(info.item); },
      ListEmptyComponent: React.createElement(Text, { style: { color: C.muted, textAlign: "center", marginTop: 48, fontSize: 14 } }, "还没有可显示的记录\n插件只会保存启用后收到的消息"),
    })
  );
}

function openArchive(channelId?: string, messageId?: string) {
  var Navigation: any = findByProps("push", "pushLazy", "pop") || findByProps("push", "pop");
  var Navigator: any = findByName("Navigator") || (findByProps("Navigator") || {}).Navigator;
  if (Navigator && Navigator.default) Navigator = Navigator.default;
  if (!Navigation || !Navigation.push) return;
  var close = (findByProps("getRenderCloseButton") || {}).getRenderCloseButton || (findByProps("getHeaderCloseButton") || {}).getHeaderCloseButton;
  try {
    if (Navigator) {
      Navigation.push(function () {
        return React.createElement(Navigator, {
          initialRouteName: "AntiRecallArchive",
          goBackOnBackPress: true,
          screens: { AntiRecallArchive: {
            title: messageId ? "消息历史" : "本频道记录",
            headerLeft: close ? close(function () { try { Navigation.pop(); } catch (e) {} }) : undefined,
            render: function () { return React.createElement(ArchivePage, { channelId: channelId, messageId: messageId }); },
          } },
        });
      });
    } else {
      Navigation.push(ArchivePage, { channelId: channelId, messageId: messageId });
    }
  } catch (e) { console.error("[AntiRecall] open archive", e); }
}

function patchMessageSheet() {
  var ActionSheet: any = findByProps("openLazy", "hideActionSheet");
  var rowMod: any = findByProps("ActionSheetRow");
  var Row = rowMod && rowMod.ActionSheetRow;
  if (!ActionSheet || !Row) return null;
  var historyIcon = getAssetIDByName("ic_history") || getAssetIDByName("ic_message_delete");

  return before("openLazy", ActionSheet, function (args: any[]) {
    try {
      var component = args[0], key = args[1], raw = args[2];
      if (key !== "MessageLongPressActionSheet") return;
      var message = (raw && raw.message) || raw;
      if (!message || !component || !component.then) return;
      capture(message, "查看时保存");
      component.then(function (instance: any) {
        var unpatch = after("default", instance, function (_a: any, tree: any) {
          try {
            React.useEffect(function () { return function () { try { unpatch(); } catch (e) {} }; }, []);
            var buttons = findInReactTree(tree, function (node: any) {
              return node && node.some && node.some(function (child: any) { return child && ((child.type && child.type.name === "ActionSheetRow") || (child.props && child.props.label)); });
            });
            if (!buttons || !buttons.length) return;
            for (var i = 0; i < buttons.length; i++) if (buttons[i] && buttons[i].key === "antirecall-history") return;
            buttons.unshift(
              React.createElement(Row, { key: "antirecall-channel", label: "查看本频道记录", icon: historyIcon ? React.createElement(Row.Icon, { source: historyIcon }) : undefined, onPress: function () { try { ActionSheet.hideActionSheet(); } catch (e) {} openArchive(message.channel_id || message.channelId); } }),
              React.createElement(Row, { key: "antirecall-history", label: "查看消息编辑历史", icon: historyIcon ? React.createElement(Row.Icon, { source: historyIcon }) : undefined, onPress: function () { try { ActionSheet.hideActionSheet(); } catch (e) {} openArchive(message.channel_id || message.channelId, message.id); } })
            );
          } catch (e) { console.error("[AntiRecall] sheet render", e); }
        });
      });
    } catch (e) { console.error("[AntiRecall] sheet", e); }
  });
}

function subscribeEvents() {
  var dispatcher: any = findByProps("subscribe", "unsubscribe") || findByProps("dispatch", "subscribe");
  if (!dispatcher || !dispatcher.subscribe) return;
  var events: Array<[string, (payload: any) => void]> = [
    ["MESSAGE_CREATE", function (p) { capture(p && p.message, "收到"); }],
    ["MESSAGE_UPDATE", function (p) { capture(p && p.message, "编辑后"); }],
    ["MESSAGE_DELETE", markDeleted],
    ["MESSAGE_DELETE_BULK", markBulkDeleted],
  ];
  for (var i = 0; i < events.length; i++) {
    dispatcher.subscribe(events[i][0], events[i][1]);
    (function (name, handler) { cleanups.push(function () { try { dispatcher.unsubscribe && dispatcher.unsubscribe(name, handler); } catch (e) {} }); })(events[i][0], events[i][1]);
  }
}

export function onLoad() {
  store();
  subscribeEvents();
  var patch = patchMessageSheet();
  if (patch) cleanups.push(patch);
  try { showToast("AntiRecall 已启动：本地保存撤回与编辑记录"); } catch (e) {}
}

export function onUnload() {
  for (var i = 0; i < cleanups.length; i++) try { cleanups[i](); } catch (e) {}
  cleanups.length = 0;
}
