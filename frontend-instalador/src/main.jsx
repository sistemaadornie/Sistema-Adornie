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

// Só registra o service worker em produção — em dev ele acaba servindo o
// bundle antigo em cache (cache-first) e mascara qualquer mudança de código.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
