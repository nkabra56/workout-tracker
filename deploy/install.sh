#!/usr/bin/env bash
# Install or update an independent personal instance after reviewing this script.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run as root with APP_ORIGIN and NODE_BINARY set.' >&2; exit 1; }
: "${APP_ORIGIN:?Set the exact private HTTPS origin}"
case "$APP_ORIGIN" in https://*) ;; *) echo 'HTTPS origin required' >&2; exit 1;; esac
node_binary="${NODE_BINARY:-$(command -v node)}"
node_binary="$(readlink -f "$node_binary")"
"$node_binary" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
source_dir="$(cd "$(dirname "$0")/.." && pwd)"
id steadily >/dev/null 2>&1 || useradd --system --home /var/lib/steadily --shell /usr/sbin/nologin steadily
install -d -m 0755 /opt/steadily
install -d -o steadily -g steadily -m 0700 /var/lib/steadily
for file in index.html app.js core.js storage.js style.css sw.js icon.svg manifest.webmanifest server.mjs sync-server.mjs; do install -m 0644 "$source_dir/$file" /opt/steadily/; done
if [ ! -e /etc/steadily.env ]; then
 umask 077
 token="$("$node_binary" -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
 printf 'HOST=127.0.0.1\nPORT=5173\nDATA_DIR=/var/lib/steadily\nAPP_ORIGIN=%s\nSYNC_TOKEN=%s\n' "$APP_ORIGIN" "$token" > /etc/steadily.env
 unset token
fi
sed "s@/usr/bin/node@$node_binary@" "$source_dir/deploy/steadily.service" > /etc/systemd/system/steadily.service
systemctl daemon-reload
systemctl enable steadily
systemctl restart steadily
printf 'Service installed on loopback. Inspect Tailscale Serve routes before enabling private HTTPS.\n'
