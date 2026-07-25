/**
 * QuickFrom v1.8
 * 长按消息 → 自建「类原生搜索」结果页
 * - 不 push 字符串路由 "Search"（会 Invariant Violation）
 * - 相对时间、关键词搜索、头像、自定义表情、图片、分页
 *
 * Revenge: eval(`vendetta=>{return ${js}}`)(vendettaForPlugins)
 */
import { findByProps, findByName, findByStoreName } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";

var patches: Array<() => void> = [];
var PAGE_SIZE = 25;

/* Discord Android search-ish tokens */
var C = {
  bg: "#313338",
  panel: "#2b2d31",
  input: "#1e1f22",
  elev: "#232428",
  press: "#1a1b1e",
  border: "#1e1f22",
  hair: "rgba(255,255,255,0.06)",
  text: "#f2f3f5",
  muted: "#b5bac1",
  faint: "#949ba4",
  link: "#00a8fc",
  accent: "#5865f2",
  accentDim: "#4752c4",
  danger: "#f23f43",
  chip: "#5865f2",
  chipText: "#fff",
  time: "#00a8fc",
};

function st() {
  return storage as any;
}
function defaults() {
  var s = st();
  if (s.sheet === undefined) s.sheet = true;
  if (s.useUserId === undefined) s.useUserId = true;
  if (s.showImages === undefined) s.showImages = true;
  if (s.showEmoji === undefined) s.showEmoji = true;
}

function fp() {
  var a = arguments,
    arr: string[] = [];
  for (var i = 0; i < a.length; i++) arr.push(a[i]);
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
    user.global_name ||
    user.globalName ||
    user.username ||
    (user.user &&
      (user.user.global_name ||
        user.user.globalName ||
        user.user.username)) ||
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
    var cs = findByStoreName("SelectedChannelStore") || fp("getChannelId");
    var cid = cs && cs.getChannelId && cs.getChannelId();
    var chStore = findByStoreName("ChannelStore") || fp("getChannel");
    var ch = cid && chStore && chStore.getChannel && chStore.getChannel(cid);
    return (ch && ch.guild_id) || null;
  } catch (e) {
    return null;
  }
}

function channelMeta(id: string): { name: string; guild: string } {
  try {
    var chStore = findByStoreName("ChannelStore") || fp("getChannel");
    var ch = chStore && chStore.getChannel && chStore.getChannel(id);
    var name = ch && ch.name ? "#" + ch.name : "#" + String(id).slice(-4);
    var gname = "";
    try {
      var gs = findByStoreName("GuildStore") || fp("getGuild");
      var g = ch && ch.guild_id && gs && gs.getGuild && gs.getGuild(ch.guild_id);
      gname = (g && g.name) || "";
    } catch (e) {}
    return { name: name, guild: gname };
  } catch (e) {
    return { name: "#" + String(id).slice(-4), guild: "" };
  }
}

function fmtTime(ts: any): string {
  if (!ts) return "";
  try {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    function pad(n: number) {
      return n < 10 ? "0" + n : String(n);
    }
    var minutes = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return minutes + " 分钟前";
    if (minutes < 1440) {
      var hours = Math.floor(minutes / 60);
      var rest = minutes % 60;
      return rest ? hours + " 小时 " + rest + " 分钟前" : hours + " 小时前";
    }
    return d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  } catch (e) {
    return String(ts);
  }
}

function avatarUrl(user: any, size?: number): string {
  var sz = size || 80;
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
  } catch (e) {}
  return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
}

