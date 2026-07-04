/**
 * Vendor Management page: list, create, edit, and delete vendors.
 * Also supports quickly testing the /route endpoint against live vendors.
 */

let editingVendorId = null;

function vendorRowHtml(vendor) {
  return `
    <tr>
      <td>
        <span class="flex gap-8">
          <span class="ticker-vendor-dot" style="background:${vendorColor(vendor.name)}"></span>
          ${vendor.name}
        </span>
      </td>
      <td class="mono">${vendor.priority}</td>
      <td class="mono">${vendor.weight}</td>
      <td class="mono">${vendor.cost}</td>
      <td class="mono">${formatLatency(vendor.avgLatencyMs)}</td>
      <td>${vendor.capabilities.join(", ")}</td>
      <td>${healthPillHtml(vendor.healthStatus)}</td>
      <td>${vendor.enabled ? `<span class="pill pill-healthy"><span class="pill-dot"></span>ON</span>` : `<span class="pill pill-neutral">OFF</span>`}</td>
      <td>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${vendor._id}">Edit</button>
          <button class="btn btn-danger-ghost btn-sm" data-action="delete" data-id="${vendor._id}">Delete</button>
        </div>
      </td>
    </tr>`;
}

async function loadVendors() {
  const tbody = document.getElementById("vendor-table-body");
  try {
    const vendors = await api.getVendors();
    if (vendors.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No vendors yet. Click "Add Vendor" to create one.</td></tr>`;
      return;
    }
    tbody.innerHTML = vendors.map(vendorRowHtml).join("");
    window.__vendorCache = vendors;
    populateCapabilityDropdown(vendors);
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">Could not load vendors: ${err.message}</td></tr>`;
  }
}

function populateCapabilityDropdown(vendors) {
  const select = document.getElementById("test-capability");
  if (!select) return;
  const capabilities = new Set();
  vendors.forEach((v) => v.capabilities.forEach((c) => capabilities.add(c)));
  const current = select.value;
  select.innerHTML = [...capabilities].map((c) => `<option value="${c}">${c}</option>`).join("");
  if (current) select.value = current;
}

/* ---------------- Modal handling ---------------- */

function openVendorModal(vendor = null) {
  editingVendorId = vendor ? vendor._id : null;
  document.getElementById("modal-title").textContent = vendor ? "Edit Vendor" : "Add Vendor";

  document.getElementById("field-name").value = vendor?.name || "";
  document.getElementById("field-priority").value = vendor?.priority ?? 5;
  document.getElementById("field-weight").value = vendor?.weight ?? 50;
  document.getElementById("field-cost").value = vendor?.cost ?? 5;
  document.getElementById("field-latency").value = vendor?.avgLatencyMs ?? 500;
  document.getElementById("field-ratelimit").value = vendor?.rateLimitPerMin ?? 60;
  document.getElementById("field-failurerate").value = vendor?.failureRate ?? 0.05;
  document.getElementById("field-capabilities").value = vendor?.capabilities?.join(", ") || "";
  document.getElementById("field-enabled").checked = vendor ? vendor.enabled : true;

  document.getElementById("vendor-modal-overlay").classList.add("open");
}

function closeVendorModal() {
  document.getElementById("vendor-modal-overlay").classList.remove("open");
  editingVendorId = null;
}

async function handleVendorFormSubmit(event) {
  event.preventDefault();

  const payload = {
    name: document.getElementById("field-name").value.trim(),
    priority: Number(document.getElementById("field-priority").value),
    weight: Number(document.getElementById("field-weight").value),
    cost: Number(document.getElementById("field-cost").value),
    avgLatencyMs: Number(document.getElementById("field-latency").value),
    rateLimitPerMin: Number(document.getElementById("field-ratelimit").value),
    failureRate: Number(document.getElementById("field-failurerate").value),
    capabilities: document
      .getElementById("field-capabilities")
      .value.split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    enabled: document.getElementById("field-enabled").checked,
  };

  try {
    if (editingVendorId) {
      await api.updateVendor(editingVendorId, payload);
      showToast("Vendor updated successfully", "success");
    } else {
      await api.createVendor(payload);
      showToast("Vendor created successfully", "success");
    }
    closeVendorModal();
    loadVendors();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;
  const vendor = (window.__vendorCache || []).find((v) => v._id === id);

  if (action === "edit") {
    openVendorModal(vendor);
  } else if (action === "delete") {
    if (!confirm(`Delete ${vendor?.name || "this vendor"}? This cannot be undone.`)) return;
    try {
      await api.deleteVendor(id);
      showToast("Vendor deleted", "success");
      loadVendors();
    } catch (err) {
      showToast(err.message, "error");
    }
  }
}

/* ---------------- Route test panel ---------------- */

async function handleTestRoute(event) {
  event.preventDefault();
  const capability = document.getElementById("test-capability").value;
  const strategy = document.getElementById("test-strategy").value;
  const resultBox = document.getElementById("test-result");

  resultBox.textContent = "Routing request...";

  try {
    const requirements = strategy ? { strategy } : {};
    const result = await api.routeRequest({
      capability,
      payload: { sample: "test-payload", triggeredFrom: "vendor-management-ui" },
      requirements,
    });
    resultBox.textContent = JSON.stringify(result, null, 2);
    loadVendors();
  } catch (err) {
    resultBox.textContent = `Error: ${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadVendors();

  document.getElementById("btn-add-vendor").addEventListener("click", () => openVendorModal());
  document.getElementById("btn-close-modal").addEventListener("click", closeVendorModal);
  document.getElementById("btn-cancel-modal").addEventListener("click", closeVendorModal);
  document.getElementById("vendor-form").addEventListener("submit", handleVendorFormSubmit);
  document.getElementById("vendor-table-body").addEventListener("click", handleTableClick);
  document.getElementById("test-route-form").addEventListener("submit", handleTestRoute);
});
