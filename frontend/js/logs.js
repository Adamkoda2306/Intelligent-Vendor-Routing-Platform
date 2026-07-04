/**
 * Routing Logs page: table of past routing decisions with a per-row
 * "Explain" action that calls Gemini via /ai/explain-route.
 */

function logRowHtml(log) {
  const failed = log.status === "FAILED";
  return `
    <tr>
      <td class="mono text-muted">${formatTimestamp(log.createdAt)}</td>
      <td>${log.capability}</td>
      <td>
        <span class="flex gap-8">
          <span class="ticker-vendor-dot" style="background:${vendorColor(log.vendorSelected)}"></span>
          ${log.vendorSelected}
        </span>
      </td>
      <td><span class="pill pill-neutral">${log.strategyUsed}</span></td>
      <td class="mono">${formatLatency(log.latencyMs)}</td>
      <td>
        <span class="pill ${failed ? "pill-offline" : "pill-healthy"}">
          <span class="pill-dot"></span>${log.status}
        </span>
      </td>
      <td>
        <button class="btn btn-ghost btn-sm" data-action="explain" data-id="${log._id}">Explain</button>
      </td>
    </tr>
    <tr class="explain-row" id="explain-${log._id}" style="display:none;">
      <td colspan="7">
        <div class="text-muted" style="font-size:12.5px; padding:4px 0;">
          <strong style="color:var(--text-primary);">Reason:</strong> ${log.reason}
        </div>
        <div id="explain-text-${log._id}" class="mono text-muted" style="font-size:12px; margin-top:6px;"></div>
      </td>
    </tr>`;
}

async function loadLogs() {
  const tbody = document.getElementById("logs-table-body");
  try {
    const logs = await api.getRoutingLogs(100);

    if (logs.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No routing logs yet. Send a request to /route to generate one.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(logRowHtml).join("");
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Could not load logs: ${err.message}</td></tr>`;
  }
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action='explain']");
  if (!button) return;

  const id = button.dataset.id;
  const explainRow = document.getElementById(`explain-${id}`);
  const explainText = document.getElementById(`explain-text-${id}`);

  const isVisible = explainRow.style.display !== "none";
  if (isVisible) {
    explainRow.style.display = "none";
    return;
  }

  explainRow.style.display = "table-row";
  explainText.textContent = "Asking Gemini to explain this decision...";
  button.disabled = true;

  try {
    const result = await api.explainRoute(id);
    explainText.textContent = result.explanation;
  } catch (err) {
    explainText.textContent = `Could not generate explanation: ${err.message}`;
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadLogs();
  document.getElementById("logs-table-body").addEventListener("click", handleTableClick);
  document.getElementById("btn-refresh-logs").addEventListener("click", loadLogs);
});
