"""Guard outbound connections for this isolated yt-dlp download process."""
import json
from pathlib import Path
import time
import ipaddress
import re
import socket
import sys
from urllib.parse import urlsplit


def install_network_guard():
    resolve = socket.getaddrinfo
    domains = ("youtube.com", "googlevideo.com", "ytimg.com", "youtubei.googleapis.com")

    def allowed_host(host):
        host = (host or "").lower().rstrip(".")
        return any(host == d or host.endswith("." + d) for d in domains)

    def allowed_address(address):
        ip = ipaddress.ip_address(address)
        return ip.version == 4 and ip.is_global and not ip.is_multicast and not ip.is_reserved

    def lookup(host, port, *args, **kwargs):
        host = host.lower().rstrip(".")
        if port not in (443, "443") or not allowed_host(host):
            raise OSError("Unsupported download destination")
        # Return only validated numeric IPv4 endpoints, including after redirects.
        records = [r for r in resolve(host, port, *args, **kwargs) if r[0] == socket.AF_INET]
        if not records or not all(allowed_address(r[4][0]) for r in records):
            raise OSError("Non-public download destination")
        return records

    def guard(event, args):
        # OpenerDirector emits this event again for every followed redirect.
        if event == "urllib.Request":
            url = urlsplit(args[0])
            if (url.scheme != "https" or url.port not in (None, 443)
                    or url.username is not None or url.password is not None or not allowed_host(url.hostname)):
                raise OSError("Unsupported download URL or redirect")
        if event == "socket.connect":
            _, address = args
            if not isinstance(address, tuple) or address[1] != 443 or not allowed_address(address[0]):
                raise OSError("Non-public download connection")

    socket.getaddrinfo = lookup
    sys.addaudithook(guard)


if __name__ == "__main__":
    from app.youtube_splitter import download_youtube_video
    video_id, output, progress_file = sys.argv[1:]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("Invalid YouTube video ID")
    install_network_guard()
    progress = Path(progress_file)
    last_write = 0.0

    def update(pct, track):
        global last_write
        if time.monotonic() - last_write >= 0.5 or pct == 100:
            pending = Path(output).parent / "progress.tmp"
            pending.write_text(json.dumps({"progress": min(100, pct), "track": track}))
            pending.replace(progress)
            last_write = time.monotonic()

    download_youtube_video("https://www.youtube.com/watch?v=" + video_id, output, clip_source=True, progress_callback=update)
