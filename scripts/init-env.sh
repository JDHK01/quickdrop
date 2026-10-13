#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <public-base-url>\n' "$0" >&2
  exit 2
fi

case "$1" in
  http://* | https://*) ;;
  *)
    printf 'Public base URL must start with http:// or https://\n' >&2
    exit 2
    ;;
esac

if [ -e .env ]; then
  printf '.env already exists; no changes made.\n' >&2
  exit 1
fi

umask 077
{
  printf 'PUBLIC_BASE_URL=%s\n' "$1"
  printf 'MAX_FILES_PER_UPLOAD=10\n'
  printf 'MAX_PREVIEW_CHARS=65536\n'
} > .env

mkdir -p data/files data/meta
chmod 700 data data/files data/meta

printf 'QuickDrop environment created.\n'
