"""Run with python -m unittest discover -s tests in the python-ai directory."""
import socket
import sys
import unittest
from unittest.mock import patch

from app.clip_download import install_network_guard


class DownloadGuardTests(unittest.TestCase):
    def setUp(self):
        self.answer = "93.184.216.34"

        def resolve(*args):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (self.answer, 443))]

        # Capture the audit callback without altering the rest of the test process.
        self.lookup = patch.object(socket, "getaddrinfo", resolve)
        self.lookup.start()
        self.addCleanup(self.lookup.stop)
        with patch.object(sys, "addaudithook") as hook:
            install_network_guard()
        self.guard = hook.call_args.args[0]

    def test_allowed_media_connection_uses_validated_address(self):
        records = socket.getaddrinfo("r1.googlevideo.com", 443)
        self.guard("socket.connect", (None, records[0][4]))
        self.assertEqual(records[0][4][0], self.answer)

    def test_redirects_require_https_and_a_supported_hostname(self):
        for dest in ("http://youtube.com/watch", "https://localhost/media",
                     "https://youtube.com.example.org/video", "https://user@youtube.com/video",
                     "https://youtube.com:8443/video"):
            with self.subTest(dest=dest), self.assertRaises(OSError):
                self.guard("urllib.Request", (dest,))
        self.guard("urllib.Request", ("https://r1.googlevideo.com/videoplayback",))

    def test_private_dns_results_and_connection_destinations_are_rejected(self):
        for address in ("127.0.0.1", "10.1.1.1", "169.254.1.2", "192.168.1.1", "100.64.0.1", "224.0.0.1"):
            self.answer = address
            with self.subTest(ip=address):
                with self.assertRaises(OSError):
                    socket.getaddrinfo("www.youtube.com", 443)
                with self.assertRaises(OSError):
                    self.guard("socket.connect", (None, (address, 443)))
