import type { WebdavConfigSession, WebdavConfigSessionDeps } from "../src/lib/webdav-config-session.js";
import type { WebdavFilePicker, WebdavFilePickerDeps } from "../src/lib/webdav-file-picker.js";

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
    YABMBookmarkTreeStateModule: any;
    YABMBookmarkTreeDndModule: any;
    YABMBookmarkTreeObserversModule: any;
    YABMBookmarkTreeMutationsModule: any;
    YABMBookmarkTreeMenuModule: any;
    YABMBookmarkTreeRenderModule: any;
    YABMBookmarkTreeModule: any;
  }

}

export {};