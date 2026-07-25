/**
 * QuickFrom v1.4.1
 * 长按消息 → 搜索此人发言
 * 结果页：头像 / 自定义表情 / 时间 / 图片 / 分页跳页 / 稳定按压反馈
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

/* ── design tokens (Discord-ish, not generic AI dark) ── */
var C = {
  bg: "#1e1f22",
  surface: "#2b2d31",
  surfaceHover: "#35373c",
  surfacePress: "#1a1b1e",
  border: "#3f4147",
  text: "#f2f3f5",
  textMuted: "#b5bac1",
  textFaint: "#949ba4",
  accent: "#5865f2",
  accentDim: "#4752c4",
  danger: "#f23f43",
  chip: "#404249",
  avatarRing: "#5865f2",
  time: "#f0b232",
  timeBg: "rgba(240, 178, 50, 0.16)",
  timeBorder: "rgba(240, 178, 50, 0.45)",
};

function st() {
  return storage as any;
}

function defaults() {
  var s = st();
  if (s.sheet === undefined) s.sheet = true;
  if (s.showImages === undefined) s.showImages = true;
  if (s.showEmoji === undefined) s.showEmoji = true;
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

/** Avatar CDN */
function avatarUrl(user: any, size?: number): string {
  var sz = size || 64;
  if (!user) {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
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
  // default avatar from discriminator or id
  var idx = 0;
  try {
    if (user.discriminator && user.discriminator !== "0") {
      idx = parseInt(user.discriminator, 10) % 5;
    } else if (id) {
      // approximate (id >> 22) % 6 without BigInt for Hermes
      var n = parseInt(String(id).slice(0, -3) || "0", 10);
      if (isNaN(n)) n = 0;
      idx = Math.abs(n) % 6;
    }
  } catch (e) {
    idx = 0;
  }
  if (isNaN(idx)) idx = 0;
  return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
}

function resolveAuthor(msg: any, fallbackUser: any) {
  if (msg && msg.author) return msg.author;
  return fallbackUser;
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
 * Split content into text + custom emoji tokens.
 * <:name:id>  <a:name:id>
 */
function parseContentTokens(content: string): any[] {
  if (!content) return [];
  var re = /<(a?):([a-zA-Z0-9_~]+):(\d+)>/g;
  var out: any[] = [];
  var last = 0;
  var m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last) {
      out.push({ type: "text", value: content.slice(last, m.index) });
    }
    out.push({
      type: "emoji",
      animated: m[1] === "a",
      name: m[2],
      id: m[3],
    });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    out.push({ type: "text", value: content.slice(last) });
  }
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
    total:
      body && body.total_results != null ? body.total_results : out.length,
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
  } catch (e) {}
  try {
    var openUrl = findByProps("openURL") || findByProps("openUrl");
    if (openUrl && openUrl.openURL) openUrl.openURL(url);
    else if (openUrl && openUrl.openUrl) openUrl.openUrl(url);
  } catch (e) {}
}

/** Stable pressable — uses Pressable style fn so drag doesn't "lose" color oddly */
function Btn(props: any) {
  var Pressable = ReactNative.Pressable;
  var Text = ReactNative.Text;
  var label = props.label;
  var onPress = props.onPress;
  var disabled = props.disabled;
  var variant = props.variant || "primary"; // primary | ghost | chip
  var flex = props.flex;

  var baseBg =
    variant === "primary"
      ? C.accent
      : variant === "chip"
        ? C.chip
        : "transparent";
  var baseBorder = variant === "ghost" ? C.border : "transparent";

  return React.createElement(
    Pressable,
    {
      onPress: disabled ? undefined : onPress,
      disabled: !!disabled,
      hitSlop: 6,
      // keep press state while finger moves slightly inside bounds
      unstable_pressDelay: 0,
      style: function (state: any) {
        var pressed = state && state.pressed;
        return {
          flex: flex ? 1 : undefined,
          paddingHorizontal: variant === "chip" ? 10 : 14,
          paddingVertical: variant === "chip" ? 7 : 10,
          borderRadius: 10,
          backgroundColor: disabled
            ? C.chip
            : pressed
              ? variant === "primary"
                ? C.accentDim
                : C.surfacePress
              : baseBg,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: baseBorder,
          opacity: disabled ? 0.45 : 1,
          alignItems: "center",
          justifyContent: "center",
          marginRight: props.mr || 0,
          marginLeft: props.ml || 0,
        };
      },
    },
    React.createElement(
      Text,
      {
        style: {
          color: C.text,
          fontSize: 13,
          fontWeight: "600",
        },
      },
      label,
    ),
  );
}

