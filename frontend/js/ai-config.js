/**
 * AI Config Generator page: takes a plain-English routing instruction
 * and calls Gemini via /ai/generate-config to produce structured JSON.
 */

const EXAMPLE_INSTRUCTIONS = [
  "Use Vendor A for 70% of traffic and Vendor B for 30%. If latency exceeds 2 seconds, fall back to Vendor C.",
  "Always prefer the cheapest available vendor for PAN verification requests.",
  "Route everything to the fastest vendor, but switch to failover mode if the primary vendor goes offline.",
];

function renderExamples() {
  const container = document.getElementById("example-instructions");
  container.innerHTML = EXAMPLE_INSTRUCTIONS.map(
    (text, i) => `<button type="button" class="btn btn-ghost btn-sm" data-example="${i}">Example ${i + 1}</button>`
  ).join("");

  container.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-example]");
    if (!btn) return;
    document.getElementById("instruction-input").value = EXAMPLE_INSTRUCTIONS[btn.dataset.example];
  });
}

function renderConfigOutput(config) {
  const output = document.getElementById("config-output");
  output.textContent = JSON.stringify(config, null, 2);

  const weightsBox = document.getElementById("weights-preview");
  const weights = config.vendorWeights || {};
  const entries = Object.entries(weights);

  if (entries.length === 0) {
    weightsBox.innerHTML = "";
    return;
  }

  weightsBox.innerHTML = `
    <div class="mt-16">
      <p class="text-muted" style="font-size:12px; margin-bottom:8px;">Vendor weight preview</p>
      ${entries
        .map(
          ([name, weight]) => `
          <div style="margin-bottom:8px;">
            <div class="flex-between" style="font-size:12px; margin-bottom:4px;">
              <span>${name}</span>
              <span class="mono">${weight}%</span>
            </div>
            <div style="height:6px; background:var(--surface-raised); border-radius:4px; overflow:hidden;">
              <div style="height:100%; width:${weight}%; background:${vendorColor(name)};"></div>
            </div>
          </div>`
        )
        .join("")}
    </div>`;
}

async function handleGenerateConfig(event) {
  event.preventDefault();
  const instruction = document.getElementById("instruction-input").value.trim();
  const output = document.getElementById("config-output");
  const button = document.getElementById("btn-generate");

  if (!instruction) {
    showToast("Enter a routing instruction first", "error");
    return;
  }

  button.disabled = true;
  output.textContent = "Generating configuration with Gemini...";
  document.getElementById("weights-preview").innerHTML = "";

  try {
    const config = await api.generateAiConfig(instruction);
    renderConfigOutput(config);
    showToast("Configuration generated successfully", "success");
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
    showToast(err.message, "error");
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderExamples();
  document.getElementById("ai-config-form").addEventListener("submit", handleGenerateConfig);
});
