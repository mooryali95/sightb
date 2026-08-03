import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "@/lib/logger";
import { installOfflineQueue } from "@/lib/offline-queue";

installGlobalErrorHandlers();
installOfflineQueue();

createRoot(document.getElementById("root")!).render(<App />);
