/**
 * Heuristic-based token estimation utility.
 * 
 * Uses character-to-token ratios based on content type:
 * - ASCII-only text: ~4 chars/token
 * - Unicode (Vietnamese, accented Latin): ~3 chars/token
 * - CJK (Chinese, Japanese, Korean): ~1.5 chars/token
 * - Emoji-heavy content: ~1.5 chars/token
 */

export function estimateTokenCount(text: string): number {
  if (!text.trim()) return 0;

  // 1. Fast global matches instead of a character loop
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  
  // Non-ASCII count (subtracting CJK and Emoji to prevent double counting)
  const allNonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
  const nonAscii = Math.max(0, allNonAscii - cjk - emoji);
  
  const ascii = Math.max(0, text.length - cjk - emoji - nonAscii);

  // 2. Combine structural checks
  const whitespace = (text.match(/\s/g) || []).length;
  const punctuation = (text.match(/[.,!?;:()[\]{}]/g) || []).length;
  const words = (text.match(/\S+/g) || []).length; // Faster than text.split(/\s+/)

  // 3. Base calculations
  let tokens =
    (ascii / 4) +
    (nonAscii / 3) +
    (cjk / 1.5) +
    (emoji / 1.3) +
    (whitespace * 0.3) +
    (punctuation * 0.5);

  tokens = Math.max(tokens, words);

  // Length-based adjustments
  if (text.length < 50) {
    tokens *= 1.1;
  } else if (text.length > 1000) {
    tokens *= 0.95;
  }

  return Math.ceil(tokens);
}

export function estimateMessagesTokenCount(messages: Array<{ content?: string }>): number {
  const TOKENS_PER_MESSAGE = 4; // Framing for each message
  const TOKENS_REPLY_PRIME = 3; // Global overhead for the assistant's response

  const total = messages.reduce((acc, msg) => {
    return acc + TOKENS_PER_MESSAGE + estimateTokenCount(msg.content || '');
  }, 0);

  return total > 0 ? total + TOKENS_REPLY_PRIME : 0;
}