export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionParams {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Custom OpenRouter attribution headers (distinct from the browser's
    // Referer, which fetch can't override) — see openrouter.ai/docs.
    "HTTP-Referer": "https://brain.local",
    "X-Title": "Brain",
  };
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  let detail = "";
  try {
    const body = await response.json();
    detail = body?.error?.message ?? JSON.stringify(body);
  } catch {
    detail = await response.text().catch(() => "");
  }
  throw new Error(`OpenRouter request failed (${response.status}): ${detail || response.statusText}`);
}

/** Non-streaming call — used by Review, which needs the complete response
 *  before it can parse the suggestions JSON out of it. */
export async function chatCompletion({ apiKey, model, messages }: ChatCompletionParams): Promise<string> {
  if (!apiKey) throw new Error("No OpenRouter API key configured.");
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, stream: false }),
  });
  await assertOk(response);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter response had no message content.");
  return content;
}

/** Streaming call — used by Ideate chat so tokens render as they arrive. */
export async function streamChatCompletion(
  { apiKey, model, messages }: ChatCompletionParams,
  onToken: (delta: string) => void,
): Promise<void> {
  if (!apiKey) throw new Error("No OpenRouter API key configured.");
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, stream: true }),
  });
  await assertOk(response);
  if (!response.body) throw new Error("OpenRouter streaming response had no body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) onToken(delta);
      } catch {
        // Ignore malformed/partial SSE chunks (comments, keep-alives).
      }
    }
  }
}
