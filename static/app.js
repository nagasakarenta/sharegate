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
const DEC_ICON = { share: ICON.shield, redact: ICON.mask, private: ICON.lock };
const DECS = ["share", "redact", "private"];
const FMTS = ["md", "html", "pdf", "video"];
const fmtName = (f) => t("fmt." + f);

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((body && body.detail) || body || r.statusText);
  return body;
}
function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : ""); el.textContent = msg;
  $("#toasts").appendChild(el); setTimeout(() => el.remove(), 3800);
}
const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const person = (id) => PEOPLE.find((p) => p.id === id);
const ago = (ts) => { const d = (Date.now() / 1000 - ts) / 86400; return d < 1 ? t("ago.today") : d < 2 ? t("ago.yesterday") : t("ago.days", { n: Math.floor(d) }); };
const pill = (v) => v ? `<span class="pill pill-${v.decision}"><span class="d"></span>${t("decs." + v.decision)}</span>` : `<span class="pill">${t("notchecked")}</span>`;
const fmtBadge = (f) => `<div class="fmt fmt-${f}">${f === "video" ? "▶" : f.toUpperCase()}</div>`;
const empty = (icon, title, sub, cta = "") => `<div class="empty"><div><div class="glyph">${icon}</div><div style="color:var(--text);font-weight:600">${title}</div><div>${sub}</div>${cta}</div></div>`;

// ---------- language, theme & tabs ----------
let CURRENT_TAB = "inbox";
document.documentElement.dataset.theme = store.get("sg-theme", "dark");
$("#theme-toggle").onclick = () => {
  const th = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = th; store.set("sg-theme", th);
  if (CURRENT_TAB === "map") loadMap();
};
$("#lang-toggle").onclick = () => {
  LANG = LANG === "en" ? "ja" : "en"; store.set("sg-lang", LANG);
  applyStatic(); setEngine(); $("#chat-log").innerHTML = "";
  delete $("#inbox-detail").dataset.id; delete $("#feed-detail").dataset.id;
  showTab(CURRENT_TAB);
};
$$(".nav button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(name) {
  CURRENT_TAB = name;
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach((x) => x.classList.toggle("active", x.id === "tab-" + name));
  ({ inbox: loadInbox, feed: loadFeed, map: loadMap, ask: initAsk, voice: loadVoice, usage: loadUsage }[name] || (() => {}))();
}
function setEngine() {
  $("#engine").classList.toggle("live", !STATUS.mock);
  $("#engine-text").textContent = STATUS.mock ? t("engine.mock") : t("engine.live");
}

