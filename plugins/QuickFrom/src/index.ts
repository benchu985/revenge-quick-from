/**
 * QuickFrom v1.3
 * 长按消息 →「搜索此人发言」
 * 自带结果页：分页 / 跳页 / 时间 / 图片
 *
 * Revenge loader: eval(`vendetta=>{return ${js}}`)(vendettaForPlugins)
 */
import { findByProps, findByName, findByStoreName } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";

var patches: Array<() => void> = [];

/** Discord search returns ~25 hits per request */
var PAGE_SIZE = 25;

function st() {
  return storage as any;
}

function defaults() {
  var s = st();
  if (s.sheet === undefined) s.sheet = true;
  if (s.showImages === undefined) s.showImages = true;
}

function getUserId(user: any): string | null {
  if (!user) return null;
  return user.id || user.userId || (user.user && user.user.id) || null;
}

function getTag(user: any): string {
  if (!user) return "?";
  var name =
    user.username ||
    user.globalName ||
    (user.user && (user.user.username || user.user.globalName)) ||
    "";
  return name || getUserId(user) || "?";
}

function http() {
  return (
    findByProps("get", "post", "put", "patch", "del") ||
    findByProps("get", "post", "put", "patch", "delete")
  );
}

function selectedGuildId(): string | null {
  try {
    var gs = findByStoreName("SelectedGuildStore") || findByProps("getGuildId");
    var id = gs && gs.getGuildId && gs.getGuildId();
    if (id) return id;
    var cs =
      findByStoreName("SelectedChannelStore") || findByProps("getChannelId");
    var cid = cs && cs.getChannelId && cs.getChannelId();
    var chStore = findByStoreName("ChannelStore") || findByProps("getChannel");
    var ch = cid && chStore && chStore.getChannel && chStore.getChannel(cid);
    return (ch && ch.guild_id) || null;
  } catch (e) {
    return null;
  }
}

function channelLabel(id: string): string {
  try {
    var chStore = findByStoreName("ChannelStore") || findByProps("getChannel");
    var ch = chStore && chStore.getChannel && chStore.getChannel(id);
    if (ch && ch.name) return "#" + ch.name;
  } catch (e) {}
  return "#" + String(id).slice(-4);
}

function fmtTime(ts: any): string {
  if (!ts) return "";
  try {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    function pad(n: number) {
      return n < 10 ? "0" + n : String(n);
    }
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes()) +
      ":" +
      pad(d.getSeconds())
    );
  } catch (e) {
    return String(ts);
  }
}

function isImageAtt(a: any): boolean {
  if (!a) return false;
  var ct = String(a.content_type || a.contentType || "").toLowerCase();
  if (ct.indexOf("image/") === 0) return true;
  var name = String(a.filename || a.url || "").toLowerCase();
  return (
    /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(name) ||
    !!(a.width && a.height && a.url)
  );
}

function imageUrl(a: any): string | null {
  if (!a) return null;
  return a.proxy_url || a.proxyUrl || a.url || null;
}

/**
 * Guild message search.
 * offset is absolute index into result set (0, 25, 50, ...).
 */
async function searchByAuthor(
  guildId: string,
  authorId: string,
  offset: number,
  channelId?: string | null,
) {
  var api = http();
  if (!api || !api.get) throw new Error("no http");

  var q =
    "/guilds/" +
    guildId +
    "/messages/search?author_id=" +
    encodeURIComponent(authorId) +
    "&include_nsfw=true&offset=" +
    encodeURIComponent(String(offset || 0));
  if (channelId) q += "&channel_id=" + encodeURIComponent(channelId);

  var res = await api.get(q);
  var body = (res && res.body) || res;
  var groups = (body && body.messages) || [];
  var out: any[] = [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (!g || !g.length) continue;
    var hit = null;
    for (var j = 0; j < g.length; j++) {
      if (g[j] && g[j].hit) {
        hit = g[j];
        break;
      }
    }
    if (!hit) hit = g[Math.floor(g.length / 2)] || g[0];
    if (hit && hit.id) out.push(hit);
  }
  return {
    total: (body && body.total_results) != null ? body.total_results : out.length,
    messages: out,
  };
}

