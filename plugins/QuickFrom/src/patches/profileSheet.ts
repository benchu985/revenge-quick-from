import { after, before } from "@vendetta/patcher";
import { findByProps } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";
import { React } from "@vendetta/metro/common";
import { getAssetIDByName } from "@vendetta/ui/assets";
import {
  ensureDefaults,
  openFromSearch,
  settings,
} from "../lib/search";

function safeFindByProps(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

/**
 * Add search action on user profile long-press / overflow sheets.
 */
export default function patchProfileSheet(): (() => void) | null {
  const ActionSheet = safeFindByProps("openLazy", "hideActionSheet");
  if (!ActionSheet) return null;

  const rowMod = safeFindByProps("ActionSheetRow");
  const ActionSheetRow = rowMod?.ActionSheetRow;
  const SearchIcon =
    getAssetIDByName("ic_search") ??
    getAssetIDByName("SearchIcon") ??
    getAssetIDByName("ic_search_24px");

  const PROFILE_KEYS = [
    "UserProfileActionSheet",
    "GuildProfileActionSheet",
    "ProfileActionSheet",
    "UserSettingsActionSheet",
  ];

  return before("openLazy", ActionSheet, ([comp, key, data]) => {
    ensureDefaults();
    if (!settings.profileSheet) return;

    const keyStr = typeof key === "string" ? key : "";
    const isProfile =
      PROFILE_KEYS.some((k) => keyStr.includes(k)) ||
      keyStr.toLowerCase().includes("profile");

    const user =
      data?.user ??
      data?.guildMember?.user ??
      data?.member?.user ??
      (data?.username ? data : null);

    if (!isProfile && !user) return;
    if (!user) return;

    comp.then((instance: any) => {
      const unpatch = after("default", instance, (_, component) => {
        React.useEffect(() => () => unpatch(), []);
        try {
          const buttons = findInReactTree(
            component,
            (c: any) =>
              c?.some?.(
                (child: any) =>
                  child?.type?.name === "ActionSheetRow" ||
                  child?.props?.label,
              ),
          );
          if (!buttons?.length) return;

          const already = buttons.some(
            (b: any) =>
              b?.props?.label === "搜索此人发言" ||
              b?.key === "quickfrom-profile-search",
          );
          if (already) return;
          if (!ActionSheetRow) return;

          const icon = SearchIcon
            ? React.createElement(ActionSheetRow.Icon, { source: SearchIcon })
            : undefined;

          buttons.unshift(
            React.createElement(ActionSheetRow, {
              key: "quickfrom-profile-search",
              label: "搜索此人发言",
              icon,
              onPress: () => {
                ActionSheet.hideActionSheet?.();
                openFromSearch(user);
              },
            }),
          );
        } catch (e) {
          console.error("[QuickFrom] profile sheet", e);
        }
      });
    });
  });
}