// ---------- people ----------
async function loadPeople() {
  PEOPLE = await api("/api/people");
  const opts = PEOPLE.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.role ? " · " + esc(p.role) : ""}</option>`).join("");
  $("#me").innerHTML = opts || `<option>—</option>`;
  $("#ask-person").innerHTML = opts;
  ME = PEOPLE.some((p) => p.id === store.get("sg-me")) ? store.get("sg-me") : PEOPLE[0]?.id || null;
  if (ME) $("#me").value = ME;
  updateAvatars();
}
function updateAvatars() {
  $("#me-avatar").textContent = initials(person(ME)?.name);
  $("#ask-avatar").textContent = initials(person($("#ask-person").value)?.name);
}
$("#me").onchange = () => { ME = $("#me").value; store.set("sg-me", ME); updateAvatars(); delete $("#inbox-detail").dataset.id; loadInbox(); };

// ---------- inbox ----------
let INBOX = [];
async function loadInbox() {
  if (!ME) {
    $("#inbox-list").innerHTML = ""; $("#inbox-stats").innerHTML = "";
    $("#inbox-detail").innerHTML = empty(ICON.chat, t("empty.nochats"), t("empty.nochats.sub"),
      `<div style="margin-top:14px"><button class="btn btn-primary" onclick="loadDemo()">${t("btn.demo")}</button></div>`);
    return;
  }
  INBOX = await api(`/api/inbox/${encodeURIComponent(ME)}`);
  $("#count-inbox").textContent = INBOX.length || "";
  renderStats(); renderInbox();
  const open = $("#inbox-detail").dataset.id;
  if (open && INBOX.some((c) => c.id === open)) openChat(open);
  else $("#inbox-detail").innerHTML = empty(ICON.shield, t("empty.pick"), t("empty.pick.sub"));
}
function renderStats() {
  const n = INBOX.length, c = { share: 0, redact: 0, private: 0 }, shared = INBOX.filter((x) => x.shared).length;
  INBOX.forEach((x) => x.verdict && c[x.verdict.decision]++);
  const card = (k, v, color, frac) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>
    <div class="bar"><i style="width:${Math.round(frac * 100)}%;background:${color}"></i></div></div>`;
  $("#inbox-stats").innerHTML = card(t("stat.share"), c.share, "var(--share)", n ? c.share / n : 0)
    + card(t("stat.redact"), c.redact, "var(--redact)", n ? c.redact / n : 0)
    + card(t("stat.private"), c.private, "var(--private)", n ? c.private / n : 0)
    + card(t("stat.shared"), shared, "var(--accent)", n ? shared / n : 0);
}
function renderInbox() {
  const q = $("#inbox-search").value.toLowerCase();
  const items = INBOX.filter((c) => c.title.toLowerCase().includes(q));
  $("#inbox-list").innerHTML = items.map((c) => `
    <li data-id="${c.id}" class="${$("#inbox-detail").dataset.id === c.id ? "sel" : ""}">
      <div class="li-title">${esc(c.title)}</div>
      <div class="li-meta">${pill(c.verdict)}${c.shared ? `<span class="pill pill-ai">${fmtName(c.shared.format)}</span>` : ""}<span>${ago(c.created_at)}</span></div>
    </li>`).join("") || `<li class="muted" style="cursor:default">${t("nomatch")}</li>`;
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
  if (!v) return `<div class="verdict none"><div class="icon">${ICON.q}</div><div><div class="t">${t("v.none")}</div>
    <div class="r">${t("v.none.sub")}</div></div></div>`;
  return `<div class="verdict ${v.decision}"><div class="icon">${DEC_ICON[v.decision]}</div><div>
    <div class="t">${t("dec." + v.decision)}</div><div class="r">${esc(v.reason)}</div>
    <div class="m">${v.categories.map((c) => `<span class="chip">${esc(c.replaceAll("_", " "))}</span>`).join("")}
      ${v.redactions.length ? `<span>${t("v.masks", { n: v.redactions.length })}</span>` : ""}
      <span class="mono">· ${esc(v.engine)}</span></div></div></div>`;
}

