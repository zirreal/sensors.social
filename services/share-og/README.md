# share-og

Small HTTP service for **Open Graph previews** of sensor deep links (Telegram, Facebook, Slack, etc.).

- **Bots** receive HTML with `og:title`, `og:description`, `og:image`.
- **Browsers** get a `302` redirect to the main map at `https://sensors.social/?sensor=…`.

The main site stays on GitHub Pages. This service runs on a separate host/subdomain, typically `share.sensors.social`.

---

## Architecture

```
User shares:  https://share.sensors.social/?sensor=…&type=pm25

Telegram bot  →  share-og (this service)  →  Roseman v2 sensor day + Nominatim  →  HTML with og:* meta
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

### First install (new server)

From a machine with the repo checked out:

```bash
ssh root@SERVER_IP "mkdir -p /sensors-social-opt/share-og"
scp services/share-og/server.mjs services/share-og/package.json root@SERVER_IP:/sensors-social-opt/share-og/
```

**Note:** copy files into `/sensors-social-opt/share-og/`, not the `share-og` folder itself — otherwise you get nested `share-og/share-og/`.

Requirements: **Node.js 18+** (20+ recommended).

### Update after code changes (usual deploy)

From your laptop, in the repo root:

```bash
scp services/share-og/server.mjs root@SERVER_IP:/sensors-social-opt/share-og/
ssh root@SERVER_IP "systemctl restart sensors-share-og && systemctl status sensors-share-og --no-pager"
```

Optional smoke test on the server:

```bash
curl -s http://127.0.0.1:3080/health
```

The `cache/` directory on the VPS is **not** overwritten by `scp` — disk cache survives deploys.

Replace `SERVER_IP` with your VPS address (e.g. `84.32.186.165`).

### Restart service on the server (SSH)

After `scp`, or after editing the unit / env file:

```bash
sudo systemctl daemon-reload    # only needed after unit file changes, not after server.mjs alone
sudo systemctl restart sensors-share-og
sudo systemctl status sensors-share-og
```

Quick health check:

```bash
curl -s http://127.0.0.1:3080/health   # → ok
```

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

`systemd` keeps `node server.mjs` running on boot, restarts on crash, and injects env vars (`PORT`, `SHARE_URL`, cache purge token, …).

### Cache purge secret (once per server)

```bash
openssl rand -hex 32   # generate token, save it somewhere safe

cat > /etc/sensors-share-og.env <<'EOF'
CACHE_PURGE_TOKEN=PASTE_YOUR_TOKEN_HERE
EOF
chmod 600 /etc/sensors-share-og.env
```

### Install unit file (copy-paste whole block)

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
EnvironmentFile=/etc/sensors-share-og.env
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

Use `which node` if Node is not at `/usr/bin/node` — edit `ExecStart=` accordingly.

To **edit an existing** unit later: `nano /etc/systemd/system/sensors-share-og.service`, then `systemctl daemon-reload && systemctl restart sensors-share-og`.

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

Telegram, Facebook, X (Twitter), and similar crawlers cache link previews. A single
shared URL usually triggers **one** scrape burst; repeat views use the platform cache.

Per bot hit:

| Situation | Roseman | Nominatim |
|-----------|---------|-----------|
| **First** request for this share URL | 1× v2 sensor day | 0–1× (if geo in logs) |
| **Same URL again** (Telegram, then Twitter, …) | **0** — OG meta read from disk | **0** |
| **New URL, known coordinates** | 1× | **0** — geo registry hit |

### Disk cache (indefinite until you purge)

| Store | Path | Key | Typical size |
|-------|------|-----|--------------|
| **OG meta** | `cache/og/{sha256}.json` | `sensor=…&type=…&date=…` | ~0.5 KB / link |
| **Geo registry** | `cache/geo/{lat},{lng}.json` | coords rounded to 4 decimals | ~0.2 KB / point |

10 000 unique share links ≈ **5 MB**. 50 000 geo points ≈ **10 MB** — negligible on a VPS.

Set `CACHE_DIR` to move storage (default: `services/share-og/cache` next to `server.mjs`).

Bot responses use `Cache-Control: public, max-age=604800` (7 days) so crawlers may cache HTML too; the authoritative store is on disk.

### Purge cache on the server

**CLI** (service stopped or from the same `WorkingDirectory`):

```bash
cd /sensors-social-opt/share-og
node server.mjs --purge-cache              # all
node server.mjs --purge-cache --scope=og   # share URLs only
node server.mjs --purge-cache --scope=geo  # address registry only
```

**HTTP** (set `CACHE_PURGE_TOKEN` in systemd, then):

```bash
curl -X POST "https://share.sensors.social/admin/purge-cache?scope=all&token=YOUR_TOKEN"
curl "https://share.sensors.social/admin/cache-stats?token=YOUR_TOKEN"
```

Without `CACHE_PURGE_TOKEN`, admin routes return `401`.

Humans get `302` to sensors.social with **no** upstream API calls.

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
| `CACHE_DIR` | `{share-og}/cache` | Persistent OG + geo registry |
| `CACHE_PURGE_TOKEN` | _(empty)_ | Secret for `/admin/purge-cache` and `/admin/cache-stats` |

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `connection refused` on `:3080` | `systemctl status sensors-share-og` |
| HTTPS fails | DNS, `systemctl status caddy`, port 80/443 open |
| Empty OG title | Sensor id, Roseman reachability: `curl -I https://roseman.robonomics.network/` |
| `curl` from laptop to `127.0.0.1:3080` fails | Expected — test from SSH **on the server** or via HTTPS after Caddy |
