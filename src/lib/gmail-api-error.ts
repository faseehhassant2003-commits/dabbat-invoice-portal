export async function gmailApiErrorMessage(response: Response): Promise<string> {
  let detail = "";
  try {
    const body = await response.json() as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string") {
      detail = body.error.message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
    }
  } catch {
    detail = "";
  }
  return `Gmail API rejected the message (HTTP ${response.status})${detail ? `: ${detail}` : "."}`;
}
