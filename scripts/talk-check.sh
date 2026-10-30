#!/bin/bash
# Claude Code hooks for the talk record. Two modes:
#   stop   (Stop hook)         nag when lamp code changed but docs/decisions.md did not,
#                              and point out commits since the last checkpoint tag
#   start  (SessionStart hook) hand the session the last checkpoint and the last log entry
# Prints hook JSON on stdout. Never fails the hook: every path exits 0.
cd "$(dirname "$0")/.." || exit 0
mode="${1:-stop}"
input="$(cat)"
json() { printf '%s' "$1" | jq -Rs .; }

last_tag="$(git describe --tags --match 'checkpoint-*' --abbrev=0 2>/dev/null)"

if [ "$mode" = "start" ]; then
  entry="$(awk '/^## /{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}' docs/decisions.md 2>/dev/null | head -40)"
  ctx="This project is also the material for a talk about directing AI as the engineer. Keep docs/decisions.md current and tag checkpoints; see CLAUDE.md. Last checkpoint tag: ${last_tag:-none}. Most recent decision log entry:
$entry"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' "$(json "$ctx")"
  exit 0
fi

code_changed="$(git status --porcelain -- src index.html experiments 2>/dev/null)"
log_changed="$(git status --porcelain -- docs/decisions.md 2>/dev/null)"
already_nagged="$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)"

block=""
note=""
if [ -n "$code_changed" ] && [ -z "$log_changed" ]; then
  block="The lamp code has uncommitted changes but docs/decisions.md has no new entry. Before stopping, record what was seen, what was proposed, what Robert decided and why, and drop a screenshot in docs/checkpoints if the look changed. If nothing worth recording happened, add a one line entry saying so."
fi
if [ -n "$last_tag" ]; then
  n="$(git rev-list --count "$last_tag"..HEAD -- src index.html 2>/dev/null)"
  if [ "${n:-0}" -gt 0 ]; then
    note="$n commit(s) since $last_tag touch the lamp. If it looks or moves differently now, tag a checkpoint (checkpoint-NN-slug, annotated) and save a before/after screenshot in docs/checkpoints."
  fi
fi

if [ -n "$block" ] && [ "$already_nagged" != "true" ]; then
  printf '{"decision":"block","reason":%s}\n' "$(json "$block${note:+ Also: $note}")"
elif [ -n "$block$note" ]; then
  printf '{"systemMessage":%s}\n' "$(json "${block:+$block }$note")"
fi
exit 0
