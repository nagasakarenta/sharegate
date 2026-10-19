"""The gate: decide whether a chat can be shared, shared with redactions, or kept private.

Runs on Nemotron Nano for every conversation. It errs on the side of "private": a leak
costs more than one extra click. The owner always has the final say, and their past
overrides are fed back in so the gate learns their personal line.
"""

from __future__ import annotations

import json
import time

from . import db, llm, mock
from .config import settings
from .importers import transcript

CATEGORIES = [
    "personal_data",        # phone numbers, home address, ID numbers, private emails
    "client_or_money",      # named clients, deal sizes, unreleased revenue, prices under NDA
    "hr_evaluation",        # performance reviews, salaries, hiring/firing of named people
    "negative_about_person",# complaints or judgements about a named colleague
    "private_life",         # health, family, relationships
    "unannounced_plan",     # layoffs, pivots, fundraising not yet told to the team
    "credentials",          # passwords, API keys, tokens
]

SYSTEM = f"""You are the privacy gate for a team knowledge tool. A person had a conversation with an AI
assistant. Decide whether their teammates may read it.

Decisions:
- "share": nothing sensitive. Teammates can read it as is.
- "redact": useful to the team, but contains specific sensitive strings that can be masked.
- "private": the substance itself is sensitive (e.g. a performance review, a complaint about a
  colleague, a health issue, an unannounced layoff). Masking words would not make it safe.

Risk categories: {", ".join(CATEGORIES)}.
When unsure between two decisions, choose the more cautious one.
For "redact", list every sensitive string exactly as it appears in the text (copy it character for
character) with its category and a short placeholder like [CLIENT] or [PHONE].
Write "reason" as one plain sentence addressed to the owner, e.g. "Mentions the Acme deal size and a
client contact's phone number."

JSON shape:
{{"decision": "share|redact|private", "categories": ["..."], "reason": "...",
  "redactions": [{{"text": "...", "category": "...", "placeholder": "[...]"}}]}}"""


def _policy_hint(owner: str) -> str:
    rows = db.rows("SELECT o.ai_decision, o.user_decision, c.title FROM overrides o "
                   "JOIN conversations c ON c.id=o.conv_id WHERE o.owner=? "
                   "ORDER BY o.created_at DESC LIMIT 8", (owner,))
    if not rows:
        return ""
    lines = [f'- "{r["title"]}": you said {r["ai_decision"]}, the owner chose {r["user_decision"]}'
             for r in rows]
    return ("\n\nThis owner has overridden the gate before. Lean toward their line:\n" + "\n".join(lines))


def _validate(result: dict, text: str) -> dict:
    decision = result.get("decision")
    if decision not in ("share", "redact", "private"):
        decision = "private"
    cats = [c for c in result.get("categories", []) if c in CATEGORIES]
    reds = []
    for r in result.get("redactions") or []:
        t = (r.get("text") or "").strip()
        if t and t in text:  # only keep spans that really exist, so masking is exact
            reds.append({"text": t, "category": r.get("category", "personal_data"),
                         "placeholder": r.get("placeholder") or "[REDACTED]"})
    if decision == "redact" and not reds:
        decision = "private"  # said "mask something" but gave nothing maskable: be cautious
    if decision == "share" and cats:
        decision = "private" if not reds else "redact"
    return {"decision": decision, "categories": cats,
            "reason": (result.get("reason") or "").strip() or "No reason given.", "redactions": reds}


def run(conv_id: str) -> dict:
    conv = db.conversation(conv_id)
    if not conv:
        raise KeyError(conv_id)
    text = transcript(conv["messages"])
    if settings.mock:
        result, engine = mock.gate(text), "mock-rules"
    else:
        raw = llm.complete_json("nano", SYSTEM + _policy_hint(conv["owner"]),
                                f"Title: {conv['title']}\n\n{text}", max_tokens=1500)
        result, engine = raw, settings.model_nano
    v = _validate(result, text)
    db.execute("INSERT OR REPLACE INTO verdicts VALUES (?,?,?,?,?,?,?)",
               (conv_id, v["decision"], json.dumps(v["categories"]), v["reason"],
                json.dumps(v["redactions"]), engine, time.time()))
    return {**v, "engine": engine}


def apply_redactions(messages: list[dict], redactions: list[dict]) -> list[dict]:
    out = []
    for m in messages:
        content = m["content"]
        for r in sorted(redactions, key=lambda r: -len(r["text"])):
            content = content.replace(r["text"], r["placeholder"])
        out.append({**m, "content": content})
    return out


RECHECK_SYSTEM = """You check a document just before it is shown to a team. It was generated from a
conversation in which some strings were masked. Report whether the document still contains anything
sensitive: any of the masked strings, or new personal data, client names with deal sizes, HR
judgements about a named person, credentials, or private-life details.
JSON shape: {"ok": true|false, "problems": ["..."]}"""


def recheck(document: str, redactions: list[dict]) -> dict:
    leaked = [r["text"] for r in redactions if r["text"] in document]
    if leaked:
        return {"ok": False, "problems": [f"masked text reappeared: {t}" for t in leaked], "engine": "exact-match"}
    if settings.mock:
        found = mock.gate(document)
        ok = found["decision"] == "share"
        return {"ok": ok, "problems": [] if ok else [found["reason"]], "engine": "mock-rules"}
    masked = ", ".join(r["placeholder"] for r in redactions) or "none"
    res = llm.complete_json("nano", RECHECK_SYSTEM,
                            f"Placeholders already used: {masked}\n\nDOCUMENT:\n{document[:40000]}",
                            max_tokens=600)
    return {"ok": bool(res.get("ok")), "problems": res.get("problems") or [], "engine": settings.model_nano}