function MessageContent(props: { content: string }) {
  var Text = ReactNative.Text;
  var Image = ReactNative.Image;
  var content = props.content || "";
  var showEmoji = st().showEmoji !== false;

  if (!content) {
    return React.createElement(
      Text,
      { style: { color: C.textFaint, fontSize: 14, fontStyle: "italic" } },
      "(无文字)",
    );
  }

  if (!showEmoji) {
    return React.createElement(
      Text,
      { style: { color: C.text, fontSize: 15, lineHeight: 22 } },
      content,
    );
  }

  var tokens = parseContentTokens(content);
  if (!tokens.length) {
    return React.createElement(
      Text,
      { style: { color: C.text, fontSize: 15, lineHeight: 22 } },
      content,
    );
  }

  // Render as one Text with nested Text/Image for baseline alignment
  var kids: any[] = [];
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (tok.type === "text") {
      if (!tok.value) continue;
      kids.push(
        React.createElement(
          Text,
          { key: "t" + i, style: { color: C.text, fontSize: 15, lineHeight: 22 } },
          tok.value,
        ),
      );
    } else if (tok.type === "emoji") {
      var uri = emojiCdn(tok.id, tok.animated);
      if (Image) {
        kids.push(
          React.createElement(Image, {
            key: "e" + i + tok.id,
            source: { uri: uri },
            style: {
              width: 22,
              height: 22,
              marginHorizontal: 1,
              transform: [{ translateY: 3 }],
            },
            // accessibility
            accessibilityLabel: ":" + tok.name + ":",
          }),
        );
      } else {
        kids.push(
          React.createElement(
            Text,
            { key: "e" + i, style: { color: C.textMuted, fontSize: 14 } },
            ":" + tok.name + ":",
          ),
        );
      }
    }
  }

  return React.createElement(
    Text,
    { style: { color: C.text, fontSize: 15, lineHeight: 22 } },
    kids,
  );
}

