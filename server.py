#!/usr/bin/env python3
"""Đúng Giờ server: serves static/ and sends / to the Cát Lái driver page.

Run:  python3 server.py   then open http://localhost:8787
"""
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = ROOT / "data"
PORT = int(os.environ.get("PORT", 8787))


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def translate_path(self, path):
        # /data/... is served from the repo's data/ folder (downloaded datasets).
        # super() has already normalised the path and dropped any '..' parts.
        p = Path(super().translate_path(path))
        try:
            return str(DATA / p.relative_to(STATIC / "data"))
        except ValueError:
            return str(p)

    def end_headers(self):
        # No caching: teammates editing JS during the hackathon must see their
        # change on reload, not a stale file.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/vn/")
            self.end_headers()
            return
        super().do_GET()


if __name__ == "__main__":
    print(f"Đúng Giờ on http://localhost:{PORT}")
    # 0.0.0.0 so teammates on the same network can open it.
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
