#!/usr/bin/env python3
import http.server
import socketserver
import webbrowser
import os

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.realpath(__file__)), **kwargs)

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving workshop app at http://localhost:{PORT}")
        print("Press Ctrl+C to stop the server")
        
        # Automatically open browser
        webbrowser.open(f"http://localhost:{PORT}")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
