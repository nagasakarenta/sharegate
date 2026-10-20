/* ShareGate front end. Plain JS, no build step.
   Globals used by onboarding.js: $, $$, store, t, ICON, api, toast, showTab, openChat, INBOX, ME, PEOPLE,
   loadPeople, loadInbox, updateAvatars, initials, esc, window.SG_READY */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ME = null, PEOPLE = [], STATUS = { mock: true, models: {} }, INBOX = [], FEED = [], FEED_FILTER = "", CURRENT_TAB = "inbox";
const TABS = ["inbox", "feed", "map", "ask", "voice", "usage"];
const DECS = ["share", "redact", "private"];
const FMTS = ["md", "html", "pdf", "video"];
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
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  map: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="10" cy="18" r="2.5"/><path d="m8 7 8 1M7.5 8 9.5 16M16.5 10l-5 6.5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 1 7 7c0 2.6-1.4 4.9-3.5 6.1V19a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-2.9A7 7 0 0 1 12 3Z"/><path d="M9.5 22h5"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/></svg>',
  bars: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
};
const TAB_ICON = { inbox: ICON.chat, feed: ICON.list, map: ICON.map, ask: ICON.bulb, voice: ICON.mic, usage: ICON.bars };
const DEC_ICON = { share: ICON.shield, redact: ICON.mask, private: ICON.lock };
const fmtName = (f) => t("fmt." + f);
const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const person = (id) => PEOPLE.find((p) => p.id === id);
const ago = (ts) => { const d = (Date.now() / 1000 - ts) / 86400; return d < 1 ? t("ago.today") : d < 2 ? t("ago.yesterday") : t("ago.days", { n: Math.floor(d) }); };
const pill = (v) => v ? `<span class="pill pill-${v.decision}"><span class="d"></span>${t("decs." + v.decision)}</span>` : `<span class="pill">${t("notchecked")}</span>`;
const fmtBadge = (f) => `<div class="fmt fmt-${f}">${f === "video" ? "▶" : f.toUpperCase()}</div>`;
const empty = (icon, title, sub, cta = "") => `<div class="empty"><div><div class="glyph">${icon}</div><b>${title}</b><div>${sub}</div>${cta}</div></div>`;
const skeleton = (rows = 5) => Array.from({ length: rows }, () => `<li class="sk-card" style="cursor:default"><div class="sk sk-line" style="width:${55 + Math.random() * 35}%"></div><div class="sk sk-line" style="width:40%;height:10px"></div></li>`).join("");
const cleanAnswer = (txt) => txt.replace(/\n*\s*Sources?:\s*(\[c[0-9a-z]+\]\s*)*\s*$/i, "").replace(/\s*\[c[0-9a-z]{4,}\]/g, "").trim();
const skDetail = () => `<div class="sk sk-line" style="width:45%;height:18px"></div><div class="sk sk-line" style="width:30%"></div><div class="sk" style="height:72px;margin:18px 0;border-radius:10px"></div><div class="sk sk-line" style="width:90%"></div><div class="sk sk-line" style="width:80%"></div><div class="sk sk-line" style="width:60%"></div>`;

// ---------- network ----------
async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((body && body.detail) || body || r.statusText);
  return body;
}
/** POST and consume a server-sent-event stream; calls on(event, data) for each event. */
async function sse(path, payload, on, signal) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
  if (!r.ok || !r.body) throw new Error((await r.text()) || r.statusText);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = "message", data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) on(ev, JSON.parse(data));
    }
  }
}
function toast(msg, err = false, action) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.innerHTML = `${err ? ICON.x : ICON.check}<span>${esc(msg)}</span>${action ? `<button class="btn btn-sm btn-ghost">${esc(action.label)}</button>` : ""}`;
  if (action) $("button", el).onclick = () => { action.run(); el.remove(); };
  $("#toasts").appendChild(el);
  while ($("#toasts").children.length > 3) $("#toasts").firstChild.remove();
  setTimeout(() => el.remove(), action ? 6000 : 3500);
}

