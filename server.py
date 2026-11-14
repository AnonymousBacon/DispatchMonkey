#!/usr/bin/env python3
"""Đúng Giờ server: serves static/ and sends / to the Cát Lái driver page.

Run:  python3 server.py   then open http://localhost:8787
"""
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

STATIC = Path(__file__).resolve().parent / "static"
DATA = Path(__file__).resolve().parent / "data"
PORT = int(os.environ.get("PORT", 8787))


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def end_headers(self):
        # No caching: teammates editing JS during the hackathon must see their
        # change on reload, not a stale file.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def translate_path(self, path):
        # /data/... is served from the repo's data/ folder (weather, air quality,
        # tide) so the browser reads the same files the manifest documents.
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/data/"):
            p = (DATA / clean[len("/data/"):]).resolve()
            if DATA.resolve() in p.parents:      # refuse ../ escapes out of data/
                return str(p)
        return super().translate_path(path)

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
