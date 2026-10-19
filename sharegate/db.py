"""SQLite storage. One file, created on first use."""

from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
  created_at REAL NOT NULL, source TEXT NOT NULL, messages TEXT NOT NULL,
  gold TEXT
);
CREATE TABLE IF NOT EXISTS verdicts (
  conv_id TEXT PRIMARY KEY, decision TEXT NOT NULL, categories TEXT NOT NULL,
  reason TEXT NOT NULL, redactions TEXT NOT NULL, engine TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  conv_id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL,
  format_reason TEXT NOT NULL, artifact TEXT NOT NULL, topics TEXT NOT NULL,
  recheck TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS votes (
  conv_id TEXT NOT NULL, voter TEXT NOT NULL, value INTEGER NOT NULL,
  PRIMARY KEY (conv_id, voter)
);
CREATE TABLE IF NOT EXISTS overrides (
  conv_id TEXT PRIMARY KEY, owner TEXT NOT NULL, ai_decision TEXT NOT NULL,
  user_decision TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS voices (
  owner TEXT PRIMARY KEY, profile TEXT NOT NULL, examples TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tier TEXT, model TEXT, prompt_tokens INTEGER,
  completion_tokens INTEGER, seconds REAL, ts REAL
);
"""


@contextmanager
def conn():
    c = sqlite3.connect(settings.db_path)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    with conn() as c:
        c.executescript(SCHEMA)


def rows(sql: str, args: tuple = ()) -> list[dict]:
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def one(sql: str, args: tuple = ()) -> dict | None:
    r = rows(sql, args)
    return r[0] if r else None


def execute(sql: str, args: tuple = ()) -> None:
    with conn() as c:
        c.execute(sql, args)


def log_usage(tier: str, model: str, pt: int, ct: int, seconds: float) -> None:
    execute("INSERT INTO usage (tier, model, prompt_tokens, completion_tokens, seconds, ts)"
            " VALUES (?,?,?,?,?,?)", (tier, model, pt, ct, seconds, time.time()))


def conversation(conv_id: str) -> dict | None:
    r = one("SELECT * FROM conversations WHERE id=?", (conv_id,))
    if r:
        r["messages"] = json.loads(r["messages"])
        r["gold"] = json.loads(r["gold"]) if r["gold"] else None
    return r


def verdict(conv_id: str) -> dict | None:
    r = one("SELECT * FROM verdicts WHERE conv_id=?", (conv_id,))
    if r:
        r["categories"] = json.loads(r["categories"])
        r["redactions"] = json.loads(r["redactions"])
    return r