function jumpTo(guildId: string, channelId: string, messageId: string) {
  try {
    var nav = findByProps("transitionToGuild") || findByProps("selectChannel");
    if (nav && nav.transitionToGuild) {
      nav.transitionToGuild(guildId, channelId, messageId);
      return true;
    }
    if (nav && nav.selectChannel) {
      nav.selectChannel({
        guildId: guildId,
        channelId: channelId,
        messageId: messageId,
        jumpType: "OPTIMISTIC_CLICK",
      });
      return true;
    }
  } catch (e) {}
  try {
    var ja = findByProps("jumpToMessage");
    if (ja && ja.jumpToMessage) {
      ja.jumpToMessage({
        channelId: channelId,
        messageId: messageId,
        flash: true,
      });
      return true;
    }
  } catch (e) {}
  return false;
}

function openImage(url: string) {
  try {
    var Media = findByProps("openMediaModal") || findByProps("showMediaModal");
    if (Media && Media.openMediaModal) {
      Media.openMediaModal({
        images: [{ url: url, source: { uri: url } }],
        index: 0,
      });
      return;
    }
    if (Media && Media.showMediaModal) {
      Media.showMediaModal([{ url: url }]);
      return;
    }
  } catch (e) {}
  try {
    var openUrl = findByProps("openURL") || findByProps("openUrl");
    if (openUrl && openUrl.openURL) openUrl.openURL(url);
    else if (openUrl && openUrl.openUrl) openUrl.openUrl(url);
  } catch (e) {}
}

