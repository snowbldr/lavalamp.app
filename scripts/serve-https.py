#!/usr/bin/env python3
# Serve the lamp over https on the LAN, for phones: a browser only offers WebGPU, the motion
# sensors and the wake lock on a secure context, and http://<laptop ip> is not one (Robert:
# "ah damn, my pixel 9 pro got the cpu version"). A self signed certificate is made on first
# run (kept outside the repository); the phone's browser warns once, then Advanced, Proceed.
#   python3 scripts/serve-https.py [port]      default 8443
import http.server, os, pathlib, ssl, subprocess, sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
root = pathlib.Path(__file__).resolve().parent.parent
certdir = pathlib.Path.home() / '.lavalamp-https'
certdir.mkdir(exist_ok=True)
cert, key = certdir / 'cert.pem', certdir / 'key.pem'
if not cert.exists():
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
                    '-subj', '/CN=lavalamp.local', '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
os.chdir(root)
server = http.server.ThreadingHTTPServer(('0.0.0.0', port), http.server.SimpleHTTPRequestHandler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(str(cert), str(key))
server.socket = context.wrap_socket(server.socket, server_side=True)
ip = subprocess.run(['ipconfig', 'getifaddr', 'en0'], capture_output=True, text=True).stdout.strip() or '<laptop ip>'
print(f'lamp at https://{ip}:{port}/  (self signed: accept the warning once)', flush=True)
server.serve_forever()
