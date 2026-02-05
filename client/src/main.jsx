import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import StandaloneApp from "./StandaloneApp.jsx";
import "./styles/theme.css";
import "./styles/hostPanel.css";

// Detect mode: if in Discord (discordsays.com) use old App, otherwise use StandaloneApp
// Use exact match or subdomain check to prevent spoofing
const IN_DISCORD = typeof window !== "undefined" && (
  window.location.hostname === "discordsays.com" ||
  window.location.hostname.endsWith(".discordsays.com")
);

// For standalone mode, use StandaloneApp (WebSocket-based)
// For Discord Activity mode, use App (HTTP polling-based)
const AppComponent = IN_DISCORD ? App : StandaloneApp;

createRoot(document.getElementById("root")).render(<AppComponent />);
