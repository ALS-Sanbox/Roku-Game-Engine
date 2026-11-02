#!/usr/bin/env bash
set -eu

# Resolve the repository beside this script, regardless of where it is launched.
REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$REPO_DIR"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo 'ERROR: This folder is not a Git repository.'
  exit 1
fi
branch=$(git branch --show-current)
if [[ -z "$branch" ]]; then
  echo 'ERROR: Detached HEAD; checkout a branch before pushing.'
  exit 1
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo 'ERROR: No origin remote configured.'
  exit 1
fi
if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
  echo 'ERROR: Resolve merge conflicts before updating GitHub.'
  exit 1
fi
printf '\nRepository: %s\nBranch: %s\n\n' "$REPO_DIR" "$branch"
git status --short
if ! git add -A; then
  echo 'ERROR: Could not stage files.'
  exit 1
fi
if ! git diff --cached --quiet; then
  message="${1:-Roku visual editor update $(date '+%Y-%m-%d %H:%M:%S')}"
  if ! git commit -m "$message"; then
    echo 'ERROR: Commit failed. Check your Git name/email and any commit hooks.'
    exit 1
  fi
else
  echo 'No local changes to commit.'
fi
printf '\nPushing branch %s to origin...\n' "$branch"
if git push -u origin "$branch"; then
  echo 'SUCCESS: GitHub push completed.'
else
  echo 'ERROR: GitHub push failed. Check authentication and review remote changes before retrying.'
  echo 'Your local commits are preserved. This script does not force-push or reset your work.'
  exit 1
fi
