declare global {
  interface Window {
    YABMI18n: any;
    YABMSync: any;
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

  namespace chrome.runtime {
    interface ExtensionContext {
      contextType?: string;
      documentUrl?: string;
      tabId?: number;
    }

    function getContexts(filter: {
      contextTypes?: string[];
      documentUrls?: string[];
    }): Promise<ExtensionContext[]>;
  }
}

export {};