/**
 * Metrics page: per-vendor stats table plus two Chart.js visualizations —
 * average latency by vendor, and success vs failure split by vendor.
 */

let latencyChart = null;
let successChart = null;

function renderSummaryStats(summary) {
  document.getElementById("stat-total-requests").textContent = summary.totalRequests;
  document.getElementById("stat-success").textContent = summary.successfulRequests;
  document.getElementById("stat-failed").textContent = summary.failedRequests;
  document.getElementById("stat-error-rate").textContent = formatPercent(summary.errorRate);
}

function renderMetricsTable(vendors) {
  const tbody = document.getElementById("metrics-table-body");

  if (vendors.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No metrics recorded yet. Route a request to generate data.</td></tr>`;
    return;
  }

  tbody.innerHTML = vendors
    .map(
      (m) => `
      <tr>
        <td>
          <span class="flex gap-8">
            <span class="ticker-vendor-dot" style="background:${vendorColor(m.vendorName)}"></span>
            ${m.vendorName}
          </span>
        </td>
        <td class="mono">${m.totalRequests}</td>
        <td class="mono">${m.successfulRequests}</td>
        <td class="mono">${m.failedRequests}</td>
        <td class="mono">${formatLatency(m.avgLatencyMs)}</td>
        <td class="mono">${formatPercent(m.errorRate)}</td>
        <td class="mono">${m.availability}%</td>
      </tr>`
    )
    .join("");
}

function renderLatencyChart(vendors) {
  const ctx = document.getElementById("latency-chart");
  const labels = vendors.map((v) => v.vendorName);
  const data = vendors.map((v) => v.avgLatencyMs);
  const colors = vendors.map((v) => vendorColor(v.vendorName));

  if (latencyChart) latencyChart.destroy();

  latencyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Avg Latency (ms)", data, backgroundColor: colors, borderRadius: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8896ac" }, grid: { color: "#1f2c42" } },
        y: { ticks: { color: "#8896ac" }, grid: { color: "#1f2c42" }, beginAtZero: true },
      },
    },
  });
}

function renderSuccessChart(vendors) {
  const ctx = document.getElementById("success-chart");

  if (successChart) successChart.destroy();

  successChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: vendors.map((v) => v.vendorName),
      datasets: [
        {
          label: "Successful",
          data: vendors.map((v) => v.successfulRequests),
          backgroundColor: "#4ade80",
          borderRadius: 4,
        },
        {
          label: "Failed",
          data: vendors.map((v) => v.failedRequests),
          backgroundColor: "#f2545b",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e8eef7" } } },
      scales: {
        x: { stacked: true, ticks: { color: "#8896ac" }, grid: { display: false } },
        y: { stacked: true, ticks: { color: "#8896ac" }, grid: { color: "#1f2c42" }, beginAtZero: true },
      },
    },
  });
}

async function loadMetrics() {
  try {
    const summary = await api.getVendorMetrics();
    renderSummaryStats(summary);
    renderMetricsTable(summary.vendors);
    renderLatencyChart(summary.vendors);
    renderSuccessChart(summary.vendors);
  } catch (err) {
    showToast(`Failed to load metrics: ${err.message}`, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadMetrics();
  setInterval(loadMetrics, 10000);
});
