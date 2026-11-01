"""Local, bounded evidence. Never persist API keys, DSNs or hidden model reasoning."""

import json
import sqlite3
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4


def json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (UUID, bytes)):
        return str(value) if isinstance(value, UUID) else value.hex()
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def json_safe(value):
    return json.loads(json.dumps(value, default=json_default, allow_nan=False))


class EvidenceStore:
    def __init__(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)
        self.path = directory / "runs.sqlite"
        with self._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY, agent TEXT, created_at TEXT, payload TEXT NOT NULL)""")
        self.path.chmod(0o600)

    def _connect(self):
        return sqlite3.connect(self.path)

    def save(self, payload: dict) -> str:
        run_id = payload.get("run_id") or uuid4().hex
        payload = json_safe({**payload, "run_id": run_id})
        with self._connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO runs VALUES (?, ?, ?, ?)",
                (
                    run_id,
                    payload["agent"],
                    datetime.now(timezone.utc).isoformat(),
                    json.dumps(payload, ensure_ascii=False),
                ),
            )
        return run_id

    def load(self, run_id: str) -> dict:
        with self._connect() as db:
            row = db.execute("SELECT payload FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            raise ValueError("Run not found.")
        return json.loads(row[0])

    def list(self) -> list[dict]:
        with self._connect() as db:
            return [
                dict(zip(("run_id", "agent", "created_at"), row, strict=True))
                for row in db.execute(
                    "SELECT id, agent, created_at FROM runs ORDER BY rowid DESC LIMIT 100"
                )
            ]
