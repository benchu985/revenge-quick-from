/**
 * QuickFrom v1.5
 * 长按消息 → 打开 Discord **原生搜索页**（from: / author）
 * 原生打不开时才用自建结果页兜底
 *
 * Revenge loader: eval(`vendetta=>{return ${js}}`)(vendettaForPlugins)
 */
import { findByProps, findByName, findByStoreName } from "@vendetta/metro";
import { React, ReactNative, FluxDispatcher, clipboard } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";

var patches: Array<() => void> = [];
var PAGE_SIZE = 25;

var C = {
  bg: "#313338",
  surface: "#2b2d31",
  surfacePress: "#232428",
  border: "#1e1f22",
  text: "#f2f3f5",
  textMuted: "#b5bac1",
  textFaint: "#949ba4",
  accent: "#5865f2",
  accentDim: "#4752c4",
  danger: "#f23f43",
  chip: "#1e1f22",
  time: "#00a8fc",
  timeBg: "rgba(0, 168, 252, 0.12)",
  timeBorder: "rgba(0, 168, 252, 0.35)",
  headerBg: "#2b2d31",
};

function st() {
  return storage as any;
}

function defaults() {
  var s = st();
  if (s.sheet === undefined) s.sheet = true;
  // preferNative: true = try Discord search UI first
  if (s.preferNative === undefined) s.preferNative = true;
  if (s.useUserId === undefined) s.useUserId = true;
  if (s.showImages === undefined) s.showImages = true;
  if (s.showEmoji === undefined) s.showEmoji = true;
}

function fp() {
  var args = arguments;
  var arr: string[] = [];
  for (var i = 0; i < args.length; i++) arr.push(args[i]);
  try {
    return findByProps.apply(null, arr);
  } catch (e) {
    return null;
  }
}

function getUserId(user: any): string | null {
  if (!user) return null;
  return user.id || user.userId || (user.user && user.user.id) || null;
}

function getTag(user: any): string {
  if (!user) return "?";
  var name =
    user.username ||
    user.global_name ||
    user.globalName ||
    (user.user &&
      (user.user.username || user.user.global_name || user.user.globalName)) ||
    "";
  var disc = user.discriminator || (user.user && user.user.discriminator);
  if (disc && disc !== "0" && disc !== "0000") return name + "#" + disc;
  return name || getUserId(user) || "?";
}

function buildQuery(user: any): string {
  defaults();
  var id = getUserId(user);
  var tag = getTag(user);
  if (st().useUserId && id) return "from:" + id;
  if (tag && tag.indexOf(" ") >= 0) return 'from:"' + tag + '"';
  if (tag && tag !== "?") return "from:" + tag;
  if (id) return "from:" + id;
  return "from:";
}

function selectedGuildId(): string | null {
  try {
    var gs = findByStoreName("SelectedGuildStore") || fp("getGuildId");
    var id = gs && gs.getGuildId && gs.getGuildId();
    if (id) return id;
    var cs =
      findByStoreName("SelectedChannelStore") || fp("getChannelId");
    var cid = cs && cs.getChannelId && cs.getChannelId();
    var chStore = findByStoreName("ChannelStore") || fp("getChannel");
    var ch = cid && chStore && chStore.getChannel && chStore.getChannel(cid);
    return (ch && ch.guild_id) || null;
  } catch (e) {
    return null;
  }
}

function selectedChannelId(): string | null {
  try {
    var cs =
      findByStoreName("SelectedChannelStore") || fp("getChannelId");
    return (cs && cs.getChannelId && cs.getChannelId()) || null;
  } catch (e) {
    return null;
  }
}

function channelLabel(id: string): string {
  try {
    var chStore = findByStoreName("ChannelStore") || fp("getChannel");
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
      pad(d.getMinutes())
    );
  } catch (e) {
    return String(ts);
  }
}

function avatarUrl(user: any, size?: number): string {
  var sz = size || 64;
  if (!user) return "https://cdn.discordapp.com/embed/avatars/0.png";
  var id = getUserId(user);
  var avatar = user.avatar || (user.user && user.user.avatar);
  if (id && avatar) {
    var ext = String(avatar).indexOf("a_") === 0 ? "gif" : "png";
    return (
      "https://cdn.discordapp.com/avatars/" +
      id +
      "/" +
      avatar +
      "." +
      ext +
      "?size=" +
      sz
    );
  }
  var idx = 0;
  try {
    if (user.discriminator && user.discriminator !== "0") {
      idx = parseInt(user.discriminator, 10) % 5;
    } else if (id) {
      var n = parseInt(String(id).slice(0, -3) || "0", 10);
      if (isNaN(n)) n = 0;
      idx = Math.abs(n) % 6;
    }
  } catch (e) {
    idx = 0;
  }
  return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
}