function ResultsPage(props: { user: any }) {
  var user = props.user;
  var authorId = getUserId(user);
  var tag = getTag(user);

  var View = ReactNative.View;
  var Text = ReactNative.Text;
  var FlatList = ReactNative.FlatList;
  var TouchableOpacity = ReactNative.TouchableOpacity;
  var ActivityIndicator = ReactNative.ActivityIndicator;
  var TextInput = ReactNative.TextInput;
  var Image = ReactNative.Image;
  var ScrollView = ReactNative.ScrollView;

  var guildId = React.useMemo(function () {
    return selectedGuildId();
  }, []);

  var _page = React.useState(1);
  var page = _page[0];
  var setPage = _page[1];

  var _jump = React.useState("1");
  var jumpText = _jump[0];
  var setJumpText = _jump[1];

  var _loading = React.useState(true);
  var loading = _loading[0];
  var setLoading = _loading[1];

  var _error = React.useState(null as string | null);
  var error = _error[0];
  var setError = _error[1];

  var _total = React.useState(0);
  var total = _total[0];
  var setTotal = _total[1];

  var _items = React.useState([] as any[]);
  var items = _items[0];
  var setItems = _items[1];

  var totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE) || 1);

  function loadPage(p: number) {
    var target = p;
    if (target < 1) target = 1;
    setPage(target);
    setJumpText(String(target));
    setLoading(true);
    setError(null);

    var offset = (target - 1) * PAGE_SIZE;

    (async function () {
      if (!authorId) {
        setError("无用户 ID");
        setLoading(false);
        return;
      }
      if (!guildId) {
        setError("请在服务器频道里使用（私信不能全服搜）");
        setLoading(false);
        return;
      }
      try {
        var res = await searchByAuthor(guildId, authorId, offset, null);
        setTotal(res.total);
        setItems(res.messages);
        // clamp page if total smaller
        var tp = Math.max(1, Math.ceil((res.total || 0) / PAGE_SIZE) || 1);
        if (target > tp) {
          // recurse once to last page
          if (tp !== target) {
            loadPage(tp);
            return;
          }
        }
      } catch (err: any) {
        var msg =
          (err && err.body && err.body.message) ||
          (err && err.message) ||
          String(err);
        setError("搜索失败: " + msg);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }

  React.useEffect(function () {
    loadPage(1);
  }, []);

  function goJump() {
    var n = parseInt(jumpText, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (total > 0) {
      var tp = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (n > tp) n = tp;
    }
    loadPage(n);
  }

  function onPressItem(m: any) {
    var ok = jumpTo(guildId as string, m.channel_id, m.id);
    if (!ok) {
      try {
        showToast("无法跳转该消息");
      } catch (e) {}
    } else {
      try {
        var Nav = findByProps("pop", "push");
        if (Nav && Nav.pop) Nav.pop();
      } catch (e) {}
    }
  }

  function renderImages(m: any) {
    if (st().showImages === false) return null;
    var atts = m.attachments || [];
    var imgs: any[] = [];
    for (var i = 0; i < atts.length; i++) {
      if (isImageAtt(atts[i])) imgs.push(atts[i]);
    }
    // also embeds with image/thumbnail
    var embeds = m.embeds || [];
    for (var e = 0; e < embeds.length; e++) {
      var emb = embeds[e];
      if (emb && emb.image && (emb.image.proxy_url || emb.image.url)) {
        imgs.push({
          url: emb.image.url,
          proxy_url: emb.image.proxy_url || emb.image.url,
          width: emb.image.width,
          height: emb.image.height,
          filename: "embed",
        });
      } else if (
        emb &&
        emb.thumbnail &&
        (emb.thumbnail.proxy_url || emb.thumbnail.url)
      ) {
        imgs.push({
          url: emb.thumbnail.url,
          proxy_url: emb.thumbnail.proxy_url || emb.thumbnail.url,
          width: emb.thumbnail.width,
          height: emb.thumbnail.height,
          filename: "thumb",
        });
      }
    }
    if (!imgs.length || !Image) return null;

    var children: any[] = [];
    for (var k = 0; k < imgs.length; k++) {
      (function (att) {
        var uri = imageUrl(att);
        if (!uri) return;
        var w = att.width || 200;
        var h = att.height || 150;
        var maxW = 220;
        var scale = w > maxW ? maxW / w : 1;
        var dw = Math.max(80, Math.round(w * scale));
        var dh = Math.max(60, Math.round(h * scale));
        children.push(
          React.createElement(
            TouchableOpacity,
            {
              key: uri + String(k),
              onPress: function () {
                openImage(uri as string);
              },
              style: { marginTop: 8, marginRight: 8 },
            },
            React.createElement(Image, {
              source: { uri: uri },
              style: {
                width: dw,
                height: dh,
                borderRadius: 8,
                backgroundColor: "rgba(0,0,0,0.3)",
              },
              resizeMode: "cover",
            }),
          ),
        );
      })(imgs[k]);
    }
    if (!children.length) return null;
    return React.createElement(
      ScrollView,
      {
        horizontal: true,
        style: { marginTop: 4 },
        showsHorizontalScrollIndicator: false,
      },
      children,
    );
  }

  var pager = React.createElement(
    View,
    {
      style: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(0,0,0,0.2)",
      },
    },
    React.createElement(
      TouchableOpacity,
      {
        onPress: function () {
          if (page > 1) loadPage(page - 1);
        },
        disabled: page <= 1 || loading,
        style: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          marginRight: 6,
          backgroundColor:
            page <= 1 ? "rgba(255,255,255,0.05)" : "#5865F2",
          opacity: page <= 1 ? 0.5 : 1,
        },
      },
      React.createElement(
        Text,
        { style: { color: "#fff", fontSize: 13, fontWeight: "600" } },
        "上一页",
      ),
    ),
    React.createElement(
      Text,
      {
        style: {
          color: "#dbdee1",
          fontSize: 13,
          marginRight: 6,
          minWidth: 72,
          textAlign: "center",
        },
      },
      page + " / " + totalPages,
    ),
    React.createElement(
      TouchableOpacity,
      {
        onPress: function () {
          if (page < totalPages) loadPage(page + 1);
        },
        disabled: page >= totalPages || loading,
        style: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          marginRight: 8,
          backgroundColor:
            page >= totalPages ? "rgba(255,255,255,0.05)" : "#5865F2",
          opacity: page >= totalPages ? 0.5 : 1,
        },
      },
      React.createElement(
        Text,
        { style: { color: "#fff", fontSize: 13, fontWeight: "600" } },
        "下一页",
      ),
    ),
    React.createElement(
      Text,
      { style: { color: "#b5bac1", fontSize: 12, marginRight: 4 } },
      "跳到",
    ),
    React.createElement(TextInput, {
      value: jumpText,
      onChangeText: setJumpText,
      keyboardType: "number-pad",
      returnKeyType: "go",
      onSubmitEditing: goJump,
      style: {
        width: 52,
        height: 34,
        borderRadius: 8,
        paddingHorizontal: 8,
        backgroundColor: "rgba(0,0,0,0.35)",
        color: "#fff",
        textAlign: "center",
        marginRight: 6,
        fontSize: 13,
      },
    }),
    React.createElement(
      TouchableOpacity,
      {
        onPress: goJump,
        style: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.12)",
        },
      },
      React.createElement(
        Text,
        { style: { color: "#fff", fontSize: 13 } },
        "Go",
      ),
    ),
  );

  var header = React.createElement(
    View,
    {
      style: {
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.1)",
      },
    },
    React.createElement(
      Text,
      { style: { color: "#fff", fontSize: 16, fontWeight: "700" } },
      tag + " 的发言",
    ),
    React.createElement(
      Text,
      { style: { color: "#b5bac1", fontSize: 12, marginTop: 4 } },
      loading
        ? "搜索中… 第 " + page + " 页"
        : error
          ? error
          : "共 " +
            total +
            " 条 · 每页 " +
            PAGE_SIZE +
            " · 第 " +
            page +
            "/" +
            totalPages +
            " 页",
    ),
  );

  var body: any;
  if (loading && items.length === 0) {
    body = React.createElement(
      View,
      { style: { flex: 1, alignItems: "center", justifyContent: "center" } },
      React.createElement(ActivityIndicator, { size: "large" }),
      React.createElement(
        Text,
        { style: { color: "#b5bac1", marginTop: 10 } },
        "加载第 " + page + " 页…",
      ),
    );
  } else if (error && items.length === 0) {
    body = React.createElement(
      View,
      { style: { padding: 16 } },
      React.createElement(
        Text,
        { style: { color: "#f23f43", marginBottom: 12 } },
        error,
      ),
      React.createElement(
        TouchableOpacity,
        {
          onPress: function () {
            loadPage(page);
          },
          style: {
            backgroundColor: "#5865F2",
            padding: 12,
            borderRadius: 8,
            alignItems: "center",
          },
        },
        React.createElement(
          Text,
          { style: { color: "#fff", fontWeight: "600" } },
          "重试",
        ),
      ),
    );
  } else {
    body = React.createElement(FlatList, {
      data: items,
      style: { flex: 1 },
      keyExtractor: function (m: any, idx: number) {
        return m.id + "-" + idx;
      },
      ListEmptyComponent: React.createElement(
        Text,
        {
          style: {
            color: "#b5bac1",
            textAlign: "center",
            marginTop: 40,
          },
        },
        "本页没有消息",
      ),
      ListFooterComponent: loading
        ? React.createElement(ActivityIndicator, {
            style: { marginVertical: 12 },
          })
        : null,
      renderItem: function (info: any) {
        var item = info.item;
        var timeStr = fmtTime(item.timestamp || item.edited_timestamp);
        return React.createElement(
          TouchableOpacity,
          {
            onPress: function () {
              onPressItem(item);
            },
            style: {
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.06)",
            },
          },
          React.createElement(
            Text,
            { style: { color: "#b5bac1", fontSize: 11, marginBottom: 4 } },
            channelLabel(item.channel_id) +
              (timeStr ? " · " + timeStr : ""),
          ),
          React.createElement(
            Text,
            {
              style: { color: "#dbdee1", fontSize: 14 },
              numberOfLines: 6,
            },
            item.content ||
              (item.attachments && item.attachments.length
                ? "(附件)"
                : "(无文字)"),
          ),
          renderImages(item),
        );
      },
    });
  }

  return React.createElement(
    View,
    { style: { flex: 1 } },
    header,
    body,
    pager,
  );
}

