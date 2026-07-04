/**
 * Dashboard page: summary stats, vendor health snapshot, and the
 * live routing ticker (signature element) fed by recent routing logs.
 */

async function loadDashboardStats() {
  try {
    const summary = await api.getVendorMetrics();

    document.getElementById("stat-total-requests").textContent = summary.totalRequests;
    document.getElementById("stat-success").textContent = summary.successfulRequests;
    document.getElementById("stat-failed").textContent = summary.failedRequests;
    document.getElementById("stat-avg-latency").textContent = formatLatency(summary.avgLatencyMs);
  } catch (err) {
    showToast(`Failed to load metrics: ${err.message}`, "error");
  }
}

async function loadHealthSnapshot() {
  const container = document.getElementById("health-snapshot");
  try {
    const vendors = await api.getHealth();
    if (vendors.length === 0) {
      container.innerHTML = `<p class="text-muted">No vendors configured yet.</p>`;
      return;
    }

    container.innerHTML = vendors
      .map(
        (v) => `
        <div class="flex-between" style="padding:10px 0; border-bottom:1px solid var(--border-soft);">
          <div class="flex gap-8">
            <span class="ticker-vendor-dot" style="background:${vendorColor(v.name)}"></span>
            <span>${v.name}</span>
            <span class="text-muted mono" style="font-size:11px;">priority ${v.priority}</span>
          </div>
          ${healthPillHtml(v.healthStatus)}
        </div>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<p class="text-muted">Could not load vendor health.</p>`;
  }
}

async function loadRoutingTicker() {
  const track = document.getElementById("ticker-track");
  try {
    const logs = await api.getRoutingLogs(15);

    if (logs.length === 0) {
      track.innerHTML = `<div class="ticker-item">No routing activity yet — send a request to /route to see it here.</div>`;
      return;
    }

    const items = logs
      .map((log) => {
        const failed = log.status === "FAILED";
        return `
          <div class="ticker-item ${failed ? "failed" : ""}">
            <span class="ticker-vendor-dot" style="background:${vendorColor(log.vendorSelected)}"></span>
            <span>${log.vendorSelected}</span>
            <span class="text-faint">·</span>
            <span>${log.capability}</span>
            <span class="text-faint">·</span>
            <span>${formatLatency(log.latencyMs)}</span>
            <span class="text-faint">·</span>
            <span>${log.status}</span>
          </div>`;
      })
      .join("");

    // Duplicate the list so the CSS marquee (-50% translate) loops seamlessly
    track.innerHTML = items + items;
  } catch (err) {
    track.innerHTML = `<div class="ticker-item">Could not load routing activity.</div>`;
  }
}

async function initDashboard() {
  await Promise.all([loadDashboardStats(), loadHealthSnapshot(), loadRoutingTicker()]);
}

document.addEventListener("DOMContentLoaded", () => {
  initDashboard();
  // Refresh the live sections periodically without a full page reload
  setInterval(loadRoutingTicker, 8000);
  setInterval(loadHealthSnapshot, 10000);
  setInterval(loadDashboardStats, 10000);
});
