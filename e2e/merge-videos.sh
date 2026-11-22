#!/usr/bin/env bash
# Joins every Playwright test video in test-results/ into one MP4 with one chapter per test.
# Usage: e2e/merge-videos.sh [output.mp4]   (default: recordings/e2e-run.mp4)
set -euo pipefail
cd "$(dirname "$0")/.."

out="${1:-recordings/e2e-run.mp4}"
mkdir -p "$(dirname "$out")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

videos=()
while IFS= read -r f; do videos+=("$f"); done < <(find test-results -name '*.webm' | sed 's/video.webm$/video-0.webm/' | sort | sed 's/video-0.webm$/video.webm/')
[ ${#videos[@]} -gt 0 ] || { echo "no videos in test-results/; run npm run test:e2e first" >&2; exit 1; }

inputs=()
filters=""
concat=""
meta=";FFMETADATA1"$'\n'
start=0
for i in "${!videos[@]}"; do
  f="${videos[$i]}"
  inputs+=(-i "$f")
  filters+="[$i:v]fps=25,scale=800:450:force_original_aspect_ratio=decrease,pad=800:450:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[v$i];"
  concat+="[v$i]"
  ms=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | awk '{printf "%d", $1 * 1000}')
  title=$(basename "$(dirname "$f")" | sed -e 's/-chromium$//' -e 's/-/ /g')
  [ "$(basename "$f")" = video.webm ] || title="$title (new tab)"
  meta+=$'[CHAPTER]\nTIMEBASE=1/1000\n'"START=$start"$'\n'"END=$((start + ms))"$'\n'"title=$title"$'\n'
  start=$((start + ms))
done
printf '%s' "$meta" > "$work/chapters.txt"

ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -i "$work/chapters.txt" \
  -filter_complex "${filters}${concat}concat=n=${#videos[@]}:v=1:a=0[out]" \
  -map "[out]" -map_metadata "${#videos[@]}" -map_chapters "${#videos[@]}" \
  -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart "$out"

echo "$out: ${#videos[@]} clips, $((start / 1000))s"
