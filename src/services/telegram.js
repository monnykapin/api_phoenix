/**
 * Minimal Telegram Bot API client.
 *
 * Sends a plain-text message to a chat via `sendMessage`. Credentials come from
 * the environment (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) but can be overridden
 * per call (useful in tests).
 *
 * Uses the built-in `fetch` (Node 18+), so no extra dependency is required.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

const sendTelegramMessage = async (text, options = {}) => {
  const token = options.token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      skipped: true,
      reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set",
    };
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API request failed (${response.status}): ${body}`);
  }

  return response.json();
};

module.exports = { sendTelegramMessage };