// ---------- theme, language, tabs ----------
function setTheme(th) { document.documentElement.dataset.theme = th; store.set("sg-theme", th); if (CURRENT_TAB === "map") loadMap(); }
const toggleTheme = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
function toggleLang() {
  LANG = LANG === "en" ? "ja" : "en"; store.set("sg-lang", LANG);
  applyStatic(); setEngine(); $("#chat-log").innerHTML = "";
  delete $("#inbox-detail").dataset.id; delete $("#feed-detail").dataset.id;
  if (typeof OB !== "undefined") OB.renderChecklist();
  showTab(CURRENT_TAB);
}
$("#theme-toggle").onclick = toggleTheme;
$("#lang-toggle").onclick = toggleLang;
$$(".nav button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(name) {
  CURRENT_TAB = name;
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach((x) => x.classList.toggle("active", x.id === "tab-" + name));
  $("#topbar-title").textContent = t("nav." + name);
  ({ inbox: loadInbox, feed: loadFeed, map: loadMap, ask: initAsk, voice: loadVoice, usage: loadUsage })[name]();
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
function switchMe(id) { ME = id; store.set("sg-me", ME); $("#me").value = ME; updateAvatars(); delete $("#inbox-detail").dataset.id; loadInbox(); }
$("#me").onchange = () => switchMe($("#me").value);

// ---------- inbox ----------
async function loadInbox() {
  if (!ME) {
    $("#inbox-list").innerHTML = ""; $("#inbox-stats").innerHTML = "";
    $("#inbox-detail").innerHTML = empty(ICON.chat, t("empty.nochats"), t("empty.nochats.sub"),
      `<div style="margin-top:14px"><button class="btn btn-primary" onclick="loadDemo()">${t("btn.demo")}</button></div>`);
    return;
  }
  if (!INBOX.length) $("#inbox-list").innerHTML = skeleton();
  INBOX = await api(`/api/inbox/${encodeURIComponent(ME)}`);
  $("#count-inbox").textContent = INBOX.length || "";
  renderStats(); renderInbox();
  if (typeof OB !== "undefined") OB.syncFromState();
  const open = $("#inbox-detail").dataset.id;
  if (open && INBOX.some((c) => c.id === open)) openChat(open);
  else $("#inbox-detail").innerHTML = empty(ICON.shield, t("empty.pick"), t("empty.pick.sub"));
}
function renderStats() {
  const n = INBOX.length, c = { share: 0, redact: 0, private: 0 }, shared = INBOX.filter((x) => x.shared).length;
  INBOX.forEach((x) => x.verdict && c[x.verdict.decision]++);
  const card = (k, v, color, frac) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="bar"><i style="width:${Math.round(frac * 100)}%;background:${color}"></i></div></div>`;
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

function highlight(text, reds, masked) {
  let out = esc(text);
  for (const r of (reds || []).slice().sort((a, b) => b.text.length - a.text.length)) {
    const rep = masked ? `<mark class="masked">${esc(r.placeholder)}</mark>` : `<mark title="${esc(r.category)} → ${esc(r.placeholder)}">${esc(r.text)}</mark>`;
    out = out.split(esc(r.text)).join(rep);
  }
  return out;
}
function verdictCard(v) {
  if (!v) return `<div class="verdict none"><div class="icon">${ICON.q}</div><div><div class="t">${t("v.none")}</div><div class="r">${t("v.none.sub")}</div></div></div>`;
  return `<div class="verdict ${v.decision}"><div class="icon">${DEC_ICON[v.decision]}</div><div>
    <div class="t">${t("dec." + v.decision)}</div><div class="r">${esc(v.reason)}</div>
    <div class="m">${v.categories.map((c) => `<span class="chip">${esc(c.replaceAll("_", " "))}</span>`).join("")}
      ${v.redactions.length ? `<span>${t("v.masks", { n: v.redactions.length })}</span>` : ""}<span class="mono">${esc(v.engine)}</span></div></div></div>`;
}

const STEPS = [["mask", "nano"], ["format", "super"], ["write", "super"], ["recheck", "nano"], ["publish", ""]];
async function openChat(id) {
  $("#inbox-detail").dataset.id = id; renderInbox();
  $("#inbox-detail").innerHTML = skDetail();
  const c = await api(`/api/conversation/${id}`), v = c.verdict, row = INBOX.find((x) => x.id === id);
  if ($("#inbox-detail").dataset.id !== id) return;
  let dec = v?.decision || "", fmt = "", masked = false;
  const canMask = !!v?.redactions?.length;
  $("#inbox-detail").innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><h2>${esc(c.title)}</h2><div class="muted">${t("chat.meta", { n: c.messages.length, src: esc(c.source), ago: ago(c.created_at) })}</div></div>
      <button class="btn btn-sm" id="btn-gate">${ICON.shield}${v ? t("btn.rerun") : t("btn.run")}</button>
    </div>
    ${verdictCard(v)}
    ${row?.shared ? `<div class="result note">${t("shared.as", { fmt: `<b>${fmtName(row.shared.format)}</b>` })} <a href="/api/artifact/${id}" target="_blank">${t("open")} ${ICON.ext}</a></div>` : ""}
    <div class="label">${t("label.call")}</div>
    <div class="seg" id="seg-dec">${DECS.map((k) => `<button data-dec="${k}" class="${k === dec ? "on" : ""}">${t("decs." + k)}</button>`).join("")}</div>
    <div class="label">${t("label.format")}</div>
    <div class="seg" id="seg-fmt"><button data-fmt="" class="on">${ICON.spark}${t("fmt.auto")}</button>${FMTS.map((k) => `<button data-fmt="${k}">${fmtName(k)}</button>`).join("")}</div>
    <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="btn-share">${ICON.spark}${row?.shared ? t("btn.shareagain") : t("btn.share")}</button>
      <span class="muted">${v ? "" : t("hint.gatefirst")}</span></div>
    <div id="pipeline"></div>
    <div class="row" style="justify-content:space-between"><div class="label">${t("label.convo")}</div>
      ${canMask ? `<div class="seg" id="seg-view"><button data-m="0" class="on">${t("view.original")}</button><button data-m="1">${t("view.masked")}</button></div>` : ""}</div>
    <div class="convo" id="convo"></div>`;
  const renderConvo = () => { $("#convo").innerHTML = c.messages.map((m) => `<div class="bubble ${m.role}"><div class="who">${m.role === "user" ? t("who.you") : t("who.ai")}</div>${highlight(m.content, v?.redactions, masked)}</div>`).join(""); };
  renderConvo();
  $$("#seg-dec button").forEach((b) => (b.onclick = () => { dec = b.dataset.dec; $$("#seg-dec button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $$("#seg-fmt button").forEach((b) => (b.onclick = () => { fmt = b.dataset.fmt; $$("#seg-fmt button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $$("#seg-view button").forEach((b) => (b.onclick = () => { masked = b.dataset.m === "1"; $$("#seg-view button").forEach((x) => x.classList.toggle("on", x === b)); renderConvo(); }));
  $("#btn-gate").onclick = async () => {
    $("#btn-gate").disabled = true; $("#btn-gate").innerHTML = `${ICON.shield}${t("btn.checking")}`;
    try { await api(`/api/gate/${id}`, { method: "POST" }); obMark("gate"); await loadInbox(); }
    catch (e) { toast(e.message, true); $("#btn-gate").disabled = false; }
  };
  $("#btn-share").onclick = () => runShare(id, v, dec, fmt);
}

async function runShare(id, v, dec, fmt) {
  const btn = $("#btn-share"); btn.disabled = true;
  const decision = dec && dec !== v?.decision ? dec : null;
  if ((dec || v?.decision) === "private") { $("#pipeline").innerHTML = `<div class="result err">${t("kept.private")}</div>`; btn.disabled = false; return; }
  $("#pipeline").innerHTML = `<div class="pipeline">${STEPS.map(([k, tier]) => `<div class="step" data-step="${k}"><span class="s-icon"></span><span class="s-label">${t("step." + k)}</span>
    <span class="s-meta">${tier ? `<span class="mono" title="${esc(STATUS.models[tier] || "")}">${STATUS.mock ? t("mockrules") : tier[0].toUpperCase() + tier.slice(1)}</span>` : ""}<span class="mono took"></span></span></div>`).join("")}</div>`;
  const started = {}; let last = null;
  const mark = (k, cls) => { const el = $(`.step[data-step="${k}"]`); if (!el) return; el.className = "step " + cls;
    if (cls === "done" && started[k]) $(".took", el).textContent = t("took", { s: ((Date.now() - started[k]) / 1000).toFixed(1) }); };
  try {
    await sse(`/api/share/${id}/stream`, { decision, format: fmt || null }, (ev, data) => {
      if (ev === "step") { if (last) mark(last, "done"); last = data.step; started[last] = Date.now(); mark(last, "run"); }
      else if (ev === "done") {
        if (last) mark(last, "done");
        $("#pipeline").insertAdjacentHTML("beforeend", `<div class="result"><div class="row">${fmtBadge(data.format)}<div style="flex:1;min-width:160px"><b>${esc(data.title)}</b><div class="muted">${fmtName(data.format)} — ${esc(data.why)}</div></div>
          <a class="btn btn-sm" href="/api/artifact/${id}" target="_blank">${t("open")} ${ICON.ext}</a></div><div style="margin-top:8px">${data.topics.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div></div>`);
        toast(t("toast.shared"), false, { label: t("undo"), run: async () => { await api(`/api/share/${id}`, { method: "DELETE" }); toast(t("toast.unshared")); loadInbox(); } });
        obMark("share"); api(`/api/inbox/${encodeURIComponent(ME)}`).then((x) => { INBOX = x; renderStats(); renderInbox(); });
      } else if (ev === "error") { if (last) mark(last, "fail"); $("#pipeline").insertAdjacentHTML("beforeend", `<div class="result err">${esc(data.detail)}</div>`); }
    });
  } catch (e) { if (last) mark(last, "fail"); $("#pipeline").insertAdjacentHTML("beforeend", `<div class="result err">${esc(e.message)}</div>`); }
  btn.disabled = false;
}

$("#gate-all").onclick = async () => {
  if (!ME) return toast(t("toast.loaddemo"), true);
  const b = $("#gate-all"); b.disabled = true; $("#gate-all-label").textContent = t("btn.checking");
  try { const r = await api(`/api/gate-all/${encodeURIComponent(ME)}`, { method: "POST" }); toast(t("toast.checked", { n: Object.keys(r).length })); obMark("gate"); }
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
  const body = await r.json().catch(() => ({}));
  r.ok ? toast(t("toast.imported", { n: body.imported })) : toast(body.detail || t("toast.importfail"), true);
  e.target.value = ""; loadInbox();
};

// ---------- feed ----------
async function loadFeed() {
  if (!FEED.length) $("#feed-list").innerHTML = skeleton(4);
  FEED = await api("/api/feed");
  $("#count-feed").textContent = FEED.length || "";
  const fmts = [...new Set(FEED.map((s) => s.format))];
  $("#feed-filters").innerHTML = fmts.length ? `<div class="seg">${["", ...fmts].map((f) => `<button data-f="${f}" class="${f === FEED_FILTER ? "on" : ""}">${f ? fmtName(f) : t("fmt.all")}</button>`).join("")}</div>` : "";
  $$("#feed-filters button").forEach((b) => (b.onclick = () => { FEED_FILTER = b.dataset.f; loadFeed(); }));
  const items = FEED.filter((s) => !FEED_FILTER || s.format === FEED_FILTER);
  $("#feed-list").innerHTML = items.map((s) => `
    <li data-id="${s.conv_id}" class="${$("#feed-detail").dataset.id === s.conv_id ? "sel" : ""}"><div class="feed-item">${fmtBadge(s.format)}<div class="body">
      <div class="li-title">${esc(s.title)}</div>
      <div class="li-meta"><span class="avatar" style="width:16px;height:16px;font-size:7.5px">${initials(s.owner_name)}</span>${esc(s.owner_name)} · ${ago(s.created_at)} · <span class="score">▲ ${s.score}</span></div>
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
  $("#feed-detail").innerHTML = skDetail();
  const body = s.format === "md" ? `<div class="doc">${marked.parse(await api(`/api/artifact/${id}`))}</div>` : `<iframe class="doc-frame" sandbox="" src="/api/artifact/${id}"></iframe>`;
  if ($("#feed-detail").dataset.id !== id) return;
  $("#feed-detail").innerHTML = `
    <div class="row" style="align-items:flex-start">${fmtBadge(s.format)}
      <div style="flex:1;min-width:200px"><h2>${esc(s.title)}</h2><div class="muted">${esc(s.owner_name)} · ${fmtName(s.format)} · ${esc(s.format_reason)}</div></div>
      <div class="row" style="gap:4px"><button class="btn btn-sm" data-v="1">${ICON.up}${t("btn.useful")}</button><button class="btn btn-sm btn-ghost" data-v="-1">${ICON.down}</button>
        <a class="btn btn-sm btn-ghost" href="/api/artifact/${id}" target="_blank">${ICON.ext}</a></div></div>
    <div style="margin-top:10px">${s.topics.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}${s.recheck?.ok ? `<span class="pill pill-share" style="margin-left:4px"><span class="d"></span>${t("recheck.ok")}</span>` : ""}</div>
    ${body}`;
  $$("#feed-detail button[data-v]").forEach((b) => (b.onclick = async () => {
    await api(`/api/vote/${id}`, { method: "POST", body: JSON.stringify({ voter: ME, value: +b.dataset.v }) });
    toast(+b.dataset.v > 0 ? t("toast.useful") : t("toast.notuseful")); loadFeed();
  }));
}

// ---------- map ----------
async function loadMap() {
  const g = await api("/api/graph");
  const css = getComputedStyle(document.documentElement), v = (n) => css.getPropertyValue(n).trim();
  const color = { person: v("--accent"), topic: v("--fg-4"), md: "#6366f1", html: "#22d3ee", pdf: "#fb7185", video: "#a78bfa" };
  $("#map-legend").innerHTML = ["person", "md", "html", "pdf", "video", "topic"].map((k) => `<span><i style="background:${color[k]}"></i>${t("leg." + k)}</span>`).join("");
  if (!g.nodes.length) { $("#graph").innerHTML = empty(ICON.chat, t("map.empty"), t("map.empty.sub")); return; }
  $("#graph").innerHTML = "";
  cytoscape({
    container: $("#graph"),
    elements: [...g.nodes.map((n) => ({ data: n })), ...g.edges.map((e, i) => ({ data: { id: "e" + i, ...e } }))],
    style: [
      { selector: "node", style: { label: "data(label)", "font-size": 10, "font-family": "Inter, 'Noto Sans JP'", color: v("--fg-2"), "background-color": (n) => color[n.data("kind")] || "#888",
        "text-wrap": "ellipsis", "text-max-width": 130, "text-valign": "bottom", "text-margin-y": 5, width: 16, height: 16, "border-width": 2, "border-color": v("--surface-1") } },
      { selector: 'node[kind="person"]', style: { width: 34, height: 34, "font-size": 11.5, "font-weight": 600, color: v("--fg") } },
      { selector: 'node[kind="topic"]', style: { shape: "round-rectangle", width: 9, height: 9, "font-size": 9 } },
      { selector: "edge", style: { width: 1, "line-color": v("--line-3"), "curve-style": "bezier" } },
      { selector: "node:selected", style: { "border-color": v("--fg"), "border-width": 2.5 } },
    ],
    layout: { name: "cose", animate: false, nodeRepulsion: 9000, idealEdgeLength: 70 },
  }).on("tap", "node", (e) => { const id = e.target.id(); if (id.startsWith("s:")) { $("#feed-detail").dataset.id = id.slice(2); showTab("feed"); } });
}

// ---------- ask (streaming) ----------
let askCtl = null;
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
  const who = person($("#ask-person").value); if (!who) return;
  if ($(".empty", $("#chat-log"))) $("#chat-log").innerHTML = "";
  $("#ask-q").value = ""; $("#ask-q").style.height = "auto";
  $("#chat-log").insertAdjacentHTML("beforeend", `<div class="msg-row q"><div class="avatar">${initials(person(ME)?.name)}</div><div class="bubble">${esc(q)}</div></div>`);
  const row = document.createElement("div"); row.className = "msg-row a";
  const label = `<div class="who">${esc(t("ask.agent", { name: who.name }))}</div>`;
  row.innerHTML = `<div class="avatar">${initials(who.name)}</div><div class="bubble">${label}<div class="ans"><span class="caret"></span></div></div>`;
  $("#chat-log").appendChild(row); row.scrollIntoView({ behavior: "smooth", block: "end" });
  const ans = $(".ans", row); let text = "", raf = 0;
  const paint = () => { raf = 0; ans.innerHTML = marked.parse(cleanAnswer(text)) + '<span class="caret"></span>'; row.scrollIntoView({ block: "end" }); };
  askCtl?.abort(); askCtl = new AbortController();
  try {
    await sse("/api/ask/stream", { person: who.id, question: q }, (ev, data) => {
      if (ev === "token") { text += data; if (!raf) raf = requestAnimationFrame(paint); }
      else if (ev === "done") {
        cancelAnimationFrame(raf); raf = 0;
        ans.innerHTML = marked.parse(cleanAnswer(text)) + `<div class="sources">${data.citations.length ? t("ask.sources") : t("ask.nosource")} ${data.citations.map((c) => `<span class="chip">${esc(c.title)}</span>`).join("")}
          <span class="mono">${esc(data.engine)}${data.seconds ? " · " + t("took", { s: data.seconds }) : ""}</span></div>`;
        obMark("ask");
      } else if (ev === "error") { ans.innerHTML = `<span style="color:var(--private)">${esc(data.detail)}</span>`; }
    }, askCtl.signal);
  } catch (err) { if (err.name !== "AbortError") ans.innerHTML = `<span style="color:var(--private)">${esc(err.message)}</span>`; }
  row.scrollIntoView({ behavior: "smooth", block: "end" });
};

// ---------- voice ----------
async function loadVoice() {
  if (!ME) { $("#voice-out").innerHTML = `<div class="panel">${empty(ICON.chat, t("voice.nochats"), t("voice.nochats.sub"))}</div>`; return; }
  $("#voice-out").innerHTML = `<div class="panel voice-card">${skDetail()}</div>`;
  const v = await api(`/api/voice/${encodeURIComponent(ME)}`);
  if (!v || !v.profile) { $("#voice-out").innerHTML = `<div class="panel">${empty(ICON.chat, t("voice.nothing"), t("voice.nothing.sub"))}</div>`; return; }
  const p = v.profile, row = (k, val) => `<div class="k">${t("voice." + k)}</div><div>${val || "—"}</div>`;
  $("#voice-out").innerHTML = `<div class="voice-grid">
    <div class="panel voice-card"><div class="label" style="margin-top:0">${esc(t("voice.how", { name: person(ME)?.name.split(" ")[0] || "" }))}</div>
      <div class="voice-quote">${esc(p.summary)}</div>
      <div class="kv">${row("tone", esc(p.tone))}${row("formality", esc(p.formality))}${row("sentences", esc(p.sentence_length))}${row("structure", esc(p.structure))}
        ${row("habits", (p.habits || []).map(esc).join("; "))}${row("phrases", (p.stock_phrases || []).map((x) => `<span class="chip">${esc(x)}</span>`).join(""))}${row("avoid", (p.avoid || []).map(esc).join("; "))}</div></div>
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
      <div class="big num">${(r.calls || 0).toLocaleString()} <span class="muted" style="font-size:12.5px;font-weight:500">${t("usage.calls")}</span></div>
      <div class="muted num">${((r.prompt_tokens || 0) + (r.completion_tokens || 0)).toLocaleString()} ${t("usage.tokens")} · ${r.seconds || 0}s</div>
      <div class="role">${t("role." + tier)}</div></div>`;
  }).join("");
  if (STATUS.mock) $("#tiers").insertAdjacentHTML("beforeend", `<p class="muted" style="grid-column:1/-1">${t("usage.mock")}</p>`);
}

// ---------- command palette ----------
const cmdk = { open: false, items: [], idx: 0 };
function cmdkItems(q) {
  const groups = [];
  const match = (s) => !q || s.toLowerCase().includes(q);
  const pages = TABS.filter((k) => match(t("nav." + k))).map((k) => ({ icon: TAB_ICON[k], label: t("nav." + k), hint: String(TABS.indexOf(k) + 1), run: () => showTab(k) }));
  if (pages.length) groups.push({ title: t("cmdk.pages"), items: pages });
  const acts = [
    { icon: ICON.shield, label: t("btn.gate"), run: () => { showTab("inbox"); $("#gate-all").click(); } },
    { icon: ICON.moon, label: t("act.theme"), hint: "T", run: toggleTheme },
    { icon: ICON.globe, label: t("act.lang"), hint: "L", run: toggleLang },
    { icon: ICON.q, label: t("act.tour"), run: () => $("#help").click() },
    { icon: ICON.spark, label: t("act.kbd"), hint: "?", run: () => openKbd(true) },
  ].filter((a) => match(a.label));
  if (acts.length) groups.push({ title: t("cmdk.actions"), items: acts });
  const ppl = PEOPLE.filter((p) => p.id !== ME && match(p.name + " " + p.role)).map((p) => ({ icon: ICON.user, label: `${p.name} · ${p.role}`, run: () => switchMe(p.id) }));
  if (ppl.length) groups.push({ title: t("cmdk.people"), items: ppl });
  const chats = INBOX.filter((c) => match(c.title)).slice(0, q ? 8 : 4).map((c) => ({ icon: ICON.chat, label: c.title, run: () => { showTab("inbox"); openChat(c.id); } }));
  if (chats.length) groups.push({ title: t("cmdk.chats"), items: chats });
  return groups;
}
function renderCmdk() {
  const q = $("#cmdk-input").value.trim().toLowerCase();
  const groups = cmdkItems(q); cmdk.items = groups.flatMap((g) => g.items); cmdk.idx = Math.min(cmdk.idx, Math.max(0, cmdk.items.length - 1));
  let i = 0;
  $("#cmdk-list").innerHTML = groups.map((g) => `<div class="cmdk-group">${g.title}</div>` + g.items.map((it) => `<div class="cmdk-item ${i === cmdk.idx ? "on" : ""}" data-i="${i++}">${it.icon}<span>${esc(it.label)}</span>${it.hint ? `<span class="hint"><kbd>${it.hint}</kbd></span>` : ""}</div>`).join("")).join("")
    || `<div class="cmdk-empty">${t("cmdk.empty")}</div>`;
  $$("#cmdk-list .cmdk-item").forEach((el) => { el.onmouseenter = () => { cmdk.idx = +el.dataset.i; $$("#cmdk-list .cmdk-item").forEach((x) => x.classList.toggle("on", x === el)); }; el.onclick = () => runCmdk(); });
  $(".cmdk-item.on")?.scrollIntoView({ block: "nearest" });
}
function openCmdk(open) { cmdk.open = open; $("#cmdk").hidden = !open; if (open) { $("#cmdk-input").value = ""; cmdk.idx = 0; renderCmdk(); $("#cmdk-input").focus(); } }
function runCmdk() { const it = cmdk.items[cmdk.idx]; openCmdk(false); it?.run(); }
$("#cmd-btn").onclick = () => openCmdk(true);
$("#cmdk").onclick = (e) => { if (e.target === $("#cmdk")) openCmdk(false); };
$("#cmdk-input").oninput = () => { cmdk.idx = 0; renderCmdk(); };
$("#cmdk-input").onkeydown = (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); cmdk.idx = Math.min(cmdk.idx + 1, cmdk.items.length - 1); renderCmdk(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); cmdk.idx = Math.max(cmdk.idx - 1, 0); renderCmdk(); }
  else if (e.key === "Enter") { e.preventDefault(); runCmdk(); }
};

// ---------- keyboard shortcuts ----------
const KB = [["kbd.pages", ["1", "…", "6"]], ["kbd.palette", ["⌘", "K"]], ["kbd.search", ["/"]], ["kbd.move", ["J", "K"]], ["kbd.open", ["↵"]], ["kbd.theme", ["T"]], ["kbd.lang", ["L"]], ["kbd.close", ["esc"]]];
function openKbd(open) {
  $("#kbd").hidden = !open;
  if (open) $("#kb-grid").innerHTML = KB.map(([k, keys]) => `<div class="kb-row"><span>${t(k)}</span><span class="keys">${keys.map((x) => x === "…" ? "<span class='muted'>…</span>" : `<kbd>${x}</kbd>`).join("")}</span></div>`).join("");
}
$("#kbd-btn").onclick = () => openKbd(true);
$("#kbd-close").onclick = () => openKbd(false);
$("#kbd").onclick = (e) => { if (e.target === $("#kbd")) openKbd(false); };

function moveSel(dir) {
  const listId = CURRENT_TAB === "inbox" ? "#inbox-list" : CURRENT_TAB === "feed" ? "#feed-list" : null; if (!listId) return;
  const items = $$(`${listId} li[data-id]`); if (!items.length) return;
  let i = items.findIndex((li) => li.classList.contains("kb")); if (i < 0) i = items.findIndex((li) => li.classList.contains("sel"));
  i = Math.max(0, Math.min(items.length - 1, i + dir));
  items.forEach((li, j) => li.classList.toggle("kb", j === i)); items[i].scrollIntoView({ block: "nearest" });
}
function openSel() { const li = $(".list li.kb"); if (li) li.click(); }
document.addEventListener("keydown", (e) => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCmdk(!cmdk.open); return; }
  if (e.key === "Escape") {
    if (cmdk.open) return openCmdk(false);
    if (!$("#kbd").hidden) return openKbd(false);
    if (inField) { e.target.blur(); if (e.target.id === "inbox-search") { e.target.value = ""; renderInbox(); } }
    return;
  }
  if (inField || cmdk.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key >= "1" && e.key <= "6") return showTab(TABS[+e.key - 1]);
  if (e.key === "/") { e.preventDefault(); (CURRENT_TAB === "ask" ? $("#ask-q") : CURRENT_TAB === "inbox" ? $("#inbox-search") : $("#cmdk-input")).focus(); if (CURRENT_TAB !== "ask" && CURRENT_TAB !== "inbox") openCmdk(true); return; }
  if (e.key === "?") return openKbd($("#kbd").hidden);
  if (e.key === "j") return moveSel(1);
  if (e.key === "k") return moveSel(-1);
  if (e.key === "Enter") return openSel();
  if (e.key === "t") return toggleTheme();
  if (e.key === "l") return toggleLang();
});

// ---------- boot ----------
const obMark = (k) => (typeof OB !== "undefined" ? OB.mark(k) : null);
window.SG_READY = (async () => {
  applyStatic();
  $("#topbar-title").textContent = t("nav.inbox");
  STATUS = await api("/api/status");
  setEngine();
  await loadPeople(); await loadInbox();
  api("/api/feed").then((f) => { FEED = f; $("#count-feed").textContent = f.length || ""; }).catch(() => {});
})();
