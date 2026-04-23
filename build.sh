#!/bin/bash
mkdir -p dist
cp index.html styles.css app.js favicon.svg dist/
cat > dist/config.js << EOF
window.SUPABASE_URL      = '${SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';
EOF
