/* =========================
   CONFIGURAÇÃO BASE
========================= */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

/* =========================
   HELPERS
========================= */

function getHeaders(isFormData = false) {
  const token = localStorage.getItem("token");
  const headers = {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function handleResponse(response) {
  // redireciona para login se token expirou
  if (response.status === 401) {
    const data = await response.json().catch(() => ({}));

    // só desloga se o erro for de token, não de credenciais erradas na tela de login
    const isTokenError =
      data?.message?.toLowerCase().includes("token") ||
      data?.message?.toLowerCase().includes("expirado");

    if (isTokenError) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      return;
    }

    throw new Error(data?.message || "Não autorizado.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || `Erro ${response.status}`);
  }

  return data;
}

/* =========================
   MÉTODOS HTTP
========================= */

export const api = {
  get: async (path) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  post: async (path, body, isFormData = false) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: getHeaders(isFormData),
      body: isFormData ? body : JSON.stringify(body),
    });
    return handleResponse(response);
  },

  put: async (path, body, isFormData = false) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: getHeaders(isFormData),
      body: isFormData ? body : JSON.stringify(body),
    });
    return handleResponse(response);
  },

  delete: async (path) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
};