const STEPS = [["mask", "nano"], ["format", "super"], ["write", "super"], ["recheck", "nano"], ["publish", ""]];
async function openChat(id) {
  $("#inbox-detail").dataset.id = id; renderInbox();
  const c = await api(`/api/conversation/${id}`), v = c.verdict, row = INBOX.find((x) => x.id === id);
  let dec = v?.decision || "", fmt = "";
  const segDec = DECS.map((k) => `<button data-dec="${k}" class="${k === dec ? "on" : ""}">${t("decs." + k)}</button>`).join("");
  const segFmt = `<button data-fmt="" class="on">${ICON.spark}${t("fmt.auto")}</button>` + FMTS.map((k) => `<button data-fmt="${k}">${fmtName(k)}</button>`).join("");
  $("#inbox-detail").innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div><h2>${esc(c.title)}</h2><div class="muted">${t("chat.meta", { n: c.messages.length, src: esc(c.source), ago: ago(c.created_at) })}</div></div>
      <button class="btn btn-sm" id="btn-gate">${ICON.shield}${v ? t("btn.rerun") : t("btn.run")}</button>
    </div>
    ${verdictCard(v)}
    ${row?.shared ? `<div class="result">${t("shared.as", { fmt: `<b>${fmtName(row.shared.format)}</b>` })} <a href="/api/artifact/${id}" target="_blank">${t("open")} ${ICON.ext}</a></div>` : ""}
    <div class="label">${t("label.call")}</div>
    <div class="seg" id="seg-dec">${segDec}</div>
    <div class="label">${t("label.format")}</div>
    <div class="seg" id="seg-fmt">${segFmt}</div>
    <div class="share-row"><button class="btn btn-primary" id="btn-share">${ICON.spark}${row?.shared ? t("btn.shareagain") : t("btn.share")}</button>
      <span class="muted">${v ? "" : t("hint.gatefirst")}</span></div>
    <div id="pipeline"></div>
    <div class="label">${t("label.convo")}</div>
    <div class="convo">${c.messages.map((m) => `<div class="bubble ${m.role}"><div class="who">${m.role === "user" ? t("who.you") : t("who.ai")}</div>${highlight(m.content, v?.redactions)}</div>`).join("")}</div>`;

  $$("#seg-dec button").forEach((b) => (b.onclick = () => { dec = b.dataset.dec; $$("#seg-dec button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $$("#seg-fmt button").forEach((b) => (b.onclick = () => { fmt = b.dataset.fmt; $$("#seg-fmt button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#btn-gate").onclick = async () => {
    $("#btn-gate").disabled = true;
    try { await api(`/api/gate/${id}`, { method: "POST" }); await loadInbox(); }
    catch (e) { toast(e.message, true); $("#btn-gate").disabled = false; }
  };
  $("#btn-share").onclick = () => runShare(id, v, dec, fmt);
}

async function runShare(id, v, dec, fmt) {
  const btn = $("#btn-share"); btn.disabled = true;
  const decision = dec && dec !== v?.decision ? dec : null;
  if ((dec || v?.decision) === "private") {
    $("#pipeline").innerHTML = `<div class="result err">${t("kept.private")}</div>`; btn.disabled = false; return;
  }
  $("#pipeline").innerHTML = `<div class="pipeline">${STEPS.map(([k, tier]) => `
    <div class="step" data-step="${k}"><span class="s-icon"></span>${t("step." + k)}<span class="s-model mono">${!tier ? "" : STATUS.mock ? t("mockrules") : esc(STATUS.models[tier] || tier)}</span></div>`).join("")}</div>`;
  const steps = $$(".step"); let i = 0;
  steps[0].classList.add("run");
  const timer = setInterval(() => { if (i < steps.length - 2) { steps[i].className = "step done"; steps[++i].classList.add("run"); } }, STATUS.mock ? 350 : 2200);
  try {
    const r = await api(`/api/share/${id}`, { method: "POST", body: JSON.stringify({ decision, format: fmt || null }) });
    clearInterval(timer); steps.forEach((s) => (s.className = "step done"));
    $("#pipeline").insertAdjacentHTML("beforeend", `<div class="result">
      <div style="display:flex;gap:10px;align-items:center">${fmtBadge(r.format)}<div><b>${esc(r.title)}</b><div class="muted">${fmtName(r.format)} — ${esc(r.why)}</div></div>
      <a class="btn btn-sm" style="margin-left:auto" href="/api/artifact/${id}" target="_blank">${t("open")} ${ICON.ext}</a></div>
      <div style="margin-top:8px">${r.topics.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div></div>`);
    toast(t("toast.shared"));
    INBOX = await api(`/api/inbox/${encodeURIComponent(ME)}`); renderStats(); renderInbox();
  } catch (e) {
    clearInterval(timer);
    const cur = steps.find((s) => s.classList.contains("run")); if (cur) cur.className = "step fail";
    $("#pipeline").insertAdjacentHTML("beforeend", `<div class="result err">${esc(e.message)}</div>`);
  }
  btn.disabled = false;
}

$("#gate-all").onclick = async () => {
  if (!ME) return toast(t("toast.loaddemo"), true);
  const b = $("#gate-all"); b.disabled = true; $("#gate-all-label").textContent = t("btn.checking");
  try { const r = await api(`/api/gate-all/${encodeURIComponent(ME)}`, { method: "POST" }); toast(t("toast.checked", { n: Object.keys(r).length })); }
  catch (e) { toast(e.message, true); }
  b.disabled = false; $("#gate-all-label").textContent = t("btn.gate"); loadInbox();
};
async function loadDemo() {
  const r = await api("/api/demo/load", { method: "POST" });
  toast(t("toast.loaded", { p: r.people, c: r.conversations })); await loadPeople(); loadInbox();
}
$("#load-demo").onclick = loadDemo;
$("#import-file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f || !ME) return;
  const fd = new FormData(); fd.append("owner", ME); fd.append("file", f);
  const r = await fetch("/api/import", { method: "POST", body: fd });
  r.ok ? toast(t("toast.imported", { n: (await r.json()).imported })) : toast(t("toast.importfail"), true);
  e.target.value = ""; loadInbox();
};

// ---------- feed ----------
let FEED = [], FEED_FILTER = "";
async function loadFeed() {
  FEED = await api("/api/feed");
  $("#count-feed").textContent = FEED.length || "";
  const fmts = [...new Set(FEED.map((s) => s.format))];
  $("#feed-filters").innerHTML = `<div class="seg">${["", ...fmts].map((f) => `<button data-f="${f}" class="${f === FEED_FILTER ? "on" : ""}">${f ? fmtName(f) : t("fmt.all")}</button>`).join("")}</div>`;
  $$("#feed-filters button").forEach((b) => (b.onclick = () => { FEED_FILTER = b.dataset.f; loadFeed(); }));
  const items = FEED.filter((s) => !FEED_FILTER || s.format === FEED_FILTER);
  $("#feed-list").innerHTML = items.map((s) => `
    <li data-id="${s.conv_id}" class="${$("#feed-detail").dataset.id === s.conv_id ? "sel" : ""}"><div class="feed-item">${fmtBadge(s.format)}<div class="body">
      <div class="li-title">${esc(s.title)}</div>
      <div class="li-meta"><span class="avatar" style="width:18px;height:18px;font-size:8px">${initials(s.owner_name)}</span>${esc(s.owner_name)} · ${ago(s.created_at)} · <span class="score">▲ ${s.score}</span></div>
      <div style="margin-top:6px">${s.topics.slice(0, 4).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div></div></div></li>`).join("");
  const open = $("#feed-detail").dataset.id;
  if (!items.length) $("#feed-detail").innerHTML = empty(ICON.chat, t("feed.empty"), t("feed.empty.sub"));
  else if (open && items.some((s) => s.conv_id === open)) openShared(open);
  else $("#feed-detail").innerHTML = empty(ICON.chat, t("feed.pick"), t("feed.pick.sub"));
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
      <div style="flex:1;min-width:200px"><h2>${esc(s.title)}</h2><div class="muted">${esc(s.owner_name)} · ${fmtName(s.format)} · ${esc(s.format_reason)}</div></div>
      <div class="vote"><button class="btn btn-sm" data-v="1">${ICON.up}${t("btn.useful")}</button><button class="btn btn-sm btn-ghost" data-v="-1">${ICON.down}</button>
        <a class="btn btn-sm btn-ghost" href="/api/artifact/${id}" target="_blank">${ICON.ext}</a></div></div>
    <div style="margin-top:10px">${s.topics.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}
      ${s.recheck?.ok ? `<span class="pill pill-share" style="margin-left:4px"><span class="d"></span>${t("recheck.ok")}</span>` : ""}</div>
    ${body}`;
  $$("#feed-detail button[data-v]").forEach((b) => (b.onclick = async () => {
    await api(`/api/vote/${id}`, { method: "POST", body: JSON.stringify({ voter: ME, value: +b.dataset.v }) });
    toast(+b.dataset.v > 0 ? t("toast.useful") : t("toast.notuseful")); loadFeed();
  }));
}

// ---------- map ----------
async function loadMap() {
  const g = await api("/api/graph");
  const css = getComputedStyle(document.documentElement);
  const color = { person: "#8b5cf6", topic: css.getPropertyValue("--muted").trim() || "#888", md: "#6366f1", html: "#22d3ee", pdf: "#fb7185", video: "#a78bfa" };
  $("#map-legend").innerHTML = ["person", "md", "html", "pdf", "video", "topic"]
    .map((k) => `<span><i style="background:${color[k]}"></i>${t("leg." + k)}</span>`).join("");
  if (!g.nodes.length) { $("#graph").innerHTML = empty(ICON.chat, t("map.empty"), t("map.empty.sub")); return; }
  $("#graph").innerHTML = "";
  cytoscape({
    container: $("#graph"),
    elements: [...g.nodes.map((n) => ({ data: n })), ...g.edges.map((e, i) => ({ data: { id: "e" + i, ...e } }))],
    style: [
      { selector: "node", style: { label: "data(label)", "font-size": 10, "font-family": "Inter, 'Noto Sans JP'", color: css.getPropertyValue("--text-2").trim(),
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
    if (id.startsWith("s:")) { $("#feed-detail").dataset.id = id.slice(2); showTab("feed"); }
  });
}

// ---------- ask ----------
function initAsk() {
  updateAvatars();
  $("#ask-engine").textContent = STATUS.mock ? t("ask.engine.mock") : t("ask.engine.live");
  if (!$("#chat-log").children.length) $("#chat-log").innerHTML = empty(ICON.spark, t("ask.empty"), t("ask.empty.sub"));
  $("#suggest").innerHTML = ["sug.1", "sug.2", "sug.3"].map((k) => `<button type="button">${esc(t(k))}</button>`).join("");
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
  const label = `<div class="who">${esc(t("ask.agent", { name: who?.name || "" }))}</div>`;
  row.innerHTML = `<div class="avatar">${initials(who?.name)}</div><div class="bubble">${label}<span class="typing"><i></i><i></i><i></i></span></div>`;
  $("#chat-log").appendChild(row); row.scrollIntoView({ behavior: "smooth" });
  try {
    const r = await api("/api/ask", { method: "POST", body: JSON.stringify({ person: who.id, question: q }) });
    $(".bubble", row).innerHTML = `${label}${marked.parse(r.answer)}
      <div class="sources">${r.citations.length ? t("ask.sources") : t("ask.nosource")} ${r.citations.map((c) => `<span class="chip">${esc(c.title)}</span>`).join("")}
      <span class="mono">· ${esc(r.engine)}</span></div>`;
  } catch (err) { $(".bubble", row).innerHTML = `<span style="color:var(--private)">${esc(err.message)}</span>`; }
  row.scrollIntoView({ behavior: "smooth" });
};

// ---------- voice ----------
async function loadVoice() {
  if (!ME) { $("#voice-out").innerHTML = `<div class="panel">${empty(ICON.chat, t("voice.nochats"), t("voice.nochats.sub"))}</div>`; return; }
  const v = await api(`/api/voice/${encodeURIComponent(ME)}`);
  if (!v || !v.profile) { $("#voice-out").innerHTML = `<div class="panel">${empty(ICON.chat, t("voice.nothing"), t("voice.nothing.sub"))}</div>`; return; }
  const p = v.profile, row = (k, val) => `<div class="k">${t("voice." + k)}</div><div>${val || "—"}</div>`;
  $("#voice-out").innerHTML = `<div class="voice-grid">
    <div class="panel voice-card"><div class="label" style="margin-top:0">${esc(t("voice.how", { name: person(ME)?.name.split(" ")[0] || "" }))}</div>
      <div class="voice-quote">${esc(p.summary)}</div>
      <div class="kv">${row("tone", esc(p.tone))}${row("formality", esc(p.formality))}${row("sentences", esc(p.sentence_length))}${row("structure", esc(p.structure))}
        ${row("habits", (p.habits || []).map(esc).join("; "))}
        ${row("phrases", (p.stock_phrases || []).map((x) => `<span class="chip">${esc(x)}</span>`).join(""))}
        ${row("avoid", (p.avoid || []).map(esc).join("; "))}</div></div>
    <div class="panel voice-card"><div class="label" style="margin-top:0">${t("voice.lines")}</div>
      ${(v.examples || []).map((e) => `<div class="example">“${esc(e)}”</div>`).join("") || `<p class="muted">${t("voice.lines.none")}</p>`}
      <p class="muted" style="margin-top:14px">${t("voice.note")}</p></div></div>`;
}
$("#voice-rebuild").onclick = async () => { await api(`/api/voice/${encodeURIComponent(ME)}`, { method: "POST" }); toast(t("toast.relearned")); loadVoice(); };

// ---------- usage ----------
async function loadUsage() {
  const rows = await api("/api/usage");
  $("#tiers").innerHTML = ["nano", "super", "ultra"].map((tier) => {
    const r = rows.find((x) => x.tier === tier) || { calls: 0, prompt_tokens: 0, completion_tokens: 0, seconds: 0 };
    return `<div class="panel tier"><h3>Nemotron 3 ${tier[0].toUpperCase() + tier.slice(1)}</h3><div class="model mono">${esc(STATUS.models[tier] || "")}</div>
      <div class="big">${(r.calls || 0).toLocaleString()} <span class="muted" style="font-size:13px;font-weight:500">${t("usage.calls")}</span></div>
      <div class="muted">${((r.prompt_tokens || 0) + (r.completion_tokens || 0)).toLocaleString()} ${t("usage.tokens")} · ${r.seconds || 0}s</div>
      <div class="role">${t("role." + tier)}</div></div>`;
  }).join("");
  if (STATUS.mock) $("#tiers").insertAdjacentHTML("beforeend", `<p class="muted" style="grid-column:1/-1">${t("usage.mock")}</p>`);
}

// ---------- boot ----------
(async () => {
  applyStatic();
  STATUS = await api("/api/status");
  setEngine();
  await loadPeople(); loadInbox();
  api("/api/feed").then((f) => ($("#count-feed").textContent = f.length || "")).catch(() => {});
})();
