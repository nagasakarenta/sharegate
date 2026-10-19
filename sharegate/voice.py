"""Voice profiles: write shared documents the way the author writes, not the way AI writes.

People skim generic AI prose ("AI fatigue"). A note that sounds like your boss gets read.
The profile is learned from the person's own turns in their chats (Nemotron Nano). It describes
HOW they write - length, tone, habits, stock phrases - never WHAT they wrote about, so a profile
built from private chats does not leak their content. Verbatim example lines are taken only from
chats the person has already shared (after masking).
"""

from __future__ import annotations

import json
import re
import time
from collections import Counter

from . import db, llm
from .config import settings
from .gate import apply_redactions

SYSTEM = """You study how one person writes, from messages they typed to an AI assistant.
Describe their writing style so another writer could imitate it. Describe HOW they write, never WHAT
they wrote about: no names, companies, numbers, projects or facts from the messages.

JSON shape:
{"summary": "one sentence on their voice",
 "tone": "...", "formality": "casual|neutral|formal", "sentence_length": "short|medium|long",
 "structure": "how they organise thoughts (bullets? questions? conclusion first?)",
 "habits": ["concrete stylistic habits"],
 "stock_phrases": ["generic phrases they reuse, max 6, no names or facts"],
 "avoid": ["things that would sound unlike them, e.g. corporate filler, emoji, long intros"]}"""

AI_TELLS = ["delve", "in today's fast-paced", "it's important to note", "leverage", "seamless",
            "robust", "game-changer", "in conclusion", "furthermore", "moreover", "tapestry"]


def _user_lines(owner: str, shared_only: bool) -> list[str]:
    sql = "SELECT c.id, c.messages FROM conversations c"
    if shared_only:
        sql += " JOIN shares s ON s.conv_id=c.id"
    rows = db.rows(sql + " WHERE c.owner=? ORDER BY c.created_at", (owner,))
    lines = []
    for r in rows:
        msgs = json.loads(r["messages"])
        if shared_only:
            v = db.verdict(r["id"])
            msgs = apply_redactions(msgs, v["redactions"] if v else [])
        lines += [m["content"] for m in msgs if m["role"] == "user"]
    return lines


def _mock_profile(lines: list[str]) -> dict:
    text = "\n".join(lines)
    sentences = [s for s in re.split(r"(?<=[.!?])\s+|\n", text) if s.strip()]
    avg = sum(len(s.split()) for s in sentences) / max(1, len(sentences))
    words = re.findall(r"[a-z']+", text.lower())
    bigrams = Counter(zip(words, words[1:])).most_common(40)
    phrases = [" ".join(b) for b, n in bigrams if n >= 2 and not any(ch.isdigit() for ch in "".join(b))][:6]
    return {
        "summary": "Writes " + ("short, direct" if avg < 12 else "longer, explanatory") + " messages.",
        "tone": "direct" if avg < 12 else "explanatory",
        "formality": "casual" if text.count("!") + text.lower().count("lol") > 2 else "neutral",
        "sentence_length": "short" if avg < 12 else ("medium" if avg < 20 else "long"),
        "structure": "bullets" if text.count("\n- ") > 2 else "plain paragraphs",
        "habits": [f"average {avg:.0f} words per sentence"],
        "stock_phrases": phrases, "avoid": ["corporate filler"],
    }


def build(owner: str) -> dict:
    lines = _user_lines(owner, shared_only=False)
    if not lines:
        return {}
    sample = "\n---\n".join(lines[-80:])[:30000]
    profile = _mock_profile(lines) if settings.mock else llm.complete_json(
        "nano", SYSTEM, sample, max_tokens=900)
    # Anything verbatim (example lines, stock phrases) must come from chats already shared,
    # so a private chat can shape the style but never surface its words.
    shared_lines = _user_lines(owner, shared_only=True)
    shared_text = "\n".join(shared_lines).lower()
    profile["stock_phrases"] = [p for p in profile.get("stock_phrases") or []
                                if isinstance(p, str) and p.lower() in shared_text]
    shared = [l for l in shared_lines if 20 <= len(l) <= 280][-5:]
    db.execute("INSERT OR REPLACE INTO voices VALUES (?,?,?,?)",
               (owner, json.dumps(profile), json.dumps(shared), time.time()))
    return {"profile": profile, "examples": shared}


def get(owner: str) -> dict:
    r = db.one("SELECT * FROM voices WHERE owner=?", (owner,))
    if not r:
        return build(owner)
    return {"profile": json.loads(r["profile"]), "examples": json.loads(r["examples"])}


def instructions(owner: str) -> str:
    v = get(owner)
    if not v:
        return "Write plainly and briefly."
    p = v["profile"]
    parts = [f"Write in the author's own voice: {p.get('summary', '')}",
             f"Tone: {p.get('tone', '')}. Formality: {p.get('formality', '')}. "
             f"Sentence length: {p.get('sentence_length', '')}. Structure: {p.get('structure', '')}."]
    if p.get("habits"):
        parts.append("Habits: " + "; ".join(p["habits"]))
    if p.get("stock_phrases"):
        parts.append("Phrases they use (use at most one or two, naturally): " + "; ".join(p["stock_phrases"]))
    parts.append("Avoid: " + "; ".join((p.get("avoid") or []) + AI_TELLS))
    if v["examples"]:
        parts.append("Lines they actually wrote:\n" + "\n".join(f'  "{e}"' for e in v["examples"]))
    parts.append("Be shorter than an AI would be. First person, as if the author wrote it for the team.")
    return "\n".join(parts)


def ai_tell_count(text: str) -> int:
    low = text.lower()
    return sum(low.count(t) for t in AI_TELLS)