function ResultsPage(props: { user: any }) {
  var fallbackUser = props.user;
  var authorId = getUserId(fallbackUser);
  var tag = getTag(fallbackUser);

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

  var totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE) || 1);

  function loadPage(p: number) {
    var target = p < 1 ? 1 : p;
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
        var tp = Math.max(1, Math.ceil((res.total || 0) / PAGE_SIZE) || 1);
        if (target > tp && tp !== target) {
          loadPage(tp);
          return;
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
          url: emb.image.url,
          proxy_url: emb.image.proxy_url || emb.image.url,
          width: emb.image.width,
          height: emb.image.height,
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
        });
      }
    }
    // stickers
    var stickers = m.sticker_items || m.stickers || [];
    for (var s = 0; s < stickers.length; s++) {
      var sticker = stickers[s];
      if (!sticker || !sticker.id) continue;
      var fmt = sticker.format_type; // 1 PNG 2 APNG 3 LOTTIE 4 GIF
      var ext = fmt === 4 ? "gif" : "png";
      imgs.push({
        url:
          "https://media.discordapp.net/stickers/" +
          sticker.id +
          "." +
          ext +
          "?size=160",
        proxy_url:
          "https://media.discordapp.net/stickers/" +
          sticker.id +
          "." +
          ext +
          "?size=160",
        width: 160,
        height: 160,
        filename: sticker.name || "sticker",
      });
    }
    if (!imgs.length) return null;

    var children: any[] = [];
    for (var k = 0; k < imgs.length; k++) {
      (function (att, idx) {
        var uri = imageUrl(att);
        if (!uri) return;
        var w = att.width || 200;
        var h = att.height || 150;
        var maxW = 200;
        var scale = w > maxW ? maxW / w : 1;
        var dw = Math.max(72, Math.round(w * scale));
        var dh = Math.max(56, Math.round(h * scale));
        children.push(
          React.createElement(
            Pressable,
            {
              key: uri + String(idx),
              onPress: function () {
                openImage(uri as string);
              },
              style: function (state: any) {
                return {
                  marginTop: 8,
                  marginRight: 8,
                  borderRadius: 10,
                  overflow: "hidden",
                  opacity: state && state.pressed ? 0.85 : 1,
                  borderWidth: 1,
                  borderColor: C.border,
                };
              },
            },
            React.createElement(Image, {
              source: { uri: uri },
              style: {
                width: dw,
                height: dh,
                backgroundColor: C.surfacePress,
              },
              resizeMode: "cover",
            }),
          ),
        );
      })(imgs[k], k);
    }
    if (!children.length) return null;
    return React.createElement(
      ScrollView,
      {
        horizontal: true,
        style: { marginTop: 2 },
        showsHorizontalScrollIndicator: false,
      },
      children,
    );
  }

  function renderRow(info: any) {
    var item = info.item;
    var author = resolveAuthor(item, fallbackUser);
    var timeStr = fmtTime(item.timestamp || item.edited_timestamp);
    var av = avatarUrl(author, 80);

    return React.createElement(
      Pressable,
      {
        onPress: function () {
          onPressItem(item);
        },
        // delay slightly so scroll doesn't flash press
        delayPressIn: 40,
        style: function (state: any) {
          var pressed = state && state.pressed;
          return {
            flexDirection: "row",
            paddingHorizontal: 12,
            paddingVertical: 12,
            backgroundColor: pressed ? C.surfacePress : C.surface,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
          };
        },
      },
      // avatar
      Image
        ? React.createElement(Image, {
            source: { uri: av },
            style: {
              width: 40,
              height: 40,
              borderRadius: 20,
              marginRight: 12,
              backgroundColor: C.chip,
              borderWidth: 1.5,
              borderColor: C.border,
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
      // body
      React.createElement(
        View,
        { style: { flex: 1, minWidth: 0 } },
        React.createElement(
          View,
          {
            style: {
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 6,
            },
          },
          React.createElement(
            Text,
            {
              style: {
                color: C.text,
                fontSize: 15,
                fontWeight: "700",
                flexShrink: 1,
                marginRight: 8,
              },
              numberOfLines: 1,
            },
            getTag(author),
          ),
          timeStr
            ? React.createElement(
                View,
                {
                  style: {
                    marginLeft: "auto",
                    backgroundColor: C.timeBg,
                    borderColor: C.timeBorder,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  },
                },
                React.createElement(
                  Text,
                  {
                    style: {
                      color: C.time,
                      fontSize: 12,
                      fontWeight: "800",
                      letterSpacing: 0.2,
                    },
                    numberOfLines: 1,
                  },
                  timeStr,
                ),
              )
            : null,
        ),
        React.createElement(
          Text,
          {
            style: {
              color: C.textMuted,
              fontSize: 12,
              marginBottom: 6,
              fontWeight: "600",
            },
            numberOfLines: 1,
          },
          channelLabel(item.channel_id),
        ),
        React.createElement(MessageContent, {
          content:
            item.content ||
            (item.sticker_items && item.sticker_items.length
              ? ""
              : item.attachments && item.attachments.length
                ? ""
                : ""),
        }),
        !item.content &&
          !(item.attachments && item.attachments.length) &&
          !(item.sticker_items && item.sticker_items.length)
          ? React.createElement(
              Text,
              {
                style: {
                  color: C.textFaint,
                  fontSize: 14,
                  fontStyle: "italic",
                },
              },
              "(无文字)",
            )
          : null,
        renderImages(item),
      ),
    );
  }

  var header = React.createElement(
    View,
    {
      style: {
        backgroundColor: C.bg,
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        flexDirection: "row",
        alignItems: "center",
      },
    },
    Image
      ? React.createElement(Image, {
          source: { uri: avatarUrl(fallbackUser, 96) },
          style: {
            width: 44,
            height: 44,
            borderRadius: 22,
            marginRight: 12,
            borderWidth: 2,
            borderColor: C.avatarRing,
            backgroundColor: C.chip,
          },
        })
      : null,
    React.createElement(
      View,
      { style: { flex: 1 } },
      React.createElement(
        Text,
        { style: { color: C.text, fontSize: 17, fontWeight: "700" } },
        tag,
      ),
      React.createElement(
        Text,
        { style: { color: C.textMuted, fontSize: 12, marginTop: 3 } },
        loading
          ? "加载第 " + page + " 页…"
          : error
            ? error
            : total +
              " 条发言 · 第 " +
              page +
              "/" +
              totalPages +
              " 页 · 每页 " +
              PAGE_SIZE,
      ),
    ),
  );

  var pager = React.createElement(
    View,
    {
      style: {
        backgroundColor: C.bg,
        borderTopWidth: 1,
        borderTopColor: C.border,
        paddingHorizontal: 10,
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
      React.createElement(Btn, {
        label: "上一页",
        variant: "primary",
        disabled: page <= 1 || loading,
        mr: 8,
        flex: true,
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
            fontWeight: "600",
            minWidth: 64,
            textAlign: "center",
          },
        },
        page + " / " + totalPages,
      ),
      React.createElement(Btn, {
        label: "下一页",
        variant: "primary",
        disabled: page >= totalPages || loading,
        ml: 8,
        flex: true,
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
        { style: { color: C.textMuted, fontSize: 12, marginRight: 8 } },
        "跳到页",
      ),
      React.createElement(TextInput, {
        value: jumpText,
        onChangeText: setJumpText,
        keyboardType: "number-pad",
        returnKeyType: "go",
        onSubmitEditing: goJump,
        placeholder: "页码",
        placeholderTextColor: C.textFaint,
        style: {
          flex: 1,
          height: 40,
          borderRadius: 10,
          paddingHorizontal: 12,
          backgroundColor: C.surface,
          borderWidth: 1,
          borderColor: C.border,
          color: C.text,
          fontSize: 14,
          marginRight: 8,
        },
      }),
      React.createElement(Btn, {
        label: "跳转",
        variant: "chip",
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
        { style: { color: C.textMuted, marginTop: 12, fontSize: 13 } },
        "正在搜索发言…",
      ),
    );
  } else if (error && items.length === 0) {
    body = React.createElement(
      View,
      {
        style: {
          flex: 1,
          padding: 20,
          backgroundColor: C.bg,
          justifyContent: "center",
        },
      },
      React.createElement(
        Text,
        {
          style: {
            color: C.danger,
            marginBottom: 16,
            fontSize: 14,
            textAlign: "center",
          },
        },
        error,
      ),
      React.createElement(Btn, {
        label: "重试",
        variant: "primary",
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
      ListEmptyComponent: React.createElement(
        Text,
        {
          style: {
            color: C.textMuted,
            textAlign: "center",
            marginTop: 48,
            fontSize: 14,
          },
        },
        "本页没有消息",
      ),
      ListFooterComponent: loading
        ? React.createElement(ActivityIndicator, {
            style: { marginVertical: 16 },
            color: C.accent,
          })
        : React.createElement(View, { style: { height: 8 } }),
      renderItem: renderRow,
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

  var title = getTag(user);
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
    showToast("QuickFrom v1.4.1 已启动");
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
