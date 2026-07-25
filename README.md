# QuickFrom

Revenge / Vendetta 插件：双击头像快速搜索对方在服务器中的发言（`from:`）。

## 安装（一条链接）

在 **Revenge → Plugins → ＋ / Install plugin** 粘贴：

```text
https://benchu985.github.io/revenge-quick-from/QuickFrom
```

装完后重启或重新加载插件，确认 **QuickFrom** 已启用。

> 若 GitHub Pages 还没生效（新仓库约等 1 分钟），可先用下方「本地安装」。

---

## 怎么用

### 1. 双击头像（主功能）

1. 打开任意**服务器频道**（要有搜索权限）
2. 找到对方的消息
3. **快速双击**对方头像（间隔约 0.35 秒内点两下）
4. 自动打开搜索，查询类似：

```text
from:用户名
```

就能看到此人在本服的发言。

单点头像仍是打开资料；只有双击才搜索。

### 2. 长按消息

1. 长按对方的一条消息
2. 菜单里点 **「搜索此人发言」**
3. 效果同上，填入 `from:`

### 3. 资料页菜单

在用户资料相关 ActionSheet 里也会有 **「搜索此人发言」**（可在设置里关）。

### 4. 插件设置

Revenge → Plugins → QuickFrom → 设置：

| 选项 | 说明 |
|------|------|
| 双击头像搜索 | 总开关，默认开 |
| 消息长按菜单 | 默认开 |
| 资料页菜单 | 默认开 |
| 优先用用户 ID | `from:123…`，用户名不准时打开 |
| 限定当前频道 | 追加 `in:频道ID` |
| 双击间隔 | 默认 350ms |
| 预览查询串 | 用自己的号测生成的 `from:` |

### 5. 若没自动打开搜索

会把 `from:xxx` **复制到剪贴板**，并 Toast 提示。  
手动点频道右上角 🔍 搜索 → 粘贴即可。

---

## 本地安装（调试）

```bash
cd ~/revenge-quick-from
npm install --legacy-peer-deps
npm run build

cd dist
npx --yes http-server -p 8787 --cors
```

Revenge 安装：

```text
http://127.0.0.1:8787/QuickFrom
```

手机连电脑时把 IP 换成电脑局域网地址。

---

## 自己编译 / 改代码

```text
plugins/QuickFrom/src/
  index.ts                 # 入口
  Settings.ts              # 设置页
  lib/search.ts            # from: 拼装 + 打开搜索
  patches/avatarDoubleTap.ts
  patches/messageSheet.ts
  patches/profileSheet.ts
```

```bash
npm run build
# 产物: dist/QuickFrom/{index.js,manifest.json}
```

推送到 GitHub 后，`dist/QuickFrom` 会通过 GitHub Pages 提供安装链接。

---

## 注意

- 必须在**有搜索权限**的服务器里用
- 修改 Discord 客户端可能违反 ToS，风险自担
- Discord 大更新后若双击失效，仍可用「长按消息 → 搜索此人发言」；搜不到模块时会走剪贴板兜底
