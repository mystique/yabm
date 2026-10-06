# 07: 修复重渲染期间用户折叠被静默撤销的竞态

**What to build:** 修掉 `rerenderAfterTreeChange` 的合并路径中一处既有竞态：用户在一次 render 进行当中折叠的文件夹，会被随后的 pass 用过期快照重新展开。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 问题

`src/pages/bookmarks/bookmark-tree-observers.js:38-44`：

```js
const openFolderIds = getOpenFolderIds();   // :39  同步快照
for (const folderId of extraOpenFolderIds) {
  openFolderIds.add(folderId);
}
for (const folderId of openFolderIds) {
  pendingOpenFolderIds.add(folderId);
}
```

`getOpenFolderIds()` 在**调用时刻**同步读取 DOM 并快照。之后才进入 `await renderBookmarks(foldersToOpen)`。

复现时序：

1. `t0` 首次调用 → 快照 `{A}`，`pendingOpenFolderIds = {A}`，开始 `renderBookmarks({A})`。
2. `t1` 渲染进行中，用户点击折叠 A → `setFolderOpen` 写入 DOM。
3. `t2` 后续调用 → 新快照为 `{}`（DOM 已折叠），`pendingOpenFolderIds` 仍为 `{A}`。
4. `renderBookmarks({A})` 完成，A 被重新展开。`while (pendingOpenFolderIds.size > 0)` 为 0，循环退出。

结果：`t1` 的折叠被静默撤销。

竞态窗口约等于一次 render 时长，含 `getTree()` 与 favicon 解析。

## 修复方向

在 `do`/`while` 循环**内部**重读 DOM，而非使用调用时刻的快照。这是行为变更，因此需要显式的验收标准，不能顺手改。

## 验收标准

- [ ] 渲染进行中折叠的文件夹，渲染结束后保持折叠。
- [ ] 渲染进行中展开的文件夹，渲染结束后保持展开。
- [ ] `extraOpenFolderIds`（显式要求展开的文件夹）仍然优先于快照状态。
- [ ] 展开两个嵌套文件夹 → 触发 WebDAV 下载或一次书签编辑 → 两者仍保持展开（即既有的 open folder 保留行为不回归）。
- [ ] `npm run check` 全绿。
- [ ] 在 Chrome 中人工验证上述时序。