function openResults(user: any) {
  var id = getUserId(user);
  if (!id) {
    try {
      showToast("QuickFrom: 无用户 ID");
    } catch (e) {}
    return;
  }

  var Navigation =
    findByProps("push", "pushLazy", "pop") || findByProps("push", "pop");
  var Navigator =
    findByName("Navigator") || (findByProps("Navigator") || {}).Navigator;
  if (Navigator && (Navigator as any).default)
    Navigator = (Navigator as any).default;

  if (!Navigation || !Navigation.push) {
    try {
      showToast("QuickFrom: 无 Navigation");
    } catch (e) {}
    return;
  }

  var title = getTag(user) + " 的发言";
  var closeBtn =
    (findByProps("getRenderCloseButton") || {}).getRenderCloseButton ||
    (findByProps("getHeaderCloseButton") || {}).getHeaderCloseButton;

  try {
    if (Navigator) {
      var screen = function () {
        return React.createElement(Navigator, {
          initialRouteName: "QuickFromResults",
          goBackOnBackPress: true,
          screens: {
            QuickFromResults: {
              title: title,
              headerLeft: closeBtn
                ? closeBtn(function () {
                    try {
                      Navigation.pop();
                    } catch (e) {}
                  })
                : undefined,
              render: function () {
                return React.createElement(ResultsPage, { user: user });
              },
            },
          },
        });
      };
      Navigation.push(screen);
    } else {
      Navigation.push(ResultsPage, { user: user });
    }
  } catch (e) {
    console.error("[QuickFrom] openResults", e);
    try {
      showToast("打开结果页失败");
    } catch (e2) {}
  }
}

