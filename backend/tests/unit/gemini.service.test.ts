import { mockGeminiConfigResponse, mockRoutingLog } from "../fixtures/mockData";

/**
 * The Gemini SDK is fully mocked — no network calls, no real API key needed.
 * We control exactly what "Gemini" returns for each test.
 */
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// Ensure the service sees a configured API key regardless of the real .env
jest.mock("../../src/config/env", () => ({
  env: {
    GEMINI_API_KEY: "test-api-key",
    GEMINI_MODEL: "gemini-2.5-flash",
    PORT: 5000,
    NODE_ENV: "test",
    MONGO_URI: "mongodb://127.0.0.1:27017/test",
    CLIENT_ORIGIN: "http://127.0.0.1:5500",
  },
}));

// Import AFTER mocks so the module-level `genAI` is built from the mock
import { geminiService } from "../../src/services/gemini.service";

function geminiReplies(text: string) {
  mockGenerateContent.mockResolvedValue({
    response: { text: () => text },
  });
}

describe("geminiService.generateRoutingConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses a clean JSON response into an object", async () => {
    geminiReplies(JSON.stringify(mockGeminiConfigResponse));

    const config = await geminiService.generateRoutingConfig(
      "Use Vendor A for 70% traffic and Vendor B for 30%."
    );

    expect(config).toEqual(mockGeminiConfigResponse);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
    });
  });

  it("strips markdown code fences before parsing", async () => {
    geminiReplies(
      "```json\n" + JSON.stringify(mockGeminiConfigResponse) + "\n```"
    );

    const config = await geminiService.generateRoutingConfig(
      "Prefer the cheapest vendor."
    );

    expect(config).toEqual(mockGeminiConfigResponse);
  });

  it("includes the user's instruction in the prompt sent to Gemini", async () => {
    geminiReplies(JSON.stringify(mockGeminiConfigResponse));

    const instruction = "Route everything to Vendor A unless it is offline.";
    await geminiService.generateRoutingConfig(instruction);

    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).toContain(instruction);
  });

  it("throws a friendly error when Gemini returns non-JSON garbage", async () => {
    geminiReplies("Sure! Here is your configuration: strategy = WEIGHTED");

    await expect(
      geminiService.generateRoutingConfig("anything")
    ).rejects.toThrow(
      "Gemini returned a response that could not be parsed as JSON."
    );
  });
});

describe("geminiService.explainRoutingDecision", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns Gemini's trimmed plain-text explanation", async () => {
    geminiReplies(
      "  Vendor A was selected because it has the highest priority and was healthy at the time of the request.  "
    );

    const explanation = await geminiService.explainRoutingDecision(
      mockRoutingLog as unknown as Record<string, unknown>
    );

    expect(explanation).toBe(
      "Vendor A was selected because it has the highest priority and was healthy at the time of the request."
    );
  });

  it("sends the routing log JSON inside the prompt", async () => {
    geminiReplies("Some explanation.");

    await geminiService.explainRoutingDecision(
      mockRoutingLog as unknown as Record<string, unknown>
    );

    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).toContain('"vendorSelected": "Vendor A"');
    expect(promptArg).toContain('"strategyUsed": "PRIORITY"');
  });
});