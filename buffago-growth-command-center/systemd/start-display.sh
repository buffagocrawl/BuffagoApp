#!/bin/sh
# Wait for branden's auto-login X11 desktop and its authority cookie, but do
# not keep systemd stuck forever if desktop readiness cannot be detected.
x_ready=false
attempt=1
while [ "$attempt" -le 12 ]; do
    if /usr/bin/xset q >/dev/null 2>&1; then
        x_ready=true
        echo "buffago-growth: X11 display is ready (attempt $attempt/12)"
        break
    fi
    echo "buffago-growth: waiting for X11 display (attempt $attempt/12)"
    sleep 5
    attempt=$((attempt + 1))
done

if [ "$x_ready" = true ]; then
    # _NET_SUPPORTING_WM_CHECK is the standard EWMH indication that a window
    # manager owns the X11 root window. xprop is optional on minimal images.
    if command -v xprop >/dev/null 2>&1; then
        wm_ready=false
        attempt=1
        while [ "$attempt" -le 10 ]; do
            if xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id #'; then
                wm_ready=true
                echo "buffago-growth: X11 window manager is ready (attempt $attempt/10)"
                break
            fi
            echo "buffago-growth: waiting for X11 window manager (attempt $attempt/10)"
            sleep 2
            attempt=$((attempt + 1))
        done
        if [ "$wm_ready" != true ]; then
            echo "buffago-growth: window manager readiness uncertain; launching anyway"
        fi
    else
        echo "buffago-growth: xprop unavailable; skipping window-manager readiness check"
    fi

    /usr/bin/xset s off
    /usr/bin/xset -dpms
    /usr/bin/xset s noblank
else
    echo "buffago-growth: X11 readiness timed out; launching anyway"
fi

exec /usr/bin/python3 /opt/buffago-growth-command-center/app.py
