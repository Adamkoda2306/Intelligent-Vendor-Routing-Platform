import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

const genAI = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY) : null;

/**
 * Strips markdown code fences (```json ... ```) that Gemini sometimes
 * wraps around JSON responses, so we can safely JSON.parse the result.
 */
function stripCodeFences(text: string): string {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

export const geminiService = {
  /**
   * Takes a plain-English routing instruction and asks Gemini to convert
   * it into structured JSON config (weights, thresholds, strategy).
   */
  async generateRoutingConfig(instruction: string): Promise<Record<string, unknown>> {
    if (!genAI) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }

    const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });

    const prompt = `
You are a routing configuration generator for a vendor routing platform.
Convert the following plain-English instruction into a JSON configuration object.

Instruction: "${instruction}"

Respond with ONLY valid JSON in this exact shape, no extra text, no markdown:
{
  "strategy": "WEIGHTED" | "PRIORITY" | "LOWEST_COST" | "LOWEST_LATENCY" | "FAILOVER",
  "vendorWeights": { "<vendorName>": <number 0-100> },
  "maxLatencyMs": <number or null>,
  "notes": "<short explanation>"
}
`.trim();

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
    const cleaned = stripCodeFences(rawText);

    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error("Gemini returned a response that could not be parsed as JSON.");
    }
  },

  /**
   * Takes a routing log entry and asks Gemini to explain, in plain English,
   * why that vendor was selected.
   */
  async explainRoutingDecision(routingLog: Record<string, unknown>): Promise<string> {
    if (!genAI) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }

    const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });

    const prompt = `
You are explaining a routing decision made by a vendor routing platform to a non-technical stakeholder.

Routing log:
${JSON.stringify(routingLog, null, 2)}

In 2-4 short sentences, explain in plain English why this vendor was selected for this request.
Do not use markdown formatting, just plain text.
`.trim();

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  },
};
