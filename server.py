"""
HTTPS server for XPath Recorder & Finder bookmarklets.
Serves files over HTTPS so they work on Salesforce (HTTPS) pages.

Usage:
    cd /path/to/this/folder
    python3 server.py

First run generates a self-signed cert (cert.pem, key.pem).
Open https://localhost:8765 in Chrome once and click "Advanced > Proceed" to trust it.
After that, bookmarklets will load from https://localhost:8765.
"""
import http.server
import ssl
import os
import subprocess
import sys

PORT = 8765
CERT = "cert.pem"
KEY = "key.pem"

if not os.path.exists(CERT) or not os.path.exists(KEY):
    print("Generating self-signed certificate...")
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048",
        "-keyout", KEY, "-out", CERT,
        "-days", "365", "-nodes",
        "-subj", "/CN=localhost"
    ], check=True)
    print("Certificate generated: cert.pem, key.pem")

handler = http.server.SimpleHTTPRequestHandler
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT, KEY)

server = http.server.HTTPServer(("localhost", PORT), handler)
server.socket = ctx.wrap_socket(server.socket, server_side=True)

print(f"""
============================================
  HTTPS Server running on port {PORT}
============================================

  1. Open https://localhost:{PORT} in Chrome
  2. Click "Advanced" > "Proceed to localhost"
  3. You should see the file listing
  4. Now bookmarklets will work on Salesforce

  Bookmark URLs (use https):
  - Finder:   javascript:(function(){{if(window.__xf)return;var s=document.createElement('script');s.src='https://localhost:{PORT}/xpath-finder.js';document.body.appendChild(s);}})()
  - Recorder: javascript:(function(){{if(window.__xpathRecorderActive)return;var s=document.createElement('script');s.src='https://localhost:{PORT}/xpath-recorder.js';document.body.appendChild(s);}})();

  Press Ctrl+C to stop.
============================================
""")

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
    server.server_close()
