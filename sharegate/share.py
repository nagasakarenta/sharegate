"""One click "Share": mask -> pick format -> write in the author's voice -> re-check -> publish."""

from __future__ import annotations

import json
import time

from . import db, formatter, gate, knowledge, voice
from .importers import transcript


class Blocked(Exception):
    pass


def share(conv_id: str, user_decision: str | None = None, fmt_override: str | None = None,
          progress=None) -> dict:
    """Mask -> format -> write -> re-check -> publish. `progress(step)` is called as each step starts."""
    note = progress or (lambda step: None)
    conv = db.conversation(conv_id)
    if not conv:
        raise KeyError(conv_id)
    v = db.verdict(conv_id) or {**gate.run(conv_id)}
    decision = user_decision or v["decision"]
    if user_decision and user_decision != v["decision"]:
        db.execute("INSERT OR REPLACE INTO overrides VALUES (?,?,?,?,?)",
                   (conv_id, conv["owner"], v["decision"], user_decision, time.time()))
    if decision == "private":
        raise Blocked("Kept private.")

    note("mask")
    masked = gate.apply_redactions(conv["messages"], v["redactions"] if decision == "redact" else [])
    note("format")
    choice = formatter.decide(conv, masked)
    fmt = fmt_override or choice["format"]
    note("write")
    art = formatter.render(conv, masked, fmt, choice["title"])
    note("recheck")
    check = gate.recheck(art["text"], v["redactions"])
    if not check["ok"]:
        raise Blocked("The generated document failed the re-check: " + "; ".join(check["problems"]))

    note("publish")
    tags = knowledge.topics(transcript(masked, 20000))
    db.execute("INSERT OR REPLACE INTO shares VALUES (?,?,?,?,?,?,?,?,?)",
               (conv_id, conv["owner"], choice["title"], fmt, choice.get("why", ""), art["path"],
                json.dumps(tags), json.dumps(check), time.time()))
    # A new shared chat can add example lines to the voice; refresh it off the critical path.
    import threading
    threading.Thread(target=_refresh_voice, args=(conv["owner"],), daemon=True).start()
    return {"conv_id": conv_id, "format": fmt, "title": choice["title"], "why": choice.get("why", ""),
            "artifact": art["path"], "topics": tags, "recheck": check}


def _refresh_voice(owner: str) -> None:
    try:
        voice.build(owner)
    except Exception:  # noqa: BLE001 - the document is already published; a stale style hint is fine
        pass


def unshare(conv_id: str) -> None:
    db.execute("DELETE FROM shares WHERE conv_id=?", (conv_id,))
