import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import "leaflet/dist/leaflet.css";
import App from "./App.jsx";

// Inicialização do tema (evita flash do tema errado antes do React montar)
const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
