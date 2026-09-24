// ui.js
//
// Small formatting helpers so chat output looks consistent. Bedrock chat
// supports the classic section-sign color codes.

const COLORS = {
  ai: "\u00a7b",       // aqua - the assistant's own replies
  system: "\u00a7e",   // yellow - status/info
  error: "\u00a7c",    // red - errors
  reset: "\u00a7r",
};

export function formatAiReply(text) {
  return `${COLORS.ai}[Gemini]${COLORS.reset} ${text}`;
}

export function formatSystem(text) {
  return `${COLORS.system}[gemini-mcpe]${COLORS.reset} ${text}`;
}

export function formatError(text) {
  return `${COLORS.error}[gemini-mcpe]${COLORS.reset} ${text}`;
}
