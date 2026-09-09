/** Server-only helper: streams a Lovable AI Gateway Responses call and
 *  returns the final output text. */
export async function callResponses(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 402 || res.status === 403) {
      throw new Error(
        "AI credits are unavailable right now — please ask the workspace owner to top up, then try again.",
      );
    }
    if (res.status === 429) throw new Error("The AI service is busy — please try again in a minute.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        if (json.type === "response.output_text.delta" && typeof json.delta === "string") {
          output += json.delta;
        } else if (json.type === "response.completed" && !output) {
          output = json.response?.output_text ?? "";
        } else if (json.type === "response.failed") {
          throw new Error(json.response?.error?.message ?? "AI request failed");
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return output;
}
