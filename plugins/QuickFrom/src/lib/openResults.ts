import { findByName, findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import { getUserId, getUserTag } from "./user";
import ResultsPage from "../ResultsPage";

function fp(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

function fn(name: string) {
  try {
    return findByName(name, false);
  } catch {
    return null;
  }
}

export function openFromSearch(user: any): boolean {
  const id = getUserId(user);
  const tag = getUserTag(user);
  if (!id && !tag) {
    try {
      showToast(
        "QuickFrom: 无用户信息",
        getAssetIDByName("ic_close_circle"),
      );
    } catch {}
    return false;
  }

  const Navigation = fp("push", "pushLazy", "pop") ?? fp("push", "pop");
  let Navigator: any =
    fn("Navigator") ?? fp("Navigator")?.Navigator ?? null;

  if (Navigator && Navigator.default) Navigator = Navigator.default;

  if (!Navigation?.push) {
    try {
      showToast(
        "QuickFrom: 无 Navigation.push",
        getAssetIDByName("ic_close_circle"),
      );
    } catch {}
    return false;
  }

  const title = `from:${tag || id}`;
  const closeBtn =
    fp("getRenderCloseButton")?.getRenderCloseButton ??
    fp("getHeaderCloseButton")?.getHeaderCloseButton;

  try {
    if (Navigator) {
      const screen = () =>
        React.createElement(Navigator, {
          initialRouteName: "QuickFromResults",
          goBackOnBackPress: true,
          screens: {
            QuickFromResults: {
              title,
              headerLeft: closeBtn
                ? closeBtn(() => {
                    try {
                      Navigation.pop();
                    } catch {}
                  })
                : undefined,
              render: () => React.createElement(ResultsPage, { user }),
            },
          },
        });
      Navigation.push(screen);
    } else {
      Navigation.push(ResultsPage, { user });
    }

    if ((storage as any).showToastOnSearch !== false) {
      try {
        showToast(`搜索 ${title}`, getAssetIDByName("ic_search"));
      } catch {}
    }
    return true;
  } catch (e) {
    console.error("[QuickFrom] openResults", e);
    try {
      showToast("打开结果页失败", getAssetIDByName("ic_close_circle"));
    } catch {}
    return false;
  }
}
