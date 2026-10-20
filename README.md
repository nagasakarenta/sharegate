# ShareGate

**Turn your AI chats into team knowledge — safely, and in your own voice.**
Built for the Nebius x NVIDIA Global AI Hackathon (Best Apps and Agents track) on **NVIDIA Nemotron 3** served by **Nebius Token Factory**.

## The problem
Most thinking now happens inside conversations with AI assistants, and none of it reaches the team.
People keep walking over to ask "what does my lead think about X?" — but sharing raw chats is risky
(client names, salaries, complaints about a colleague, unannounced plans), so nobody shares.
And when someone does paste AI output into Slack, nobody reads it: it doesn't sound like a person.

## What it does
1. **Import** your ChatGPT or Claude export (or any transcript).
2. **The gate** (Nemotron 3 Nano) reads every chat and says *share / share with masking / keep private*,
   highlights the exact strings to mask, and explains why in one sentence. It errs on the side of private,
   and learns your line from the times you overrode it.
3. **One click to share.** Nemotron 3 Super picks the format that fits the content — a Markdown note for a
   decision, an HTML page for numbers, a PDF for something going to leadership, narrated slides for a how-to —
   and writes it **in the author's voice**, learned from their own messages, so it doesn't read like AI.
4. **Re-check** (Nano): the finished document is scanned again so masked details can't sneak back in.
5. **Team view:** a ranked feed, a map of who shared what about which topics, and
   **"Ask their agent"** — Nemotron 3 Ultra reads *everything* a person chose to share (raw, not summaries;
   that's what long context is for) and answers the way they would, citing the chats it used.
   If they never shared it, the agent says so.

## Why Nemotron on Nebius
- **Your chats never leave your infrastructure.** AI conversations are among the most sensitive text a
  company has. Open-weight Nemotron on Nebius means the gate and the agent can run in your own environment.
- **Right-sized models.** Nano runs on every single chat (gate, re-check, topics, voice) — cheap and fast.
  Super handles judgement and writing. Ultra is reserved for long-context answers. The *Model usage* tab
  shows calls and tokens per tier.
- **Long context instead of lossy summaries.** Ultra reads months of a person's shared chats in one pass.
- **Background work fits Serverless Jobs:** PDF/slide rendering and nightly map rebuilds.

## Evaluation
`eval/eval_gate.py` scores the gate on 26 hand-labelled demo chats (10 of them deliberately tricky:
sensitive content without obvious keywords, and harmless text full of scary keywords).
The key number is **leaks**: chats that should have been masked or kept private but were let through.
The gate asks Nano twice in parallel and keeps the more cautious answer; at Nano prices that still costs a fraction of a cent per chat.

| Engine | Exact match | Leaks | Over-blocked |
|---|---|---|---|
| Keyword rules (baseline) | 17/26 | 5 | 4 |
| Nemotron 3 Nano, one call | 24/26 | 2 | 0 |
| Nemotron 3 Nano, two votes + category guide (current) | 24-25/26 (two runs) | **0** | 1-2 |

## Run it
```bash
uv sync
cp .env.example .env          # add NEBIUS_API_KEY; without it the app runs in mock mode (rules only)
uv run python scripts/list_models.py   # confirm the exact Nemotron model IDs
uv run uvicorn sharegate.main:app --port 8811
```
Open http://localhost:8811, click **Load demo team**, then **Run the gate on all my chats**.

## Data
The demo team (Kumo Labs) and all its conversations are fictional, written for this project.
Imported chats are stored only in the local SQLite file.

## License
MIT
