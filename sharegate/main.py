"""FastAPI app. Run: uv run uvicorn sharegate.main:app --reload"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import db, gate, importers, knowledge, llm, share, voice
from .config import ROOT, settings

app = FastAPI(title="ShareGate")
db.init()


@app.middleware("http")
async def no_stale_frontend(request, call_next):
    # The UI is three small files; always revalidate so an update never mixes old JS with new HTML.
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


def _store(convs: list[dict]) -> int:
    for c in convs:
        db.execute("INSERT OR REPLACE INTO conversations VALUES (?,?,?,?,?,?,?)",
                   (c["id"], c["owner"], c["title"], c["created_at"], c["source"],
                    json.dumps(c["messages"], ensure_ascii=False),
                    json.dumps(c["gold"]) if c.get("gold") else None))
    return len(convs)


@app.get("/api/status")
def status():
    return {"mock": settings.mock, "models": {t: settings.model(t) for t in ("nano", "super", "ultra")}}


@app.post("/api/demo/load")
def load_demo():
    team = json.loads((settings.demo_dir / "team.json").read_text())
    for p in team["people"]:
        db.execute("INSERT OR REPLACE INTO people VALUES (?,?,?)", (p["id"], p["name"], p["role"]))
    n = _store(importers.parse((settings.demo_dir / "conversations.json").read_bytes(), owner=""))
    return {"people": len(team["people"]), "conversations": n}


@app.get("/api/people")
def people():
    return db.rows("SELECT * FROM people ORDER BY name")


@app.post("/api/import")
async def import_file(owner: str = Form(...), file: UploadFile = File(...)):
    if not db.one("SELECT 1 FROM people WHERE id=?", (owner,)):
        db.execute("INSERT INTO people VALUES (?,?,?)", (owner, owner, ""))
    convs = importers.parse(await file.read(), owner=owner, filename=file.filename or "")
    return {"imported": _store(convs)}


@app.get("/api/inbox/{person}")
def inbox(person: str):
    out = []
    for c in db.rows("SELECT id, title, created_at, source FROM conversations WHERE owner=? "
                     "ORDER BY created_at DESC", (person,)):
        c["verdict"] = db.verdict(c["id"])
        c["shared"] = db.one("SELECT format, title FROM shares WHERE conv_id=?", (c["id"],))
        out.append(c)
    return out


@app.get("/api/conversation/{conv_id}")
def conversation(conv_id: str):
    c = db.conversation(conv_id)
    if not c:
        raise HTTPException(404)
    c.pop("gold", None)
    c["verdict"] = db.verdict(conv_id)
    return c


@app.post("/api/gate/{conv_id}")
def run_gate(conv_id: str):
    try:
        return gate.run(conv_id)
    except llm.LLMError as e:
        raise HTTPException(502, str(e))


@app.post("/api/gate-all/{person}")
def run_gate_all(person: str):
    ids = [r["id"] for r in db.rows("SELECT id FROM conversations WHERE owner=?", (person,))]
    return {cid: gate.run(cid)["decision"] for cid in ids}


class ShareReq(BaseModel):
    decision: str | None = None
    format: str | None = None


@app.post("/api/share/{conv_id}")
def do_share(conv_id: str, req: ShareReq):
    try:
        return share.share(conv_id, req.decision, req.format)
    except share.Blocked as e:
        raise HTTPException(409, str(e))
    except llm.LLMError as e:
        raise HTTPException(502, str(e))


@app.delete("/api/share/{conv_id}")
def undo_share(conv_id: str):
    share.unshare(conv_id)
    return {"ok": True}


@app.get("/api/feed")
def feed():
    return knowledge.feed()


class VoteReq(BaseModel):
    voter: str
    value: int


@app.post("/api/vote/{conv_id}")
def vote(conv_id: str, req: VoteReq):
    db.execute("INSERT OR REPLACE INTO votes VALUES (?,?,?)", (conv_id, req.voter, max(-1, min(1, req.value))))
    return {"ok": True}


@app.get("/api/graph")
def graph():
    return knowledge.graph()


@app.get("/api/artifact/{conv_id}")
def artifact(conv_id: str):
    s = db.one("SELECT artifact FROM shares WHERE conv_id=?", (conv_id,))
    if not s or not Path(s["artifact"]).exists():
        raise HTTPException(404)
    p = Path(s["artifact"])
    media = {".md": "text/markdown; charset=utf-8", ".html": "text/html; charset=utf-8",
             ".pdf": "application/pdf"}[p.suffix]
    return FileResponse(p, media_type=media)


@app.get("/api/voice/{person}")
def get_voice(person: str):
    return voice.get(person)


@app.post("/api/voice/{person}")
def rebuild_voice(person: str):
    return voice.build(person)


class AskReq(BaseModel):
    person: str
    question: str


@app.post("/api/ask")
def ask(req: AskReq):
    try:
        return knowledge.ask(req.person, req.question)
    except llm.LLMError as e:
        raise HTTPException(502, str(e))


@app.get("/api/usage")
def usage():
    return db.rows("SELECT tier, model, COUNT(*) AS calls, SUM(prompt_tokens) AS prompt_tokens, "
                   "SUM(completion_tokens) AS completion_tokens, ROUND(SUM(seconds),1) AS seconds "
                   "FROM usage GROUP BY tier, model")


app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")
