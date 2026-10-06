# 05: sync-utils 中真正的数据丢失面是导入/导出引擎，不是 transport

**What to build:** 若日后要拆分 `src/lib/sync-utils.js`，目标是 Netscape HTML 导入/导出引擎 + 原子回滚（`:403-857`，约 455 行，占该文件 953 行的 16%），**不是** WebDAV transport。

**Blocked by:** 04

**Status:** needs-info

## 背景：原候选前提被证伪

架构报告中的候选 4 声称 `sync-utils.js` 混合了 WebDAV protocol（MKCOL、PUT、`If-None-Match`/`If-Match`、ETag、冲突检测）与 transport，要求分离。

**全 `src/` 范围内 grep `MKCOL|If-None-Match|If-Match|ETag|AbortController|backoff` 零命中。** 具体地：

- 无 MKCOL，从未调用。
- 无 `If-None-Match` / `If-Match`。`:869` 的 PUT 只发 `Content-Type`。
- 无 ETag，从不读取、存储或比较。
- 无冲突检测。`uploadBookmarksToWebDav` (`:861-881`) 是无条件盲覆盖。
- 无重试或超时策略。`setTimeout` 在 `sync-utils.js` 中完全不出现。

所谓「坏的 `If-Match` 或丢失的 ETag 会损坏用户书签」描述的是**从未被写下的代码**。

## 而 transport 已经以其唯一可能的形态存在

`webDavRequest(url, method, options)` (`:204-217`) 已是通用的 14 行单 `fetch` 函数，4 个调用点全在同一文件内（`:372`、`:869`、`:899`、`:928`）。一个实现、零个潜在第二实现——按「一个 adapter = 假想 seam」的规则，这是教科书式的假想 seam。删除测试结论是「搬移」而非「收拢」：删掉一个新文件再内联回来，得到的是一模一样的 14 行，外加一个新全局、一个 `<script>` 标签、`yabm-globals.d.ts` 声明和 4 处间接调用。

对比真实 seam：`webdav-file-picker` 有 2 个消费者，`webdav-config-session` 有 4 个。

## 真正的目标

该文件混合了三块互不相关的关注点，其中**最大的一块与 WebDAV 无关**：

- WebDAV 配置存储：`:40-62`（3 个函数）
- WebDAV PROPFIND transport + 解析：`:77-400`（14 个函数，其中约 30 行是 transport）
- **Netscape HTML 导入/导出引擎 + 原子回滚：`:403-857`，约 455 行，15 个函数**

第三块才是数据丢失风险所在：`overwriteWithBookmarksHtml` (`:784-857`) 会快照三个根文件夹 → 清空 → 从下载的文档重建 → 失败则回滚。这既不是 transport 也不是 protocol。`webdav-file-picker.js` 与 `webdav-config-session.js` 都没有触碰它。

**已核实**：该动作是本模块中**唯一**会删除书签的路径——`chrome.bookmarks.remove` / `removeTree` 在 `src/lib/sync-utils.js` 中仅出现于 `:640` 与 `:642`，均在该函数体内。其余 sync action 只会向集合中增加内容。

`GLOSSARY.md` 已为此补上术语 **Download and replace**（区别于其余不具破坏性的 sync action）与 **Bookmarks file**，理由见 `ff1a017`。拆该模块时须沿用这两个术语。

## 结论

**暂不做。** 与候选 4 同理，在没有运行器的前提下拆分等于把最敏感的数据丢失路径置于零可执行验证之下。但若日后重新审视本模块，目标是这一块，而不是 transport port。

## 验收标准（待解封 04 后）

- [ ] 原子回滚路径（导入失败后书签树不处于半清空状态）有可执行测试覆盖。
- [ ] 拆出的接口通过删除测试：删除后复杂度是**收拢**而非搬移。
- [ ] 拥有至少两个真实实现或两个真实消费者，否则不构成 seam。
