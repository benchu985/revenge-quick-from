# QuickFrom — Revenge 插件

双击别人头像，快速搜索对方在**当前服务器**里的发言（`from:`）。

## 功能

| 触发 | 行为 |
|------|------|
| **双击头像** | 打开搜索并填入 `from:用户名`（或用户 ID） |
| **长按消息** | ActionSheet 多一项「搜索此人发言」 |
| **资料页菜单** | 同样加搜索入口 |

搜不到原生搜索模块时，会把 `from:...` **复制到剪贴板**，你打开搜索粘贴即可。

## 目录

```text
revenge-quick-from/
  build.mjs
  package.json
  plugins/QuickFrom/
    manifest.json
    src/
      index.ts
      Settings.tsx
      lib/search.ts          # 构造 from: + 打开搜索（多 fallback）
      patches/
        avatarDoubleTap.ts   # 双击头像
        messageSheet.ts      # 消息长按菜单
        profileSheet.ts      # 资料菜单
  dist/QuickFrom/            # 构建产物（安装这个）
    index.js
    manifest.json
```

## 编译

需要 Node 18+（Termux 里 `pkg install nodejs` 也行）：

```bash
cd ~/revenge-quick-from
npm install
npm run build
```

产物：

```text
dist/QuickFrom/index.js
dist/QuickFrom/manifest.json
```

## 安装到 Revenge

### 方式 A：本地 HTTP（推荐调试）

```bash
cd ~/revenge-quick-from/dist
npx --yes http-server -p 8787 --cors
```

手机和电脑同一局域网时，Revenge → Plugins → Install plugin URL：

```text
http://<你的IP>:8787/QuickFrom
```

纯本机 Termux 跑 Discord 时：

```text
http://127.0.0.1:8787/QuickFrom
```

### 方式 B：GitHub Pages

把 `dist/QuickFrom/` 推到仓库 `gh-pages`，安装 URL：

```text
https://<user>.github.io/<repo>/QuickFrom
```

### 方式 C：直接拷贝（部分 Loader 支持）

部分 Bunny/Revenge 构建允许从本地路径装；把 `dist/QuickFrom` 整夹放进插件目录后刷新。

## 设置页

插件设置里可调：

- 双击头像 / 消息菜单 / 资料菜单 开关
- `from:用户名` vs `from:用户ID`
- 是否追加 `in:当前频道`
- 双击间隔（默认 350ms）

## 原理简述

1. Hook 常见 Avatar 组件的 `onPress`，用时间窗识别双击  
2. 双击时调用 `openFromSearch(user)`：  
   - 优先 `findByProps("openSearch")`  
   - 其次 SearchStore / FluxDispatcher  
   - 再次 Navigation push Search  
   - 最后剪贴板 fallback  
3. 消息/资料 ActionSheet 用 `before("openLazy", …)` 插入 `ActionSheetRow`

Discord 改包后模块名可能变；fallback 链是为了尽量还能用。

## 兼容

- **Revenge**（主目标，Vendetta API）
- 其他 Vendetta 系客户端（Bunny 等）大多也能装，以实机为准

## 注意

- 修改 Discord 客户端可能违反 ToS，风险自担  
- 必须在**有搜索权限的服务器频道**里用，`from:` 才有结果  
- 新用户名系统下若 `from:用户名` 不准，设置里打开「优先用用户 ID」
