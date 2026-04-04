#!/usr/bin/env python3
"""
Tiny local HTTP server for Dungeon Gleaner development.
Bypasses file:// CORS restrictions so audio, JSON fetches, etc. all work.

Usage:
    python3 serve.py          # serves on http://localhost:8080
    python3 serve.py 9000     # serves on http://localhost:9000

Then open http://localhost:8080 in your browser.
"""
import http.server
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# Serve from the directory this script lives in
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    """Adds CORS headers and correct MIME types for game assets."""

    # Extend MIME map for game assets
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.webm': 'audio/webm',
        '.opus': 'audio/opus',
        '.ogg': 'audio/ogg',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.json': 'application/json',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.wasm': 'application/wasm',
    }

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Quieter logging — only errors
        if args and '404' in str(args[1] if len(args) > 1 else ''):
            super().log_message(fmt, *args)

print(f'Dungeon Gleaner dev server → http://localhost:{PORT}')
print('Press Ctrl+C to stop.\n')
http.server.HTTPServer(('', PORT), CORSHandler).serve_forever()
