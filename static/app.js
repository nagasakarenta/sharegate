const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

let ME = null, PEOPLE = [], STATUS = { mock: true, models: {} };
const ICON = {
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  mask: '<svg viewBox="0 0 24 24"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><path d="M4 4l16 16"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  q: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
};
const DEC = {
  share: { label: "Safe to share", short: "Share", icon: ICON.shield },
  redact: { label: "Share with masking", short: "Mask", icon: ICON.mask },
  private: { label: "Keep private", short: "Private", icon: ICON.lock },
};
const FMT = { md: "Markdown note", html: "HTML page", pdf: "PDF report", video: "Slides" };

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((body && body.detail) || body || r.statusText);
  return body;
}
function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), 3800);
}
const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const person = (id) => PEOPLE.find((p) => p.id === id);
const ago = (ts) => { const d = (Date.now() / 1000 - ts) / 86400; return d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.floor(d)}d ago`; };
const pill = (v) => v ? `<span class="pill pill-${v.decision}"><span class="d"></span>${DEC[v.decision].short}</span>` : `<span class="pill">Not checked</span>`;
const fmtBadge = (f) => `<div class="fmt fmt-${f}">${f === "video" ? "▶" : f.toUpperCase()}</div>`;
const empty = (icon, title, sub, cta = "") => `<div class="empty"><div><div class="glyph">${icon}</div><div style="color:var(--text);font-weight:600">${title}</div><div>${sub}</div>${cta}</div></div>`;

// ---------- theme & tabs ----------
document.documentElement.dataset.theme = store.get("sg-theme", "dark");
$("#theme-toggle").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t; store.set("sg-theme", t);
  if ($("#tab-map").classList.contains("active")) loadMap();
};
$$(".nav button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(name) {
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  ({ inbox: loadInbox, feed: loadFeed, map: loadMap, ask: initAsk, voice: loadVoice, usage: loadUsage }[name] || (() => {}))();
}

// ---------- people ----------
async function loadPeople() {
  PEOPLE = await api("/api/people");
  const opts = PEOPLE.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.role ? " · " + esc(p.role) : ""}</option>`).join("");
  $("#me").innerHTML = opts || `<option>No one yet</option>`;
  $("#ask-person").innerHTML = opts;
  ME = PEOPLE.some((p) => p.id === store.get("sg-me")) ? store.get("sg-me") : PEOPLE[0]?.id || null;
  if (ME) $("#me").value = ME;
  updateAvatars();
}
function updateAvatars() {
  $("#me-avatar").textContent = initials(person(ME)?.name);
  $("#ask-avatar").textContent = initials(person($("#ask-person").value)?.name);
}
$("#me").onchange = () => { ME = $("#me").value; store.set("sg-me", ME); updateAvatars(); loadInbox(); };

