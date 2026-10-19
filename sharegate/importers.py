"""Read AI chat exports into a common shape: {title, created_at, messages:[{role, content}]}.

Supported: ChatGPT export (conversations.json), Claude export (conversations.json),
the ShareGate demo format, and a plain Markdown/text transcript.
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime


def _cid(owner: str, title: str, created: float) -> str:
    return "c" + hashlib.sha1(f"{owner}|{title}|{created}".encode()).hexdigest()[:10]


def _ts(value) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            pass
    return time.time()


def _chatgpt(conv: dict) -> list[dict]:
    mapping = conv.get("mapping") or {}
    node_id = conv.get("current_node")
    chain = []
    while node_id and node_id in mapping:
        node = mapping[node_id]
        msg = node.get("message")
        if msg:
            role = (msg.get("author") or {}).get("role")
            parts = (msg.get("content") or {}).get("parts") or []
            text = "\n".join(p for p in parts if isinstance(p, str)).strip()
            if role in ("user", "assistant") and text:
                chain.append({"role": role, "content": text})
        node_id = node.get("parent")
    return list(reversed(chain))


def _claude(conv: dict) -> list[dict]:
    out = []
    for m in conv.get("chat_messages") or []:
        text = (m.get("text") or "").strip()
        if not text and isinstance(m.get("content"), list):
            text = "\n".join(c.get("text", "") for c in m["content"] if isinstance(c, dict)).strip()
        if text:
            out.append({"role": "user" if m.get("sender") == "human" else "assistant", "content": text})
    return out


def parse(raw: bytes, owner: str, filename: str = "") -> list[dict]:
    """Return a list of conversations with ids, ready to store."""
    text = raw.decode("utf-8", errors="replace")
    convs: list[dict] = []
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = None

    if isinstance(data, dict) and "conversations" in data:  # demo format
        for c in data["conversations"]:
            created = _ts(c.get("created_at"))
            convs.append({
                "id": c.get("id") or _cid(c.get("owner", owner), c["title"], created),
                "owner": c.get("owner", owner), "title": c["title"], "created_at": created,
                "source": "demo", "messages": c["messages"], "gold": c.get("gold"),
            })
        return convs

    if isinstance(data, list):
        for c in data:
            if not isinstance(c, dict):
                continue
            if "mapping" in c:
                msgs, title, created, src = _chatgpt(c), c.get("title") or "Untitled", _ts(c.get("create_time")), "chatgpt"
            elif "chat_messages" in c:
                msgs, title, created, src = _claude(c), c.get("name") or "Untitled", _ts(c.get("created_at")), "claude"
            else:
                continue
            if msgs:
                convs.append({"id": _cid(owner, title, created), "owner": owner, "title": title,
                              "created_at": created, "source": src, "messages": msgs, "gold": None})
        return convs

    # Plain transcript: lines starting with "User:" / "Assistant:" (or "Q:"/"A:") switch speaker.
    msgs, role, buf = [], "user", []
    for line in text.splitlines():
        low = line.strip().lower()
        for prefix, r in (("user:", "user"), ("me:", "user"), ("q:", "user"),
                          ("assistant:", "assistant"), ("ai:", "assistant"), ("a:", "assistant")):
            if low.startswith(prefix):
                if buf:
                    msgs.append({"role": role, "content": "\n".join(buf).strip()})
                role, buf = r, [line.strip()[len(prefix):].strip()]
                break
        else:
            buf.append(line)
    if buf and "\n".join(buf).strip():
        msgs.append({"role": role, "content": "\n".join(buf).strip()})
    title = filename.rsplit(".", 1)[0] or "Imported chat"
    created = time.time()
    return [{"id": _cid(owner, title, created), "owner": owner, "title": title, "created_at": created,
             "source": "text", "messages": msgs, "gold": None}]


def transcript(messages: list[dict], limit: int = 60000) -> str:
    lines = [f"{'USER' if m['role'] == 'user' else 'AI'}: {m['content']}" for m in messages]
    text = "\n\n".join(lines)
    return text if len(text) <= limit else text[:limit] + "\n\n[...truncated]"
