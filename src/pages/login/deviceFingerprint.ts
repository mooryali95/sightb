const KEY = 'rouya_device_fp';

/** The id this browser is known by to the one-time-code check; minted once and kept. */
export function getDeviceFingerprint(storage: Storage = localStorage): string {
  let fp = storage.getItem(KEY);
  if (!fp) {
    fp = crypto.randomUUID();
    storage.setItem(KEY, fp);
  }
  return fp;
}
