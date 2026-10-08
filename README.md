# Bansos Router + optional WhatsApp bridge (SnapDeploy)

Existing Bansos Router dashboard and OpenAI-compatible API stay at port `17070`.
The WhatsApp bridge is **opt-in** and uses Baileys (unofficial WhatsApp Web protocol).

## Deploy

1. Connect this repository's `main` branch in SnapDeploy.
2. Use **Dockerfile**, CPU Small and internal port **17070**.
3. Initially keep `WA_ENABLED=false` and confirm `/healthz` is healthy.
4. To enable WhatsApp, configure variables **in SnapDeploy, not GitHub**:

| Variable | Example | Notes |
|---|---|---|
| `WA_ENABLED` | `true` | Start WhatsApp connection |
| `WA_PHONE_NUMBER` | `628xxxxxxxxxx` | WhatsApp number with country code, digits only |
| `WA_MODEL` | `auto` | Automatically discovers `/v1/models` and caches for 10 minutes; optional explicit model ID |
| `WA_AI_BASE_URL` | `http://127.0.0.1:17070/v1` | Local Bansos API |
| `WA_AI_API_KEY` | (secret if required) | Never commit credentials |
| `WA_USER_COOLDOWN_MS` | `15000` | Per-sender AI cooldown |
| `WA_AI_MAX_PER_MINUTE` | `30` | Global AI request cap |
| `WA_AUTH_DIR` | `/home/node/.wa_auth` | Use persistent volume if supported |
| `WA_SYSTEM_PROMPT` | Custom CS instruction | Optional |

5. Read private container logs for the WhatsApp **pairing code**; in WhatsApp use **Linked devices → Link with phone number instead**. Never publish pairing codes or credentials.
6. Test with a second WhatsApp number. Do not send bulk messages.

## About SnapDeploy 429

SnapDeploy's **100 requests/minute/IP** restriction is implemented on its **shared public domain**. Application code **cannot disable that limit**. This change only reduces bot-generated API traffic via per-user cooldown, message-ID deduplication, global quota, bounded 429 retry, and FAQ responses that do not call AI.

If the browser dashboard itself makes over 100 requests/minute, the server-side WhatsApp changes **will not fix that**. Inspect browser Network and server access logs; stop frequent refreshes, disable aggressive health checks, or use an approved custom domain according to platform rules. Do not rotate IPs to bypass rate limits.

## Security and reliability

**Do not share the Bansos UI or /v1 API publicly without external authentication or network restrictions.** Bansos is started with `--unsafe-allow-non-loopback` so the hosting ingress can reach it. Configure access controls at SnapDeploy or a protected reverse proxy before wider use.

Baileys is an unofficial WhatsApp connection and may break or violate platform terms; for production business use prefer the official Meta WhatsApp Cloud API. The free SnapDeploy container auto-sleeps, so WhatsApp **will not stay connected 24/7**. The WhatsApp session is lost on a fresh container without persistent volume. Do not store session keys in GitHub.

If you previously embedded a hard-coded secret in an app script, **rotate that secret** and remove it from deployed systems.

## Health

`GET /healthz` checks Bansos only. It does not certify that WhatsApp is connected, authenticated, or able to reply through an AI model.
