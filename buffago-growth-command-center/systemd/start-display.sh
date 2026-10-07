#!/bin/sh
# Wait for branden's auto-login X11 desktop and its authority cookie.
while ! /usr/bin/xset q >/dev/null 2>&1; do
    sleep 5
done
/usr/bin/xset s off
/usr/bin/xset -dpms
/usr/bin/xset s noblank
exec /usr/bin/python3 /opt/buffago-growth-command-center/app.py