function http() {
  return fp("get", "post", "put", "patch", "del") || fp("get", "post", "put", "patch", "delete");
}

function parseContentTokens(content: string): any[] {
  if (!content) return [];
  var re = /<(a?):([a-zA-Z0-9_~]+):(\d+)>/g;
  var out: any[] = [];
  var last = 0;
  var m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last)
      out.push({ type: "text", value: content.slice(last, m.index) });
    out.push({
      type: "emoji",
      animated: m[1] === "a",
      name: m[2],
      id: m[3],
    });
    last = m.index + m[0].length;
  }
  if (last < content.length)
    out.push({ type: "text", value: content.slice(last) });
  return out;
}

function emojiCdn(id: string, animated: boolean): string {
  return (
    "https://cdn.discordapp.com/emojis/" +
    id +
    "." +
    (animated ? "gif" : "webp") +
    "?size=48&quality=lossless"
  );
}

/**
 * Try hard to open Discord's native in-guild search with query filled.
 * Returns true if something that looks like native search was triggered.
 */
function openNativeSearch(user: any): boolean {
  var query = buildQuery(user);
  var guildId = selectedGuildId();
  var channelId = selectedChannelId();
  var authorId = getUserId(user);
  var tried: string[] = [];

  function ok( whi: string) {
    tried.push(whi + ":ok");
    try {
      showToast("原生搜索 · " + query, getAssetIDByName("ic_search"));
    } catch (e) {}
    console.log("[QuickFrom] native search via", whi, query);
    return true;
  }

  // 1) openSearch modules (various builds)
  var searchMods = [
    fp("openSearch", "dismissSearch"),
    fp("openSearch", "closeSearch"),
    fp("openSearch"),
    fp("openSearchModal"),
    fp("showSearch"),
  ];
  for (var i = 0; i < searchMods.length; i++) {
    var sm = searchMods[i];
    if (!sm) continue;
    var open =
      sm.openSearch || sm.openSearchModal || sm.showSearch || null;
    if (!open) continue;
    var payloads = [
      { query: query },
      query,
      { searchQuery: query, queryString: query },
      { query: query, guildId: guildId, channelId: channelId },
      {
        query: query,
        guildId: guildId,
        channelId: channelId,
        authorId: authorId,
      },
      {
        searchContext: { guildId: guildId, channelId: channelId },
        query: query,
      },
    ];
    for (var p = 0; p < payloads.length; p++) {
      try {
        open.call(sm, payloads[p]);
        return ok("openSearch#" + p);
      } catch (e) {}
    }
    try {
      open.call(sm);
      // set query after open
      var setter =
        fp("setSearchQuery") ||
        fp("updateSearchQuery") ||
        fp("setQueryString") ||
        fp("setQuery");
      if (setter) {
        try {
          if (setter.setSearchQuery) setter.setSearchQuery(query);
          if (setter.updateSearchQuery) setter.updateSearchQuery(query);
          if (setter.setQueryString) setter.setQueryString(query);
          if (setter.setQuery) setter.setQuery(query);
        } catch (e2) {}
      }
      return ok("openSearch-bare");
    } catch (e) {}
  }

  // 2) Search actions / store
  var actions =
    fp("search", "setQuery") ||
    fp("setSearchQuery", "search") ||
    fp("clearSearch", "setSearchQuery") ||
    fp("SEARCH", "setSearchQuery");
  if (actions) {
    tried.push("searchActions");
    try {
      if (actions.setSearchQuery) actions.setSearchQuery(query);
      if (actions.updateSearchQuery) actions.updateSearchQuery(query);
      if (actions.setQueryString) actions.setQueryString(query);
      if (actions.setQuery) actions.setQuery(query);
      if (actions.search) actions.search(query);
      if (actions.openSearch) {
        actions.openSearch({ query: query, guildId: guildId });
        return ok("actions.openSearch");
      }
    } catch (e) {}
  }

  // 3) FluxDispatcher — fire common search events then try open again
  var FD =
    FluxDispatcher ||
    fp("dispatch", "subscribe") ||
    fp("dispatch", "wait");
  if (FD && FD.dispatch) {
    tried.push("flux");
    var events = [
      { type: "SEARCH_SET_QUERY", query: query },
      { type: "SEARCH_QUERY_UPDATE", query: query },
      {
        type: "SEARCH_EDITOR_STATE_CHANGE",
        query: query,
        searchContext: { guildId: guildId, channelId: channelId },
      },
      {
        type: "SEARCH_START",
        query: query,
        guildId: guildId,
        channelId: channelId,
      },
      {
        type: "LAYER_PUSH",
        layer: "SEARCH",
        query: query,
        guildId: guildId,
      },
      {
        type: "SEARCH_MODAL_OPEN",
        query: query,
        guildId: guildId,
        channelId: channelId,
      },
    ];
    for (var ei = 0; ei < events.length; ei++) {
      try {
        FD.dispatch(events[ei]);
      } catch (e) {}
    }
    // retry openSearch after flux
    for (var j = 0; j < searchMods.length; j++) {
      var sm2 = searchMods[j];
      var open2 = sm2 && (sm2.openSearch || sm2.openSearchModal);
      if (!open2) continue;
      try {
        open2.call(sm2, { query: query, guildId: guildId });
        return ok("flux+openSearch");
      } catch (e) {}
      try {
        open2.call(sm2, query);
        return ok("flux+openSearch-q");
      } catch (e) {}
    }
  }

  // 4) Navigation routes used on some mobile builds
  var Nav = fp("push", "pushLazy", "pop") || fp("push", "pop");
  if (Nav && Nav.push) {
    tried.push("nav");
    var routes = [
      ["Search", { query: query, guildId: guildId }],
      ["GuildSearch", { query: query, queryString: query, guildId: guildId }],
      ["ChatSearch", { query: query, channelId: channelId }],
      ["SearchResults", { query: query }],
      ["SearchModal", { query: query }],
    ];
    for (var r = 0; r < routes.length; r++) {
      try {
        Nav.push(routes[r][0], routes[r][1]);
        return ok("nav:" + routes[r][0]);
      } catch (e) {}
    }
  }

  // 5) Clipboard + tip (still "native" path user can paste)
  try {
    if (clipboard && clipboard.setString) clipboard.setString(query);
  } catch (e) {}

  console.log("[QuickFrom] native search failed, tried:", tried.join(","));
  return false;
}

