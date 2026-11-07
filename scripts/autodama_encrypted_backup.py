#!/usr/bin/env python3
"""Encrypted, non-interactive backup of AutoDama application tables + referenced documents.

Requires Python 3.11+, cryptography, and THREE GitHub Actions secrets.
No key, token, or plaintext backup is printed or committed. This is an
application-data backup, not a full PostgreSQL/GoTrue configuration dump.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"AUTODAMA-BACKUP-1\x00"
AAD = b"AutoDama encrypted application backup v1"
TABLES = (
    "autodama_workspaces",
    "autodama_members",
    "autodama_states",
    "autodama_history",
    "autodama_owner_private",
    "autodama_change_audit",
)
MAX_BACKUP_SIZE = 600 * 1024 * 1024


def key_from_environment() -> bytes:
    raw = os.environ.get("AUTODAMA_BACKUP_KEY", "")
    try:
        key = base64.b64decode(raw, validate=True)
    except (ValueError, base64.binascii.Error):
        raise ValueError("AUTODAMA_BACKUP_KEY must be a Base64-encoded random 32-byte key") from None
    if len(key) != 32:
        raise ValueError("AUTODAMA_BACKUP_KEY must encode exactly 32 bytes")
    return key


def encrypt(payload: bytes, key: bytes) -> bytes:
    nonce = secrets.token_bytes(12)
    return MAGIC + nonce + AESGCM(key).encrypt(nonce, payload, AAD)


def decrypt(payload: bytes, key: bytes) -> bytes:
    if not payload.startswith(MAGIC) or len(payload) < len(MAGIC) + 28:
        raise ValueError("Not an AutoDama encrypted backup")
    offset = len(MAGIC)
    return AESGCM(key).decrypt(payload[offset : offset + 12], payload[offset + 12 :], AAD)


class SupabaseReader:
    def __init__(self) -> None:
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co"):
            raise ValueError("SUPABASE_URL must be the HTTPS URL of your Supabase project")
        token = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if len(token) < 30:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is missing")
        self.url = url
        self.headers = {
            "apikey": token,
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
        }

    def get(self, endpoint: str, *, binary: bool = False) -> bytes | object:
        req = urllib.request.Request(
            self.url + endpoint, headers=self.headers, method="GET"
        )
        try:
            with urllib.request.urlopen(req, timeout=75) as response:
                result = response.read(MAX_BACKUP_SIZE + 1)
        except urllib.error.HTTPError as error:
            raise RuntimeError(
                f"Supabase HTTP {error.code} during {endpoint.split('?')[0]}"
            ) from None
        if len(result) > MAX_BACKUP_SIZE:
            raise ValueError("One Supabase response exceeded the allowed backup size")
        return result if binary else json.loads(result)

    def table(self, name: str) -> list:
        records = []
        limit = 500
        for page in range(100):
            endpoint = f"/rest/v1/{name}?select=*&limit={limit}&offset={page * limit}"
            portion = self.get(endpoint)
            if not isinstance(portion, list):
                raise ValueError(f"Unexpected table response for {name}")
            records.extend(portion)
            if len(portion) < limit:
                return records
        raise ValueError(f"Too many pages for {name}; increase explicit safety limit")


def referenced_files(tables: dict[str, list]) -> set[str]:
    paths: set[str] = set()
    for table_name in ("autodama_states", "autodama_history"):
        for row in tables[table_name]:
            data = row.get("data") or {}
            for doc in data.get("documents", []):
                storage_path = doc.get("storagePath")
                if storage_path:
                    parts = storage_path.split("/")
                    if (
                        len(parts) != 3
                        or len(parts[0]) != 36
                        or len(parts[1]) != 64
                        or not parts[2].endswith((".pdf", ".jpg", ".png"))
                    ):
                        raise ValueError("Unsafe storage path in the document manifest")
                    paths.add(storage_path)
    return paths


def create_backup(reader: SupabaseReader) -> tuple[bytes, dict]:
    tables = {name: reader.table(name) for name in TABLES}
    files = sorted(referenced_files(tables))
    manifest = {
        "type": "AutoDama application data and referenced documents",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tables": {key: len(rows) for key, rows in tables.items()},
        "referenced_documents": len(files),
        "note": "Not a database schema dump, user authentication backup, or restore command.",
    }
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for name, rows in tables.items():
            zf.writestr(
                f"tables/{name}.json",
                json.dumps(rows, ensure_ascii=False, separators=(",", ":")),
            )
        for name in files:
            endpoint = (
                "/storage/v1/object/authenticated/autodama-documents/"
                + urllib.parse.quote(name, safe="/")
            )
            data = reader.get(endpoint, binary=True)
            zf.writestr("documents/" + name, data)
    payload = raw.getvalue()
    if len(payload) > MAX_BACKUP_SIZE:
        raise ValueError("Backup size exceeded 600 MB")
    return payload, manifest


def self_test() -> None:
    plaintext = b"AutoDama test: " + secrets.token_bytes(24)
    key = secrets.token_bytes(32)
    result = encrypt(plaintext, key)
    assert decrypt(result, key) == plaintext
    try:
        decrypt(result, secrets.token_bytes(32))
    except Exception:
        pass
    else:
        raise AssertionError("Invalid key must be rejected")
    print("Backup encryption self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--decrypt", type=Path, help="Existing .adbackup file to decrypt")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if args.output is None:
        parser.error("--output is required")
    key = key_from_environment()
    if args.decrypt:
        raw = decrypt(args.decrypt.read_bytes(), key)
        # The caller receives a local ZIP, never an automatic write to Supabase.
        args.output.write_bytes(raw)
        print("Backup decrypted locally. Store the ZIP securely.")
        return

    raw, manifest = create_backup(SupabaseReader())
    encrypted = encrypt(raw, key)
    if decrypt(encrypted, key) != raw:
        raise RuntimeError("Post-encryption integrity verification failed")
    args.output.write_bytes(encrypted)
    print(
        "Encrypted backup created: "
        + str(sum(manifest["tables"].values()))
        + " database rows, "
        + str(manifest["referenced_documents"])
        + " referenced documents, SHA-256 "
        + hashlib.sha256(encrypted).hexdigest()[:16]
        + "…"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"AutoDama backup failed ({type(exc).__name__}): {exc}", file=sys.stderr)
        sys.exit(1)
