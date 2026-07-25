/**
 * QuickFrom — minimal Vendetta/Revenge plugin
 * Loader does: eval(`vendetta=>{return ${js}}`)(vendettaForPlugins)
 * So the bundle must be an IIFE expression that RETURNS { onLoad, onUnload, settings? }
 */
import { findByProps, findByName, findByStoreName } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after, before, instead } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";

const patches: Array<() => void> = [];

function s() {
  return storage as any;
}

function defaults() {
  const st = s();
  if (st.doubleTap === undefined) st.doubleTap = true;
  if (st.sheet === undefined) st.sheet = true;
}

function getUserId(user: any): string | null {
  if (!user) return null;
  return user.id || user.userId || (user.user && user.user.id) || null;
}

function getTag(user: any): string {
  if (!user) return "?";
  var name = user.username || user.globalName || (user.user && user.user.username) || "";
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
    var id = gs && (gs.getGuildId && gs.getGuildId());
    if (id) return id;
    var cs = findByStoreName("SelectedChannelStore") || findByProps("getChannelId");
    var cid = cs && cs.getChannelId && cs.getChannelId();
    var chStore = findByStoreName("ChannelStore") || findByProps("getChannel");
    var ch = cid && chStore && chStore.getChannel && chStore.getChannel(cid);
    return (ch && ch.guild_id) || null;
  } catch (e) {
    return null;
  }
}

