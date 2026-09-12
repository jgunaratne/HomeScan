#!/bin/bash
# Install the walkthrough as a system service reachable at http://house.local
#
#   sudo webviewer/deploy/install.sh
#
# Idempotent — safe to re-run after editing any of the files beside it. Touches
# nothing belonging to the other sites on this box. What it installs:
#
#   house.service              serve.mjs on 127.0.0.1:3010
#   avahi-alias-house.service  publishes house.local for this host's address
#   nginx: house               http://house.local -> :3010
#
# Ports 3000–3009 and 8000 belong to the other sites; 3010 is this one's.

set -euo pipefail

REPO="/mnt/usbdrive/HomeScan"
DEPLOY="$REPO/webviewer/deploy"
PORT=3010

if [ "$(id -u)" -ne 0 ]; then
    echo "Run with sudo: sudo webviewer/deploy/install.sh" >&2
    exit 1
fi
cd "$REPO"

echo "==> Checking port $PORT is free"
if ss -ltn "sport = :$PORT" | grep -q ":$PORT"; then
    if systemctl is-active --quiet house.service; then
        echo "    $PORT held by house.service (will be restarted)"
    else
        echo "    port $PORT is in use by something else — resolve before installing" >&2
        ss -ltnp "sport = :$PORT" >&2
        exit 1
    fi
else
    echo "    $PORT free"
fi

echo "==> Installing nginx vhost for house.local"
install -m 644 "$DEPLOY/nginx-house.conf" /etc/nginx/sites-available/house
ln -sfn /etc/nginx/sites-available/house /etc/nginx/sites-enabled/house
nginx -t
systemctl reload nginx

echo "==> Installing systemd units"
chmod +x "$DEPLOY/avahi-alias-house.sh"
install -m 644 "$DEPLOY/house.service"             /etc/systemd/system/
install -m 644 "$DEPLOY/avahi-alias-house.service" /etc/systemd/system/
systemctl daemon-reload

echo "==> Enabling and starting services"
systemctl enable --now avahi-alias-house.service
systemctl restart house.service 2>/dev/null || true
systemctl enable --now house.service

sleep 3

echo
echo "==> Status"
for svc in avahi-alias-house house; do
    printf '    %-24s %s\n' "$svc" "$(systemctl is-active $svc.service)"
done

echo
echo "==> Reachability"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || echo "000")
echo "    127.0.0.1:$PORT          -> HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' --resolve house.local:80:127.0.0.1 http://house.local/ || echo "000")
echo "    http://house.local      -> HTTP $code"
echo "    mDNS: $(avahi-resolve -n house.local 2>&1 | head -1)"

echo
echo "Done. Open http://house.local from any device on the LAN."
