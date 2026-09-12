#!/bin/sh
# Publish house.local as an mDNS address record for this host.
#
# This box publishes itself as www.local (its avahi host-name) plus an alias
# per site it serves — budget, swiss, octo80 and the rest, each its own unit.
# avahi has no built-in alias mechanism, so each extra name is published as its
# own A record; this is house.local's.
#
# The interface address is DHCP-assigned, so it is resolved at start time rather
# than baked into the unit file — a lease change would otherwise leave
# house.local pointing at an address this host no longer owns.

set -eu

IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"

if [ -z "${IP:-}" ]; then
    echo "avahi-alias: could not determine primary IPv4 address" >&2
    exit 1
fi

echo "avahi-alias: publishing house.local -> $IP"

# -R skips the reverse (PTR) record; the host already owns the reverse mapping
# for this address under www.local, and publishing a second one conflicts.
avahi-publish -a -R house.local "$IP" &
PUBLISHER=$!

trap 'kill "$PUBLISHER" 2>/dev/null; exit 0' INT TERM

# avahi-publish keeps announcing whatever address it was handed, for as long as
# it runs — so resolving at start time only helps if something re-runs us when
# the lease changes. Nothing did: a DHCP move left house.local pointing at the
# old address while this stayed up and healthy. Watch the address instead and
# exit on a change so the unit's Restart=always republishes against the new one.
while kill -0 "$PUBLISHER" 2>/dev/null; do
    sleep 30
    CURRENT="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"
    if [ -n "${CURRENT:-}" ] && [ "$CURRENT" != "$IP" ]; then
        echo "avahi-alias: address changed $IP -> $CURRENT, republishing"
        kill "$PUBLISHER" 2>/dev/null || true
        wait "$PUBLISHER" 2>/dev/null || true
        exit 0
    fi
done

# The publisher exited on its own (name conflict, avahi restart); surface its
# status so systemd restarts us rather than treating the name as published.
wait "$PUBLISHER"
