"""Rule-based stand-ins used when no NEBIUS_API_KEY is set.

They keep the app usable offline and give the evaluation a baseline: the Nemotron gate
is compared against these rules on the same labelled conversations.
"""

from __future__ import annotations

import re
from collections import Counter

PATTERNS = {
    "personal_data": [r"\b0\d{1,4}-\d{1,4}-\d{3,4}\b", r"\+\d{1,3}[ -]?\d{2,4}[ -]?\d{3,4}[ -]?\d{3,4}",
                      r"\b[\w.+-]+@[\w-]+\.[\w.]+\b", r"\bhome address\b"],
    "client_or_money": [r"[$¥€£]\s?\d[\d,.]*\s?(k|m|million|万|億)?", r"\b\d[\d,.]*\s?(k|m|million) (deal|contract|arr|mrr)\b",
                        r"\b(contract value|deal size|our revenue|burn rate)\b"],
    "hr_evaluation": [r"\bperformance review\b", r"\b(underperform\w*|pip\b|let (him|her|them) go|fire (him|her|them))",
                      r"\b(salary|raise|compensation) (for|of)\b"],
    "negative_about_person": [r"\b(annoying|incompetent|lazy|useless|can't stand|frustrated with)\b"],
    "private_life": [r"\b(doctor|diagnos\w+|therapy|divorce|pregnan\w+|my (wife|husband|girlfriend|boyfriend))\b"],
    "unannounced_plan": [r"\b(layoffs?|lay off|before (we|i) tell the team|not announced|keep this quiet|between us)\b"],
    "credentials": [r"\b(sk-[A-Za-z0-9]{10,}|password\s*[:=]|api[_ ]key\s*[:=])"],
}
SUBSTANCE = {"hr_evaluation", "negative_about_person", "private_life", "unannounced_plan"}


def gate(text: str) -> dict:
    cats, reds = [], []
    for cat, pats in PATTERNS.items():
        for pat in pats:
            for m in re.finditer(pat, text, flags=re.I):
                if cat not in cats:
                    cats.append(cat)
                if cat not in SUBSTANCE:
                    reds.append({"text": m.group(0), "category": cat,
                                 "placeholder": {"personal_data": "[CONTACT]", "client_or_money": "[AMOUNT]",
                                                 "credentials": "[SECRET]"}.get(cat, "[REDACTED]")})
    if any(c in SUBSTANCE for c in cats):
        return {"decision": "private", "categories": cats, "redactions": [],
                "reason": "Rules found sensitive substance: " + ", ".join(c for c in cats if c in SUBSTANCE) + "."}
    if reds:
        return {"decision": "redact", "categories": cats, "redactions": reds,
                "reason": f"Rules found {len(reds)} sensitive string(s) to mask."}
    return {"decision": "share", "categories": [], "redactions": [], "reason": "Rules found nothing sensitive."}


def decide_format(title: str, text: str) -> dict:
    low = (title + " " + text).lower()
    if re.search(r"\b(proposal|investor|board|client deck|report for)\b", low):
        fmt, why = "pdf", "Reads like something for leadership or outsiders."
    elif len(re.findall(r"\d+(\.\d+)?\s?%|\b\d{2,}\b", low)) >= 6:
        fmt, why = "html", "Lots of numbers to compare."
    elif re.search(r"\b(how to|step \d|walkthrough|set up|setup|onboarding)\b", low):
        fmt, why = "video", "A how-to is easier to follow as slides."
    else:
        fmt, why = "md", "A short note is enough."
    return {"format": fmt, "title": title, "why": why + " (mock rules)"}


def write(fmt: str, title: str, messages: list[dict]) -> str:
    asks = [m["content"] for m in messages if m["role"] == "user"]
    body = "\n".join(f"- {a.splitlines()[0][:200]}" for a in asks)
    if fmt == "md":
        return f"# {title}\n\n(mock mode: no model call)\n\nWhat I worked through:\n{body}\n"
    items = "".join(f"<li>{a.splitlines()[0][:200]}</li>" for a in asks)
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>{title}</title></head><body>"
            f"<h1>{title}</h1><p><em>mock mode: no model call</em></p><ul>{items}</ul></body></html>")


STOP = set("the a an and or to of in on for with is are be it this that i we you my our what how can should "
           "would do does not if as at by from about so just me your have has they them their was were will "
           "there which also any more some could like than then into get make need want user assistant amount "
           "contact redacted secret yes okay good".split())


def topics(text: str) -> list[str]:
    words = [w for w in re.findall(r"[a-z]{4,}", text.lower()) if w not in STOP]
    return [w for w, _ in Counter(words).most_common(4)]


def ask(question: str, blocks: list[str]) -> str:
    q = set(w for w in re.findall(r"[a-z]{4,}", question.lower()) if w not in STOP)
    scored = []
    for b in blocks:
        cid = re.match(r"\[(c[0-9a-z]+)\]", b).group(1)
        score = sum(b.lower().count(w) for w in q)
        if score:
            scored.append((score, cid, b))
    if not scored:
        return "Nothing they shared covers this. (mock mode) Ask them directly."
    scored.sort(reverse=True)
    lines = [f"Closest shared chat [{cid}]: " + b.split("\n", 2)[1][:160] for _, cid, b in scored[:2]]
    return "(mock mode: retrieval only)\n" + "\n".join(lines)
