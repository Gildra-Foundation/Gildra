#!/usr/bin/env python3
"""Restricted TLS CONNECT relay for native stand importers. Never decrypts TLS.
No production network attachment, listener installation, credentials, or URL logs.
"""
import argparse
import ipaddress
import select
import socket
import socketserver
import threading

ALLOWED = frozenset({'wago.tools', 'www.raidbots.com', 'oauth.battle.net',
    'us.api.blizzard.com', 'eu.api.blizzard.com', 'github.com',
    'release-assets.githubusercontent.com', 'objects.githubusercontent.com',
    'raw.githubusercontent.com'})
SLOTS = threading.BoundedSemaphore(64)


def target(authority):
    host, sep, port = authority.rpartition(':')
    if not sep or port != '443' or host not in ALLOWED:
        raise ValueError('source not allowed')
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('nonpublic source address')
    return addresses


class Relay(socketserver.StreamRequestHandler):
    def handle(self):
        if ipaddress.ip_address(self.client_address[0]) not in self.server.allowed_clients:
            self.wfile.write(b'HTTP/1.1 403 Client Denied\r\n\r\n')
            return
        if not SLOTS.acquire(blocking=False):
            self.wfile.write(b'HTTP/1.1 503 Busy\r\n\r\n')
            return
        try:
            self.connection.settimeout(15)
            line = self.rfile.readline(4096).decode('ascii').strip().split()
            if len(line) != 3 or line[0] != 'CONNECT':
                raise ValueError('CONNECT required')
            addresses = target(line[1])
            size = 0
            while True:
                header = self.rfile.readline(4096)
                size += len(header)
                if not header or size > 16384:
                    raise ValueError('invalid headers')
                if header == b'\r\n':
                    break
            upstream = None
            for family, kind, protocol, _, address in addresses:
                candidate = socket.socket(family, kind, protocol)
                candidate.settimeout(15)
                try:
                    candidate.connect(address)
                    upstream = candidate
                    break
                except OSError:
                    candidate.close()
            if upstream is None:
                raise OSError('source connection failed')
            with upstream:
                self.wfile.write(b'HTTP/1.1 200 Connection Established\r\n\r\n')
                self.wfile.flush()
                self.connection.settimeout(30)
                upstream.settimeout(30)
                while True:
                    ready, _, _ = select.select([self.connection, upstream], [], [], 900)
                    if not ready:
                        return
                    for src in ready:
                        data = src.recv(65536)
                        if not data:
                            return
                        dst = upstream if src is self.connection else self.connection
                        dst.sendall(data)
        except (ValueError, OSError, UnicodeError):
            try:
                self.wfile.write(b'HTTP/1.1 403 Source Denied\r\n\r\n')
            except OSError:
                pass
        finally:
            SLOTS.release()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=58089)
    parser.add_argument('--listen', default='127.0.0.1')
    parser.add_argument('--allow-client-cidr', default='127.0.0.0/8')
    args = parser.parse_args()
    listen = ipaddress.ip_address(args.listen)
    if not listen.is_private or listen.is_unspecified:
        parser.error('bind only an explicit loopback or isolated bridge address')
    with Server((str(listen), args.port), Relay) as server:
        server.allowed_clients = ipaddress.ip_network(args.allow_client_cidr)
        server.serve_forever()
