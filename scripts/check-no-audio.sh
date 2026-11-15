#!/bin/sh
# Rule 8 guard (CLAUDE.md): no song audio and no .env files tracked in git.
# Runs in CI on every pull request, and locally: sh scripts/check-no-audio.sh
set -eu
found=$(git ls-files | grep -Ei '\.(mp3|wav|flac|m4a|aac|ogg|oga|opus|webm|aiff?)$' || true)
envs=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' || true)
if [ -n "$found" ] || [ -n "$envs" ]; then
  [ -n "$found" ] && printf 'Audio files are tracked (rule 8):\n%s\n' "$found"
  [ -n "$envs" ] && printf '.env files are tracked (keys belong outside git):\n%s\n' "$envs"
  exit 1
fi
echo "Rule 8: no audio or .env files tracked."
