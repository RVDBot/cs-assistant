#!/bin/sh
set -e
# Fix ownership on mounted volumes (host dirs may be owned by root)
chown -R nextjs:nodejs /app/data /app/knowledge 2>/dev/null || true
exec su-exec nextjs node server.js
