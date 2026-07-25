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

export default function patchMessageSheet(): (() => void) | null {
  const ActionSheet = fp("openLazy", "hideActionSheet");
  if (!ActionSheet) {
    console.log("[QuickFrom] no ActionSheet");
    return null;
  }

  const rowMod = fp("ActionSheetRow");
  const ActionSheetRow = rowMod?.ActionSheetRow;
  const SearchIcon =
    getAssetIDByName("ic_search") ??
    getAssetIDByName("SearchIcon") ??
    getAssetIDByName("ic_search_24px");

  return before("openLazy", ActionSheet, ([comp, key, msg]) => {
    try {
      if ((storage as any).messageSheet === false) return;
      if (key !== "MessageLongPressActionSheet") return;

      const message = msg?.message ?? msg;
      const author = message?.author;
      if (!author || !comp?.then) return;

      comp.then((instance: any) => {
        const unpatch = after("default", instance, (_, component) => {
          try {
            React.useEffect(() => () => {
              try {
                unpatch();
              } catch {}
            }, []);

            if (!ActionSheetRow) return;

            let buttons = findInReactTree(
              component,
              (c: any) =>
                c?.some?.(
                  (child: any) =>
                    child?.type?.name === "ActionSheetRow" ||
                    child?.props?.label,
                ),
            );

            if (!buttons) {
              buttons = findInReactTree(
                component,
                (x: any) => x?.[0]?.type?.name === "ButtonRow",
              );
            }

            if (!Array.isArray(buttons)) return;

            if (
              buttons.some(
                (b: any) =>
                  b?.key === "quickfrom-search" ||
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
                key: "quickfrom-search",
                label: "搜索此人发言",
                icon,
                onPress: () => {
                  try {
                    ActionSheet.hideActionSheet?.();
                  } catch {}
                  openFromSearch(author);
                },
              }),
            );
          } catch (e) {
            console.error("[QuickFrom] message sheet render", e);
          }
        });
      });
    } catch (e) {
      console.error("[QuickFrom] message sheet", e);
    }
  });
}