function http() {
  return (
    fp("get", "post", "put", "patch", "del") ||
    fp("get", "post", "put", "patch", "delete")
  );
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

async function searchByAuthor(
  guildId: string,
  authorId: string,
  offset: number,
  keyword?: string,
) {
  var api = http();
  if (!api || !api.get) throw new Error("no http");
  var q =
    "/guilds/" +
    guildId +
    "/messages/search?author_id=" +
    encodeURIComponent(authorId) +
    "&include_nsfw=true&offset=" +
    encodeURIComponent(String(offset || 0)) +
    (keyword && keyword.trim()
      ? "&content=" + encodeURIComponent(keyword.trim())
      : "");
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

function openImage(url: string) {
  try {
    var Media = fp("openMediaModal") || fp("showMediaModal");
    if (Media && Media.openMediaModal) {
      Media.openMediaModal({
        images: [{ url: url, source: { uri: url } }],
        index: 0,
      });
      return;
    }
  } catch (e) {}
  try {
    var u = fp("openURL") || fp("openUrl");
    if (u && u.openURL) u.openURL(url);
    else if (u && u.openUrl) u.openUrl(url);
  } catch (e) {}
}

function isImageAtt(a: any): boolean {
  if (!a) return false;
  var ct = String(a.content_type || "").toLowerCase();
  if (ct.indexOf("image/") === 0) return true;
  var name = String(a.filename || a.url || "").toLowerCase();
  return (
    /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(name) ||
    !!(a.width && a.height && a.url)
  );
}

function MessageContent(props: { content: string }) {
  var Text = ReactNative.Text;
  var Image = ReactNative.Image;
  var content = props.content || "";
  if (!content) return null;
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
          source: {
            uri: emojiCdn(tok.id, tok.animated),
          },
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

function PagerBtn(props: any) {
  var Pressable = ReactNative.Pressable;
  var Text = ReactNative.Text;
  return React.createElement(
    Pressable,
    {
      onPress: props.disabled ? undefined : props.onPress,
      disabled: !!props.disabled,
      hitSlop: 8,
      style: function (state: any) {
        var pressed = state && state.pressed;
        return {
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 16,
          backgroundColor: props.disabled
            ? C.elev
            : pressed
              ? C.accentDim
              : props.ghost
                ? C.elev
                : C.accent,
          opacity: props.disabled ? 0.45 : 1,
          marginRight: props.mr || 0,
        };
      },
    },
    React.createElement(
      Text,
      { style: { color: C.text, fontSize: 13, fontWeight: "700" } },
      props.label,
    ),
  );
}

/**
 * Search results page — layout mirrors Discord mobile search:
 * top query bar + result count, then message hits with avatar/name/time/content.
 */
function SearchResultsPage(props: { user: any }) {
  var user = props.user;
  var authorId = getUserId(user);
  var tag = getTag(user);
  var query = buildQuery(user);

  var View = ReactNative.View;
  var Text = ReactNative.Text;
  var FlatList = ReactNative.FlatList;
  var Pressable = ReactNative.Pressable;
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
  var _keyword = React.useState("");
  var keyword = _keyword[0];
  var setKeyword = _keyword[1];

  var totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE) || 1);

  function loadPage(p: number) {
    var target = p < 1 ? 1 : p;
    setPage(target);
    setJumpText(String(target));
    setLoading(true);
    setError(null);
    (async function () {
      if (!authorId) {
        setError("无用户 ID");
        setLoading(false);
        return;
      }
      if (!guildId) {
        setError("请在服务器频道里使用（私信没有服务器搜索）");
        setLoading(false);
        return;
      }
      try {
        var res = await searchByAuthor(
          guildId,
          authorId,
          (target - 1) * PAGE_SIZE,
          keyword,
        );
        setTotal(res.total);
        setItems(res.messages);
        var tp = Math.max(1, Math.ceil((res.total || 0) / PAGE_SIZE) || 1);
        if (target > tp && tp !== target) {
          loadPage(tp);
          return;
        }
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

  function submitKeyword() {
    loadPage(1);
  }

  function renderImages(m: any) {
    if (st().showImages === false || !Image) return null;
    var imgs: any[] = [];
    var atts = m.attachments || [];
    for (var i = 0; i < atts.length; i++) {
      if (isImageAtt(atts[i])) imgs.push(atts[i]);
    }
    var embeds = m.embeds || [];
    for (var e = 0; e < embeds.length; e++) {
      var emb = embeds[e];
      if (emb && emb.image && (emb.image.proxy_url || emb.image.url)) {
        imgs.push({
          url: emb.image.proxy_url || emb.image.url,
          width: emb.image.width,
          height: emb.image.height,
        });
      }
    }
    var stickers = m.sticker_items || m.stickers || [];
    for (var s = 0; s < stickers.length; s++) {
      var sticker = stickers[s];
      if (!sticker || !sticker.id) continue;
      var ext = sticker.format_type === 4 ? "gif" : "png";
      imgs.push({
        url:
          "https://media.discordapp.net/stickers/" +
          sticker.id +
          "." +
          ext +
          "?size=160",
        width: 120,
        height: 120,
      });
    }
    if (!imgs.length) return null;
    var kids: any[] = [];
    for (var k = 0; k < imgs.length; k++) {
      (function (att, idx) {
        var uri = att.proxy_url || att.url;
        if (!uri) return;
        var w = att.width || 160;
        var h = att.height || 120;
        var maxW = 180;
        var scale = w > maxW ? maxW / w : 1;
        kids.push(
          React.createElement(
            Pressable,
            {
              key: uri + idx,
              onPress: function () {
                openImage(uri);
              },
              style: function (state: any) {
                return {
                  marginTop: 8,
                  marginRight: 8,
                  borderRadius: 8,
                  overflow: "hidden",
                  opacity: state && state.pressed ? 0.85 : 1,
                };
              },
            },
            React.createElement(Image, {
              source: { uri: uri },
              style: {
                width: Math.max(72, Math.round(w * scale)),
                height: Math.max(56, Math.round(h * scale)),
                backgroundColor: C.elev,
              },
              resizeMode: "cover",
            }),
          ),
        );
      })(imgs[k], k);
    }
    if (!kids.length) return null;
    return React.createElement(
      ScrollView,
      { horizontal: true, showsHorizontalScrollIndicator: false },
      kids,
    );
  }

  function renderRow(info: any) {
    var item = info.item;
    var author = item.author || user;
    var timeStr = fmtTime(item.timestamp || item.edited_timestamp);
    var meta = channelMeta(item.channel_id);

    // Discord search groups hits under a channel context strip
    return React.createElement(
      View,
      {
        style: {
          backgroundColor: C.bg,
          borderBottomWidth: 8,
          borderBottomColor: C.panel,
        },
      },
      // channel context bar (like native search)
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 4,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              color: C.faint,
              fontSize: 12,
              fontWeight: "600",
            },
            numberOfLines: 1,
          },
          (meta.guild ? meta.guild + "  ›  " : "") + meta.name,
        ),
      ),
      // message hit
      React.createElement(
        Pressable,
        {
          onPress: function () {
            var ok = jumpTo(guildId as string, item.channel_id, item.id);
            if (!ok) {
              try {
                showToast("无法跳转");
              } catch (e) {}
            } else {
              try {
                var Nav = fp("pop", "push");
                if (Nav && Nav.pop) Nav.pop();
              } catch (e) {}
            }
          },
          delayPressIn: 35,
          style: function (state: any) {
            return {
              flexDirection: "row",
              paddingHorizontal: 16,
              paddingTop: 6,
              paddingBottom: 12,
              backgroundColor:
                state && state.pressed ? C.press : C.bg,
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
                backgroundColor: C.elev,
                marginTop: 2,
              },
            })
          : React.createElement(View, {
              style: {
                width: 40,
                height: 40,
                borderRadius: 20,
                marginRight: 12,
                backgroundColor: C.accent,
              },
            }),
        React.createElement(
          View,
          { style: { flex: 1, minWidth: 0 } },
          React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                alignItems: "baseline",
                flexWrap: "wrap",
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
            // prominent absolute time — native only shows relative/vague
            timeStr
              ? React.createElement(
                  Text,
                  {
                    style: {
                      color: C.time,
                      fontSize: 12,
                      fontWeight: "700",
                    },
                    numberOfLines: 1,
                  },
                  timeStr,
                )
              : null,
          ),
          React.createElement(MessageContent, {
            content: item.content || "",
          }),
          !item.content &&
            !(item.attachments && item.attachments.length) &&
            !(item.sticker_items && item.sticker_items.length)
            ? React.createElement(
                Text,
                {
                  style: {
                    color: C.faint,
                    fontSize: 14,
                    fontStyle: "italic",
                  },
                },
                "(无文字内容)",
              )
            : null,
          renderImages(item),
        ),
      ),
    );
  }

  // Top bar mimicking native search field + from-chip
  var header = React.createElement(
    View,
    {
      style: {
        backgroundColor: C.panel,
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
          backgroundColor: C.input,
          borderRadius: 22,
          paddingHorizontal: 6,
          paddingVertical: 6,
          minHeight: 44,
        },
      },
      // from: chip like official filter pill
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: C.chip,
            borderRadius: 16,
            paddingLeft: 4,
            paddingRight: 10,
            paddingVertical: 4,
            marginRight: 8,
          },
        },
        Image
          ? React.createElement(Image, {
              source: { uri: avatarUrl(user, 64) },
              style: {
                width: 24,
                height: 24,
                borderRadius: 12,
                marginRight: 6,
              },
            })
          : null,
        React.createElement(
          Text,
          {
            style: {
              color: C.chipText,
              fontSize: 13,
              fontWeight: "700",
            },
            numberOfLines: 1,
          },
          "from: " + tag,
        ),
      ),
      React.createElement(TextInput, {
        value: keyword,
        onChangeText: setKeyword,
        onSubmitEditing: submitKeyword,
        returnKeyType: "search",
        placeholder: "搜索此人的消息",
        placeholderTextColor: C.faint,
        style: { color: C.text, fontSize: 13, flex: 1, paddingVertical: 0 },
      }),
    ),
    React.createElement(
      Text,
      {
        style: {
          color: C.muted,
          fontSize: 12,
          marginTop: 10,
          marginLeft: 4,
          fontWeight: "600",
        },
      },
      loading
        ? "正在搜索…"
        : error
          ? error
          : "—  " +
            total +
            "  条结果" +
            (totalPages > 1
              ? "   ·   第 " + page + " / " + totalPages + " 页"
              : ""),
    ),
  );

  var pager = React.createElement(
    View,
    {
      style: {
        backgroundColor: C.panel,
        borderTopWidth: 1,
        borderTopColor: C.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
      },
    },
    React.createElement(
      View,
      {
        style: {
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
        },
      },
      React.createElement(PagerBtn, {
        label: "上一页",
        disabled: page <= 1 || loading,
        mr: 8,
        onPress: function () {
          if (page > 1) loadPage(page - 1);
        },
      }),
      React.createElement(
        Text,
        {
          style: {
            color: C.text,
            fontSize: 13,
            fontWeight: "700",
            flex: 1,
            textAlign: "center",
          },
        },
        page + " / " + totalPages,
      ),
      React.createElement(PagerBtn, {
        label: "下一页",
        disabled: page >= totalPages || loading,
        onPress: function () {
          if (page < totalPages) loadPage(page + 1);
        },
      }),
    ),
    React.createElement(
      View,
      { style: { flexDirection: "row", alignItems: "center" } },
      React.createElement(
        Text,
        { style: { color: C.muted, fontSize: 12, marginRight: 8 } },
        "跳到",
      ),
      React.createElement(TextInput, {
        value: jumpText,
        onChangeText: setJumpText,
        keyboardType: "number-pad",
        returnKeyType: "go",
        onSubmitEditing: goJump,
        placeholder: "页码",
        placeholderTextColor: C.faint,
        style: {
          flex: 1,
          height: 40,
          borderRadius: 12,
          paddingHorizontal: 12,
          backgroundColor: C.input,
          color: C.text,
          fontSize: 14,
          marginRight: 8,
        },
      }),
      React.createElement(PagerBtn, {
        label: "Go",
        ghost: true,
        onPress: goJump,
      }),
    ),
  );

  var body: any;
  if (loading && items.length === 0) {
    body = React.createElement(
      View,
      {
        style: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.bg,
        },
      },
      React.createElement(ActivityIndicator, {
        size: "large",
        color: C.accent,
      }),
      React.createElement(
        Text,
        { style: { color: C.muted, marginTop: 12, fontSize: 13 } },
        "搜索消息中…",
      ),
    );
  } else if (error && items.length === 0) {
    body = React.createElement(
      View,
      {
        style: {
          flex: 1,
          padding: 24,
          justifyContent: "center",
          backgroundColor: C.bg,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            color: C.danger,
            textAlign: "center",
            marginBottom: 16,
            fontSize: 14,
          },
        },
        error,
      ),
      React.createElement(PagerBtn, {
        label: "重试",
        onPress: function () {
          loadPage(page);
        },
      }),
    );
  } else {
    body = React.createElement(FlatList, {
      data: items,
      style: { flex: 1, backgroundColor: C.bg },
      keyExtractor: function (m: any, idx: number) {
        return m.id + "-" + idx;
      },
      renderItem: renderRow,
      ListEmptyComponent: React.createElement(
        Text,
        {
          style: {
            color: C.muted,
            textAlign: "center",
            marginTop: 48,
            fontSize: 14,
          },
        },
        "没有找到消息",
      ),
      ListFooterComponent: loading
        ? React.createElement(ActivityIndicator, {
            style: { marginVertical: 16 },
            color: C.accent,
          })
        : React.createElement(View, { style: { height: 12 } }),
    });
  }

  return React.createElement(
    View,
    { style: { flex: 1, backgroundColor: C.bg } },
    header,
    body,
    pager,
  );
}

