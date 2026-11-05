#!/usr/bin/env bash
# doppo — установка одной командой (macOS / Linux):
#   curl -fsSL https://raw.githubusercontent.com/kikobin/doppo/main/remote-install.sh | bash
set -euo pipefail

REPO="kikobin/doppo"
BRANCH="${DOPPO_BRANCH:-main}"

# Spicetify мог только что установиться и ещё не попасть в PATH
if ! command -v spicetify >/dev/null 2>&1 && [ -x "$HOME/.spicetify/spicetify" ]; then
  export PATH="$HOME/.spicetify:$PATH"
fi
if ! command -v spicetify >/dev/null 2>&1; then
  echo "Сначала установи Spicetify:"
  echo "  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh"
  echo "Потом перезапусти терминал и выполни эту команду ещё раз."
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Скачиваю doppo…"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$tmp"
bash "$tmp/doppo-$BRANCH/install.sh"
