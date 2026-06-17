import { useEffect, useState } from "react";

export type TableDensity = "comfortable" | "compact";

const STORAGE_KEY = "rouya.tableDensity";

function read(): TableDensity {
  if (typeof window === "undefined") return "comfortable";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "compact" ? "compact" : "comfortable";
}

/**
 * Global, localStorage-persisted table density preference.
 * Broadcasts changes across all subscribers via a custom event.
 */
export function useTableDensity(): [TableDensity, (d: TableDensity) => void] {
  const [density, setDensityState] = useState<TableDensity>(read);

  useEffect(() => {
    const handler = () => setDensityState(read());
    window.addEventListener("rouya-table-density", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("rouya-table-density", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const setDensity = (d: TableDensity) => {
    window.localStorage.setItem(STORAGE_KEY, d);
    window.dispatchEvent(new Event("rouya-table-density"));
    setDensityState(d);
  };

  return [density, setDensity];
}