function selectedChannelId(): string | null {
  try {
    var cs = findByStoreName("SelectedChannelStore") || findByProps("getChannelId");
    return (cs && cs.getChannelId && cs.getChannelId()) || null;
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

async function searchByAuthor(guildId: string, authorId: string, channelId?: string | null) {
  var api = http();
  if (!api || !api.get) throw new Error("no http");

  var q =
    "/guilds/" +
    guildId +
    "/messages/search?author_id=" +
    encodeURIComponent(authorId) +
    "&include_nsfw=true";
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
    total: (body && body.total_results) || out.length,
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

function ResultsPage(props: { user: any }) {
  var user = props.user;
  var authorId = getUserId(user);
  var tag = getTag(user);
  var View = ReactNative.View;
  var Text = ReactNative.Text;
  var FlatList = ReactNative.FlatList;
  var TouchableOpacity = ReactNative.TouchableOpacity;
  var ActivityIndicator = ReactNative.ActivityIndicator;

  var _s = React.useState(true);
  var loading = _s[0];
  var setLoading = _s[1];
  var _e = React.useState(null as string | null);
  var error = _e[0];
  var setError = _e[1];
  var _t = React.useState(0);
  var total = _t[0];
  var setTotal = _t[1];
  var _i = React.useState([] as any[]);
  var items = _i[0];
  var setItems = _i[1];

  var guildId = React.useMemo(function () {
    return selectedGuildId();
  }, []);

  React.useEffect(function () {
    var dead = false;
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
        var res = await searchByAuthor(guildId, authorId, null);
        if (dead) return;
        setTotal(res.total);
        setItems(res.messages);
      } catch (err: any) {
        if (dead) return;
        var msg =
          (err && err.body && err.body.message) ||
          (err && err.message) ||
          String(err);
        setError("搜索失败: " + msg);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return function () {
      dead = true;
    };
  }, []);

  function onPressItem(m: any) {
    var ok = jumpTo(guildId as string, m.channel_id, m.id);
    if (!ok) {
      try {
        showToast("无法跳转，记下频道与消息 ID");
      } catch (e) {}
    } else {
      try {
        var Nav = findByProps("pop", "push");
        if (Nav && Nav.pop) Nav.pop();
      } catch (e) {}
    }
  }

  var header = React.createElement(
    View,
    {
      style: {
        padding: 12,
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
      loading ? "搜索中…" : error ? error : "共 " + total + " 条",
    ),
  );

  if (loading) {
    return React.createElement(
      View,
      { style: { flex: 1 } },
      header,
      React.createElement(
        View,
        { style: { flex: 1, alignItems: "center", justifyContent: "center" } },
        React.createElement(ActivityIndicator, { size: "large" }),
      ),
    );
  }

  if (error) {
    return React.createElement(
      View,
      { style: { flex: 1 } },
      header,
      React.createElement(
        Text,
        { style: { color: "#f23f43", padding: 16 } },
        error,
      ),
    );
  }

  return React.createElement(
    View,
    { style: { flex: 1 } },
    header,
    React.createElement(FlatList, {
      data: items,
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
        "没有搜到消息",
      ),
      renderItem: function (info: any) {
        var item = info.item;
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
            channelLabel(item.channel_id),
          ),
          React.createElement(
            Text,
            { style: { color: "#dbdee1", fontSize: 14 }, numberOfLines: 4 },
            item.content || "(无文字)",
          ),
        );
      },
    }),
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

  var Navigation = findByProps("push", "pushLazy", "pop") || findByProps("push", "pop");
  var Navigator = findByName("Navigator") || (findByProps("Navigator") || {}).Navigator;
  if (Navigator && (Navigator as any).default) Navigator = (Navigator as any).default;

  if (!Navigation || !Navigation.push) {
    try {
      showToast("QuickFrom: 无 Navigation");
    } catch (e) {}
    return;
  }

  var title = "from:" + getTag(user);
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
    try {
      showToast("搜索 " + title);
    } catch (e) {}
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
      if (s().sheet === false) return;
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
                    (child && child.type && child.type.name === "ActionSheetRow") ||
                    (child && child.props && child.props.label)
                  );
                })
              );
            });

            if (!buttons) {
              buttons = findInReactTree(component, function (x: any) {
                return x && x[0] && x[0].type && x[0].type.name === "ButtonRow";
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

function patchProfileOpen() {
  var mod = findByProps("openUserProfileModal") || findByProps("openProfile");
  if (!mod) return null;

  var method = mod.openUserProfileModal
    ? "openUserProfileModal"
    : mod.openProfile
      ? "openProfile"
      : null;
  if (!method) return null;

  var last: Record<string, number> = {};
  var timers: Record<string, any> = {};

  return instead(method, mod, function (args: any[], orig: any) {
    try {
      if (s().doubleTap === false) return orig.apply(null, args);

      var a0 = args[0];
      var userId =
        (typeof a0 === "string" ? a0 : null) ||
        (a0 && a0.userId) ||
        (a0 && a0.id) ||
        (a0 && a0.user && a0.user.id) ||
        null;
      if (!userId) return orig.apply(null, args);

      var now = Date.now();
      var prev = last[userId] || 0;
      last[userId] = now;

      if (now - prev <= 350) {
        if (timers[userId]) {
          clearTimeout(timers[userId]);
          delete timers[userId];
        }
        var user =
          (a0 && a0.user) ||
          (typeof a0 === "object" ? a0 : null) ||
          { id: userId };
        openResults(user);
        return;
      }

      if (timers[userId]) clearTimeout(timers[userId]);
      timers[userId] = setTimeout(function () {
        delete timers[userId];
        try {
          orig.apply(null, args);
        } catch (e) {}
      }, 360);
      return;
    } catch (e) {
      return orig.apply(null, args);
    }
  });
}

export function onLoad() {
  defaults();

  try {
    showToast("QuickFrom v1.2 已启动");
  } catch (e) {
    console.log("[QuickFrom] toast failed", e);
  }

  try {
    var p1 = patchMessageSheet();
    if (p1) patches.push(p1);
  } catch (e) {
    console.error("[QuickFrom] message sheet failed", e);
    try {
      showToast("QuickFrom: 消息菜单 hook 失败");
    } catch (e2) {}
  }

  try {
    var p2 = patchProfileOpen();
    if (p2) patches.push(p2);
  } catch (e) {
    console.error("[QuickFrom] profile hook failed", e);
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
