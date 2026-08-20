"""No-cache static file server for LAN development.

Plain ``python -m http.server`` sends ``Last-Modified`` but no ``Cache-Control``
header, so mobile Safari applies heuristic caching and keeps serving stale JS/CSS
even after a reload. That makes it look like code edits never reach the phone.

This server behaves exactly like ``http.server`` but adds
``Cache-Control: no-store`` (plus ``Pragma``/``Expires`` for older clients) to
every response, so a reload on the phone always fetches the latest file.

Usage:
    python scripts/lan_server.py <port> [--bind ADDR] [--directory DIR]
"""

import argparse
import contextlib
import functools
import http.server
import os
import sys


class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Force revalidation on every request so the LAN client (iPhone Safari)
        # never serves a cached copy of edited JS/CSS.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="No-cache static file server.")
    parser.add_argument("port", type=int, nargs="?", default=8080)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--directory", default=os.getcwd())
    args = parser.parse_args()

    handler = functools.partial(NoCacheHTTPRequestHandler, directory=args.directory)

    # Mirror http.server's dual-stack behaviour when binding to an IPv6 wildcard.
    server_class = http.server.ThreadingHTTPServer
    if ":" in args.bind:
        server_class.address_family = __import__("socket").AF_INET6

    with server_class((args.bind, args.port), handler) as httpd:
        host, port = httpd.socket.getsockname()[:2]
        print(f"Serving {args.directory} (no-cache) on {host}:{port}")
        with contextlib.suppress(KeyboardInterrupt):
            httpd.serve_forever()


if __name__ == "__main__":
    sys.exit(main())