// ---------- inbox ----------
let INBOX = [];
async function loadInbox() {
  if (!ME) {
    $("#inbox-list").innerHTML = "";
    $("#inbox-detail").innerHTML = empty(ICON.chat, "No chats yet", "Import a ChatGPT or Claude export, or load the demo team.",
      `<div style="margin-top:14px"><button class="btn btn-primary" onclick="loadDemo()">Load demo team</button></div>`);
    $("#inbox-stats").innerHTML = ""; return;
  }
  INBOX = await api(`/api/inbox/${encodeURIComponent(ME)}`);
  $("#count-inbox").textContent = INBOX.length || "";
  renderStats(); renderInbox();
  if (!$("#inbox-detail").dataset.id) $("#inbox-detail").innerHTML = empty(ICON.shield, "Pick a chat", "The gate shows what's safe before anything leaves your hands.");
}
function renderStats() {
  const n = INBOX.length, c = { share: 0, redact: 0, private: 0 }, shared = INBOX.filter((x) => x.shared).length;
  INBOX.forEach((x) => x.verdict && c[x.verdict.decision]++);
  const card = (k, v, color, frac) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>
    <div class="bar"><i style="width:${Math.round(frac * 100)}%;background:${color}"></i></div></div>`;
  $("#inbox-stats").innerHTML = card("Safe to share", c.share, "var(--share)", n ? c.share / n : 0)
    + card("Needs masking", c.redact, "var(--redact)", n ? c.redact / n : 0)
    + card("Kept private", c.private, "var(--private)", n ? c.private / n : 0)
    + card("Shared with team", shared, "var(--accent)", n ? shared / n : 0);
}
function renderInbox() {
  const q = $("#inbox-search").value.toLowerCase();
  const items = INBOX.filter((c) => c.title.toLowerCase().includes(q));
  $("#inbox-list").innerHTML = items.map((c) => `
    <li data-id="${c.id}" class="${$("#inbox-detail").dataset.id === c.id ? "sel" : ""}">
      <div class="li-title">${esc(c.title)}</div>
      <div class="li-meta">${pill(c.verdict)}${c.shared ? `<span class="pill pill-ai">Shared · ${FMT[c.shared.format]}</span>` : ""}<span>${ago(c.created_at)}</span></div>
    </li>`).join("") || `<li class="muted" style="cursor:default">No matches.</li>`;
  $$("#inbox-list li[data-id]").forEach((li) => (li.onclick = () => openChat(li.dataset.id)));
}
$("#inbox-search").oninput = renderInbox;

function highlight(text, reds) {
  let out = esc(text);
  for (const r of (reds || []).slice().sort((a, b) => b.text.length - a.text.length))
    out = out.split(esc(r.text)).join(`<mark title="${esc(r.category)} → ${esc(r.placeholder)}">${esc(r.text)}</mark>`);
  return out;
}
function verdictCard(v) {
  if (!v) return `<div class="verdict none"><div class="icon">${ICON.q}</div><div><div class="t">Not checked yet</div>
    <div class="r">Run the gate to see whether this chat is safe to share.</div></div></div>`;
  return `<div class="verdict ${v.decision}"><div class="icon">${DEC[v.decision].icon}</div><div>
    <div class="t">${DEC[v.decision].label}</div><div class="r">${esc(v.reason)}</div>
    <div class="m">${v.categories.map((c) => `<span class="chip">${esc(c.replaceAll("_", " "))}</span>`).join("")}
      ${v.redactions.length ? `<span>${v.redactions.length} string${v.redactions.length > 1 ? "s" : ""} to mask — highlighted below</span>` : ""}
      <span class="mono">· ${esc(v.engine)}</span></div></div></div>`;
}

const STEPS = [
  ["mask", "Mask sensitive details", "nano"], ["format", "Choose the right format", "super"],
  ["write", "Write it in your voice", "super"], ["recheck", "Re-check before publishing", "nano"], ["publish", "Publish to the team", ""],
];
async function openChat(id) {
  $("#inbox-detail").dataset.id = id; renderInbox();
  const c = await api(`/api/conversation/${id}`), v = c.verdict, row = INBOX.find((x) => x.id === id);
  let dec = v?.decision || "", fmt = "";
  const segDec = Object.entries(DEC).map(([k, d]) => `<button data-dec="${k}" class="${k === dec ? "on" : ""}">${d.short}</button>`).join("");
  const segFmt = `<button data-fmt="" class="on">${ICON.spark}Auto</button>` + Object.entries(FMT).map(([k, l]) => `<button data-fmt="${k}">${l}</button>`).join("");
  $("#inbox-detail").innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div><h2>${esc(c.title)}</h2><div class="muted">${c.messages.length} messages · ${esc(c.source)} · ${ago(c.created_at)}</div></div>
      <button class="btn btn-sm" id="btn-gate">${ICON.shield}${v ? "Re-run gate" : "Run gate"}</button>
    </div>
    ${verdictCard(v)}
    ${row?.shared ? `<div class="result">Shared as <b>${FMT[row.shared.format]}</b>. <a href="/api/artifact/${id}" target="_blank">Open ${ICON.ext}</a></div>` : ""}
    <div class="label">Your call</div>
    <div class="seg" id="seg-dec">${segDec}</div>
    <div class="label">Format</div>
    <div class="seg" id="seg-fmt">${segFmt}</div>
    <div class="share-row"><button class="btn btn-primary" id="btn-share">${ICON.spark}${row?.shared ? "Share again" : "Share with team"}</button>
      <span class="muted" id="share-hint">${v ? "" : "The gate will run first."}</span></div>
    <div id="pipeline"></div>
    <div class="label">Conversation</div>
    <div class="convo">${c.messages.map((m) => `<div class="bubble ${m.role}"><div class="who">${m.role === "user" ? "You" : "AI"}</div>${highlight(m.content, v?.redactions)}</div>`).join("")}</div>`;

  $$("#seg-dec button").forEach((b) => (b.onclick = () => { dec = b.dataset.dec; $$("#seg-dec button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $$("#seg-fmt button").forEach((b) => (b.onclick = () => { fmt = b.dataset.fmt; $$("#seg-fmt button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#btn-gate").onclick = async () => {
    $("#btn-gate").disabled = true;
    try { await api(`/api/gate/${id}`, { method: "POST" }); await loadInbox(); openChat(id); }
    catch (e) { toast(e.message, true); $("#btn-gate").disabled = false; }
  };
  $("#btn-share").onclick = () => runShare(id, v, dec, fmt);
}

async function runShare(id, v, dec, fmt) {
  const btn = $("#btn-share"); btn.disabled = true;
  const decision = dec && dec !== v?.decision ? dec : null;
  if ((dec || v?.decision) === "private") {
    $("#pipeline").innerHTML = `<div class="result err">Kept private. Nothing leaves your hands.</div>`; btn.disabled = false; return;
  }
  $("#pipeline").innerHTML = `<div class="pipeline">${STEPS.map(([k, label, tier]) => `
    <div class="step" data-step="${k}"><span class="s-icon"></span>${label}<span class="s-model mono">${!tier ? "" : STATUS.mock ? "mock rules" : esc(STATUS.models[tier] || tier)}</span></div>`).join("")}</div>`;
  const steps = $$(".step"); let i = 0;
  steps[0].classList.add("run");
  const timer = setInterval(() => { if (i < steps.length - 2) { steps[i].className = "step done"; steps[++i].classList.add("run"); } }, STATUS.mock ? 350 : 2200);
  try {
    const r = await api(`/api/share/${id}`, { method: "POST", body: JSON.stringify({ decision, format: fmt || null }) });
    clearInterval(timer); steps.forEach((s) => (s.className = "step done"));
    $("#pipeline").insertAdjacentHTML("beforeend", `<div class="result">
      <div style="display:flex;gap:10px;align-items:center">${fmtBadge(r.format)}<div><b>${esc(r.title)}</b><div class="muted">${FMT[r.format]} — ${esc(r.why)}</div></div>
      <a class="btn btn-sm" style="margin-left:auto" href="/api/artifact/${id}" target="_blank">Open ${ICON.ext}</a></div>
      <div style="margin-top:8px">${r.topics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div></div>`);
    toast("Shared with the team"); loadInbox(); $("#count-feed").textContent = "";
  } catch (e) {
    clearInterval(timer);
    const cur = steps.find((s) => s.classList.contains("run")); if (cur) cur.className = "step fail";
    $("#pipeline").insertAdjacentHTML("beforeend", `<div class="result err">${esc(e.message)}</div>`);
  }
  btn.disabled = false;
}

$("#gate-all").onclick = async () => {
  if (!ME) return toast("Load the demo team first", true);
  const b = $("#gate-all"); b.disabled = true; b.lastChild.textContent = "Checking…";
  try { const r = await api(`/api/gate-all/${encodeURIComponent(ME)}`, { method: "POST" }); toast(`Checked ${Object.keys(r).length} chats`); }
  catch (e) { toast(e.message, true); }
  b.disabled = false; b.lastChild.textContent = "Run the gate"; loadInbox();
};
async function loadDemo() {
  const r = await api("/api/demo/load", { method: "POST" });
  toast(`Loaded ${r.people} people and ${r.conversations} chats`); await loadPeople(); loadInbox();
}
$("#load-demo").onclick = loadDemo;
$("#import-file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f || !ME) return;
  const fd = new FormData(); fd.append("owner", ME); fd.append("file", f);
  const r = await fetch("/api/import", { method: "POST", body: fd });
  r.ok ? toast(`Imported ${(await r.json()).imported} chat(s)`) : toast("Import failed", true);
  e.target.value = ""; loadInbox();
};

// ---------- feed ----------
let FEED = [], FEED_FILTER = "";
async function loadFeed() {
  FEED = await api("/api/feed");
  $("#count-feed").textContent = FEED.length || "";
  const fmts = [...new Set(FEED.map((s) => s.format))];
  $("#feed-filters").innerHTML = `<div class="seg">${["", ...fmts].map((f) => `<button data-f="${f}" class="${f === FEED_FILTER ? "on" : ""}">${f ? FMT[f] : "All"}</button>`).join("")}</div>`;
  $$("#feed-filters button").forEach((b) => (b.onclick = () => { FEED_FILTER = b.dataset.f; loadFeed(); }));
  const items = FEED.filter((s) => !FEED_FILTER || s.format === FEED_FILTER);
  $("#feed-list").innerHTML = items.map((s) => `
    <li data-id="${s.conv_id}" class="${$("#feed-detail").dataset.id === s.conv_id ? "sel" : ""}"><div class="feed-item">${fmtBadge(s.format)}<div class="body">
      <div class="li-title">${esc(s.title)}</div>
      <div class="li-meta"><span class="avatar" style="width:18px;height:18px;font-size:8px">${initials(s.owner_name)}</span>${esc(s.owner_name)} · ${ago(s.created_at)} · <span class="score">▲ ${s.score}</span></div>
      <div style="margin-top:6px">${s.topics.slice(0, 4).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div></div></div></li>`).join("");
  if (!items.length) $("#feed-detail").innerHTML = empty(ICON.chat, "Nothing shared yet", "Share a chat from “My AI chats” and it shows up here.");
  else if (!$("#feed-detail").dataset.id) $("#feed-detail").innerHTML = empty(ICON.chat, "Pick something to read", "Written in the author's own voice.");
  $$("#feed-list li[data-id]").forEach((li) => (li.onclick = () => openShared(li.dataset.id)));
}
async function openShared(id) {
  $("#feed-detail").dataset.id = id;
  $$("#feed-list li").forEach((li) => li.classList.toggle("sel", li.dataset.id === id));
  const s = FEED.find((x) => x.conv_id === id); if (!s) return;
  const body = s.format === "md" ? `<div class="doc">${marked.parse(await api(`/api/artifact/${id}`))}</div>`
    : `<iframe class="doc-frame" sandbox="" src="/api/artifact/${id}"></iframe>`;
  $("#feed-detail").innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">${fmtBadge(s.format)}
      <div style="flex:1;min-width:200px"><h2>${esc(s.title)}</h2><div class="muted">${esc(s.owner_name)} · ${FMT[s.format]} · ${esc(s.format_reason)}</div></div>
      <div class="vote"><button class="btn btn-sm" data-v="1">${ICON.up}Useful</button><button class="btn btn-sm btn-ghost" data-v="-1">${ICON.down}</button>
        <a class="btn btn-sm btn-ghost" href="/api/artifact/${id}" target="_blank">${ICON.ext}</a></div></div>
    <div style="margin-top:10px">${s.topics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}
      ${s.recheck?.ok ? `<span class="pill pill-share" style="margin-left:4px"><span class="d"></span>Passed re-check</span>` : ""}</div>
    ${body}`;
  $$("#feed-detail button[data-v]").forEach((b) => (b.onclick = async () => {
    await api(`/api/vote/${id}`, { method: "POST", body: JSON.stringify({ voter: ME, value: +b.dataset.v }) });
    toast(+b.dataset.v > 0 ? "Marked useful" : "Marked not useful"); loadFeed();
  }));
}

// ---------- map ----------
async function loadMap() {
  const g = await api("/api/graph");
  const css = getComputedStyle(document.documentElement);
  const color = { person: "#8b5cf6", topic: css.getPropertyValue("--muted").trim() || "#888", md: "#6366f1", html: "#22d3ee", pdf: "#fb7185", video: "#a78bfa" };
  $("#map-legend").innerHTML = Object.entries({ person: "Person", md: "Note", html: "Page", pdf: "PDF", video: "Slides", topic: "Topic" })
    .map(([k, l]) => `<span><i style="background:${color[k]}"></i>${l}</span>`).join("");
  if (!g.nodes.length) { $("#graph").innerHTML = empty(ICON.chat, "The map is empty", "It fills in as people share."); return; }
  $("#graph").innerHTML = "";
  cytoscape({
    container: $("#graph"),
    elements: [...g.nodes.map((n) => ({ data: n })), ...g.edges.map((e, i) => ({ data: { id: "e" + i, ...e } }))],
    style: [
      { selector: "node", style: { label: "data(label)", "font-size": 10, "font-family": "Inter", color: css.getPropertyValue("--text-2").trim(),
        "background-color": (n) => color[n.data("kind")] || "#888", "text-wrap": "ellipsis", "text-max-width": 130, "text-valign": "bottom", "text-margin-y": 5,
        width: 18, height: 18, "border-width": 2, "border-color": css.getPropertyValue("--surface").trim() } },
      { selector: 'node[kind="person"]', style: { width: 38, height: 38, "font-size": 12, "font-weight": 600, color: css.getPropertyValue("--text").trim() } },
      { selector: 'node[kind="topic"]', style: { shape: "round-rectangle", width: 10, height: 10, "font-size": 9 } },
      { selector: "edge", style: { width: 1.2, "line-color": css.getPropertyValue("--border-strong").trim(), "curve-style": "bezier" } },
      { selector: "node:selected", style: { "border-color": "#22d3ee", "border-width": 3 } },
    ],
    layout: { name: "cose", animate: false, nodeRepulsion: 9000, idealEdgeLength: 70 },
  }).on("tap", "node", (e) => {
    const id = e.target.id();
    if (id.startsWith("s:")) { showTab("feed"); setTimeout(() => openShared(id.slice(2)), 250); }
  });
}

// ---------- ask ----------
const SUGGEST = ["Why did we choose this pricing?", "What's still undecided?", "What would you want me to check before shipping?"];
function initAsk() {
  updateAvatars();
  $("#ask-engine").textContent = STATUS.mock ? "Mock mode · keyword retrieval" : "Nemotron 3 Ultra · long context";
  if (!$("#chat-log").children.length) {
    $("#chat-log").innerHTML = empty(ICON.spark, "Ask what they think", "Their agent reads everything they chose to share — and nothing else.");
  }
  $("#suggest").innerHTML = SUGGEST.map((s) => `<button type="button">${esc(s)}</button>`).join("");
  $$("#suggest button").forEach((b) => (b.onclick = () => { $("#ask-q").value = b.textContent; $("#ask-form").requestSubmit(); }));
}
$("#ask-person").onchange = () => { updateAvatars(); $("#chat-log").innerHTML = ""; initAsk(); };
$("#ask-q").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; });
$("#ask-q").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#ask-form").requestSubmit(); } });
$("#ask-form").onsubmit = async (e) => {
  e.preventDefault();
  const q = $("#ask-q").value.trim(); if (!q) return;
  const who = person($("#ask-person").value);
  if ($(".empty", $("#chat-log"))) $("#chat-log").innerHTML = "";
  $("#ask-q").value = ""; $("#ask-q").style.height = "auto";
  $("#chat-log").insertAdjacentHTML("beforeend", `<div class="msg-row q"><div class="avatar">${initials(person(ME)?.name)}</div><div class="bubble">${esc(q)}</div></div>`);
  const row = document.createElement("div"); row.className = "msg-row a";
  row.innerHTML = `<div class="avatar">${initials(who?.name)}</div><div class="bubble"><div class="who">${esc(who?.name)}'s agent</div><span class="typing"><i></i><i></i><i></i></span></div>`;
  $("#chat-log").appendChild(row); row.scrollIntoView({ behavior: "smooth" });
  try {
    const r = await api("/api/ask", { method: "POST", body: JSON.stringify({ person: who.id, question: q }) });
    $(".bubble", row).innerHTML = `<div class="who">${esc(who?.name)}'s agent</div>${marked.parse(r.answer)}
      <div class="sources">${r.citations.length ? "Sources" : "No shared source"} ${r.citations.map((c) => `<span class="chip">${esc(c.title)}</span>`).join("")}
      <span class="mono">· ${esc(r.engine)}</span></div>`;
  } catch (err) { $(".bubble", row).innerHTML = `<span style="color:var(--private)">${esc(err.message)}</span>`; }
  row.scrollIntoView({ behavior: "smooth" });
};

// ---------- voice ----------
async function loadVoice() {
  if (!ME) { $("#voice-out").innerHTML = `<div class="panel">${empty(ICON.chat, "No chats yet", "Load the demo team first.")}</div>`; return; }
  const v = await api(`/api/voice/${encodeURIComponent(ME)}`);
  if (!v || !v.profile) { $("#voice-out").innerHTML = `<div class="panel">${empty(ICON.chat, "Nothing to learn from yet", "Import some chats first.")}</div>`; return; }
  const p = v.profile;
  $("#voice-out").innerHTML = `<div class="voice-grid">
    <div class="panel voice-card"><div class="label" style="margin-top:0">How ${esc(person(ME)?.name.split(" ")[0])} writes</div>
      <div class="voice-quote">${esc(p.summary)}</div>
      <div class="kv"><div class="k">Tone</div><div>${esc(p.tone)}</div><div class="k">Formality</div><div>${esc(p.formality)}</div>
        <div class="k">Sentences</div><div>${esc(p.sentence_length)}</div><div class="k">Structure</div><div>${esc(p.structure)}</div>
        <div class="k">Habits</div><div>${(p.habits || []).map(esc).join("; ") || "—"}</div>
        <div class="k">Phrases</div><div>${(p.stock_phrases || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("") || "—"}</div>
        <div class="k">Avoid</div><div>${(p.avoid || []).map(esc).join("; ") || "—"}</div></div></div>
    <div class="panel voice-card"><div class="label" style="margin-top:0">Lines they actually wrote</div>
      ${(v.examples || []).map((e) => `<div class="example">“${esc(e)}”</div>`).join("") || `<p class="muted">Appears once they share a chat.</p>`}
      <p class="muted" style="margin-top:14px">The profile describes <b>how</b> you write, never <b>what</b> about. Verbatim lines and phrases
      come only from chats you already shared, so private chats can shape the style but never surface their words.</p></div></div>`;
}
$("#voice-rebuild").onclick = async () => { await api(`/api/voice/${encodeURIComponent(ME)}`, { method: "POST" }); toast("Voice relearned"); loadVoice(); };

// ---------- usage ----------
const ROLE = { nano: "Runs on every chat: the gate, the re-check, topics and the voice profile. Cheap and fast.",
  super: "Picks the format and writes the document in the author's voice.", ultra: "Reads everything a person shared to answer for them. Long context, no summaries." };
async function loadUsage() {
  const rows = await api("/api/usage");
  $("#tiers").innerHTML = ["nano", "super", "ultra"].map((t) => {
    const r = rows.find((x) => x.tier === t) || { calls: 0, prompt_tokens: 0, completion_tokens: 0, seconds: 0 };
    return `<div class="panel tier"><h3>Nemotron 3 ${t[0].toUpperCase() + t.slice(1)}</h3><div class="model mono">${esc(STATUS.models[t] || "")}</div>
      <div class="big">${(r.calls || 0).toLocaleString()} <span class="muted" style="font-size:13px;font-weight:500">calls</span></div>
      <div class="muted">${((r.prompt_tokens || 0) + (r.completion_tokens || 0)).toLocaleString()} tokens · ${r.seconds || 0}s</div>
      <div class="role">${ROLE[t]}</div></div>`;
  }).join("");
  if (STATUS.mock) $("#tiers").insertAdjacentHTML("beforeend", `<p class="muted" style="grid-column:1/-1">Mock mode: no model calls are made until NEBIUS_API_KEY is set.</p>`);
}

// ---------- boot ----------
(async () => {
  STATUS = await api("/api/status");
  $("#engine").classList.toggle("live", !STATUS.mock);
  $("#engine-text").textContent = STATUS.mock ? "Mock mode · no Nebius key" : "Nemotron 3 · Nebius Token Factory";
  await loadPeople(); loadInbox();
  api("/api/feed").then((f) => ($("#count-feed").textContent = f.length || "")).catch(() => {});
})();
