"""Score the gate against hand-labelled conversations.

Usage:
  uv run python eval/eval_gate.py            # uses Nemotron if NEBIUS_API_KEY is set, else rules
  uv run python eval/eval_gate.py --rules    # force the rule baseline

The number that matters most is LEAKS: chats labelled redact/private that the gate let through as
"share" (or private chats it would only mask). Over-blocking costs a click; a leak costs trust.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sharegate import db, gate, importers, mock  # noqa: E402
from sharegate.config import settings  # noqa: E402

ORDER = {"share": 0, "redact": 1, "private": 2}


def main() -> None:
    force_rules = "--rules" in sys.argv
    db.init()
    convs = importers.parse((settings.demo_dir / "conversations.json").read_bytes(), owner="")
    rows, conf = [], Counter()
    for c in convs:
        gold = c["gold"]["decision"]
        if force_rules or settings.mock:
            pred, engine = mock.gate(importers.transcript(c["messages"]))["decision"], "rules"
        else:
            db.execute("INSERT OR REPLACE INTO conversations VALUES (?,?,?,?,?,?,?)",
                       (c["id"], c["owner"], c["title"], c["created_at"], c["source"],
                        json.dumps(c["messages"]), json.dumps(c["gold"])))
            pred, engine = gate.run(c["id"])["decision"], settings.model_nano
        conf[(gold, pred)] += 1
        rows.append({"id": c["id"], "title": c["title"], "gold": gold, "pred": pred})

    n = len(rows)
    exact = sum(r["gold"] == r["pred"] for r in rows)
    leaks = [r for r in rows if ORDER[r["pred"]] < ORDER[r["gold"]]]
    over = [r for r in rows if ORDER[r["pred"]] > ORDER[r["gold"]]]
    print(f"engine: {engine}   conversations: {n}")
    print(f"exact match: {exact}/{n}   leaks (less cautious than gold): {len(leaks)}   over-blocked: {len(over)}")
    print("\nconfusion (rows = gold, cols = predicted)")
    print("          " + "".join(f"{p:>9}" for p in ORDER))
    for g in ORDER:
        print(f"{g:>9} " + "".join(f"{conf[(g, p)]:>9}" for p in ORDER))
    for r in leaks:
        print(f"  LEAK  {r['id']}  {r['title']}: gold={r['gold']} pred={r['pred']}")
    out = ROOT / "eval" / f"results_{'rules' if engine == 'rules' else 'nemotron'}.json"
    out.write_text(json.dumps({"engine": engine, "exact": exact, "n": n, "leaks": len(leaks),
                               "over_blocked": len(over), "rows": rows}, indent=2))
    print(f"\nsaved {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