/* ───────── fallback custom page (native-ish layout) ───────── */

async function searchByAuthor(
  guildId: string,
  authorId: string,
  offset: number,
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
    total:
      body && body.total_results != null ? body.total_results : out.length,
    messages: out,
  };
}

function jumpTo(guildId: string, channelId: string, messageId: string) {
  try {
    var nav = fp("transitionToGuild") || fp("selectChannel");
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
    var ja = fp("jumpToMessage");
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

function MessageContent(props: { content: string }) {
  var Text = ReactNative.Text;
  var Image = ReactNative.Image;
  var content = props.content || "";
  if (!content) {
    return React.createElement(
      Text,
      { style: { color: C.textFaint, fontSize: 15, lineHeight: 20 } },
      "",
    );
  }
  if (st().showEmoji === false) {
    return React.createElement(
      Text,
      { style: { color: C.text, fontSize: 15, lineHeight: 22 } },
      content,
    );
  }
  var tokens = parseContentTokens(content);
  var kids: any[] = [];
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (tok.type === "text") {
      kids.push(
        React.createElement(
          Text,
          {
            key: "t" + i,
            style: { color: C.text, fontSize: 15, lineHeight: 22 },
          },
          tok.value,
        ),
      );
    } else if (tok.type === "emoji" && Image) {
      kids.push(
        React.createElement(Image, {
          key: "e" + i,
          source: { uri: emojiCdn(tok.id, tok.animated) },
          style: {
            width: 20,
            height: 20,
            transform: [{ translateY: 3 }],
          },
        }),
      );
    }
  }
  return React.createElement(
    Text,
    { style: { color: C.text, fontSize: 15, lineHeight: 22 } },
    kids,
  );
}

function FallbackResultsPage(props: { user: any }) {
  var user = props.user;
  var authorId = getUserId(user);
  var tag = getTag(user);
  var View = ReactNative.View;
  var Text = ReactNative.Text;
  var FlatList = ReactNative.FlatList;
  var Pressable = ReactNative.Pressable;
  var ActivityIndicator = ReactNative.ActivityIndicator;
  var TextInput = ReactNative.TextInput;
  var Image = ReactNative.Image;

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
    var target = p < 1 ? 1 : p;
    setPage(target);
    setJumpText(String(target));
    setLoading(true);
    setError(null);
    (async function () {
      if (!authorId || !guildId) {
        setError(!guildId ? "请在服务器频道使用" : "无用户 ID");
        setLoading(false);
        return;
      }
      try {
        var res = await searchByAuthor(
          guildId,
          authorId,
          (target - 1) * PAGE_SIZE,
        );
        setTotal(res.total);
        setItems(res.messages);
      } catch (err: any) {
        setError(
          "搜索失败: " +
            ((err && err.body && err.body.message) ||
              (err && err.message) ||
              String(err)),
        );
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
    var tp = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE) || 1);
    if (n > tp) n = tp;
    loadPage(n);
  }

  // Native-search-like row: avatar | name+time / content  (Discord search result style)
  function renderRow(info: any) {
    var item = info.item;
    var author = item.author || user;
    var timeStr = fmtTime(item.timestamp);
    return React.createElement(
      Pressable,
      {
        onPress: function () {
          jumpTo(guildId as string, item.channel_id, item.id);
          try {
            var Nav = fp("pop", "push");
            if (Nav && Nav.pop) Nav.pop();
          } catch (e) {}
        },
        delayPressIn: 30,
        style: function (state: any) {
          return {
            flexDirection: "row",
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor:
              state && state.pressed ? C.surfacePress : C.bg,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(0,0,0,0.25)",
          };
        },
      },
      Image
        ? React.createElement(Image, {
            source: { uri: avatarUrl(author, 80) },
            style: {
              width: 40,
              height: 40,
              borderRadius: 20,
              marginRight: 12,
              backgroundColor: C.chip,
            },
          })
        : null,
      React.createElement(
        View,
        { style: { flex: 1, minWidth: 0 } },
        React.createElement(
          View,
          {
            style: {
              flexDirection: "row",
              alignItems: "baseline",
              marginBottom: 2,
            },
          },
          React.createElement(
            Text,
            {
              style: {
                color: C.text,
                fontSize: 16,
                fontWeight: "600",
                marginRight: 8,
              },
              numberOfLines: 1,
            },
            getTag(author),
          ),
          timeStr
            ? React.createElement(
                Text,
                {
                  style: {
                    color: C.time,
                    fontSize: 12,
                    fontWeight: "700",
                  },
                },
                timeStr,
              )
            : null,
        ),
        React.createElement(
          Text,
          {
            style: {
              color: C.textFaint,
              fontSize: 12,
              marginBottom: 4,
            },
          },
          channelLabel(item.channel_id),
        ),
        React.createElement(MessageContent, {
          content: item.content || "",
        }),
      ),
    );
  }

  return React.createElement(
    View,
    { style: { flex: 1, backgroundColor: C.bg } },
    // Search-bar lookalike header
    React.createElement(
      View,
      {
        style: {
          backgroundColor: C.headerBg,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        },
      },
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: C.chip,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 10,
          },
        },
        React.createElement(
          Text,
          { style: { color: C.accent, fontWeight: "700", fontSize: 14 } },
          buildQuery(user),
        ),
      ),
      React.createElement(
        Text,
        {
          style: {
            color: C.textMuted,
            fontSize: 12,
            marginTop: 8,
            marginLeft: 4,
          },
        },
        loading
          ? "搜索中…"
          : error
            ? error
            : "— " +
              total +
              " 条结果 · 第 " +
              page +
              "/" +
              totalPages +
              " 页（原生搜索不可用时的兜底）",
      ),
    ),
    loading && items.length === 0
      ? React.createElement(
          View,
          {
            style: {
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            },
          },
          React.createElement(ActivityIndicator, {
            size: "large",
            color: C.accent,
          }),
        )
      : React.createElement(FlatList, {
          style: { flex: 1 },
          data: items,
          keyExtractor: function (m: any, i: number) {
            return m.id + "-" + i;
          },
          renderItem: renderRow,
          ListEmptyComponent: React.createElement(
            Text,
            {
              style: {
                color: C.textMuted,
                textAlign: "center",
                marginTop: 40,
              },
            },
            "没有结果",
          ),
        }),
    React.createElement(
      View,
      {
        style: {
          flexDirection: "row",
          alignItems: "center",
          padding: 10,
          backgroundColor: C.headerBg,
          borderTopWidth: 1,
          borderTopColor: C.border,
        },
      },
      React.createElement(
        Pressable,
        {
          onPress: function () {
            if (page > 1) loadPage(page - 1);
          },
          style: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: C.accent,
            borderRadius: 8,
            opacity: page <= 1 ? 0.4 : 1,
            marginRight: 8,
          },
        },
        React.createElement(
          Text,
          { style: { color: "#fff", fontWeight: "600" } },
          "上一页",
        ),
      ),
      React.createElement(
        Text,
        { style: { color: C.text, marginRight: 8 } },
        page + "/" + totalPages,
      ),
      React.createElement(
        Pressable,
        {
          onPress: function () {
            if (page < totalPages) loadPage(page + 1);
          },
          style: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: C.accent,
            borderRadius: 8,
            opacity: page >= totalPages ? 0.4 : 1,
            marginRight: 8,
          },
        },
        React.createElement(
          Text,
          { style: { color: "#fff", fontWeight: "600" } },
          "下一页",
        ),
      ),
      React.createElement(TextInput, {
        value: jumpText,
        onChangeText: setJumpText,
        keyboardType: "number-pad",
        onSubmitEditing: goJump,
        style: {
          width: 48,
          height: 36,
          backgroundColor: C.chip,
          color: C.text,
          borderRadius: 8,
          textAlign: "center",
          marginRight: 6,
        },
      }),
      React.createElement(
        Pressable,
        {
          onPress: goJump,
          style: {
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: C.chip,
            borderRadius: 8,
          },
        },
        React.createElement(Text, { style: { color: C.text } }, "跳转"),
      ),
    ),
  );
}

