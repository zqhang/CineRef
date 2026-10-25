"""Loopback-only static preview with single HTTP byte-range support for video seeking."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import re

class MediaHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.remaining_bytes = None
        value = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not value or not os.path.isfile(path):
            return super().send_head()
        stream = open(path, "rb")
        stat = os.fstat(stream.fileno())
        size = stat.st_size
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
        try:
            if not match or not any(match.groups()) or size == 0:
                raise ValueError("Invalid range")
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            else:
                length = int(last)
                if length <= 0: raise ValueError("Empty range")
                start, end = max(0, size - length), size - 1
            if start > end or start >= size: raise ValueError("Unsatisfiable range")
        except ValueError:
            stream.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        stream.seek(start)
        self.remaining_bytes = end - start + 1
        self.send_response(206)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(self.remaining_bytes))
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.end_headers()
        return stream

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def copyfile(self, source, outputfile):
        try:
            if self.remaining_bytes is None:
                return super().copyfile(source, outputfile)
            left = self.remaining_bytes
            while left:
                chunk = source.read(min(64 * 1024, left))
                if not chunk: break
                outputfile.write(chunk)
                left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("--port", type=int, default=8767)
    args = parser.parse_args()
    if not os.path.isdir(args.directory): parser.error("Directory does not exist")
    handler = partial(MediaHandler, directory=os.path.abspath(args.directory))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Local media preview: http://127.0.0.1:{args.port}", flush=True)
        server.serve_forever()
