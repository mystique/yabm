# 架构深度化改进

本组 ticket 将架构评审中的 3 个候选拆成可独立验证的纵向切片。三个切片互不阻塞，按用户可见行为分别改善 WebDAV 配置会话、书签刷新协调和拖拽生命周期。

## Tickets

- [01: 统一 WebDAV 配置会话](issues/01-unify-webdav-configuration-session.md)
- [02: 统一书签变化后的刷新协调](issues/02-coordinate-bookmark-refresh.md)
- [03: 收拢拖拽 module 的完整生命周期](issues/03-close-dnd-lifecycle.md)
