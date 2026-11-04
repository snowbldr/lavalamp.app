# The local server, with caching off: python3 scripts/serve.py [port], from the repository root.
# Plain http.server let the browser keep old modules, and a change did not show until a hard
# reload (Robert: "can you just set nocache headers on the local server to make sure it never
# caches?").
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def taken(port):
    # Python's http.server sets SO_REUSEADDR, and on macOS an IPv4 and an IPv6 server can hold the
    # same port side by side, localhost reaching one or the other (Robert: "python allows multiple
    # listeners by default. stupid default"). Refuse when anything answers on either.
    import socket
    for family, host in ((socket.AF_INET, '127.0.0.1'), (socket.AF_INET6, '::1')):
        try:
            with socket.socket(family, socket.SOCK_STREAM) as probe:
                probe.settimeout(0.3)
                if probe.connect_ex((host, port)) == 0:
                    return True
        except OSError:
            pass
    return False



class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
if taken(port):
    sys.exit(f'port {port} is already served; stop that server first (lsof -nP -iTCP:{port})')
ThreadingHTTPServer.allow_reuse_port = False
ThreadingHTTPServer(('', port), NoCache).serve_forever()
