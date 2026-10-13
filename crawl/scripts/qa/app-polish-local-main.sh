#!/bin/sh
# Restart only the extra gateway process in the isolated acceptance container.
for p in /proc/[0-9]*/cmdline; do
  command=$(tr '\000' ' ' < "$p" 2>/dev/null)
  case "$command" in
    "edge-runtime start --port 8082"*)
      pid=${p#/proc/}; pid=${pid%/cmdline}; kill "$pid" 2>/dev/null ;;
  esac
done
exec edge-runtime start --port 8082 --main-service /tmp/polish-main > /tmp/polish-main.log 2>&1
