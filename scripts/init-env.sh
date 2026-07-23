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

upload_password=$(openssl rand -hex 12)
session_secret=$(openssl rand -hex 32)
cookie_secure=false
case "$1" in
  https://*) cookie_secure=true ;;
esac

umask 077
{
  printf 'PUBLIC_BASE_URL=%s\n' "$1"
  printf 'UPLOAD_PASSWORD=%s\n' "$upload_password"
  printf 'SESSION_SECRET=%s\n' "$session_secret"
  printf 'COOKIE_SECURE=%s\n' "$cookie_secure"
  printf 'MAX_FILE_SIZE_MB=256\n'
  printf 'MAX_FILES_PER_UPLOAD=10\n'
  printf 'SESSION_TTL_MS=604800000\n'
} > .env

mkdir -p data/files data/meta
chmod 700 data data/files data/meta

printf 'QuickDrop environment created.\n'
printf 'Upload password: %s\n' "$upload_password"
