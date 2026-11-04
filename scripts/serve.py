# The local server, with caching off: python3 scripts/serve.py [port], from the repository root.
# Plain http.server let the browser keep old modules, and a change did not show until a hard
# reload (Robert: "can you just set nocache headers on the local server to make sure it never
# caches?").
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ThreadingHTTPServer(('', port), NoCache).serve_forever()
