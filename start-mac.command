#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 18+ is required: https://nodejs.org"; read -r; exit 1; }
node server.js --open
