"""Occupy port 1933 with a minimal HTTP server to simulate "port already in use"
for testing OpenViking's port-conflict handling.

Usage:
    python scripts/occupy-port-1933.py          Start foreground (Ctrl+C to stop)
    start python scripts/occupy-port-1933.py    Start in background (Windows)

Stop:
    Find the PID:  netstat -ano | findstr :1933
    Kill it:       taskkill /PID <PID> /F
"""

import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 1933


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(f"Dummy server occupying port {PORT}\n".encode())

    def log_message(self, format, *args):
        pass  # suppress noisy request logs


def main():
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Dummy HTTP server running on http://127.0.0.1:{PORT}")
    print("This simulates a non-OpenViking process occupying the port.")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
