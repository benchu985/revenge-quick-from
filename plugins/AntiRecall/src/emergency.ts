import { showToast } from "@vendetta/ui/toasts";

// Emergency recovery entrypoint. It deliberately installs no hooks and writes
// no data, allowing clients that cached the previous release to open Plugins
// and remove this plugin normally.
export function onLoad() {
  try {
    showToast("AntiRecall 已紧急停用，可在插件列表删除");
  } catch (e) {}
}

export function onUnload() {}
