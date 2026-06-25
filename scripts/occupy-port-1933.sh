#!/bin/bash
# Occupy port 1933 with a minimal HTTP server to simulate "port already in use"
# for testing OpenViking's port-conflict handling.
#
# Usage:
#   bash scripts/occupy-port-1933.sh          Start foreground (Ctrl+C to stop)
#   bash scripts/occupy-port-1933.sh &        Start in background
#
# Stop:
#   kill $(lsof -ti:1933)                     Kill whichever process occupies 1933

set -e

PORT=1933

echo "Starting dummy HTTP server on port $PORT..."
echo "This simulates a non-OpenViking process occupying the port."
echo "Press Ctrl+C to stop."
echo ""

python3 -c "
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'Dummy server occupying port $PORT\n')

    def log_message(self, format, *args):
        pass  # suppress noisy request logs

server = HTTPServer(('127.0.0.1', $PORT), Handler)
print(f'Listening on http://127.0.0.1:{$PORT}')
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\nShutting down.')
    server.server_close()
"