function patchMessageSheet() {
  var ActionSheet = findByProps("openLazy", "hideActionSheet");
  if (!ActionSheet) return null;

  var rowMod = findByProps("ActionSheetRow");
  var ActionSheetRow = rowMod && rowMod.ActionSheetRow;
  var icon =
    getAssetIDByName("ic_search") ||
    getAssetIDByName("ic_search_24px") ||
    getAssetIDByName("SearchIcon");

  return before("openLazy", ActionSheet, function (args: any[]) {
    try {
      if (st().sheet === false) return;
      var comp = args[0];
      var key = args[1];
      var msg = args[2];
      if (key !== "MessageLongPressActionSheet") return;
      var message = (msg && msg.message) || msg;
      var author = message && message.author;
      if (!author || !comp || !comp.then) return;

      comp.then(function (instance: any) {
        var unp = after("default", instance, function (_a: any, component: any) {
          try {
            React.useEffect(function () {
              return function () {
                try {
                  unp();
                } catch (e) {}
              };
            }, []);

            if (!ActionSheetRow) return;

            var buttons = findInReactTree(component, function (c: any) {
              return (
                c &&
                c.some &&
                c.some(function (child: any) {
                  return (
                    (child &&
                      child.type &&
                      child.type.name === "ActionSheetRow") ||
                    (child && child.props && child.props.label)
                  );
                })
              );
            });

            if (!buttons) {
              buttons = findInReactTree(component, function (x: any) {
                return (
                  x && x[0] && x[0].type && x[0].type.name === "ButtonRow"
                );
              });
            }

            if (!buttons || !buttons.length) return;

            for (var i = 0; i < buttons.length; i++) {
              if (buttons[i] && buttons[i].key === "quickfrom") return;
            }

            var row = React.createElement(ActionSheetRow, {
              key: "quickfrom",
              label: "搜索此人发言",
              icon: icon
                ? React.createElement(ActionSheetRow.Icon, { source: icon })
                : undefined,
              onPress: function () {
                try {
                  ActionSheet.hideActionSheet();
                } catch (e) {}
                openResults(author);
              },
            });
            buttons.unshift(row);
          } catch (e) {
            console.error("[QuickFrom] sheet render", e);
          }
        });
      });
    } catch (e) {
      console.error("[QuickFrom] sheet", e);
    }
  });
}

export function onLoad() {
  defaults();
  try {
    showToast("QuickFrom v1.3 已启动");
  } catch (e) {
    console.log("[QuickFrom] toast failed", e);
  }

  try {
    var p1 = patchMessageSheet();
    if (p1) patches.push(p1);
  } catch (e) {
    console.error("[QuickFrom] message sheet failed", e);
    try {
      showToast("QuickFrom: 菜单 hook 失败");
    } catch (e2) {}
  }

  console.log("[QuickFrom] patches", patches.length);
}

export function onUnload() {
  for (var i = 0; i < patches.length; i++) {
    try {
      patches[i]();
    } catch (e) {}
  }
  patches.length = 0;
}
