#!/usr/bin/env bash
# Taps on-screen text on the emulator, one label after another (used by the crash check).
for label in "$@"; do
  sleep 4
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  bounds=$(adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -F "text=\"$label\"" | head -1 | sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p')
  if [ -z "$bounds" ]; then adb shell log -t HisaabCheck "[tap] not found: $label"; continue; fi
  read -r x1 y1 x2 y2 <<< "$bounds"
  adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
  adb shell log -t HisaabCheck "[tap] $label"
done
