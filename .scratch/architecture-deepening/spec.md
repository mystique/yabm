# 架构深度化改进

本组 ticket 将架构评审中的 3 个候选拆成可独立验证的纵向切片。三个切片互不阻塞，按用户可见行为分别改善 WebDAV 配置会话、书签刷新协调和拖拽生命周期。

## Tickets

- [01: 统一 WebDAV 配置会话](issues/01-unify-webdav-configuration-session.md)
- [02: 统一书签变化后的刷新协调](issues/02-coordinate-bookmark-refresh.md)
- [03: 收拢拖拽 module 的完整生命周期](issues/03-close-dnd-lifecycle.md)

## 后续发现

架构评审的其余候选已在本分支直接处理完毕（`86b858d` / `52b7c62` / `274b6cc` / `11271a3`）。其中两个候选经核验后判定为**无需改动**：

- 「开放文件夹状态归属」—— 写入方（`setFolderOpen`）与读取方（`getOpenFolderIds`）同处 `bookmark-tree-state.js`，原发现「三方分属」的前提已被 `ffd04a8` 消灭。
- 「分离 WebDAV transport」—— 前提被证伪：全 `src/` 范围内无 MKCOL、无 `If-Match`/`If-None-Match`、无 ETag、无重试。`webDavRequest` 本身已是通用的 14 行函数，删除测试结论为「搬移」而非「收拢」。

这两个候选的核验过程中发现了若干真实的遗留问题，以及一个更有价值的重构目标，已记录为 ticket：

- [04: 为纯函数引入最小测试运行器](issues/04-add-minimal-test-runner.md) — `ready-for-human`（约定变更，超出既定范围）
- [05: sync-utils 中真正的数据丢失面是导入/导出引擎](issues/05-split-import-export-engine.md) — `needs-info`，Blocked by 04
- [06: PROPFIND 解析在 `?` 与 `#` 处截断远端文件名](issues/06-properfind-name-truncation.md) — `needs-info`（需真实 WebDAV 服务器观察）
- [07: 修复重渲染期间用户折叠被静默撤销的竞态](issues/07-open-folder-rerender-race.md) — `ready-for-agent`
