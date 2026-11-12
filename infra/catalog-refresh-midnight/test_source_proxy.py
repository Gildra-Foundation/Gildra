import socket
import unittest
from unittest.mock import patch
import source_proxy


class SourceProxyTest(unittest.TestCase):
    def test_only_named_tls_sources(self):
        for value in ['example.com:443', '127.0.0.1:443', 'wago.tools:80',
                      'wago.tools:5432', 'user@wago.tools:443', 'wago.tools.evil:443']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                source_proxy.target(value)

    def test_rejects_private_dns_answers(self):
        for address in ['127.0.0.1', '169.254.169.254', '172.18.0.1', '::1']:
            with patch('socket.getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 443))]):
                with self.assertRaises(ValueError):
                    source_proxy.target('wago.tools:443')

    def test_public_source(self):
        addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('1.1.1.1', 443))]
        with patch('socket.getaddrinfo', return_value=addresses):
            self.assertEqual(source_proxy.target('wago.tools:443'), addresses)
