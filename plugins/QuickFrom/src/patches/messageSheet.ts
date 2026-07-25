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
 * Add "搜索此人发言 (from:)" to MessageLongPressActionSheet.
 */
export default function patchMessageSheet(): (() => void) | null {
  const ActionSheet = safeFindByProps("openLazy", "hideActionSheet");
  if (!ActionSheet) return null;

  const rowMod = safeFindByProps("ActionSheetRow");
  const ActionSheetRow = rowMod?.ActionSheetRow;
  const SearchIcon =
    getAssetIDByName("ic_search") ??
    getAssetIDByName("SearchIcon") ??
    getAssetIDByName("ic_search_24px") ??
    getAssetIDByName("MagnifyingGlassIcon");

  return before("openLazy", ActionSheet, ([comp, key, msg]) => {
    ensureDefaults();
    if (!settings.messageSheet) return;
    if (key !== "MessageLongPressActionSheet") return;

    const message = msg?.message ?? msg;
    const author = message?.author;
    if (!author) return;

    comp.then((instance: any) => {
      const unpatch = after("default", instance, (_, component) => {
        React.useEffect(() => () => unpatch(), []);

        try {
          let buttons = findInReactTree(
            component,
            (c: any) =>
              c?.some?.(
                (child: any) =>
                  child?.type?.name === "ActionSheetRow" ||
                  child?.props?.label ||
                  child?.props?.iconSource,
              ),
          );

          if (!buttons) {
            buttons = findInReactTree(
              component,
              (x: any) => x?.[0]?.type?.name === "ButtonRow",
            );
          }

          if (!buttons) {
            const groups = findInReactTree(
              component,
              (c: any) => c?.[0]?.type?.name === "ActionSheetRowGroup",
            );
            if (groups?.length) {
              buttons = findInReactTree(
                groups[0],
                (c: any) =>
                  c?.some?.(
                    (child: any) =>
                      child?.type?.name === "ActionSheetRow" ||
                      child?.props?.label,
                  ),
              );
            }
          }

          if (!buttons?.length && !Array.isArray(buttons)) return;

          const already = buttons.some(
            (b: any) =>
              b?.props?.label === "搜索此人发言" ||
              b?.props?.label === "Search From User" ||
              b?.key === "quickfrom-search",
          );
          if (already) return;
          if (!ActionSheetRow) return;

          const onPress = () => {
            ActionSheet.hideActionSheet?.();
            openFromSearch(author);
          };

          const icon = SearchIcon
            ? React.createElement(ActionSheetRow.Icon, { source: SearchIcon })
            : undefined;

          const row = React.createElement(ActionSheetRow, {
            key: "quickfrom-search",
            label: "搜索此人发言",
            icon,
            onPress,
          });

          if (Array.isArray(buttons)) {
            buttons.unshift(row);
          }
        } catch (e) {
          console.error("[QuickFrom] message sheet", e);
        }
      });
    });
  });
}
