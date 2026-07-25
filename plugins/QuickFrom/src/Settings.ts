import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { ensureDefaults, settings as s, buildFromQuery } from "./lib/search";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";

const { ScrollView, Text, View } = ReactNative as any;

export default function Settings() {
  ensureDefaults();
  try {
    useProxy(storage);
  } catch {}

  const FormSection = Forms?.FormSection;
  const FormSwitchRow = Forms?.FormSwitchRow;
  const FormRow = Forms?.FormRow;
  const FormDivider = Forms?.FormDivider;
  const FormInput = Forms?.FormInput;

  // If Forms missing, still show something so settings page doesn't white-screen
  if (!FormSection || !FormSwitchRow) {
    return React.createElement(
      View,
      { style: { padding: 16 } },
      React.createElement(
        Text,
        { style: { color: "#fff" } },
        "QuickFrom 设置加载失败（Forms 不可用）。插件主体仍可用：双击头像 / 长按消息。",
      ),
    );
  }

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    React.createElement(
      FormSection,
      { title: "触发方式", titleStyleType: "no_border" },
      React.createElement(FormSwitchRow, {
        label: "双击头像搜索",
        subLabel: "聊天里双击别人头像 → 打开 from: 搜索",
        value: !!s.doubleTapAvatar,
        onValueChange: (v: boolean) => {
          s.doubleTapAvatar = v;
        },
      }),
      FormDivider ? React.createElement(FormDivider, null) : null,
      React.createElement(FormSwitchRow, {
        label: "消息长按菜单",
        subLabel: "长按消息 →「搜索此人发言」",
        value: !!s.messageSheet,
        onValueChange: (v: boolean) => {
          s.messageSheet = v;
        },
      }),
      FormDivider ? React.createElement(FormDivider, null) : null,
      React.createElement(FormSwitchRow, {
        label: "资料页菜单",
        subLabel: "用户资料 ActionSheet 加搜索入口",
        value: !!s.profileSheet,
        onValueChange: (v: boolean) => {
          s.profileSheet = v;
        },
      }),
    ),
    React.createElement(
      FormSection,
      { title: "搜索语法" },
      React.createElement(FormSwitchRow, {
        label: "优先用用户 ID",
        subLabel: "from:123456…（更准）；关则用用户名",
        value: !!s.preferUserId,
        onValueChange: (v: boolean) => {
          s.preferUserId = v;
        },
      }),
      FormDivider ? React.createElement(FormDivider, null) : null,
      React.createElement(FormSwitchRow, {
        label: "限定当前频道",
        subLabel: "追加 in:当前频道ID",
        value: !!s.includeChannel,
        onValueChange: (v: boolean) => {
          s.includeChannel = v;
        },
      }),
      FormDivider ? React.createElement(FormDivider, null) : null,
      React.createElement(FormSwitchRow, {
        label: "打开搜索时 Toast",
        value: !!s.showToastOnSearch,
        onValueChange: (v: boolean) => {
          s.showToastOnSearch = v;
        },
      }),
    ),
    React.createElement(
      FormSection,
      { title: "双击判定 (ms)" },
      FormInput
        ? React.createElement(FormInput, {
            title: "双击间隔",
            value: String(s.doubleTapMs ?? 350),
            onChange: (v: string) => {
              const n = parseInt(v, 10);
              if (!Number.isNaN(n) && n >= 150 && n <= 1000) s.doubleTapMs = n;
            },
            placeholder: "350",
            keyboardType: "number-pad",
          })
        : FormRow
          ? React.createElement(FormRow, {
              label: "双击间隔",
              subLabel: String(s.doubleTapMs ?? 350) + " ms",
            })
          : null,
      FormRow
        ? React.createElement(FormRow, {
            label: "预览查询串",
            subLabel: "用你自己的账号测 buildFromQuery",
            onPress: () => {
              try {
                const UserStore =
                  findByStoreName?.("UserStore") ??
                  findByProps("getCurrentUser");
                const me = UserStore?.getCurrentUser?.();
                const q = buildFromQuery(me);
                showToast(
                  q || "(empty)",
                  getAssetIDByName("ic_search") ??
                    getAssetIDByName("SearchIcon"),
                );
              } catch (e) {
                showToast(String(e), getAssetIDByName("ic_close_circle"));
              }
            },
          })
        : null,
    ),
    FormRow
      ? React.createElement(
          FormSection,
          { title: "说明" },
          React.createElement(FormRow, {
            label: "用法",
            subLabel:
              "1) 进服务器频道\n2) 双击消息头像\n3) 自动填 from:用户\n启动成功会 Toast「QuickFrom 已启动」",
          }),
        )
      : null,
  );
}
