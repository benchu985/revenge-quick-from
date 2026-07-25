import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";

export default function Settings() {
  try {
    useProxy(storage);
  } catch {}

  const s = storage as any;
  const FormSection = Forms?.FormSection;
  const FormSwitchRow = Forms?.FormSwitchRow;
  const FormRow = Forms?.FormRow;
  const FormDivider = Forms?.FormDivider;
  const ScrollView = (ReactNative as any)?.ScrollView;
  const Text = (ReactNative as any)?.Text;
  const View = (ReactNative as any)?.View;

  if (!FormSection || !FormSwitchRow || !ScrollView) {
    return React.createElement(
      View || "div",
      { style: { padding: 16 } },
      React.createElement(
        Text || "span",
        { style: { color: "#fff" } },
        "QuickFrom 设置。主功能：长按消息 → 搜索此人发言；双击头像（若 hook 成功）。",
      ),
    );
  }

  const sw = (
    label: string,
    sub: string,
    key: string,
    def = true,
  ) =>
    React.createElement(FormSwitchRow, {
      label,
      subLabel: sub,
      value: s[key] === undefined ? def : !!s[key],
      onValueChange: (v: boolean) => {
        s[key] = v;
      },
    });

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    React.createElement(
      FormSection,
      { title: "触发", titleStyleType: "no_border" },
      sw("双击头像", "拦截开资料并搜索", "doubleTapAvatar", true),
      FormDivider ? React.createElement(FormDivider, null) : null,
      sw("消息长按菜单", "「搜索此人发言」", "messageSheet", true),
      FormDivider ? React.createElement(FormDivider, null) : null,
      sw("资料菜单", "资料 ActionSheet 入口", "profileSheet", true),
    ),
    React.createElement(
      FormSection,
      { title: "其它" },
      sw("优先用户 ID", "from:数字ID", "preferUserId", true),
      FormDivider ? React.createElement(FormDivider, null) : null,
      sw("搜索 Toast", "打开结果时提示", "showToastOnSearch", true),
    ),
    FormRow
      ? React.createElement(
          FormSection,
          { title: "用法" },
          React.createElement(FormRow, {
            label: "推荐",
            subLabel:
              "长按对方消息 → 搜索此人发言（最稳）\n双击头像需 hook 成功才会拦资料",
          }),
        )
      : null,
  );
}
