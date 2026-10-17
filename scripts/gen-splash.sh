#!/usr/bin/env bash
# Builds the iOS launch screens (public/splash/) from the app icon and prints the <link> tags for index.html.
# iOS only shows a launch screen whose size exactly matches the device, so there is one per screen size.
# Needs ImageMagick. Run from the repo root: scripts/gen-splash.sh
set -euo pipefail
src=public/pwa-512.png
out=public/splash
mkdir -p "$out"
# css-width css-height pixel-ratio
devices="
440 956 3
402 874 3
430 932 3
393 852 3
428 926 3
390 844 3
375 812 3
414 896 3
414 896 2
375 667 2
414 736 3
320 568 2
744 1133 2
810 1080 2
820 1180 2
834 1194 2
1024 1366 2
"
echo "$devices" | while read -r w h r; do
  [ -z "$w" ] && continue
  pw=$((w * r)); ph=$((h * r))
  logo=$((pw * 36 / 100)); [ "$logo" -gt 512 ] && logo=512
  f="$out/splash-${pw}x${ph}.png"
  convert -size "${pw}x${ph}" xc:black \( "$src" -resize "${logo}x${logo}" \) -gravity center -composite -strip "$f"
  echo "    <link rel=\"apple-touch-startup-image\" href=\"/splash/splash-${pw}x${ph}.png\" media=\"(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)\" />"
done