function openResults(user: any) {
  defaults();
  var id = getUserId(user);
  if (!id) {
    try {
      showToast("QuickFrom: 无用户 ID");
    } catch (e) {}
    return;
  }

  // ONLY push React components — never string route "Search" (crashes RN)
  var Navigation = fp("push", "pushLazy", "pop") || fp("push", "pop");
  var Navigator =
    findByName("Navigator") || (fp("Navigator") || {}).Navigator;
  if (Navigator && (Navigator as any).default)
    Navigator = (Navigator as any).default;

  if (!Navigation || !Navigation.push) {
    try {
      showToast("QuickFrom: 无 Navigation.push");
    } catch (e) {}
    return;
  }

  var title = "搜索结果";
  var closeBtn =
    (fp("getRenderCloseButton") || {}).getRenderCloseButton ||
    (fp("getHeaderCloseButton") || {}).getHeaderCloseButton;

  try {
    if (Navigator) {
      Navigation.push(function () {
        return React.createElement(Navigator, {
          initialRouteName: "QuickFromSearch",
          goBackOnBackPress: true,
          screens: {
            QuickFromSearch: {
              title: title,
              headerLeft: closeBtn
                ? closeBtn(function () {
                    try {
                      Navigation.pop();
                    } catch (e) {}
                  })
                : undefined,
              render: function () {
                return React.createElement(SearchResultsPage, {
                  user: user,
                });
              },
            },
          },
        });
      });
    } else {
      Navigation.push(SearchResultsPage, { user: user });
    }
  } catch (e) {
    console.error("[QuickFrom] openResults", e);
    try {
      showToast("打开搜索页失败");
    } catch (e2) {}
  }
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
              if (buttons[i] && buttons[i].key === "quickfrom") return;
            }

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
                  openResults(author);
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
    showToast("QuickFrom v1.8 已启动");
  } catch (e) {}
  try {
    var p = patchMessageSheet();
    if (p) patches.push(p);
  } catch (e) {
    console.error("[QuickFrom] hook", e);
  }
  console.log("[QuickFrom] v1.8");
}

export function onUnload() {
  for (var i = 0; i < patches.length; i++) {
    try {
      patches[i]();
    } catch (e) {}
  }
  patches.length = 0;
}
