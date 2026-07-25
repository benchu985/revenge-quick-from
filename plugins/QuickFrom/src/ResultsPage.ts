import { React, ReactNative, clipboard } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import {
  getSelectedChannelId,
  getSelectedGuildId,
  jumpToMessage,
  searchAuthorMessages,
  SearchHit,
} from "./lib/api";
import { getUserId, getUserTag } from "./lib/user";

const { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput } =
  ReactNative as any;

function safeFindByProps(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

function channelName(id: string): string {
  try {
    const ChannelStore =
      findByStoreName?.("ChannelStore") ?? safeFindByProps("getChannel");
    const ch = ChannelStore?.getChannel?.(id);
    if (ch?.name) return `#${ch.name}`;
  } catch {}
  return `#${id.slice(-4)}`;
}

function fmtTime(ts?: string) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  } catch {
    return ts;
  }
}

export default function ResultsPage({ user }: { user: any }) {
  const authorId = getUserId(user);
  const tag = getUserTag(user) || authorId || "?";
  const queryPreview = (() => {
    const id = getUserId(user);
    const tag = getUserTag(user);
    if (id) return `from:${id}`;
    if (tag) return `from:${tag}`;
    return "from:";
  })();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const [items, setItems] = React.useState<SearchHit[]>([]);
  const [offset, setOffset] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [onlyChannel, setOnlyChannel] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  const guildId = React.useMemo(() => getSelectedGuildId(), []);
  const channelId = React.useMemo(() => getSelectedChannelId(), []);

  const load = React.useCallback(
    async (nextOffset = 0, append = false) => {
      if (!authorId) {
        setError("没有用户 ID");
        setLoading(false);
        return;
      }
      if (!guildId) {
        setError("当前不在服务器里（私信没有全服搜索）");
        setLoading(false);
        return;
      }

      try {
        if (append) setLoadingMore(true);
        else {
          setLoading(true);
          setError(null);
        }

        const res = await searchAuthorMessages({
          guildId,
          authorId,
          channelId: onlyChannel ? channelId : null,
          offset: nextOffset,
          content: filter.trim() || undefined,
        });

        setTotal(res.total);
        setOffset(nextOffset + res.messages.length);
        setItems((prev) => (append ? [...prev, ...res.messages] : res.messages));
      } catch (e: any) {
        const msg = e?.body?.message || e?.message || e?.text || String(e);
        setError(`搜索失败: ${msg}`);
        console.error("[QuickFrom] search", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [authorId, guildId, channelId, onlyChannel, filter],
  );

  React.useEffect(() => {
    load(0, false);
  }, [onlyChannel]);

  const onPressItem = (m: SearchHit) => {
    const ok = jumpToMessage(guildId, m.channel_id, m.id);
    if (!ok) {
      const link = `https://discord.com/channels/${guildId}/${m.channel_id}/${m.id}`;
      try {
        clipboard?.setString?.(link);
      } catch {}
      showToast(
        "跳转失败，已复制消息链接",
        getAssetIDByName("ic_copy_message_link") ??
          getAssetIDByName("CopyIcon"),
      );
    } else {
      try {
        const Navigation =
          safeFindByProps("push", "pushLazy", "pop") ??
          safeFindByProps("pop");
        Navigation?.pop?.();
      } catch {}
    }
  };

  const header = React.createElement(
    View,
    {
      style: {
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.08)",
      },
    },
    React.createElement(
      Text,
      { style: { color: "#fff", fontSize: 16, fontWeight: "700" } },
      `${tag} 的发言`,
    ),
    React.createElement(
      Text,
      { style: { color: "#b5bac1", fontSize: 12, marginTop: 2 } },
      loading ? "搜索中…" : error ? error : `共 ${total} 条 · ${queryPreview}`,
    ),
    React.createElement(
      View,
      {
        style: {
          flexDirection: "row",
          marginTop: 8,
          alignItems: "center",
        },
      },
      React.createElement(
        TouchableOpacity,
        {
          onPress: () => setOnlyChannel((v: boolean) => !v),
          style: {
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 16,
            marginRight: 8,
            backgroundColor: onlyChannel ? "#5865F2" : "rgba(255,255,255,0.08)",
          },
        },
        React.createElement(
          Text,
          { style: { color: "#fff", fontSize: 12 } },
          onlyChannel ? "仅当前频道 ✓" : "全服",
        ),
      ),
      React.createElement(
        TouchableOpacity,
        {
          onPress: () => load(0, false),
          style: {
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: "rgba(255,255,255,0.08)",
          },
        },
        React.createElement(
          Text,
          { style: { color: "#fff", fontSize: 12 } },
          "刷新",
        ),
      ),
    ),
    React.createElement(TextInput, {
      value: filter,
      onChangeText: setFilter,
      placeholder: "再筛内容关键词（可选，回车搜索）",
      placeholderTextColor: "#6d6f78",
      onSubmitEditing: () => load(0, false),
      returnKeyType: "search",
      style: {
        marginTop: 8,
        marginBottom: 8,
        backgroundColor: "rgba(0,0,0,0.25)",
        color: "#fff",
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 14,
      },
    }),
  );

  if (loading && items.length === 0) {
    return React.createElement(
      View,
      { style: { flex: 1 } },
      header,
      React.createElement(
        View,
        {
          style: { flex: 1, alignItems: "center", justifyContent: "center" },
        },
        React.createElement(ActivityIndicator, { size: "large" }),
        React.createElement(
          Text,
          { style: { color: "#b5bac1", marginTop: 12 } },
          "正在搜索…",
        ),
      ),
    );
  }

  if (error && items.length === 0) {
    return React.createElement(
      View,
      { style: { flex: 1 } },
      header,
      React.createElement(
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
            onPress: () => load(0, false),
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
      ),
    );
  }

  return React.createElement(
    View,
    { style: { flex: 1 } },
    header,
    React.createElement(FlatList, {
      data: items,
      keyExtractor: (m: SearchHit, i: number) => m.id + "-" + i,
      contentContainerStyle: { paddingBottom: 24 },
      ListEmptyComponent: React.createElement(
        Text,
        {
          style: { color: "#b5bac1", textAlign: "center", marginTop: 40 },
        },
        "没有搜到消息",
      ),
      onEndReached: () => {
        if (!loadingMore && items.length < total) load(offset, true);
      },
      onEndReachedThreshold: 0.4,
      ListFooterComponent: loadingMore
        ? React.createElement(ActivityIndicator, {
            style: { marginVertical: 12 },
          })
        : items.length < total
          ? React.createElement(
              TouchableOpacity,
              {
                onPress: () => load(offset, true),
                style: { padding: 16, alignItems: "center" },
              },
              React.createElement(
                Text,
                { style: { color: "#00a8fc" } },
                "加载更多",
              ),
            )
          : null,
      renderItem: ({ item }: { item: SearchHit }) =>
        React.createElement(
          TouchableOpacity,
          {
            onPress: () => onPressItem(item),
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
            `${channelName(item.channel_id)} · ${fmtTime(item.timestamp)}`,
          ),
          React.createElement(
            Text,
            { style: { color: "#dbdee1", fontSize: 14 }, numberOfLines: 4 },
            item.content || "(无文字 / 贴纸或附件)",
          ),
        ),
    }),
  );
}
