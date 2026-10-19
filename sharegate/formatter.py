"""Turn a shared chat into the document format that fits it, written in the author's voice.

decide()  - Nemotron Super reads the (masked) chat and picks md / html / pdf / video
render()  - Nemotron Super writes it; PDF is the HTML printed by headless Chrome
Video is planned as a background job (Nebius Serverless Jobs); for now it renders as slides.
"""

from __future__ import annotations

import html
import re
import subprocess
from pathlib import Path

from . import llm, mock, voice
from .config import settings
from .importers import transcript

FORMATS = {
    "md": "Markdown note - decisions, conclusions, a position, short reasoning",
    "html": "Interactive HTML page - numbers, comparisons, tables, data the reader should explore",
    "pdf": "PDF - a polished proposal or report meant for leadership or people outside the team",
    "video": "Short narrated slides - a how-to, a walkthrough, or an idea that is easier heard than read",
}

DECIDE_SYSTEM = ("You decide how a conversation between a person and an AI should be shared with their "
                 "team. Pick the one format that would get read and understood fastest.\nFormats:\n"
                 + "\n".join(f"- {k}: {v}" for k, v in FORMATS.items())
                 + '\nJSON shape: {"format": "md|html|pdf|video", "title": "short title in the '
                 'author\'s words", "why": "one sentence"}')

WRITE_SYSTEM = """You turn a person's conversation with an AI into a document for their team, written as
if the person wrote it themselves. Keep their reasoning, the options they weighed, what they decided and
what is still open. Do not invent facts that are not in the conversation. Keep placeholders such as
[CLIENT] exactly as they are. The AI's suggestions only count if the person accepted them.
"""


def decide(conv: dict, messages: list[dict]) -> dict:
    text = transcript(messages, 30000)
    if settings.mock:
        return mock.decide_format(conv["title"], text)
    res = llm.complete_json("super", DECIDE_SYSTEM, f"Title: {conv['title']}\n\n{text}", max_tokens=400)
    if res.get("format") not in FORMATS:
        res["format"] = "md"
    res.setdefault("title", conv["title"])
    res.setdefault("why", "")
    return res


def _write(fmt: str, conv: dict, messages: list[dict], title: str) -> str:
    text = transcript(messages, 50000)
    style = voice.instructions(conv["owner"])
    if settings.mock:
        return mock.write(fmt, title, messages)
    shape = {
        "md": "Output Markdown only. Start with '# ' + title. Under 350 words.",
        "html": ("Output one self-contained HTML document (inline CSS, no external scripts). Present the "
                 "numbers as tables or simple inline SVG bar charts. Under 500 words of prose."),
        "pdf": ("Output one self-contained HTML document styled for A4 printing (inline CSS, serif body, "
                "clear headings, page margins). It will be printed to PDF. Under 600 words."),
        "video": ("Output one self-contained HTML document with 4-6 slides (each a <section> with a short "
                  "heading, 2-3 bullets, and a <p class='narration'> line the author would say out loud)."),
    }[fmt]
    return llm.complete("super", WRITE_SYSTEM + "\n" + style + "\n\n" + shape,
                        f"Title: {title}\n\nCONVERSATION:\n{text}", max_tokens=3500, temperature=0.4)


def _clean(fmt: str, doc: str) -> str:
    doc = re.sub(r"^```[a-z]*\s*|\s*```$", "", doc.strip())
    if fmt != "md" and "<html" not in doc.lower():
        doc = f"<!doctype html><html><head><meta charset='utf-8'></head><body>{doc}</body></html>"
    return doc


def _print_pdf(html_path: Path, pdf_path: Path) -> bool:
    try:
        subprocess.run([settings.chrome_path, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={pdf_path}", html_path.as_uri()],
                       check=True, timeout=60, capture_output=True)
        return pdf_path.exists()
    except (OSError, subprocess.SubprocessError):
        return False


def render(conv: dict, messages: list[dict], fmt: str, title: str) -> dict:
    """Write the document to artifacts/<id>/ and return {path, kind, text}."""
    out = settings.artifact_dir / conv["id"]
    out.mkdir(parents=True, exist_ok=True)
    doc = _clean(fmt, _write(fmt, conv, messages, title))
    if fmt == "md":
        p = out / "note.md"
        p.write_text(doc, encoding="utf-8")
        return {"path": str(p), "kind": "md", "text": doc}
    html_path = out / ("slides.html" if fmt == "video" else "page.html")
    html_path.write_text(doc, encoding="utf-8")
    if fmt == "pdf":
        pdf_path = out / "report.pdf"
        if _print_pdf(html_path, pdf_path):
            return {"path": str(pdf_path), "kind": "pdf", "text": _visible_text(doc)}
    return {"path": str(html_path), "kind": "html", "text": _visible_text(doc)}


def _visible_text(doc: str) -> str:
    doc = re.sub(r"(?is)<(script|style).*?</\1>", " ", doc)
    return html.unescape(re.sub(r"<[^>]+>", " ", doc))
