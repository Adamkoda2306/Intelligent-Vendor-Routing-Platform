/**
 * Central API client. Every page-specific JS file uses these helpers
 * instead of calling fetch() directly, so the base URL only lives in one place.
 */
const API_BASE_URL = "http://localhost:3000";

const VENDOR_COLORS = {
  "Vendor A": "#3ddbd9",
  "Vendor B": "#b18cff",
  "Vendor C": "#f5a623",
};

function vendorColor(name) {
  return VENDOR_COLORS[name] || "#8896ac";
}

async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Unexpected response from server (status ${res.status})`);
  }

  if (!res.ok || body.success === false) {
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }

  return body.data;
}

const api = {
  getVendors: () => apiRequest("/vendors"),
  createVendor: (data) => apiRequest("/vendors", { method: "POST", body: JSON.stringify(data) }),
  updateVendor: (id, data) => apiRequest(`/vendors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteVendor: (id) => apiRequest(`/vendors/${id}`, { method: "DELETE" }),

  getHealth: () => apiRequest("/health"),
  getVendorMetrics: () => apiRequest("/vendor-metrics"),
  getRoutingLogs: (limit = 50) => apiRequest(`/routing-logs?limit=${limit}`),

  routeRequest: (data) => apiRequest("/route", { method: "POST", body: JSON.stringify(data) }),

  generateAiConfig: (instruction) =>
    apiRequest("/ai/generate-config", { method: "POST", body: JSON.stringify({ instruction }) }),
  explainRoute: (logId) =>
    apiRequest("/ai/explain-route", { method: "POST", body: JSON.stringify({ logId }) }),
};

/* ---------------- Toast notifications ---------------- */

function showToast(message, type = "info") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  stack.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ---------------- Small formatting helpers ---------------- */

function formatLatency(ms) {
  if (ms === undefined || ms === null) return "—";
  return `${ms}ms`;
}

function formatPercent(value) {
  if (value === undefined || value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function healthPillHtml(status) {
  const map = {
    HEALTHY: "pill-healthy",
    WARNING: "pill-warning",
    OFFLINE: "pill-offline",
  };
  const cls = map[status] || "pill-neutral";
  return `<span class="pill ${cls}"><span class="pill-dot"></span>${status}</span>`;
}
