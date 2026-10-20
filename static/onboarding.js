// First-run welcome flow and the "Getting started" checklist.
// Progress lives in localStorage (a per-viewer convenience); everything works if storage is blocked.
const OB = (() => {
  const TASKS = ["gate", "mask", "share", "ask"];
  const done = new Set(JSON.parse(store.get("sg-ob-done", "[]")));
  let path = "demo", step = 0;

  // ---------- checklist ----------
  function mark(task) {
    if (done.has(task)) return;
    done.add(task); store.set("sg-ob-done", JSON.stringify([...done]));
    renderChecklist(task);
  }
  function renderChecklist(justDone) {
    const box = $("#checklist");
    if (!box) return;
    if (store.get("sg-ob-hide", "") === "1") { box.hidden = true; return; }
    box.hidden = false;
    const n = TASKS.length, d = TASKS.filter((x) => done.has(x)).length;
    box.innerHTML = `
      <div class="cl-head">
        <div class="ring" style="--p:${Math.round((d / n) * 100)}"><span>${d}/${n}</span></div>
        <div style="flex:1;min-width:0"><div class="cl-title">${t("cl.title")}</div>
          <div class="muted">${d === n ? t("cl.done") : t("cl.progress", { d, n })}</div></div>
        <button class="btn btn-sm btn-ghost" id="cl-hide">${t("cl.hide")}</button>
      </div>
      <div class="cl-items">${TASKS.map((k, i) => `
        <div class="cl-item ${done.has(k) ? "ok" : ""} ${k === justDone ? "pop" : ""}">
          <span class="cl-check">${done.has(k) ? "✓" : i + 1}</span><span class="cl-label">${t("cl." + k)}</span>
          ${done.has(k) ? "" : `<button class="btn btn-sm" data-show="${k}">${t("cl.show")}</button>`}
        </div>`).join("")}</div>`;
    $("#cl-hide").onclick = () => { store.set("sg-ob-hide", "1"); box.hidden = true; };
    $$("#checklist [data-show]").forEach((b) => (b.onclick = () => showMe(b.dataset.show)));
  }
  function spotlight(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("spot"); void el.offsetWidth; el.classList.add("spot");
    setTimeout(() => el.classList.remove("spot"), 3200);
  }
  async function showMe(task) {
    if (task === "gate") { showTab("inbox"); setTimeout(() => spotlight($("#gate-all")), 250); return; }
    if (task === "mask" || task === "share") {
      showTab("inbox"); await new Promise((r) => setTimeout(r, 300));
      const want = task === "mask" ? ["redact"] : ["share", "redact"];
      const c = INBOX.find((x) => x.verdict && want.includes(x.verdict.decision) && !(task === "share" && x.shared))
        || INBOX.find((x) => x.verdict && want.includes(x.verdict.decision));
      if (!c) { spotlight($("#gate-all")); return; }
      await openChat(c.id);
      setTimeout(() => spotlight(task === "mask" ? $(".verdict") : $("#btn-share")), 200);
      return;
    }
    if (task === "ask") {
      const feed = await api("/api/feed");
      const other = feed.find((s) => s.owner !== ME) || feed[0];
      if (!other) { toast(t("ob.noshare"), true); showMe("share"); return; }
      showTab("ask"); $("#ask-person").value = other.owner; $("#ask-person").dispatchEvent(new Event("change"));
      setTimeout(() => spotlight($("#suggest")), 250);
    }
  }
  // Infer progress from what already exists, so returning users aren't asked to redo things.
  function syncFromState() {
    if (INBOX.some((c) => c.verdict)) mark("gate");
    if (INBOX.some((c) => c.shared)) mark("share");
    renderChecklist();
  }

  // ---------- welcome modal ----------
  const STEPS = { demo: ["welcome", "start", "person", "privacy"], own: ["welcome", "start", "import", "privacy"] };
  function open() {
    step = 0; path = "demo";
    if (!$("#ob")) document.body.insertAdjacentHTML("beforeend", `<div id="ob" class="ob-backdrop" role="dialog" aria-modal="true"><div class="ob-card"></div></div>`);
    $("#ob").hidden = false; render();
    document.addEventListener("keydown", onKey);
  }
  function close() {
    store.set("sg-onboarded", "1");
    $("#ob").hidden = true; document.removeEventListener("keydown", onKey);
    renderChecklist();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  const go = (d) => { step = Math.max(0, Math.min(STEPS[path].length - 1, step + d)); render(); };

  function render() {
    const steps = STEPS[path], name = steps[step], total = steps.length;
    const dots = steps.map((_, i) => `<i class="${i === step ? "on" : i < step ? "past" : ""}"></i>`).join("");
    const body = { welcome, start, person, import: importStep, privacy }[name]();
    $("#ob .ob-card").innerHTML = `
      <div class="ob-top"><div class="ob-dots" aria-label="${t("ob.step", { n: step + 1, total })}">${dots}</div>
        <button class="ob-skip" id="ob-skip">${t("ob.skip")}</button></div>
      <div class="ob-body" data-step="${name}">${body.html}</div>
      <div class="ob-foot">${step > 0 ? `<button class="btn btn-ghost" id="ob-back">${t("ob.back")}</button>` : "<span></span>"}
        ${body.next === false ? "" : `<button class="btn btn-primary" id="ob-next">${name === "privacy" ? t("ob.start") : t("ob.next")}</button>`}</div>`;
    $("#ob-skip").onclick = close;
    $("#ob-back") && ($("#ob-back").onclick = () => go(-1));
    $("#ob-next") && ($("#ob-next").onclick = () => (name === "privacy" ? close() : go(1)));
    body.after && body.after();
    $("#ob-next")?.focus();
  }

  function welcome() {
    const card = (icon, k) => `<div class="ob-feature"><div class="ob-ficon">${icon}</div><div><b>${t(k + ".t")}</b><p>${t(k + ".d")}</p></div></div>`;
    return { html: `<div class="ob-hero">${ICON.shield}</div>
      <h2>${t("ob.w.title")}</h2><p class="ob-lead">${t("ob.w.sub")}</p>
      <div class="ob-features">${card(ICON.shield, "ob.w.c1")}${card(ICON.spark, "ob.w.c2")}${card(ICON.chat, "ob.w.c3")}</div>` };
  }
  function start() {
    return {
      next: false,
      html: `<h2>${t("ob.s.title")}</h2><p class="ob-lead">${t("ob.s.sub")}</p>
        <div class="ob-choices">
          <button class="ob-choice" data-path="demo"><span class="ob-tag">${t("ob.s.demo.tag")}</span>
            <div class="ob-ficon">${ICON.spark}</div><b>${t("ob.s.demo.t")}</b><p>${t("ob.s.demo.d")}</p></button>
          <button class="ob-choice" data-path="own"><div class="ob-ficon">${ICON.chat}</div><b>${t("ob.s.own.t")}</b><p>${t("ob.s.own.d")}</p></button>
        </div>`,
      after() {
        $$(".ob-choice").forEach((b) => (b.onclick = async () => {
          path = b.dataset.path;
          if (path === "demo") {
            b.classList.add("busy");
            if (!PEOPLE.length) { await api("/api/demo/load", { method: "POST" }); await loadPeople(); }
          }
          go(1);
        }));
      },
    };
  }
  function person() {
    return {
      html: `<h2>${t("ob.p.title")}</h2><p class="ob-lead">${t("ob.p.sub")}</p>
        <div class="ob-people">${PEOPLE.map((p) => `<button class="ob-person ${p.id === ME ? "on" : ""}" data-id="${esc(p.id)}">
          <div class="avatar">${initials(p.name)}</div><b>${esc(p.name)}</b><span class="muted">${esc(p.role)}</span></button>`).join("")}</div>`,
      after() {
        $$(".ob-person").forEach((b) => (b.onclick = () => {
          ME = b.dataset.id; store.set("sg-me", ME); $("#me").value = ME; updateAvatars(); loadInbox();
          $$(".ob-person").forEach((x) => x.classList.toggle("on", x === b));
        }));
      },
    };
  }
  function importStep() {
    return {
      next: false,
      html: `<h2>${t("ob.i.title")}</h2><p class="ob-lead">${t("ob.i.sub")}</p>
        <div class="ob-form"><label>${t("ob.i.name")}<input id="ob-name" autocomplete="name"></label>
          <label>${t("ob.i.role")}<input id="ob-role"></label></div>
        <label class="ob-drop" id="ob-drop"><input type="file" id="ob-file" accept=".json,.md,.txt" hidden>
          <div class="ob-ficon">${ICON.chat}</div><span id="ob-drop-text">${t("ob.i.drop")}</span></label>
        <details class="ob-how"><summary>${t("ob.i.how")}</summary><p>${t("ob.i.gpt")}</p><p>${t("ob.i.claude")}</p></details>`,
      after() {
        const drop = $("#ob-drop");
        const send = async (file) => {
          const name = $("#ob-name").value.trim();
          if (!name) { $("#ob-name").focus(); toast(t("ob.i.needname"), true); return; }
          $("#ob-drop-text").textContent = t("ob.i.reading");
          const owner = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "me";
          const fd = new FormData(); fd.append("owner", owner); fd.append("name", name); fd.append("role", $("#ob-role").value); fd.append("file", file);
          const r = await fetch("/api/import", { method: "POST", body: fd });
          const body = await r.json().catch(() => ({}));
          if (!r.ok) { $("#ob-drop-text").textContent = body.detail || t("toast.importfail"); drop.classList.add("bad"); return; }
          ME = owner; store.set("sg-me", ME); await loadPeople(); loadInbox();
          toast(t("ob.i.done", { n: body.imported })); go(1);
        };
        $("#ob-file").onchange = (e) => e.target.files[0] && send(e.target.files[0]);
        drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
        drop.ondragleave = () => drop.classList.remove("over");
        drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); e.dataTransfer.files[0] && send(e.dataTransfer.files[0]); };
      },
    };
  }
  function privacy() {
    const li = (icon, k) => `<div class="ob-feature"><div class="ob-ficon">${icon}</div><p>${t(k)}</p></div>`;
    return { html: `<div class="ob-hero">${ICON.lock}</div><h2>${t("ob.v.title")}</h2>
      <div class="ob-features">${li(ICON.lock, "ob.v.1")}${li(ICON.mask, "ob.v.2")}${li(ICON.shield, "ob.v.3")}</div>` };
  }

  return { open, mark, renderChecklist, syncFromState };
})();

$("#help").onclick = () => { store.set("sg-ob-hide", ""); OB.open(); };
window.SG_READY.then(() => {
  OB.syncFromState();
  if (store.get("sg-onboarded", "") !== "1") OB.open();
});