function openFallbackPage(user: any) {
  var Navigation = fp("push", "pushLazy", "pop") || fp("push", "pop");
  var Navigator =
    findByName("Navigator") || (fp("Navigator") || {}).Navigator;
  if (Navigator && (Navigator as any).default)
    Navigator = (Navigator as any).default;
  if (!Navigation || !Navigation.push) {
    try {
      showToast("无法打开页面");
    } catch (e) {}
    return;
  }
  var title = "搜索 · " + getTag(user);
  var closeBtn =
    (fp("getRenderCloseButton") || {}).getRenderCloseButton ||
    (fp("getHeaderCloseButton") || {}).getHeaderCloseButton;
  try {
    if (Navigator) {
      Navigation.push(function () {
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
                return React.createElement(FallbackResultsPage, {
                  user: user,
                });
              },
            },
          },
        });
      });
    } else {
      Navigation.push(FallbackResultsPage, { user: user });
    }
    try {
      showToast("已用自建结果页（原生搜索不可用）");
    } catch (e) {}
  } catch (e) {
    console.error("[QuickFrom] fallback", e);
  }
}

/** Main entry: native first, fallback second */
function openFromUser(user: any) {
  defaults();
  var id = getUserId(user);
  if (!id && !getTag(user)) {
    try {
      showToast("QuickFrom: 无用户信息");
    } catch (e) {}
    return;
  }

  if (st().preferNative !== false) {
    var nativeOk = false;
    try {
      nativeOk = openNativeSearch(user);
    } catch (e) {
      console.error("[QuickFrom] native", e);
    }
    if (nativeOk) return;
  }

  // copy query always as safety
  try {
    var q = buildQuery(user);
    if (clipboard && clipboard.setString) clipboard.setString(q);
  } catch (e) {}

  openFallbackPage(user);
}

