/// <reference types="vite/client" />

/** Install-once flags the global handlers leave on the window. */
interface Window {
  __rouyaLoggerInstalled?: boolean;
  __rouyaOfflineQueueInstalled?: boolean;
}
