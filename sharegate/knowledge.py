"""Team view: topics for the map, ranking for the feed, and "ask their agent".

ask() gives Nemotron Ultra everything one person has shared (masked transcripts, not summaries -
long context is the point) and asks it to answer the way that person would, citing the chats it
used. Anything they did not share is invisible to it.
"""

from __future__ import annotations

import json
import math
import re
import time

from . import db, llm, mock, voice
from .config import settings
from .gate import apply_redactions
from .importers import transcript

TOPIC_SYSTEM = """List 3 to 5 short topic tags (1-3 words, lowercase) for this conversation, the kind a
teammate would search for. Reuse common wording (e.g. "pricing", "hiring", "onboarding").
JSON shape: {"topics": ["..."]}"""


def topics(text: str) -> list[str]:
    if settings.mock:
        return mock.topics(text)
    res = llm.complete_json("nano", TOPIC_SYSTEM, text[:20000], max_tokens=200)
    return [t.strip().lower() for t in res.get("topics", []) if isinstance(t, str) and t.strip()][:5]


def feed() -> list[dict]:
    rows = db.rows("SELECT s.*, p.name AS owner_name, COALESCE(SUM(v.value),0) AS score "
                   "FROM shares s JOIN people p ON p.id=s.owner LEFT JOIN votes v ON v.conv_id=s.conv_id "
                   "GROUP BY s.conv_id")
    now = time.time()
    for r in rows:
        age_days = max(0.0, (now - r["created_at"]) / 86400)
        r["rank"] = r["score"] + 2.0 * math.exp(-age_days / 7)  # votes, plus a fading boost for new items
        r["topics"] = json.loads(r["topics"])
        r["recheck"] = json.loads(r["recheck"])
    return sorted(rows, key=lambda r: -r["rank"])


def graph() -> dict:
    items = feed()
    nodes, edges = [], []
    people = {p["id"]: p for p in db.rows("SELECT * FROM people")}
    for pid, p in people.items():
        nodes.append({"id": f"p:{pid}", "label": p["name"], "kind": "person"})
    seen_topics = set()
    for it in items:
        nodes.append({"id": f"s:{it['conv_id']}", "label": it["title"], "kind": it["format"]})
        edges.append({"source": f"p:{it['owner']}", "target": f"s:{it['conv_id']}"})
        for t in it["topics"]:
            if t not in seen_topics:
                nodes.append({"id": f"t:{t}", "label": t, "kind": "topic"})
                seen_topics.add(t)
            edges.append({"source": f"s:{it['conv_id']}", "target": f"t:{t}"})
    return {"nodes": nodes, "edges": edges}


ASK_SYSTEM = """You are the knowledge agent of {name} ({role}). Teammates ask you what {name} thinks.
You only know what {name} chose to share: the conversations below, each tagged [id]. Answer the way
{name} would, in their voice, from those conversations only. After each claim cite the ids you used,
like [c1a2b3]. If the shared conversations do not answer the question, say so plainly and suggest
asking {name} directly. Never guess beyond what was shared.
{style}"""


def ask(person: str, question: str) -> dict:
    p = db.one("SELECT * FROM people WHERE id=?", (person,))
    if not p:
        raise KeyError(person)
    shared = db.rows("SELECT s.conv_id, s.title FROM shares s WHERE s.owner=? ORDER BY s.created_at", (person,))
    blocks = []
    for s in shared:
        conv = db.conversation(s["conv_id"])
        v = db.verdict(s["conv_id"])
        msgs = apply_redactions(conv["messages"], v["redactions"] if v else [])
        blocks.append(f"[{s['conv_id']}] {s['title']}\n{transcript(msgs, 40000)}")
    if not blocks:
        return {"answer": f"{p['name']} has not shared anything yet.", "citations": [], "engine": "none"}
    if settings.mock:
        answer = mock.ask(question, blocks)
        engine = "mock-retrieval"
    else:
        answer = llm.complete("ultra", ASK_SYSTEM.format(name=p["name"], role=p["role"],
                                                         style=voice.instructions(person)),
                              "SHARED CONVERSATIONS:\n\n" + "\n\n=====\n\n".join(blocks)
                              + f"\n\nQUESTION: {question}", max_tokens=1200, temperature=0.3)
        engine = settings.model_ultra
    cited = sorted(set(re.findall(r"\[(c[0-9a-z]{4,})\]", answer)))
    valid = {s["conv_id"]: s["title"] for s in shared}
    return {"answer": answer, "engine": engine,
            "citations": [{"id": c, "title": valid[c]} for c in cited if c in valid]}
