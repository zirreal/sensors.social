# share-og

Small HTTP service for **Open Graph previews** of sensor deep links (Telegram, Facebook, Slack, etc.).

- **Bots** receive HTML with `og:title`, `og:description`, `og:image`.
- **Browsers** get a `302` redirect to the main map at `https://sensors.social/?sensor=…`.

The main site stays on GitHub Pages. This service runs on a separate host/subdomain, typically `share.sensors.social`.

---

## Architecture

```
User shares:  https://share.sensors.social/?sensor=…&type=pm25

Telegram bot  →  share-og (this service)  →  Roseman API + Nominatim  →  HTML with og:* meta
Browser       →  share-og                 →  302 → https://sensors.social/?sensor=…
```

Caddy (or nginx) terminates TLS on `share.sensors.social` and reverse-proxies to `127.0.0.1:3080`.

---

## Repository layout

| File | Role |
|------|------|
| `server.mjs` | Node HTTP server (no npm dependencies) |
| `package.json` | `npm start` → `node server.mjs` |

---

## Server directory layout

Suggested path on the VPS (adjust if your convention differs):

```
/sensors-social-opt/
  share-og/          # this service
```

All deploy commands below use `/sensors-social-opt/share-og`.

---

## 1. DNS

Add a record in Cloudflare (or your DNS provider) for the main domain `sensors.social`:

| Field | Value |
|-------|--------|
| Type | `A` |
| Name | `share` |
| Content | VPS public IPv4 |
| Proxy | **DNS only** (grey cloud) — traffic goes directly to the VPS |

Verify:

```bash
dig +short share.sensors.social
```

HTTPS (Let's Encrypt) will not issue a certificate until this resolves to the server.

---

## 2. Deploy files

From a machine with the repo checked out:

```bash
ssh root@SERVER_IP "mkdir -p /sensors-social-opt/share-og"
scp services/share-og/* root@SERVER_IP:/sensors-social-opt/share-og/
```

**Note:** copy the *files inside* `services/share-og/`, not the folder itself — otherwise you get a nested `share-og/share-og/` path.

Requirements: **Node.js 18+** (20+ recommended).

---

## 3. Manual smoke test

```bash
cd /sensors-social-opt/share-og
node server.mjs
```

In a **second SSH session on the same server** (not your laptop — the process binds to `127.0.0.1`):

```bash
curl -s http://127.0.0.1:3080/health          # → ok
curl -A "TelegramBot" "http://127.0.0.1:3080/?sensor=SENSOR_ID&type=pm25"
```

Stop the manual process with `Ctrl+C` before enabling systemd.

---

## 4. systemd service

### What this does

`systemd` is Linux’s service manager. The unit file tells the OS to:

- run `node server.mjs` on boot;
- restart it if it crashes;
- set environment variables (`PORT`, `SITE_URL`, `SHARE_URL`);
- run from `WorkingDirectory` so relative paths resolve correctly.

Equivalent of “keep `node server.mjs` running in the background forever”.

### Install

```bash
cat > /etc/systemd/system/sensors-share-og.service <<'EOF'
[Unit]
Description=sensors.social share OG service
After=network.target

[Service]
Type=simple
WorkingDirectory=/sensors-social-opt/share-og
Environment=PORT=3080
Environment=SITE_URL=https://sensors.social
Environment=SHARE_URL=https://share.sensors.social
ExecStart=/usr/bin/node server.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sensors-share-og
systemctl status sensors-share-og
curl -s http://127.0.0.1:3080/health
```

Use `which node` if Node is not at `/usr/bin/node`.

Useful commands:

```bash
journalctl -u sensors-share-og -f    # logs
systemctl restart sensors-share-og
systemctl stop sensors-share-og
```

---

## 5. TLS with Caddy

Install Caddy, then point the subdomain at the local Node port:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

cat > /etc/caddy/Caddyfile <<'EOF'
share.sensors.social {
  reverse_proxy 127.0.0.1:3080
}
EOF

systemctl enable --now caddy
systemctl reload caddy
```

Caddy obtains and renews Let's Encrypt certificates automatically.

---

## 6. Production checks

Replace `SENSOR_ID` with a real sensor id from the map.

```bash
# Bot — HTML with og:title
curl -A "TelegramBot" "https://share.sensors.social/?sensor=SENSOR_ID&type=pm25"

# Browser — redirect to main site
curl -I "https://share.sensors.social/?sensor=SENSOR_ID&type=pm25"
# Expect: HTTP/2 302, Location: https://sensors.social/?sensor=…
```

Telegram caches previews for several minutes.

---

## 7. Frontend integration

In `src/config/default/config.json`:

```json
"SHARE_URL": "https://share.sensors.social"
```

After the site is deployed, **Copy link** in the sensor popup uses `share.sensors.social` URLs instead of `sensors.social/?sensor=…`.

Links copied from the browser address bar still point at GitHub Pages and will **not** get OG previews unless a separate edge rule is added on the main domain.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3080` | Listen port (localhost only) |
| `SITE_URL` | `https://sensors.social` | Redirect target for humans |
| `SHARE_URL` | `https://share.sensors.social` | Canonical URL in `og:url` |
| `REMOTE_PROVIDER` | `https://roseman.robonomics.network/` | Sensor log API |
| `OG_IMAGE` | `{SITE_URL}/og-default.webp` | Default `og:image` |

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `connection refused` on `:3080` | `systemctl status sensors-share-og` |
| HTTPS fails | DNS, `systemctl status caddy`, port 80/443 open |
| Empty OG title | Sensor id, Roseman reachability: `curl -I https://roseman.robonomics.network/` |
| `curl` from laptop to `127.0.0.1:3080` fails | Expected — test from SSH **on the server** or via HTTPS after Caddy |
