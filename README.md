# QuickFrom v1.2

Revenge / Vendetta 插件：长按消息 → **搜索此人发言**（`author_id` 搜本服消息，自带结果页）。

## 安装

**务必删掉旧版再装。** 用带 commit 的链接，避免缓存：

```text
https://cdn.jsdelivr.net/gh/benchu985/revenge-quick-from@main/QuickFrom/
```

注意 URL **末尾要有 `/`**（Revenge 会拼 `manifest.json`）。

装好后描述应为：`v1.2 长按消息 → 搜索此人发言`

点启动应 Toast：`QuickFrom v1.2 已启动`

## 用法

1. 进**服务器**频道（私信没有 guild 搜索）
2. **长按**对方一条消息
3. 点 **「搜索此人发言」**
4. 结果列表里点某条可跳转

双击头像：若 hook 到 `openUserProfileModal`，双击会搜、单击延迟开资料。

## 开发注意（Revenge 加载器）

源码见 [plugins.ts](https://github.com/revenge-mod/revenge/blob/dev/src/core/vendetta/plugins.ts)：

```js
const pluginString = `vendetta=>{return ${plugin.js}}`;
const raw = eval(pluginString)(vendettaForPlugins);
const ret = typeof raw === "function" ? raw() : raw;
pluginRet = ret?.default ?? ret ?? {};
pluginRet.onLoad?.();
```

因此：

1. 产物必须是**表达式**，通常是匿名 IIFE：`(function(...){...; return exports})(vendetta.metro, ...)`
2. **不要** `var PluginName = function...`（eval 得到 undefined）
3. 导出 `onLoad` / `onUnload`（`settings` 可选）
4. `manifest.hash` = 对 `index.js` 的 sha256
5. `manifest.main` = `index.js`
6. 安装 id/URL 以 `/` 结尾
7. `onLoad` 抛错会被 loader catch 并 **自动 unload + enabled=false**（表现为点启动没反应）
8. top-level 不要对可能为 null 的 `findByProps` 结果解构
9. 尽量 es2018，少用过新语法

## 编译

```bash
npm install --legacy-peer-deps
npm run build
# dist/QuickFrom → 同步到仓库根 QuickFrom/ 供 Pages
cp -f dist/QuickFrom/* QuickFrom/
```
