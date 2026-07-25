import { after, before } from "@vendetta/patcher";
import { findByProps } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";
import { React } from "@vendetta/metro/common";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import { openFromSearch } from "../lib/openResults";

function fp(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

export default function patchProfileSheet(): (() => void) | null {
  const ActionSheet = fp("openLazy", "hideActionSheet");
  if (!ActionSheet) return null;

  const rowMod = fp("ActionSheetRow");
  const ActionSheetRow = rowMod?.ActionSheetRow;
  const SearchIcon =
    getAssetIDByName("ic_search") ??
    getAssetIDByName("SearchIcon") ??
    getAssetIDByName("ic_search_24px");

  return before("openLazy", ActionSheet, ([comp, key, data]) => {
    try {
      if ((storage as any).profileSheet === false) return;
      const keyStr = typeof key === "string" ? key : "";
      const user =
        data?.user ??
        data?.guildMember?.user ??
        data?.member?.user ??
        (data?.username ? data : null);

      const isProfile =
        /profile/i.test(keyStr) ||
        !!user;

      // only if key looks like profile OR we clearly have user + profile-ish key
      if (!user) return;
      if (!isProfile && !keyStr.includes("User")) return;
      if (!comp?.then || !ActionSheetRow) return;

      comp.then((instance: any) => {
        const unpatch = after("default", instance, (_, component) => {
          try {
            React.useEffect(() => () => {
              try {
                unpatch();
              } catch {}
            }, []);

            const buttons = findInReactTree(
              component,
              (c: any) =>
                c?.some?.(
                  (child: any) =>
                    child?.type?.name === "ActionSheetRow" ||
                    child?.props?.label,
                ),
            );
            if (!Array.isArray(buttons)) return;
            if (
              buttons.some(
                (b: any) =>
                  b?.key === "quickfrom-profile-search" ||
                  b?.props?.label === "搜索此人发言",
              )
            ) {
              return;
            }

            const icon = SearchIcon
              ? React.createElement(ActionSheetRow.Icon, {
                  source: SearchIcon,
                })
              : undefined;

            buttons.unshift(
              React.createElement(ActionSheetRow, {
                key: "quickfrom-profile-search",
                label: "搜索此人发言",
                icon,
                onPress: () => {
                  try {
                    ActionSheet.hideActionSheet?.();
                  } catch {}
                  openFromSearch(user);
                },
              }),
            );
          } catch (e) {
            console.error("[QuickFrom] profile sheet render", e);
          }
        });
      });
    } catch (e) {
      console.error("[QuickFrom] profile sheet", e);
    }
  });
}
