# 04: 为纯函数引入最小测试运行器

**What to build:** 引入 `node --test`(Node 内置，**不引入任何新依赖**)，把 `src/lib/sync-utils.js` 中的纯函数纳入可执行验证。

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

## 背景

`src/lib/sync-utils.js` 中真正值得测试的是三个纯函数，而非 transport：

- `joinDirectoryAndFile` (`:183-192`) — 拒绝空名、拒绝 `/` 分隔符。纯函数，无依赖，且每次 sync action 的 PUT/GET URL 都由它拼出。
- `normalizeDirectoryUrl` (`:148-148-165`) — 拒绝非 HTTPS、剥离 URL 内嵌凭据与 query/fragment、强制结尾斜杠。安全相关。只需给 `t()` 一个 i18n shim。
- `createAuthHeader` (`:77-88`) — 空用户名返回 `null`；非 ASCII 凭据经 `TextEncoder` 往返。`:71-76` 的注释说明朴素 `btoa` 会破坏多字节字符，说明这防的是一个真实的历史 bug。

## 已验证的前置事实

- `node --test` 在 Node v24.21.0 上实测通过（`pass 1, fail 0`），**零新依赖**。
- `sync-utils.js` 在裸 Node 中可加载：需 6 行 shim（`window`、`chrome.i18n`/`storage`、`DOMParser` stub），加载后暴露全部 9 个 key。

## 成本（这才是需要人来拍板的部分）

- `package.json` 增加 `"test": "node --test tests/"`。
- 新增 `tests/` 目录，并将其加入 `tsconfig.json` 的 `exclude`（或 ESLint ignores，否则 `eslint .` 会去 lint 它）。
- 需要决定测试文件用 CJS 还是 ESM：`module: NodeNext` 与「运行时不用 ESM」的既定规则相冲突。
- 这是一条**人类维护者需要永久遵守的约定**，而本仓库是刻意保持依赖精简的（目前只有 esbuild / ESLint / TypeScript `checkJs`）。

## 买不到的部分（务必先读）

- Node 中无 `DOMParser` → `parsePropfindResponse` (`:306`)、`parseBookmarksHtml` (`:581`)、`parseDlElement` (`:520`) 全部无法测，除非引入 jsdom（真依赖）。
- Node 中无 `chrome` → 约 455 行的书签树逻辑（含原子回滚）无法测，除非写一个高保真的 `chrome.bookmarks` fake，而 fake 自身就是 bug 来源。

## 验收标准

- [ ] `npm test` 存在且可通过，`npm run check` 仍为绿。
- [ ] 三个纯函数各有覆盖，包括上述边界情形。
- [ ] `docs/modernization/ROADMAP.md:122` 与 `STATUS.md:58` 中「不含新测试框架」的表述已相应更新。

## 待人决策

ROADMAP 与 STATUS 明确把测试框架排除在既定范围之外。这是一次**约定变更**，不是纯技术改动，故标 `ready-for-human`。
