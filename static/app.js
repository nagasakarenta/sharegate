const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let ME = null;

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error(body.detail || body || r.statusText);
  return body;
}

// ---------- tabs ----------
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
function showTab(name) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  ({ inbox: loadInbox, feed: loadFeed, map: loadMap, voice: loadVoice, usage: loadUsage }[name] || (() => {}))();
}

// ---------- people ----------
async function loadPeople() {
  const people = await api("/api/people");
  const opts = people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.role ? " · " + esc(p.role) : ""}</option>`).join("");
  $("#me").innerHTML = opts; $("#ask-person").innerHTML = opts;
  try { ME = localStorage.getItem("sg-me") || people[0]?.id; } catch { ME = people[0]?.id; }
  if (ME) $("#me").value = ME;
  if (people.length > 1) $("#ask-person").selectedIndex = 0;
}
$("#me").addEventListener("change", () => { ME = $("#me").value; try { localStorage.setItem("sg-me", ME); } catch {} loadInbox(); });

// ---------- inbox ----------
const DEC = { share: "Share as is", redact: "Share with masking", private: "Keep private" };
function verdictBadge(v) { return v ? `<span class="d-${v.decision}">${DEC[v.decision]}</span>` : `<span class="muted">not checked</span>`; }

async function loadInbox() {
  if (!ME) return;
  const items = await api(`/api/inbox/${encodeURIComponent(ME)}`);
  $("#inbox-list").innerHTML = items.map((c) => `
    <li data-id="${c.id}"><div>${esc(c.title)}</div>
      <div class="meta">${verdictBadge(c.verdict)}${c.shared ? " · shared as " + c.shared.format.toUpperCase() : ""}</div></li>`).join("")
    || `<li class="muted">No chats yet. Import an export or load the demo team.</li>`;
  $("#inbox-list").querySelectorAll("li[data-id]").forEach((li) => li.addEventListener("click", () => openChat(li.dataset.id, li)));
}

function highlight(text, reds) {
  let out = esc(text);
  for (const r of (reds || []).slice().sort((a, b) => b.text.length - a.text.length)) {
    out = out.split(esc(r.text)).join(`<mark title="${esc(r.category)} → ${esc(r.placeholder)}">${esc(r.text)}</mark>`);
  }
  return out;
}

async function openChat(id, li) {
  document.querySelectorAll("#inbox-list li").forEach((x) => x.classList.toggle("sel", x === li));
  const c = await api(`/api/conversation/${id}`);
  const v = c.verdict;
  $("#inbox-detail").innerHTML = `
    <h3>${esc(c.title)}</h3>
    <div id="verdict">${v ? verdictHtml(v) : `<p class="muted">The gate has not looked at this chat yet.</p>`}</div>
    <div class="actions">
      <button id="btn-gate" class="ghost">${v ? "Re-run gate" : "Run gate"}</button>
      <select id="sel-dec"><option value="">Use the gate's decision</option>
        <option value="share">Share as is</option><option value="redact">Share with masking</option><option value="private">Keep private</option></select>
      <select id="sel-fmt"><option value="">Let AI pick the format</option>
        <option value="md">Markdown note</option><option value="html">HTML page</option><option value="pdf">PDF</option><option value="video">Slides (video)</option></select>
      <button id="btn-share">Share</button>
    </div>
    <div id="share-out"></div>
    <details open><summary>Conversation</summary>
      ${c.messages.map((m) => `<div class="msg ${m.role}"><b>${m.role === "user" ? "You" : "AI"}:</b> ${highlight(m.content, v?.redactions)}</div>`).join("")}
    </details>`;
  $("#btn-gate").onclick = async () => {
    $("#verdict").innerHTML = `<p class="muted">Checking…</p>`;
    try { await api(`/api/gate/${id}`, { method: "POST" }); openChat(id, li); loadInbox(); }
    catch (e) { $("#verdict").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  };
  $("#btn-share").onclick = async () => {
    const btn = $("#btn-share"); btn.disabled = true; $("#share-out").innerHTML = `<p class="muted">Masking, choosing a format, writing in your voice, re-checking…</p>`;
    try {
      const r = await api(`/api/share/${id}`, { method: "POST", body: JSON.stringify({ decision: $("#sel-dec").value || null, format: $("#sel-fmt").value || null }) });
      $("#share-out").innerHTML = `<p>Shared as <b>${r.format.toUpperCase()}</b> — ${esc(r.why)} <a href="/api/artifact/${id}" target="_blank">open</a></p>
        <p>${r.topics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</p>`;
      loadInbox();
    } catch (e) { $("#share-out").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    btn.disabled = false;
  };
}

function verdictHtml(v) {
  return `<p>${verdictBadge(v)} — ${esc(v.reason)}</p>
    <p>${v.categories.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}
    ${v.redactions.length ? `<span class="muted">${v.redactions.length} string(s) to mask, highlighted below</span>` : ""}
    <span class="muted"> · ${esc(v.engine)}</span></p>`;
}

$("#gate-all").onclick = async () => {
  $("#gate-all").disabled = true;
  try { await api(`/api/gate-all/${encodeURIComponent(ME)}`, { method: "POST" }); } catch (e) { alert(e.message); }
  $("#gate-all").disabled = false; loadInbox();
};
$("#load-demo").onclick = async () => { await api("/api/demo/load", { method: "POST" }); await loadPeople(); loadInbox(); };
$("#import-file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const fd = new FormData(); fd.append("owner", ME); fd.append("file", f);
  const r = await fetch("/api/import", { method: "POST", body: fd });
  alert(r.ok ? `Imported ${(await r.json()).imported} chat(s)` : "Import failed"); loadInbox();
};

// ---------- feed ----------
async function loadFeed() {
  const items = await api("/api/feed");
  $("#feed-list").innerHTML = items.map((s) => `
    <li data-id="${s.conv_id}"><div>${esc(s.title)}</div>
      <div class="meta">${esc(s.owner_name)} · ${s.format.toUpperCase()} · score ${s.score}</div>
      <div>${s.topics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div></li>`).join("")
    || `<li class="muted">Nothing shared yet.</li>`;
  $("#feed-list").querySelectorAll("li[data-id]").forEach((li) => li.addEventListener("click", () => openShared(li.dataset.id, li, items)));
}

async function openShared(id, li, items) {
  document.querySelectorAll("#feed-list li").forEach((x) => x.classList.toggle("sel", x === li));
  const s = items.find((x) => x.conv_id === id);
  const vote = `<div class="actions"><button class="ghost" data-v="1">▲ Useful</button><button class="ghost" data-v="-1">▼ Not useful</button>
    <a href="/api/artifact/${id}" target="_blank">open in new tab</a></div>`;
  let body;
  if (s.format === "md") body = marked.parse(await api(`/api/artifact/${id}`));
  else body = `<iframe sandbox="" src="/api/artifact/${id}"></iframe>`;
  $("#feed-detail").innerHTML = `<h3>${esc(s.title)}</h3><p class="muted">${esc(s.owner_name)} · ${esc(s.format_reason)}</p>${vote}${body}`;
  $("#feed-detail").querySelectorAll("button[data-v]").forEach((b) => b.onclick = async () => {
    await api(`/api/vote/${id}`, { method: "POST", body: JSON.stringify({ voter: ME, value: +b.dataset.v }) }); loadFeed();
  });
}

// ---------- map ----------
async function loadMap() {
  const g = await api("/api/graph");
  const color = { person: "#2f5d50", topic: "#9b9b94", md: "#4a7bd0", html: "#b7791f", pdf: "#b23b3b", video: "#7a4fb5" };
  cytoscape({
    container: $("#graph"),
    elements: [...g.nodes.map((n) => ({ data: n })), ...g.edges.map((e, i) => ({ data: { id: "e" + i, ...e } }))],
    style: [
      { selector: "node", style: { label: "data(label)", "font-size": 10, "background-color": (n) => color[n.data("kind")] || "#888",
        color: getComputedStyle(document.body).color, "text-wrap": "ellipsis", "text-max-width": 120 } },
      { selector: 'node[kind="person"]', style: { width: 34, height: 34, "font-size": 12, "font-weight": 700 } },
      { selector: 'node[kind="topic"]', style: { shape: "round-rectangle", width: 14, height: 14 } },
      { selector: "edge", style: { width: 1, "line-color": "#c9c9c2" } },
    ],
    layout: { name: "cose", animate: false },
  }).on("tap", "node", (e) => {
    const id = e.target.id();
    if (id.startsWith("s:")) { showTab("feed"); setTimeout(() => document.querySelector(`#feed-list li[data-id="${id.slice(2)}"]`)?.click(), 300); }
  });
}

