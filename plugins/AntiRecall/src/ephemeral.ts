/**
 * AntiRecall v3 — ephemeral message-store patch.
 * Mirrors the reference plugin model: no persistent storage; restarting the
 * app restores Discord's normal server-backed timeline.
 */
import { findByName, findByProps } from "@vendetta/metro";
import { FluxDispatcher, ReactNative } from "@vendetta/metro/common";
import { after, before, instead } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";

var dispatchUnpatch: (() => void) | null = null;
var rowsUnpatch: (() => void) | null = null;
var recordUnpatches: Array<() => void> = [];
var deletedIds = new Map<string, true>();
var editedIds = new Set<string>();

function content(message: any): string {
  return message && typeof message.content === "string" ? message.content : "";
}

function cached(channelId: any, messageId: any): any {
  try {
    var store: any = findByProps("getMessage", "getMessages") || findByProps("_channelMessages");
    if (store && store.getMessage) return store.getMessage(channelId, messageId);
    if (store && store._channelMessages) return store._channelMessages.get(channelId)?.get(messageId);
  } catch (e) {}
  return null;
}

function paint(background: string, gutter: string) {
  return {
    backgroundColor: ReactNative.processColor(background),
    gutterColor: ReactNative.processColor(gutter),
  };
}

function stripEditHistory(value: string): string {
  var marker = "\n\n[已编辑]\n";
  var index = value.lastIndexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

function patchRows() {
  var controller: any = findByProps("updateRows", "getConstants") || findByProps("updateRows");
  if (!controller || !controller.updateRows) return null;
  return before("updateRows", controller, function (args: any[]) {
    try {
      var value = args[1];
      var wasString = typeof value === "string";
      var rows: any = wasString ? JSON.parse(value) : value;
      if (!Array.isArray(rows)) return;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var message = row && row.message;
        if (!message) continue;
        var id = String(message.id || "");
        if (message.was_deleted || deletedIds.has(id)) {
          message.textColor = ReactNative.processColor("#F23F43");
          row.backgroundHighlight = paint("#4B1F25", "#F23F43");
        } else if (editedIds.has(id)) {
          message.textColor = ReactNative.processColor("#5865F2");
          row.backgroundHighlight = paint("#1E3656", "#5865F2");
        }
      }
      args[1] = wasString ? JSON.stringify(rows) : rows;
    } catch (e) {
      console.error("[AntiRecall] row patch", e);
    }
  });
}

function patchMessageRecords() {
  var records: any = findByProps("updateMessageRecord", "createMessageRecord");
  if (!records) return;
  try {
    recordUnpatches.push(after("createMessageRecord", records, function (args: any[], result: any) {
      if (args[0] && args[0].was_deleted && result) result.was_deleted = true;
    }));
  } catch (e) {}
  try {
    var MessageRecord: any = findByName("MessageRecord", false);
    if (MessageRecord) recordUnpatches.push(after("default", MessageRecord, function (args: any[], result: any) {
      if (args[0] && args[0].was_deleted && result) result.was_deleted = true;
    }));
  } catch (e) {}
  try {
    recordUnpatches.push(instead("updateMessageRecord", records, function (args: any[], original: any) {
      var current = args[0];
      var incoming = args[1];
      if (incoming && incoming.was_deleted) return records.createMessageRecord(incoming, current && current.reactions);
      return original.apply(this, args);
    }));
  } catch (e) {}
}

function patchDispatch() {
  var dispatcher: any = FluxDispatcher || findByProps("dispatch", "subscribe");
  if (!dispatcher || !dispatcher.dispatch) return null;
  return before("dispatch", dispatcher, function (args: any[]) {
    try {
      var event = args[0];
      if (!event || event.otherPluginBypass) return;
      if (event.type === "MESSAGE_DELETE") {
        var old = cached(event.channelId || event.channel_id, event.id || event.message_id);
        if (!old) return;
        var oldContent = content(old);
        deletedIds.set(String(old.id), true);
        event.message = Object.assign({}, old, {
          channel_id: old.channel_id || event.channelId || event.channel_id,
          guild_id: old.guild_id || event.guildId || event.guild_id,
          content: oldContent.indexOf("[已撤回]\n") === 0 ? oldContent : "[已撤回]\n" + (oldContent || "(无文字内容)"),
          was_deleted: true,
          edited_timestamp: "invalid_timestamp",
        });
        event.type = "MESSAGE_UPDATE";
        event.channelId = old.channel_id || event.channelId || event.channel_id;
        event.optimistic = false;
        event.sendMessageOptions = {};
      } else if (event.type === "MESSAGE_UPDATE") {
        var changed = event.message;
        var channelId = changed && (changed.channel_id || event.channelId || event.channel_id);
        var previous = changed && cached(channelId, changed.id);
        if (!previous || content(previous) === content(changed)) return;
        var oldText = content(previous);
        var newText = stripEditHistory(content(changed));
        editedIds.add(String(changed.id));
        event.message = Object.assign({}, changed, {
          content: stripEditHistory(oldText) + "\n\n[已编辑]\n" + newText,
        });
      }
    } catch (e) {
      console.error("[AntiRecall] dispatch patch", e);
    }
  });
}

export function onLoad() {
  dispatchUnpatch = patchDispatch();
  rowsUnpatch = patchRows();
  patchMessageRecords();
  try { showToast("AntiRecall v3 已启动：撤回红框、编辑蓝框（重启清空）"); } catch (e) {}
}

export function onUnload() {
  try { if (dispatchUnpatch) dispatchUnpatch(); } catch (e) {}
  try { if (rowsUnpatch) rowsUnpatch(); } catch (e) {}
  for (var i = 0; i < recordUnpatches.length; i++) try { recordUnpatches[i](); } catch (e) {}
  dispatchUnpatch = null;
  rowsUnpatch = null;
  recordUnpatches = [];
  deletedIds.clear();
  editedIds.clear();
}
