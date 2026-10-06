import type { WebdavConfigSession, WebdavConfigSessionDeps } from "../src/lib/webdav-config-session.js";
import type { WebdavFilePicker, WebdavFilePickerDeps } from "../src/lib/webdav-file-picker.js";
import type { BookmarkOverlayModule } from "../src/pages/bookmarks/bookmark-overlay.js";
import type { TooltipModule, TooltipModuleDeps } from "../src/pages/bookmarks/bookmark-tooltip.js";
import type { WebdavStatusModule, WebdavStatusModuleDeps } from "../src/pages/bookmarks/bookmark-webdav-status.js";
import type { EditMenuModule, EditMenuModuleDeps } from "../src/pages/bookmarks/bookmark-edit-menu.js";
import type { AppearanceMenuModule, AppearanceMenuModuleDeps } from "../src/pages/bookmarks/bookmark-appearance-menu.js";

declare global {
  interface Window {
    YABMI18n: any;
    YABMSync: any;
    YABMWebdavConfigSession: {
      createSession(deps: WebdavConfigSessionDeps): WebdavConfigSession;
    };
    YABMWebdavFilePicker: {
      createPicker(deps: WebdavFilePickerDeps): WebdavFilePicker;
    };
    YABMTheme: any;
    YABMNotificationsModule: any;
    YABMScrollbarModule: any;
    YABMFaviconCacheModule: any;
    YABMModalsModule: any;
    YABMBookmarkOverlayModule: BookmarkOverlayModule;
    YABMTooltipModule: {
      createTooltipModule(deps: TooltipModuleDeps): TooltipModule;
    };
    YABMWebdavStatusModule: {
      createWebdavStatusModule(deps: WebdavStatusModuleDeps): WebdavStatusModule;
    };
    YABMEditMenuModule: {
      createEditMenuModule(deps: EditMenuModuleDeps): EditMenuModule;
    };
    YABMAppearanceMenuModule: {
      createAppearanceMenuModule(
        deps: AppearanceMenuModuleDeps,
      ): AppearanceMenuModule;
    };
    YABMBookmarkTreeStateModule: any;
    YABMBookmarkTreeDndModule: any;
    YABMBookmarkTreeObserversModule: any;
    YABMBookmarkTreeMutationsModule: any;
    YABMBookmarkTreeMenuModule: any;
    YABMBookmarkTreeNodeActionsModule: any;
    YABMBookmarkTreeRenderModule: any;
    YABMBookmarkTreeModule: any;
  }

}

export {};