// ---------- ask ----------
$("#ask-go").onclick = async () => {
  const q = $("#ask-q").value.trim(); if (!q) return;
  $("#ask-out").innerHTML = `<p class="muted">Reading everything they shared…</p>`;
  try {
    const r = await api("/api/ask", { method: "POST", body: JSON.stringify({ person: $("#ask-person").value, question: q }) });
    $("#ask-out").innerHTML = `<div>${marked.parse(r.answer)}</div>
      <p class="muted">Sources: ${r.citations.map((c) => `<span class="chip">${esc(c.title)}</span>`).join("") || "none"} · ${esc(r.engine)}</p>`;
  } catch (e) { $("#ask-out").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
};

// ---------- voice ----------
async function loadVoice() {
  const v = await api(`/api/voice/${encodeURIComponent(ME)}`);
  if (!v || !v.profile) { $("#voice-out").innerHTML = `<p class="muted">No chats to learn from yet.</p>`; return; }
  const p = v.profile;
  $("#voice-out").innerHTML = `<h3>How you write</h3><p>${esc(p.summary)}</p>
    <p><span class="chip">tone: ${esc(p.tone)}</span><span class="chip">${esc(p.formality)}</span><span class="chip">${esc(p.sentence_length)} sentences</span></p>
    <p><b>Structure:</b> ${esc(p.structure)}</p>
    <p><b>Habits:</b> ${(p.habits || []).map(esc).join("; ")}</p>
    <p><b>Phrases you reuse:</b> ${(p.stock_phrases || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p>
    <p><b>Avoid:</b> ${(p.avoid || []).map(esc).join("; ")}</p>
    <p class="muted">Learned from your own messages. The profile describes how you write, never what you wrote about.
      Example lines are only taken from chats you already shared.</p>`;
}
$("#voice-rebuild").onclick = async () => { await api(`/api/voice/${encodeURIComponent(ME)}`, { method: "POST" }); loadVoice(); };

// ---------- usage ----------
async function loadUsage() {
  const rows = await api("/api/usage");
  $("#usage-table").innerHTML = `<tr><th>Tier</th><th>Model</th><th>Calls</th><th>Prompt tokens</th><th>Output tokens</th><th>Seconds</th></tr>` +
    (rows.map((r) => `<tr><td>${r.tier}</td><td>${esc(r.model)}</td><td>${r.calls}</td><td>${r.prompt_tokens}</td><td>${r.completion_tokens}</td><td>${r.seconds}</td></tr>`).join("")
     || `<tr><td colspan="6" class="muted">No model calls yet${$("#mode").textContent.includes("mock") ? " (mock mode)" : ""}.</td></tr>`);
}

// ---------- boot ----------
(async () => {
  const st = await api("/api/status");
  $("#mode").textContent = st.mock ? "mock mode (no Nebius key)" : "Nemotron on Nebius Token Factory";
  await loadPeople(); loadInbox();
})();
