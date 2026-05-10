const API_BASE = `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/api`;

// Exporta para arquivos que ainda fazem fetch direto (Login, Register)
export { API_BASE };

const TIMEOUT_MS = 15_000;

function getHeaders(isFormData = false) {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  if (!isFormData) headers["Content-Type"] = "application/json";
  return headers;
}

async function handleResponse(response) {
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = data?.message || `Erro ${response.status}: ${response.statusText || "Requisição falhou"}`;
    const err = new Error(msg);
    err.status = response.status;
    err.data   = data;
    throw err;
  }

  return data;
}

function withTimeout(promise, ms = TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Tempo limite da requisição esgotado.")), ms)
  );
  return Promise.race([promise, timeout]);
}

export const api = {
  get: async (path, { signal } = {}) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers: getHeaders(),
        signal,
      })
    );
    return handleResponse(response);
  },

  post: async (path, body, isFormData = false) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: getHeaders(isFormData),
        body: isFormData ? body : JSON.stringify(body),
      })
    );
    return handleResponse(response);
  },

  put: async (path, body, isFormData = false) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "PUT",
        headers: getHeaders(isFormData),
        body: isFormData ? body : JSON.stringify(body),
      })
    );
    return handleResponse(response);
  },

  patch: async (path, body, { signal } = {}) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(body),
        signal,
      })
    );
    return handleResponse(response);
  },

  delete: async (path) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "DELETE",
        headers: getHeaders(),
      })
    );
    return handleResponse(response);
  },
};
