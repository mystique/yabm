# 06: PROPFIND 解析在 `?` 与 `#` 处截断远端文件名

**What to build:** 正确处理 WebDAV 远端文件名中含 `?` 或 `#` 的情况，使其不再被静默截断。

**Blocked by:** None (can start immediately)

**Status:** needs-info

## 问题

`parsePropfindResponse` 解析远端文件列表时，文件名在 `?` 与 `#` 处被截断。

已在 Node 中实测确认：
- `new URL("a?b.html", base).pathname` → `…/user/a`
- `new URL("a#b.html", base).pathname` → `…/user/a`

因此一个真实名为 `a?b.html` 的远端文件会被列为 `a`——先经 `hrefToPathname` (`:285`)，再经 `:337` 的 leaf 提取。随后 `webdav-file-picker.js` 的新建文件规范化（`webdav-config-session.js:30-33`，追加 `.html`）会因此提供一个名为 `a.html` 的选项，即写入目标与原文件名不一致。

已验证**不受影响**的情形：`100%.html`、`café.html`、`中文.html` 均正确。

## 为何现在不修

标记 `needs-info` 而非 `ready-for-agent`，因为正确的修复方案取决于一个离线无法做出的观察：

**真实 WebDAV 服务器在 `<href>` 中是否会 percent-encode `?`？** 现有 WebDAV 实现行为不一致。猜测一种写法有可能引入回归。

同时，按 `AGENTS.md` §10，修改后需针对**真实 WebDAV 服务器**验证选择器行为，本地无法完成。

## 验收标准

- [ ] 明确记录所针对的 WebDAV 服务器实现及其 `<href>` 编码行为。
- [ ] 远端名为 `a?b.html` / `a#b.html` 时，选择器显示与写入的目标文件名均保持一致。
- [ ] `100%.html`、`café.html`、`中文.html` 不回归。
- [ ] 在真实 WebDAV 服务器上完成人工验证。
