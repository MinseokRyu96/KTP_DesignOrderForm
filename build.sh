#!/bin/bash
set -e

echo "=== Build Start ==="
echo "SUPABASE_URL set: ${SUPABASE_URL:+YES}"
echo "SUPABASE_ANON_KEY set: ${SUPABASE_ANON_KEY:+YES}"

mkdir -p dist
cp index.html styles.css app.js favicon.svg dist/

echo "window.SUPABASE_URL      = '${SUPABASE_URL}';"      > dist/config.js
echo "window.SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';" >> dist/config.js

echo "=== dist/config.js ==="
cat dist/config.js
echo "=== Build Done ==="
