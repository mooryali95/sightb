/// <reference types="vite/client" />

/** Install-once flags the global handlers leave on the window. */
interface Window {
  __rouyaLoggerInstalled?: boolean;
  __rouyaOfflineQueueInstalled?: boolean;
}

/** Changes on every build; drops the saved query cache. */
declare const __BUILD_ID__: string;
