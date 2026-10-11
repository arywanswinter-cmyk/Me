#!/bin/bash
# checkpoint.sh — scan, commit and push sborn/; exits 0 only when origin has HEAD.
# Exports: nothing. Invariants: never prints the key; never force-pushes.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
git add -A sborn
if [ -n "${ELEVENLABS_API_KEY:-}" ] && git grep --cached -qF -- "$ELEVENLABS_API_KEY"; then git reset -q; echo 'BLOCKED: key in staged files'; exit 3; fi
w='spo''re'
if git grep --cached -qiI "$w" -- sborn/ || git ls-files sborn | grep -qi "$w"; then git grep --cached -liI "$w" -- sborn/; echo 'BLOCKED: IP word'; exit 4; fi
if [ -n "$(git status --porcelain --untracked-files=all -- . ':!sborn' ':!prompts/sborn-master-prompt.md')" ]; then echo 'BLOCKED: changes outside sborn/'; exit 5; fi
git diff --cached --quiet || git commit -q -m "$1" || exit 1
br=$(git branch --show-current)
for s in 0 2 4 8 16; do sleep $s; git push -q -u origin HEAD && break; done
[ "$(git rev-parse HEAD)" = "$(git ls-remote origin "refs/heads/$br" | cut -f1)" ] && echo "PUSHED $(git rev-parse --short HEAD)" || { echo 'PUSH NOT CONFIRMED'; exit 6; }
