import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { TypographySpecimen } from "./components/specimen/TypographySpecimen";
import { queryClient } from "./lib/queryClient";
import { installTauriDevBridgeIfNeeded } from "./lib/tauri-dev-bridge";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/tokens/typography.css";
import "./styles/typography.css";

installTauriDevBridgeIfNeeded();

// Dev/QA-only route for the typography specimen page. No router dependency
// for one debug page — a hash check at the root is enough.
const isSpecimenRoute = window.location.hash === "#/typography";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>{isSpecimenRoute ? <TypographySpecimen /> : <App />}</QueryClientProvider>
  </React.StrictMode>,
);