function patchMessageSheet() {
  var ActionSheet = fp("openLazy", "hideActionSheet");
  if (!ActionSheet) return null;
  var rowMod = fp("ActionSheetRow");
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
              if (
                buttons[i] &&
                (buttons[i].key === "quickfrom" ||
                  buttons[i].key === "quickfrom-native")
              )
                return;
            }

            // Primary: native-style search
            buttons.unshift(
              React.createElement(ActionSheetRow, {
                key: "quickfrom",
                label: "搜索此人发言",
                icon: icon
                  ? React.createElement(ActionSheetRow.Icon, {
                      source: icon,
                    })
                  : undefined,
                onPress: function () {
                  try {
                    ActionSheet.hideActionSheet();
                  } catch (e) {}
                  openFromUser(author);
                },
              }),
            );
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
    showToast("QuickFrom v1.5 · 优先原生搜索");
  } catch (e) {}

  try {
    var p = patchMessageSheet();
    if (p) patches.push(p);
  } catch (e) {
    console.error("[QuickFrom] sheet hook", e);
    try {
      showToast("QuickFrom: hook 失败");
    } catch (e2) {}
  }
  console.log("[QuickFrom] v1.5 loaded");
}

export function onUnload() {
  for (var i = 0; i < patches.length; i++) {
    try {
      patches[i]();
    } catch (e) {}
  }
  patches.length = 0;
}
