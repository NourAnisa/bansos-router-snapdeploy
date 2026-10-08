#!/bin/sh
set -eu
PORT="${PORT:-17070}"
# Run WhatsApp only when explicitly enabled. The router remains the primary process.
if [ "${WA_ENABLED:-false}" = "true" ]; then
  node /app/whatsapp.mjs &
  echo "[WA] Bridge started in the background"
fi
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  node /app/telegram.mjs &
  echo "[TG] Telegram bridge started"
fi
exec bansos start --bind 0.0.0.0 --port "$PORT" --unsafe-allow-non-loopback
