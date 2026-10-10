/* ==========================================================================
   app.js — แกนหลักของระบบ: ล็อกอิน, สลับโครงการ, ภาพรวม, ข้อมูลสัญญา, Checklist, ตั้งค่า
   (หน้าบันทึกประจำวัน/ชิ้นงาน/คุณภาพ/รูปถ่าย/เอกสาร/รายงาน อยู่ใน app-views.js)
   ========================================================================== */
(function () {
  'use strict';
  const D = window.PCS_DATA, esc = U.esc;
  const S = {
    team: [], projects: [], pid: null, p: null,
    subs: { daily: [], docs: [], tests: [], units: [], photos: [], safety: [] },
    view: 'dash', ui: {}, dirty: {}
  };
  const A = window.App = { S: S, views: {}, D: D };
  function $(id) { return document.getElementById(id); }
  A.$ = $;

  /* ======================= ตัวช่วยหน้าจอ ======================= */
  let toastTimer = null;
  A.toast = function (msg, isErr) {
    const t = $('toast'); t.textContent = msg; t.classList.toggle('err', !!isErr); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, isErr ? 5200 : 2600);
  };
  A.modal = function (o) {
    const root = $('modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = '<div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + esc(o.title || '') + '</h3><button class="modal-close" type="button" title="ปิด">×</button></div>' +
      '<div class="modal-body">' + (o.body || '') + '</div>' +
      (o.foot === false ? '' : '<div class="modal-foot">' + (o.foot || '<button class="btn btn-outline" data-close>ปิด</button>') + '</div>') + '</div>';
    root.appendChild(wrap);
    const close = function () { wrap.remove(); if (o.onClose) o.onClose(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape' && root.lastElementChild === wrap) close(); }
    document.addEventListener('keydown', onKey);
    wrap.querySelector('.modal-close').onclick = close;
    wrap.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = close; });
    wrap.querySelectorAll('.pw-toggle').forEach(bindPwToggle);
    const m = { el: wrap, close: close, q: function (s) { return wrap.querySelector(s); }, qa: function (s) { return wrap.querySelectorAll(s); } };
    if (o.onOpen) o.onOpen(m);
    return m;
  };
  A.confirm = function (msg, okText, danger) {
    return new Promise(function (resolve) {
      const m = A.modal({
        title: 'ยืนยัน', size: 'narrow', body: '<p style="margin:0;white-space:pre-line">' + esc(msg) + '</p>',
        foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="cfOk">' + esc(okText || 'ตกลง') + '</button>',
        onClose: function () { resolve(false); }
      });
      m.q('#cfOk').onclick = function () { m.el.remove(); resolve(true); };
    });
  };
  A.busy = function (btn, text) {
    if (!btn) return function () {};
    const old = btn.innerHTML; btn.disabled = true; btn.textContent = text || 'กำลังบันทึก...';
    return function () { btn.disabled = false; btn.innerHTML = old; };
  };
  A.pwField = function (id, placeholder, ac) {
    return '<div class="pw-wrap"><input type="password" id="' + id + '" autocomplete="' + (ac || 'new-password') + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '><button type="button" class="pw-toggle" data-target="' + id + '" title="แสดง/ซ่อนรหัสผ่าน">👁</button></div>';
  };
  function bindPwToggle(b) {
    b.onclick = function () { const i = document.getElementById(b.dataset.target); if (i) i.type = i.type === 'password' ? 'text' : 'password'; };
  }
  A.opts = function (list, sel, withBlank) {
    return (withBlank ? '<option value="">' + esc(withBlank === true ? '—' : withBlank) + '</option>' : '') + list.map(function (x) {
      const v = typeof x === 'object' ? x.key : x, n = typeof x === 'object' ? x.name : x;
      return '<option value="' + esc(v) + '"' + (String(v) === String(sel === undefined ? '' : sel) ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  };
  A.active = function (sub) { return (S.subs[sub] || []).filter(function (r) { return !r.deletedAt; }); };
  A.val = function (m, sel) { const e = m.q(sel); return e ? e.value.trim() : ''; };

  /* ======================= เขียนข้อมูล ======================= */
  A.save = async function (sub, rec, summary) {
    if (!S.pid) throw new Error('ยังไม่ได้เลือกโครงการ');
    return FBL.saveSub(S.pid, sub, rec, summary);
  };
  A.softDelete = async function (sub, rec, summary) {
    await FBL.softDelete(S.pid, sub, rec.id, summary);
    A.toast('ย้ายไปถังขยะแล้ว (กู้คืนได้ที่แท็บตั้งค่า)');
  };
  A.saveProject = async function (p) {
    const id = await FBL.saveProject(p);
    return id;
  };
  A.roleTag = function (u) { return u && u.isOwner ? ' 👑' : (u && u.isAdmin ? ' 🛡️' : ''); };
  A.can = function () { return FBL.user && (FBL.user.isOwner || FBL.user.isAdmin); };

  /* ======================= หน้าล็อกอิน (เหมือนระบบงานอุบัติเหตุ) ======================= */
  let teamLoadError = '';
  let appStarted = false;
  function gate() { return $('authGate'); }
  function hideLoading() { const o = $('pageLoadingOverlay'); if (o) o.classList.add('hide'); }
  function showGateError(msg) { const el = $('gateError'); if (!el) return; el.textContent = msg; el.style.display = 'block'; }
  function renderAuthGate(errorMsg) {
    const g = gate(); hideLoading(); g.classList.add('show');
    $('appHeader').style.display = 'none'; $('main').style.display = 'none';
    const head = '<img src="logo.png" alt="ตรากรมทางหลวง" class="auth-logo"><h2>งานควบคุมงานโครงการ</h2>' +
      '<p class="auth-sub">หมวดทางหลวงเชิงเนิน · แขวงทางหลวงระยอง</p>';
    const demo = FBL.mode === 'demo' ? '<div class="auth-demo">โหมดทดลอง: ยังไม่ได้เชื่อม Firebase — ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น</div>' : '';
    const errHtml = '<p class="hint auth-error" id="gateError" style="' + (errorMsg ? '' : 'display:none') + '">' + esc(errorMsg || '') + '</p>';
    if (teamLoadError) {
      g.innerHTML = '<div class="auth-card">' + head + '<h3 class="auth-h3">เชื่อมต่อฐานข้อมูลไม่สำเร็จ</h3><p class="hint auth-error">' + esc(teamLoadError) +
        '</p><button class="btn btn-primary auth-btn" id="gateRetry">ลองอีกครั้ง</button></div>';
      $('gateRetry').onclick = function () { location.reload(); };
      return;
    }
    if (!S.team.length) {
      g.innerHTML = '<div class="auth-card">' + head + '<h3 class="auth-h3">ตั้งค่าเจ้าของระบบครั้งแรก</h3>' +
        '<p class="hint" style="margin-bottom:14px">ยังไม่มีผู้ใช้งานในระบบ — คนแรกที่ตั้งค่าจะเป็น "เจ้าของระบบ" และประตูนี้จะปิดถาวร</p>' +
        '<div class="field" style="margin-bottom:12px"><label>ชื่อ-นามสกุลของคุณ</label><input type="text" id="gateOwnerName" autocomplete="off"></div>' +
        '<div class="field" style="margin-bottom:12px"><label>ตั้งรหัสผ่าน (อย่างน้อย 8 ตัวอักษร)</label>' + A.pwField('gateOwnerPass') + '</div>' +
        '<div class="field" style="margin-bottom:14px"><label>ยืนยันรหัสผ่าน</label>' + A.pwField('gateOwnerPass2') + '</div>' +
        errHtml + '<button class="btn btn-primary auth-btn" id="gateClaim">ตั้งค่าและเข้าสู่ระบบ</button>' + demo + '</div>';
      g.querySelectorAll('.pw-toggle').forEach(bindPwToggle);
      const claim = async function () {
        const n = $('gateOwnerName').value.trim(), p1 = $('gateOwnerPass').value, p2 = $('gateOwnerPass2').value;
        if (!n || !p1) return showGateError('กรอกชื่อและรหัสผ่านให้ครบ');
        if (p1.length < 8) return showGateError('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
        if (p1 !== p2) return showGateError('รหัสผ่านสองช่องไม่ตรงกัน');
        const done = A.busy($('gateClaim'), 'กำลังตั้งค่า...');
        try { const u = await FBL.bootstrapOwner(n, p1); S.team = FBL.team(); handleAuth(u); }
        catch (e) { done(); showGateError(e.message); }
      };
      $('gateClaim').onclick = claim;
      g.querySelectorAll('input').forEach(function (i) { i.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') claim(); }); });
      return;
    }
    const options = S.team.map(function (m) { return '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>'; }).join('');
    g.innerHTML = '<div class="auth-card">' + head + '<h3 class="auth-h3">เข้าสู่ระบบ</h3>' +
      '<div class="field" style="margin-bottom:12px"><label>ชื่อผู้ใช้งาน</label><select id="gateName"><option value="">— เลือกชื่อของคุณ —</option>' + options + '</select></div>' +
      '<div class="field" style="margin-bottom:14px"><label>รหัสผ่าน</label><input type="text" id="gateUserShadow" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' + A.pwField('gatePass', '', 'current-password') + '</div>' +
      errHtml + '<button class="btn btn-primary auth-btn" id="gateOk">เข้าสู่ระบบ</button>' + demo + '</div>';
    g.querySelectorAll('.pw-toggle').forEach(bindPwToggle);
    // เหมือนระบบงานอุบัติเหตุ: ขึ้น "— เลือกชื่อของคุณ —" ไว้ก่อน ไม่เลือกชื่อใครไว้ให้ล่วงหน้า
    const gSel = $('gateName'), gShadow = $('gateUserShadow');
    gSel.addEventListener('change', function () { gShadow.value = gSel.value; });
    gShadow.addEventListener('input', function () { if ([].some.call(gSel.options, function (o) { return o.value === gShadow.value; })) gSel.value = gShadow.value; });
    const login = async function () {
      const name = gSel.value, pass = $('gatePass').value;
      if (!name) return showGateError('เลือกชื่อของคุณก่อน');
      if (!pass) return showGateError('กรอกรหัสผ่าน');
      const done = A.busy($('gateOk'), 'กำลังตรวจสอบ...');
      try { await FBL.login(name, pass); } catch (e) { done(); showGateError(e.message); }
    };
    $('gateOk').onclick = login;
    $('gatePass').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') login(); });
    setTimeout(function () { (gSel.value ? $('gatePass') : gSel).focus(); }, 50);
  }
  function handleAuth(user, errorMsg) {
    if (!user) { appStarted = false; renderAuthGate(errorMsg); return; }
    const g = gate(); g.classList.remove('show'); g.innerHTML = '';
    startApp();
  }

  async function boot() {
    if (!window.FBL) { hideLoading(); gate().classList.add('show'); gate().innerHTML = '<div class="auth-card"><h3 class="auth-h3">โหลดระบบฐานข้อมูลไม่สำเร็จ</h3><p class="hint">ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้านี้</p></div>'; return; }
    FBL.onError = function (msg) { A.toast(msg, true); };
    try { S.team = await FBL.loadTeam(); teamLoadError = ''; } catch (e) { teamLoadError = FBL.errorText(e); }
    FBL.onAuth(handleAuth);
  }

  /* ======================= เริ่มระบบหลังล็อกอิน ======================= */
  async function startApp() {
    if (appStarted) return;
    appStarted = true;
    $('appHeader').style.display = ''; $('main').style.display = '';
    $('demoBadge').style.display = FBL.mode === 'demo' ? '' : 'none';
    // แบบเดียวกับระบบงานอุบัติเหตุ: 👑 เจ้าของระบบ / 🛡️ ผู้ดูแลระบบ
    const tag = A.roleTag(FBL.user);
    $('whoDisplay').textContent = 'ผู้บันทึก: ' + FBL.user.name + tag;
    $('whoDisplay').title = FBL.user.isOwner ? 'เจ้าของระบบ' : (FBL.user.isAdmin ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน');
    $('btnLogout').onclick = async function () { await FBL.logout(); location.reload(); };
    $('btnNewProject').onclick = function () { A.newProjectDialog(); };
    $('projectSelect').onchange = function () { selectProject(this.value); };
    $('tabs').querySelectorAll('.tab-btn').forEach(function (b) { b.onclick = function () { A.go(b.dataset.view); }; });
    window.addEventListener('popstate', function (e) {
      const v = (e.state && e.state.view) || (location.hash || '').replace('#', '');
      if (v && v !== S.view) A.go(v, true);
    });
    const list = await FBL.watchProjects(function (docs) { S.projects = docs; onProjectsChanged(); });
    S.projects = list;
    hideLoading();
    let last = null; try { last = localStorage.getItem('pcs_last_project'); } catch (e) { /* ข้าม */ }
    const vis = visibleProjects();
    const pick = vis.find(function (p) { return p.id === last; }) || vis[0];
    fillProjectSelect();
    if (pick) await selectProject(pick.id); else A.render();
    const hv = (location.hash || '').replace('#', '');
    if (hv && $('view-' + hv)) A.go(hv, true);
  }
  function visibleProjects() {
    return S.projects.filter(function (p) { return !p.deletedAt; }).sort(function (a, b) {
      const oa = a.status === 'closed' ? 1 : 0, ob = b.status === 'closed' ? 1 : 0;
      return oa - ob || String(b.startDate || '').localeCompare(String(a.startDate || ''));
    });
  }
  const STATUS = {
    active: { name: 'กำลังดำเนินการ', cls: 'b-info' }, completed: { name: 'ส่งงานแล้ว รอตรวจรับ', cls: 'b-warn' },
    accepted: { name: 'ตรวจรับแล้ว', cls: 'b-ok' }, closed: { name: 'ปิดโครงการ', cls: 'b-mute' }
  };
  A.STATUS = STATUS;
  function fillProjectSelect() {
    const sel = $('projectSelect');
    const vis = visibleProjects();
    sel.innerHTML = vis.length ? vis.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === S.pid ? ' selected' : '') + '>' + esc((p.code || '(ไม่มีเลขสัญญา)') + ' · ' + (p.shortName || p.name || '')) + '</option>';
    }).join('') : '<option value="">— ยังไม่มีโครงการ —</option>';
    const st = S.p ? (STATUS[S.p.status] || STATUS.active) : null;
    $('projectStatus').innerHTML = st ? '<span class="status-pill ' + st.cls + '">' + st.name + '</span>' : '';
  }
  function onProjectsChanged() {
    S.p = S.projects.find(function (p) { return p.id === S.pid; }) || null;
    fillProjectSelect();
    A.scheduleRender();
  }
  async function selectProject(pid) {
    if (S.pid && S.pid !== pid) FBL.unwatchProject(S.pid);
    S.pid = pid || null; S.p = S.projects.find(function (p) { return p.id === pid; }) || null;
    S.dirty = {}; S.ui = {};
    try { localStorage.setItem('pcs_last_project', pid || ''); } catch (e) { /* ข้าม */ }
    FBL.SUBS.forEach(function (k) { S.subs[k] = []; });
    fillProjectSelect();
    if (S.pid) {
      const lists = await Promise.all(FBL.SUBS.map(function (sub) {
        return FBL.watchSub(S.pid, sub, function (docs) { if (S.pid === pid) { S.subs[sub] = docs; A.scheduleRender(); } });
      }));
      if (S.pid !== pid) return;
      FBL.SUBS.forEach(function (sub, i) { S.subs[sub] = lists[i]; });
    }
    A.render();
  }
  A.selectProject = selectProject;

  A.go = function (view, noPush) {
    if (!$('view-' + view)) view = 'dash';
    if (S.view !== view && S.dirty[S.view]) {
      if (!window.confirm('มีข้อมูลที่ยังไม่ได้บันทึกในหน้านี้ ต้องการออกจากหน้านี้หรือไม่?')) return;
      S.dirty[S.view] = false;
    }
    S.view = view;
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    if (!noPush) history.pushState({ view: view }, '', '#' + view);
    A.render();
    window.scrollTo(0, 0);
  };
  let renderTimer = null;
  A.scheduleRender = function () { clearTimeout(renderTimer); renderTimer = setTimeout(A.render, 60); };
  A.render = function () {
    const v = S.view;
    updateTabBadges();
    if (S.dirty[v]) return;   // กำลังแก้ฟอร์มอยู่ — ไม่วาดทับ
    const el = $('view-' + v);
    if (!S.p && v !== 'settings') { el.innerHTML = welcomeHtml(); bindWelcome(el); return; }
    const fn = A.views[v];
    if (fn) { try { fn(el); } catch (e) { console.error(e); el.innerHTML = '<div class="card"><b>แสดงผลไม่สำเร็จ</b><p class="hint">' + esc(e.message) + '</p></div>'; } }
  };
  function welcomeHtml() {
    return '<div class="card welcome"><h2>ยินดีต้อนรับสู่ งานควบคุมงานโครงการ</h2>' +
      '<p class="muted">เริ่มจากสร้างโครงการใหม่ แล้วกรอกข้อมูลสัญญา หรือนำเข้าข้อมูลโครงการจากไฟล์สำรอง (.json)</p>' +
      '<div class="flex" style="justify-content:center;margin-top:14px"><button class="btn btn-primary" id="wNew">+ สร้างโครงการใหม่</button>' +
      '<button class="btn btn-outline" id="wImp">นำเข้าจากไฟล์ .json</button></div></div>';
  }
  function bindWelcome(el) {
    el.querySelector('#wNew').onclick = function () { A.newProjectDialog(); };
    el.querySelector('#wImp').onclick = function () { A.importJsonDialog(); };
  }

  /* ======================= การคำนวณแจ้งเตือน ======================= */
  A.alerts = function () {
    const p = S.p; const out = [];
    if (!p) return out;
    const c = U.contract(p), t = U.today();
    const active = !p.status || p.status === 'active';
    const units = A.active('units');
    if (!p.startDate || !p.days || !(p.boq || []).length) out.push({ lv: 'info', t: 'กรอกข้อมูลสัญญาให้ครบ (วันเริ่ม ระยะเวลา BOQ แผนงาน) เพื่อให้ระบบคำนวณแผน-ผลและรอบรายงาน', go: 'contract' });
    if (active && c.endExt) {
      if (t > c.endExt) out.push({ lv: 'bad', t: 'เกินกำหนดสัญญา ' + c.late + ' วัน (สิ้นสุด ' + U.thDate(c.endExt) + ') ค่าปรับสะสมประมาณ ' + U.money(c.fine) + ' บาท', go: 'contract' });
      else if (c.remaining <= 7 && t >= c.start) out.push({ lv: 'warn', t: 'เหลือเวลาตามสัญญา ' + (c.remaining + 1) + ' วัน (สิ้นสุด ' + U.thDate(c.endExt) + ')', go: 'dash' });
    }
    if (c.q1 && (p.plan || []).length) {
      const a = U.planCum(p, c.q1), b = U.planCum(p, c.q2);
      if (a < 10) out.push({ lv: 'bad', t: 'แผนงาน ณ 1/4 ของเวลา (' + U.thDate(c.q1, 'short') + ') = ' + U.pct(a) + ' ต่ำกว่า 10% — ให้ผู้รับจ้างแก้ไขแผน', go: 'contract' });
      if (b < 25) out.push({ lv: 'bad', t: 'แผนงาน ณ 2/4 ของเวลา (' + U.thDate(c.q2, 'short') + ') = ' + U.pct(b) + ' ต่ำกว่า 25% — ให้ผู้รับจ้างแก้ไขแผน', go: 'contract' });
    }
    if (active && c.start && t >= c.start) {
      const ref = t > c.endExt ? c.endExt : t;
      const diff = U.planCum(p, ref) - U.actualCum(p, units, ref);
      if (diff > 15) out.push({ lv: 'bad', t: 'ผลงานช้ากว่าแผน ' + U.pct(diff) + ' (เกิน 15%) — พิจารณาทำเรื่องแจ้งตามระเบียบ', go: 'dash' });
      else if (diff > 10) out.push({ lv: 'warn', t: 'ผลงานช้ากว่าแผน ' + U.pct(diff) + ' ใกล้เกณฑ์ 15%', go: 'dash' });
    }
    // รอบรายงาน
    if (active && c.start) {
      const docs = A.active('docs'); const done = {};
      docs.forEach(function (d) { if (d.reportKey) done[d.reportKey] = d; });
      const pr = U.periods(p);
      const all = [];
      if (pr.threeDay) all.push({ key: '3day', due: pr.threeDay.due, name: 'รายงาน 3 วันทำการ' });
      pr.weeks.forEach(function (w) { all.push({ key: w.key, due: w.due, name: 'รายงานประจำสัปดาห์ที่ ' + w.n + ' (' + U.thRange(w.from, w.to) + ')' }); });
      pr.months.forEach(function (m) { all.push({ key: m.key, due: m.due, name: 'รายงานประจำเดือน ' + U.thMonth(m.ym) }); });
      all.forEach(function (r) {
        if (done[r.key]) return;
        const dd = U.diffDays(t, r.due);
        if (dd < 0 && dd >= -21) out.push({ lv: 'warn', t: 'ยังไม่ได้ลงทะเบียน' + r.name + ' (ครบกำหนด ' + U.thDate(r.due, 'short') + ')', go: 'reports' });
        else if (dd >= 0 && dd <= 2) out.push({ lv: 'info', t: r.name + ' ครบกำหนดส่ง ' + U.thDate(r.due, 'short'), go: 'reports' });
      });
    }
    // การทดสอบ
    A.active('tests').forEach(function (x) {
      if (x.status && x.status !== 'pending') return;
      const isCube = /ลูกปูน|กำลังอัด/.test(x.type || '') || /ลูกปูน/.test(x.item || '');
      if (isCube && x.sampleDate) {
        const d28 = U.addDays(x.sampleDate, 28);
        if (!x.sentDate && t >= U.addDays(x.sampleDate, 14)) out.push({ lv: 'warn', t: 'ลูกปูน "' + (x.item || '') + '" เทเมื่อ ' + U.thDate(x.sampleDate, 'short') + ' — ถึงเวลาทำหนังสือ ว.4-01 ส่งทดสอบ (ครบ 28 วัน ' + U.thDate(d28, 'short') + ')', go: 'quality' });
        else if (t >= d28) out.push({ lv: 'info', t: 'ลูกปูน "' + (x.item || '') + '" ครบ 28 วันแล้ว (' + U.thDate(d28, 'short') + ') — ติดตามผลทดสอบ ห้ามรายงานผลงานส่วนนี้ก่อนทราบผล', go: 'quality' });
      } else if (x.sentDate && U.diffDays(x.sentDate, t) > 30) {
        out.push({ lv: 'info', t: 'รอผลทดสอบ "' + (x.item || x.type) + '" ส่งเมื่อ ' + U.thDate(x.sentDate, 'short') + ' (เกิน 30 วัน)', go: 'quality' });
      }
    });
    A.active('tests').forEach(function (x) { if (x.status === 'fail') out.push({ lv: 'bad', t: 'ผลทดสอบไม่ผ่าน: ' + (x.item || x.type) + ' — สั่งแก้ไข/ทดสอบซ้ำ', go: 'quality' }); });
    // Checklist เกินกำหนด
    if (active) {
      const overdue = A.checklistItems().filter(function (i) { return i.due && !i.done && i.due < t; });
      if (overdue.length) out.push({ lv: 'warn', t: 'Checklist เกินกำหนด ' + overdue.length + ' รายการ เช่น "' + overdue[0].text.slice(0, 60) + '…"', go: 'check' });
    }
    // ความปลอดภัย
    const openSafety = A.active('safety').filter(function (s) { return s.result === 'fail' && !s.fixedDate; });
    if (openSafety.length) out.push({ lv: 'warn', t: 'ผลตรวจความปลอดภัยที่ยังไม่แก้ไข ' + openSafety.length + ' ครั้ง', go: 'check' });
    // บันทึกประจำวัน
    if (active && c.start && t > c.start && t <= U.addDays(c.endExt, 1)) {
      const y = U.addDays(t, -1);
      if (!A.active('daily').some(function (d) { return d.date === y; })) out.push({ lv: 'info', t: 'ยังไม่มีบันทึกประจำวันของเมื่อวาน (' + U.thDate(y, 'short') + ')', go: 'daily' });
    }
    const flagged = A.active('photos').filter(function (x) { return x.flag; });
    if (flagged.length) out.push({ lv: 'warn', t: 'มีรูป ' + flagged.length + ' รูปที่อาจเป็นภาพสร้างด้วย AI — ตรวจก่อนใช้เป็นหลักฐาน ห้ามใช้ในรายงานแทนภาพหน้างานจริง', go: 'photos' });
    const order = { bad: 0, warn: 1, info: 2, ok: 3 };
    out.sort(function (a, b) { return order[a.lv] - order[b.lv]; });
    return out;
  };
  function updateTabBadges() {
    const b = document.querySelector('.tab-btn[data-view="dash"]');
    if (!b) return;
    const n = S.p ? A.alerts().filter(function (a) { return a.lv === 'bad' || a.lv === 'warn'; }).length : 0;
    b.innerHTML = 'ภาพรวม' + (n ? '<span class="cnt">' + n + '</span>' : '');
  }
  A.alertHtml = function (list) {
    if (!list.length) return '<div class="alert ok"><span class="ic">✓</span><span>ไม่มีเรื่องที่ต้องติดตาม</span></div>';
    const ic = { bad: '⛔', warn: '⚠️', info: 'ℹ️', ok: '✓' };
    return list.map(function (a) {
      return '<div class="alert ' + a.lv + '"><span class="ic">' + ic[a.lv] + '</span><span>' + esc(a.t) + '</span>' +
        (a.go ? '<button class="btn btn-sm btn-ghost go" data-go="' + a.go + '">เปิด →</button>' : '') + '</div>';
    }).join('');
  };
  A.bindGo = function (el) { el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { A.go(b.dataset.go); }; }); };

  /* ======================= ภาพรวม ======================= */
  A.views.dash = function (el) {
    const p = S.p, c = U.contract(p), t = U.today();
    const units = A.active('units');
    const ref = p.completedDate || (c.endExt && t > c.endExt ? c.endExt : t);
    const plan = c.start ? U.planCum(p, ref < c.start ? c.start : ref) : 0;
    const act = c.start ? U.actualCum(p, units, ref) : 0;
    const total = U.boqTotal(p);
    const timePct = c.totalDays ? c.elapsed / c.totalDays * 100 : 0;
    const diff = act - plan;
    const alerts = A.alerts();
    const daily = A.active('daily').sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 6);
    const st = STATUS[p.status] || STATUS.active;
    const remainTxt = p.completedDate ? 'ส่งงาน ' + U.thDate(p.completedDate, 'short') + (c.late ? ' (ล่าช้า ' + c.late + ' วัน)' : ' (ทันกำหนด)') :
      (c.remaining >= 0 ? 'เหลือ ' + (c.remaining + 1) + ' วัน' : 'เกินกำหนด ' + (-c.remaining) + ' วัน');
    el.innerHTML =
      '<div class="card"><div class="section-title">' + esc(p.code || '') + ' <span class="sub">' + esc(p.name || '') + '</span>' +
      '<span class="right"><span class="badge ' + st.cls + '">' + st.name + '</span></span></div>' +
      '<dl class="kv"><dt>ผู้รับจ้าง</dt><dd>' + esc(p.contractor || '-') + '</dd>' +
      '<dt>สัญญา</dt><dd>' + esc(p.contractNo || p.code || '-') + (p.contractDate ? ' ลงวันที่ ' + U.thDate(p.contractDate) : '') + '</dd>' +
      '<dt>ระยะเวลา</dt><dd>' + (c.start ? U.thDate(c.start) + ' – ' + U.thDate(c.end) + ' (' + c.days + ' วัน)' + (c.ext ? ' ขยาย ' + c.ext + ' วัน ถึง ' + U.thDate(c.endExt) : '') : '-') + '</dd>' +
      '<dt>ค่างาน / ค่าปรับ</dt><dd>' + U.money(c.value) + ' บาท / ' + U.money(c.finePerDay) + ' บาทต่อวัน</dd></dl></div>' +
      '<div class="kpis">' +
      kpi('เวลาสัญญาที่ใช้ไป', c.elapsed + '<small> / ' + c.totalDays + ' วัน</small>', remainTxt, timePct) +
      kpi('ผลงานตามแผนสะสม', U.pct(plan, 2), 'ณ ' + U.thDate(ref, 'short'), plan) +
      kpi('ผลงานจริงสะสม', U.pct(act, 2), Math.abs(diff) < 0.005 ? 'เป็นไปตามแผน' : (diff > 0 ? 'เร็วกว่าแผน ' : 'ช้ากว่าแผน ') + U.pct(Math.abs(diff)), act, plan) +
      kpi('มูลค่าผลงาน', U.money(act / 100 * total, 0) + '<small> บาท</small>', 'จาก ' + U.money(total, 0) + ' บาท', act) + '</div>' +
      '<div class="split"><div class="card chart-box"><div class="section-title">แผน-ผลงานสะสม (S-Curve)</div>' + R.sCurveSvg(p, units, { until: ref }) +
      '<div class="legend"><span><i style="background:#FF6600"></i>แผนงาน</span><span><i style="background:#1E7B1E"></i>ผลงานจริง</span><span><i style="background:#123a5e;height:8px;width:2px"></i>1/4, 2/4 ของเวลา / สิ้นสุดสัญญา</span></div>' +
      checkpointTable(p, units) + '</div>' +
      '<div class="card"><div class="section-title">เรื่องที่ต้องติดตาม <span class="sub">' + alerts.length + ' รายการ</span></div><div class="alert-list">' + A.alertHtml(alerts) + '</div></div></div>' +
      '<div class="card"><div class="section-title">บันทึกประจำวันล่าสุด<span class="right"><button class="btn btn-sm btn-primary" id="dNewDaily">+ บันทึกวันนี้</button></span></div>' +
      (daily.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>วันที่</th><th>งานที่ทำ</th><th>สภาพอากาศ</th><th class="r">คนงาน</th></tr></thead><tbody>' +
        daily.map(function (d) {
          return '<tr class="clickable" data-id="' + esc(d.id) + '"><td class="nowrap">' + U.thDow(d.date) + ' ' + U.thDate(d.date, 'short') + '</td><td>' +
            esc((d.works || []).map(function (w) { return w.desc; }).filter(Boolean).join(' / ') || (d.noWork ? 'ไม่มีการทำงาน' : '-')) + '</td><td>' + esc(d.weather || '') + '</td><td class="r">' + (U.num(d.workers) || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีบันทึก</div>') + '</div>';
    A.bindGo(el);
    el.querySelector('#dNewDaily').onclick = function () { A.dailyForm(null); };
    el.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.onclick = function () { A.dailyForm(A.active('daily').find(function (d) { return d.id === tr.dataset.id; })); };
    });
  };
  function kpi(lb, big, sm, barPct, marker) {
    return '<div class="kpi"><div class="lb">' + lb + '</div><div class="big">' + big + '</div><div class="sm">' + esc(sm) + '</div>' +
      '<div class="bar"><span style="width:' + Math.max(0, Math.min(100, barPct || 0)).toFixed(1) + '%"></span>' +
      (marker !== undefined ? '<i style="left:' + Math.max(0, Math.min(100, marker)).toFixed(1) + '%" title="แผน"></i>' : '') + '</div></div>';
  }
  function checkpointTable(p, units) {
    const c = U.contract(p);
    if (!c.start) return '';
    const t = U.today();
    const rows = [
      { n: '1/4 ของเวลา', d: c.q1, need: 10 }, { n: '2/4 ของเวลา', d: c.q2, need: 25 },
      { n: 'สิ้นสุดสัญญา', d: c.end, need: 100 }
    ];
    if (c.ext) rows.push({ n: 'สิ้นสุด (ขยายเวลา)', d: c.endExt, need: 100 });
    return '<div class="table-wrap" style="margin-top:12px"><table class="data"><thead><tr><th>จุดตรวจ</th><th>วันที่</th><th class="r">แผน</th><th class="r">ผลจริง</th><th>สถานะ</th></tr></thead><tbody>' +
      rows.map(function (r) {
        const pl = U.planCum(p, r.d), ac = r.d <= t ? U.actualCum(p, units, r.d) : null;
        const planOk = r.need >= 100 || pl >= r.need;
        let badge;
        if (!planOk) badge = '<span class="badge b-bad">แผนต่ำกว่า ' + r.need + '%</span>';
        else if (ac === null) badge = '<span class="badge b-mute">ยังไม่ถึง</span>';
        else if (pl - ac > 15) badge = '<span class="badge b-bad">ช้ากว่าแผนเกิน 15%</span>';
        else if (ac + 0.005 >= pl) badge = '<span class="badge b-ok">ตามแผน</span>';
        else badge = '<span class="badge b-warn">ช้ากว่าแผน</span>';
        return '<tr><td>' + r.n + '</td><td class="nowrap">' + U.thDate(r.d, 'short') + '</td><td class="r num">' + U.pct(pl) + '</td><td class="r num">' +
          (ac === null ? '-' : U.pct(ac)) + '</td><td>' + badge + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ======================= โครงการใหม่ ======================= */
  A.newProjectDialog = function () {
    const m = A.modal({
      title: 'สร้างโครงการใหม่', size: 'narrow',
      body: '<div class="grid"><div class="field"><label>เลขที่สัญญา / รหัสโครงการ <span class="req">*</span></label><input id="npCode" placeholder="เช่น รย.23/2569"></div>' +
        '<div class="field"><label>ชื่อย่อโครงการ <span class="req">*</span></label><input id="npShort" placeholder="เช่น ติดตั้งไฟฟ้าแสงสว่าง ทล.3"></div>' +
        '<div class="field"><label>ประเภทงาน</label><select id="npType">' + A.opts(D.PROJECT_TYPES, 'lighting') + '</select></div>' +
        '<div class="field"><label>คัดลอกผู้ลงนาม/กรรมการจากโครงการ</label><select id="npCopy">' + A.opts(visibleProjects().map(function (p) { return { key: p.id, name: p.code + ' ' + (p.shortName || '') }; }), S.pid, 'ไม่คัดลอก') + '</select></div></div>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="npOk">สร้าง</button>'
    });
    m.q('#npOk').onclick = async function () {
      const code = A.val(m, '#npCode'), short = A.val(m, '#npShort'), type = A.val(m, '#npType');
      if (!code || !short) return A.toast('กรอกเลขที่สัญญาและชื่อย่อ', true);
      const src = S.projects.find(function (p) { return p.id === A.val(m, '#npCopy'); });
      const p = {
        code: code, docPrefix: code, shortName: short, name: '', type: type, status: 'active',
        stages: JSON.parse(JSON.stringify(D.DEFAULT_STAGES[type] || D.DEFAULT_STAGES.general)),
        machines: D.DEFAULT_MACHINES.slice(), boq: [], plan: [], extensions: [], locations: [], checklist: {},
        office: src ? src.office : 'หมวดทางหลวงเชิงเนิน แขวงทางหลวงระยอง', phone: src ? src.phone : '',
        addressee: src ? src.addressee : 'ผอ.ขท.ระยอง (ประธานกรรมการตรวจรับพัสดุ)',
        supervisor: src ? src.supervisor : { name: FBL.user.name, position: '' },
        committee: src ? JSON.parse(JSON.stringify(src.committee || [])) : []
      };
      const done = A.busy(m.q('#npOk'));
      try { const id = await A.saveProject(p); m.close(); await waitProject(id); await selectProject(id); A.go('contract'); A.toast('สร้างโครงการแล้ว — กรอกข้อมูลสัญญาต่อ'); }
      catch (e) { done(); A.toast(e.message, true); }
    };
  };
  function waitProject(id) {
    return new Promise(function (resolve) {
      let n = 0; (function chk() { if (S.projects.some(function (p) { return p.id === id; }) || n++ > 40) resolve(); else setTimeout(chk, 100); })();
    });
  }
  A.waitProject = waitProject;

  /* ======================= ข้อมูลสัญญา ======================= */
  A.views.contract = function (el) {
    const p = JSON.parse(JSON.stringify(S.p));
    p.committee = p.committee || []; p.extensions = p.extensions || []; p.boq = p.boq || []; p.plan = p.plan || [];
    p.locations = p.locations || []; p.stages = p.stages || []; p.machines = p.machines || []; p.supervisor = p.supervisor || {};
    const c = U.contract(p);
    function f(id, label, val, type, attrs, cls) {
      return '<div class="field ' + (cls || '') + '"><label>' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val === undefined || val === null ? '' : val) + '" ' + (attrs || '') + '></div>';
    }
    el.innerHTML =
      '<div class="card"><div class="section-title">ข้อมูลทั่วไปของสัญญา<span class="right"><button class="btn btn-primary" id="cSave">บันทึกข้อมูลสัญญา</button></span></div>' +
      '<div class="grid grid-4">' +
      f('cCode', 'เลขที่สัญญา / รหัสโครงการ', p.code) + f('cPrefix', 'เลขที่หนังสือ (ส่วนหน้า)', p.docPrefix || p.code, 'text', 'placeholder="รย.23/2569"') +
      f('cShort', 'ชื่อย่อโครงการ', p.shortName, 'text', '', 'span-2') +
      '<div class="field span-all"><label>ชื่องาน (ตามสัญญา ใช้ในหนังสือ)</label><textarea id="cName" rows="3">' + esc(p.name || '') + '</textarea></div>' +
      f('cContractor', 'ผู้รับจ้าง', p.contractor, 'text', '', 'span-2') +
      '<div class="field"><label>ประเภทงาน</label><select id="cType">' + A.opts(D.PROJECT_TYPES, p.type || 'general') + '</select></div>' +
      '<div class="field"><label>สถานะโครงการ</label><select id="cStatus">' + A.opts(Object.keys(STATUS).map(function (k) { return { key: k, name: STATUS[k].name }; }), p.status || 'active') + '</select></div>' +
      f('cContractDate', 'วันที่ลงนามสัญญา', p.contractDate, 'date') + f('cStart', 'วันเริ่มสัญญา', p.startDate, 'date') +
      f('cDays', 'ระยะเวลา (วัน)', p.days, 'number', 'min="1"') +
      '<div class="field"><label>วันสิ้นสุดสัญญา (คำนวณ)</label><input id="cEnd" disabled value="' + esc(c.end ? U.thDate(c.end) : '') + '"></div>' +
      f('cValue', 'ค่างาน (บาท)', p.value, 'number', 'step="0.01"') + f('cFine', 'ค่าปรับต่อวัน (บาท)', p.finePerDay, 'number', 'step="0.01" placeholder="ว่าง = 0.025% ของค่างาน"') +
      f('cCompleted', 'วันที่ผู้รับจ้างส่งงาน', p.completedDate, 'date') + f('cAccepted', 'วันที่ตรวจรับ', p.acceptedDate, 'date') +
      f('cHighway', 'ทางหลวง/ตอนควบคุม (สั้น)', p.highway, 'text', 'placeholder="ทล.3 ตอน ระยอง – กะเฉด"', 'span-2') +
      f('cLocation', 'ช่วง กม. (สั้น)', p.kmText, 'text', 'placeholder="กม.241+420 - กม.247+016"', 'span-2') + '</div>' +
      '<div class="sub-h">ผู้ลงนามและหนังสือ</div><div class="grid grid-4">' +
      f('cOffice', 'ส่วนราชการ (หัวบันทึก)', p.office, 'text', '', 'span-2') + f('cPhone', 'โทรศัพท์', p.phone) + f('cAddressee', 'เรียน', p.addressee) +
      f('cSupName', 'ผู้ควบคุมงาน (ชื่อ-นามสกุล)', p.supervisor.name, 'text', '', 'span-2') + f('cSupPos', 'ตำแหน่งผู้ควบคุมงาน', p.supervisor.position, 'text', '', 'span-2') + '</div>' +
      '<div class="sub-h">คณะกรรมการตรวจรับพัสดุ <button class="btn btn-sm btn-outline" id="addCom">+ เพิ่ม</button></div><div class="rows-edit" id="comRows"></div>' +
      '<div class="sub-h">การขยายเวลา / งดคิดค่าปรับ <button class="btn btn-sm btn-outline" id="addExt">+ เพิ่ม</button></div><div class="rows-edit" id="extRows"></div></div>' +

      '<div class="card"><div class="section-title">รายการงานและราคา (BOQ) <span class="sub">รวม <b id="boqSum"></b> บาท</span><span class="right"><button class="btn btn-sm btn-outline" id="addBoq">+ เพิ่มรายการ</button></span></div>' +
      '<p class="hint" style="margin-top:-6px">"คิดผลงานจาก": <b>ทะเบียนชิ้นงาน</b> = คำนวณจากหน้า "ความคืบหน้ารายจุด" ตามน้ำหนักขั้นตอน · <b>กรอกเอง</b> = กดปุ่ม ผลงาน เพื่อบันทึก % แล้วเสร็จตามวันที่</p>' +
      '<div class="rows-edit" id="boqRows"></div></div>' +

      '<div class="card"><div class="section-title">แผนงานรายเดือนของผู้รับจ้าง <span class="sub">รวม <b id="planSum"></b></span><span class="right"><button class="btn btn-sm btn-outline" id="genPlan">สร้างเดือนตามอายุสัญญา</button><button class="btn btn-sm btn-outline" id="addPlan">+ เพิ่มเดือน</button></span></div>' +
      '<div class="rows-edit" id="planRows"></div><div id="planCheck" class="hint" style="margin-top:8px"></div></div>' +

      '<div class="card"><div class="section-title">จุดติดตั้ง / ช่วงงาน <span class="sub">ใช้สร้างทะเบียนชิ้นงาน (เช่น เสาไฟแต่ละต้น)</span><span class="right"><button class="btn btn-sm btn-outline" id="addLoc">+ เพิ่มจุด</button></span></div>' +
      '<div class="rows-edit" id="locRows"></div></div>' +

      '<div class="card"><div class="section-title">ขั้นตอนของชิ้นงาน และน้ำหนักผลงาน <span class="sub">รวม <b id="stSum"></b>%</span><span class="right"><button class="btn btn-sm btn-outline" id="addSt">+ เพิ่มขั้นตอน</button></span></div>' +
      '<div class="rows-edit" id="stRows"></div>' +
      '<div class="field" style="margin-top:12px"><label>เครื่องจักร/เครื่องมือที่บันทึกประจำวัน (คั่นด้วยเครื่องหมายจุลภาค)</label><input id="cMachines" value="' + esc(p.machines.join(', ')) + '"></div></div>' +
      '<div class="flex" style="justify-content:flex-end"><button class="btn btn-primary" id="cSave2">บันทึกข้อมูลสัญญา</button></div>';

    const markDirty = function () { S.dirty.contract = true; };
    el.addEventListener('input', markDirty); el.addEventListener('change', markDirty);

    // ---------- แถวแก้ไขแบบตาราง ----------
    function rowsEditor(boxId, arr, cols, tpl, onChange) {
      const box = el.querySelector('#' + boxId);
      function draw() {
        box.innerHTML = arr.length ? arr.map(function (r, i) {
          return '<div class="row-edit" style="grid-template-columns:' + cols.map(function (c) { return c.w || '1fr'; }).join(' ') + ' 30px">' +
            cols.map(function (c) {
              const v = r[c.k] === undefined || r[c.k] === null ? '' : r[c.k];
              if (c.type === 'select') return '<select class="inp" data-i="' + i + '" data-k="' + c.k + '" title="' + esc(c.ph || '') + '">' + A.opts(c.opts, v) + '</select>';
              if (c.type === 'btn') return '<button class="btn btn-sm btn-outline" data-i="' + i + '" data-act="' + c.k + '">' + c.label + '</button>';
              return '<input class="inp" data-i="' + i + '" data-k="' + c.k + '" type="' + (c.type || 'text') + '" ' + (c.step ? 'step="' + c.step + '"' : '') + ' placeholder="' + esc(c.ph || '') + '" title="' + esc(c.ph || '') + '" value="' + esc(v) + '">';
            }).join('') + '<button class="x" data-del="' + i + '" title="ลบแถว">×</button></div>';
        }).join('') : '<div class="hint">ยังไม่มีรายการ</div>';
        box.querySelectorAll('[data-k]').forEach(function (inp) {
          inp.addEventListener('input', function () {
            const col = cols.find(function (c) { return c.k === inp.dataset.k; });
            arr[+inp.dataset.i][inp.dataset.k] = col.type === 'number' ? (inp.value === '' ? '' : U.num(inp.value)) : inp.value;
            if (onChange) onChange();
          });
          inp.addEventListener('change', function () { if (onChange) onChange(); });
        });
        box.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { arr.splice(+b.dataset.del, 1); markDirty(); draw(); if (onChange) onChange(); }; });
        box.querySelectorAll('[data-act]').forEach(function (b) {
          const col = cols.find(function (c) { return c.k === b.dataset.act; });
          b.onclick = function () { col.onClick(arr[+b.dataset.i], draw); };
        });
      }
      draw();
      return { draw: draw, add: function () { arr.push(tpl()); markDirty(); draw(); if (onChange) onChange(); } };
    }

    const com = rowsEditor('comRows', p.committee, [
      { k: 'name', ph: 'ชื่อ-นามสกุล', w: '2fr' }, { k: 'position', ph: 'ตำแหน่ง เช่น ผอ.ขท.ระยอง', w: '2fr' },
      { k: 'role', type: 'select', opts: ['ประธานกรรมการ', 'กรรมการ'], w: '1fr' }
    ], function () { return { name: '', position: '', role: 'กรรมการ' }; });
    el.querySelector('#addCom').onclick = com.add;

    const ext = rowsEditor('extRows', p.extensions, [
      { k: 'days', type: 'number', ph: 'จำนวนวัน', w: '110px' }, { k: 'reason', ph: 'เหตุผล เช่น หยุดงานช่วงเทศกาลปีใหม่', w: '3fr' }, { k: 'ref', ph: 'เลขที่หนังสืออนุมัติ', w: '1.3fr' }
    ], function () { return { days: '', reason: '', ref: '' }; }, updateCalc);
    el.querySelector('#addExt').onclick = ext.add;

    const boq = rowsEditor('boqRows', p.boq, [
      { k: 'desc', ph: 'รายการ', w: '3fr' }, { k: 'unit', ph: 'หน่วย', w: '70px' }, { k: 'qty', type: 'number', ph: 'ปริมาณ', w: '80px', step: 'any' },
      { k: 'unitPrice', type: 'number', ph: 'ราคาต่อหน่วย', w: '120px', step: '0.01' },
      { k: 'track', type: 'select', ph: 'คิดผลงานจาก', opts: [{ key: 'manual', name: 'กรอกเอง' }, { key: 'units', name: 'ทะเบียนชิ้นงาน' }], w: '130px' },
      { k: 'deliveredAmount', type: 'number', ph: 'เงินที่ขอส่งจริง (ถ้าต่างจากราคา เช่น จ่ายตามใบเสร็จ)', w: '120px', step: '0.01' },
      { k: 'progress', type: 'btn', label: 'ผลงาน', w: '70px', onClick: function (item) { progressDialog(item); } }
    ], function () { return { desc: '', unit: '', qty: 1, unitPrice: 0, track: 'manual', progress: [] }; }, updateCalc);
    el.querySelector('#addBoq').onclick = boq.add;

    const plan = rowsEditor('planRows', p.plan, [
      { k: 'month', type: 'month', ph: 'เดือน', w: '170px' }, { k: 'pct', type: 'number', ph: 'ร้อยละของเดือน', w: '140px', step: 'any' },
      { k: 'note', ph: 'หมายเหตุ', w: '2fr' }
    ], function () { return { month: '', pct: '' }; }, updateCalc);
    el.querySelector('#addPlan').onclick = plan.add;
    el.querySelector('#genPlan').onclick = function () {
      readForm();
      const cc = U.contract(p);
      if (!cc.start) return A.toast('กรอกวันเริ่มสัญญาและระยะเวลาก่อน', true);
      const have = {}; p.plan.forEach(function (x) { have[x.month] = 1; });
      let d = U.parse(cc.start); const endM = cc.end.slice(0, 7);
      while (U.iso(d).slice(0, 7) <= endM) { const ym = U.iso(d).slice(0, 7); if (!have[ym]) p.plan.push({ month: ym, pct: '' }); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
      p.plan.sort(function (a, b) { return String(a.month).localeCompare(String(b.month)); });
      markDirty(); plan.draw(); updateCalc();
    };

    const loc = rowsEditor('locRows', p.locations, [
      { k: 'name', ph: 'ชื่อจุด เช่น จุดที่ 1', w: '1.3fr' }, { k: 'prefix', ph: 'อักษรนำเลขชิ้นงาน เช่น A', w: '80px' },
      { k: 'kmFrom', ph: 'กม.เริ่ม 241+420', w: '1fr' }, { k: 'kmTo', ph: 'กม.สิ้นสุด 242+100', w: '1fr' },
      { k: 'count', type: 'number', ph: 'จำนวนชิ้นงาน', w: '90px' },
      { k: 'sides', type: 'select', ph: 'ฝั่ง', opts: [{ key: 'LR', name: 'สองฝั่ง (Lt/Rt)' }, { key: 'C', name: 'เกาะกลาง (Cl.)' }, { key: 'L', name: 'ซ้าย (Lt)' }, { key: 'R', name: 'ขวา (Rt)' }], w: '140px' },
      { k: 'note', ph: 'หมายเหตุ เช่น หม้อแปลง กฟภ.สาขา', w: '1.5fr' }
    ], function () { return { name: 'จุดที่ ' + (p.locations.length + 1), prefix: String.fromCharCode(65 + p.locations.length), kmFrom: '', kmTo: '', count: '', sides: 'C' }; });
    el.querySelector('#addLoc').onclick = loc.add;

    const st = rowsEditor('stRows', p.stages, [
      { k: 'name', ph: 'ชื่อขั้นตอน', w: '3fr' }, { k: 'weight', type: 'number', ph: 'น้ำหนัก %', w: '120px', step: 'any' }
    ], function () { return { key: 's' + Date.now().toString(36), name: '', weight: 0 }; }, updateCalc);
    el.querySelector('#addSt').onclick = st.add;

    function readForm() {
      const g = function (id) { const e = el.querySelector('#' + id); return e ? e.value.trim() : ''; };
      p.code = g('cCode'); p.docPrefix = g('cPrefix'); p.shortName = g('cShort'); p.name = el.querySelector('#cName').value.trim();
      p.contractor = g('cContractor'); p.type = g('cType'); p.status = g('cStatus');
      p.contractDate = g('cContractDate'); p.startDate = g('cStart'); p.days = U.num(g('cDays')) || '';
      p.value = U.num(g('cValue')) || ''; p.finePerDay = g('cFine') === '' ? '' : U.num(g('cFine'));
      p.completedDate = g('cCompleted'); p.acceptedDate = g('cAccepted'); p.highway = g('cHighway'); p.kmText = g('cLocation');
      p.office = g('cOffice'); p.phone = g('cPhone'); p.addressee = g('cAddressee');
      p.supervisor = { name: g('cSupName'), position: g('cSupPos') };
      p.machines = g('cMachines').split(/\s*,\s*/).filter(Boolean);
    }
    function updateCalc() {
      readForm();
      const cc = U.contract(p);
      el.querySelector('#cEnd').value = cc.end ? U.thDate(cc.end) + (cc.ext ? ' (ขยายถึง ' + U.thDate(cc.endExt) + ')' : '') : '';
      const tot = U.boqTotal(p);
      el.querySelector('#boqSum').textContent = U.money(tot) + (p.value && Math.abs(tot - U.num(p.value)) > 1 ? ' ⚠ ไม่ตรงกับค่างาน ' + U.money(p.value) : '');
      const ps = p.plan.reduce(function (s, x) { return s + U.num(x.pct); }, 0);
      el.querySelector('#planSum').textContent = U.pct(ps, 3) + (Math.abs(ps - 100) > 0.01 && p.plan.length ? ' ⚠ ควรรวมได้ 100%' : '');
      const ss = p.stages.reduce(function (s, x) { return s + U.num(x.weight); }, 0);
      el.querySelector('#stSum').textContent = U.pct(ss, 1).replace('%', '') + (Math.abs(ss - 100) > 0.01 && p.stages.length ? ' ⚠ ควรรวมได้ 100' : '');
      if (cc.start && p.plan.length) {
        const a = U.planCum(p, cc.q1), b = U.planCum(p, cc.q2);
        el.querySelector('#planCheck').innerHTML = 'ตรวจแผน: ณ 1/4 ของเวลา (' + U.thDate(cc.q1, 'short') + ') = <b>' + U.pct(a) + '</b> ' +
          (a >= 10 ? '<span class="badge b-ok">ผ่าน ≥10%</span>' : '<span class="badge b-bad">ต่ำกว่า 10%</span>') +
          ' · ณ 2/4 ของเวลา (' + U.thDate(cc.q2, 'short') + ') = <b>' + U.pct(b) + '</b> ' +
          (b >= 25 ? '<span class="badge b-ok">ผ่าน ≥25%</span>' : '<span class="badge b-bad">ต่ำกว่า 25%</span>');
      } else el.querySelector('#planCheck').textContent = '';
    }
    ['cStart', 'cDays', 'cValue'].forEach(function (id) { el.querySelector('#' + id).addEventListener('input', updateCalc); });
    updateCalc();

    function progressDialog(item) {
      item.progress = item.progress || [];
      const m = A.modal({
        title: 'ผลงานรายการ: ' + (item.desc || ''), size: 'narrow',
        body: '<p class="hint">บันทึก % แล้วเสร็จสะสมของรายการนี้ ณ วันที่ต่างๆ (เช่น วันที่การไฟฟ้าติดตั้งหม้อแปลงเสร็จ = 100%)</p><div id="pgRows" class="rows-edit"></div>' +
          '<button class="btn btn-sm btn-outline" id="pgAdd" style="margin-top:8px">+ เพิ่ม</button>',
        foot: '<button class="btn btn-primary" data-close>เสร็จ</button>'
      });
      function draw() {
        m.q('#pgRows').innerHTML = item.progress.map(function (x, i) {
          return '<div class="row-edit" style="grid-template-columns:1fr 110px 30px"><input class="inp" type="date" data-i="' + i + '" data-k="date" value="' + esc(x.date || '') + '">' +
            '<input class="inp" type="number" step="any" min="0" max="100" data-i="' + i + '" data-k="pct" value="' + esc(x.pct === undefined ? '' : x.pct) + '" placeholder="%"><button class="x" data-del="' + i + '">×</button></div>';
        }).join('') || '<div class="hint">ยังไม่มีผลงาน</div>';
        m.qa('[data-k]').forEach(function (inp) { inp.oninput = function () { item.progress[+inp.dataset.i][inp.dataset.k] = inp.dataset.k === 'pct' ? U.num(inp.value) : inp.value; markDirty(); }; });
        m.qa('[data-del]').forEach(function (b) { b.onclick = function () { item.progress.splice(+b.dataset.del, 1); markDirty(); draw(); }; });
      }
      m.q('#pgAdd').onclick = function () { item.progress.push({ date: U.today(), pct: 100 }); markDirty(); draw(); };
      draw();
    }

    async function save(btn) {
      readForm();
      if (!p.code) return A.toast('กรอกเลขที่สัญญา', true);
      p.plan = p.plan.filter(function (x) { return x.month; });
      const done = A.busy(btn);
      try { await A.saveProject(p); S.dirty.contract = false; A.toast('บันทึกข้อมูลสัญญาแล้ว'); }
      catch (e) { A.toast(e.message, true); }
      finally { done(); }
    }
    el.querySelector('#cSave').onclick = function () { save(this); };
    el.querySelector('#cSave2').onclick = function () { save(this); };
  };

  /* ======================= Checklist + ความปลอดภัย + คู่มือ ======================= */
  A.checklistItems = function () {
    const p = S.p; if (!p) return [];
    const c = U.contract(p); const st = p.checklist || {};
    const out = [];
    D.CHECKLIST.forEach(function (ph) {
      ph.items.forEach(function (it) {
        if (it.types && it.types.indexOf(p.type) < 0) return;
        let due = '';
        if (it.due && c.start) due = U.addDays(it.due.from === 'end' ? c.end : (it.due.from === 'endExt' ? c.endExt : c.start), it.due.days);
        if (it.auto === 'q1') due = c.q1; if (it.auto === 'q2') due = c.q2;
        const s = st[it.id] || {};
        out.push({ id: it.id, phase: ph.phase, text: it.text, due: due, auto: it.auto, done: !!s.done, date: s.date || '', note: s.note || '' });
      });
    });
    (p.customChecklist || []).forEach(function (it) {
      const s = st[it.id] || {};
      out.push({ id: it.id, phase: it.phase || '5. รายการเพิ่มเติม', text: it.text, due: it.due || '', custom: true, done: !!s.done, date: s.date || '', note: s.note || '' });
    });
    return out;
  };
  A.views.check = function (el) {
    const p = S.p, t = U.today();
    const items = A.checklistItems();
    const doneN = items.filter(function (i) { return i.done; }).length;
    const phases = [];
    items.forEach(function (i) { if (phases.indexOf(i.phase) < 0) phases.push(i.phase); });
    const safety = A.active('safety').sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    el.innerHTML = '<div class="split"><div class="card"><div class="section-title">Checklist การบริหารสัญญา <span class="sub">เสร็จ ' + doneN + '/' + items.length + '</span>' +
      '<span class="right"><button class="btn btn-sm btn-outline" id="ckAdd">+ เพิ่มรายการ</button></span></div>' +
      '<div class="bar" style="margin:-4px 0 8px"><span style="width:' + (items.length ? doneN / items.length * 100 : 0) + '%"></span></div>' +
      phases.map(function (ph) {
        return '<div class="ck-phase">' + esc(ph) + '</div>' + items.filter(function (i) { return i.phase === ph; }).map(function (i) {
          const over = i.due && !i.done && i.due < t;
          return '<div class="ck-item' + (i.done ? ' done' : '') + '"><input type="checkbox" data-ck="' + i.id + '"' + (i.done ? ' checked' : '') + '>' +
            '<div><div class="t">' + esc(i.text) + '</div><div class="meta">' +
            (i.due ? '<span class="badge ' + (over ? 'b-bad' : (i.done ? 'b-mute' : 'b-info')) + '">กำหนด ' + U.thDate(i.due, 'short') + '</span> ' : '') +
            (i.done && i.date ? 'ทำแล้ว ' + U.thDate(i.date, 'short') + ' ' : '') + (i.note ? '· ' + esc(i.note) : '') + '</div></div>' +
            '<button class="btn btn-sm btn-ghost" data-ed="' + i.id + '">แก้ไข</button></div>';
        }).join('');
      }).join('') + '</div>' +
      '<div><div class="card"><div class="section-title">ตรวจความปลอดภัย/การจัดการจราจร <span class="right"><button class="btn btn-sm btn-primary" id="sfNew">+ บันทึกการตรวจ</button></span></div>' +
      (safety.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>วันที่</th><th>จุดตรวจ</th><th>ผล</th><th>แก้ไขแล้ว</th></tr></thead><tbody>' +
        safety.map(function (s) {
          return '<tr class="clickable" data-sf="' + esc(s.id) + '"><td class="nowrap">' + U.thDate(s.date, 'short') + '</td><td>' + esc(s.location || '') + '</td><td>' +
            (s.result === 'fail' ? '<span class="badge b-bad">พบข้อบกพร่อง</span>' : '<span class="badge b-ok">เรียบร้อย</span>') + '</td><td>' +
            (s.result === 'fail' ? (s.fixedDate ? U.thDate(s.fixedDate, 'short') : '<span class="badge b-warn">ยัง</span>') : '-') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีบันทึกการตรวจ</div>') + '</div>' +
      '<div class="card guide"><div class="section-title">คู่มือผู้ควบคุมงาน (ย่อ)</div>' +
      D.GUIDE.map(function (g) { return '<h4>' + esc(g.h) + '</h4><ul>' + g.items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }).join('') + '</div></div></div>';

    async function saveCk(id, patch) {
      const pp = JSON.parse(JSON.stringify(S.p)); pp.checklist = pp.checklist || {};
      pp.checklist[id] = Object.assign({}, pp.checklist[id] || {}, patch);
      try { await A.saveProject(pp); } catch (e) { A.toast(e.message, true); }
    }
    el.querySelectorAll('[data-ck]').forEach(function (cb) {
      cb.onchange = function () { saveCk(cb.dataset.ck, { done: cb.checked, date: cb.checked ? U.today() : '' }); };
    });
    el.querySelectorAll('[data-ed]').forEach(function (b) {
      b.onclick = function () {
        const it = items.find(function (i) { return i.id === b.dataset.ed; });
        const m = A.modal({
          title: 'Checklist', size: 'narrow',
          body: '<p style="margin-top:0">' + esc(it.text) + '</p><div class="grid">' +
            '<div class="field"><label><input type="checkbox" id="ckDone"' + (it.done ? ' checked' : '') + '> ดำเนินการแล้ว</label></div>' +
            '<div class="field"><label>วันที่ดำเนินการ</label><input type="date" id="ckDate" value="' + esc(it.date || '') + '"></div>' +
            '<div class="field"><label>หมายเหตุ / เลขที่หนังสือ</label><textarea id="ckNote">' + esc(it.note || '') + '</textarea></div></div>',
          foot: (it.custom ? '<button class="btn btn-danger left" id="ckDel">ลบรายการ</button>' : '') + '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="ckOk">บันทึก</button>'
        });
        m.q('#ckOk').onclick = async function () {
          await saveCk(it.id, { done: m.q('#ckDone').checked, date: m.q('#ckDate').value, note: m.q('#ckNote').value.trim() }); m.close();
        };
        if (it.custom) m.q('#ckDel').onclick = async function () {
          const pp = JSON.parse(JSON.stringify(S.p));
          pp.customChecklist = (pp.customChecklist || []).filter(function (x) { return x.id !== it.id; });
          try { await A.saveProject(pp); m.close(); } catch (e) { A.toast(e.message, true); }
        };
      };
    });
    el.querySelector('#ckAdd').onclick = function () {
      const m = A.modal({
        title: 'เพิ่มรายการ Checklist', size: 'narrow',
        body: '<div class="grid"><div class="field"><label>รายการ</label><textarea id="nkText"></textarea></div><div class="field"><label>กำหนดเสร็จ</label><input type="date" id="nkDue"></div></div>',
        foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="nkOk">เพิ่ม</button>'
      });
      m.q('#nkOk').onclick = async function () {
        const text = m.q('#nkText').value.trim(); if (!text) return;
        const pp = JSON.parse(JSON.stringify(S.p));
        pp.customChecklist = (pp.customChecklist || []).concat([{ id: 'x' + FBL.newId(), text: text, due: m.q('#nkDue').value }]);
        try { await A.saveProject(pp); m.close(); } catch (e) { A.toast(e.message, true); }
      };
    };
    el.querySelector('#sfNew').onclick = function () { safetyForm(null); };
    el.querySelectorAll('[data-sf]').forEach(function (tr) { tr.onclick = function () { safetyForm(safety.find(function (s) { return s.id === tr.dataset.sf; })); }; });
  };

  function safetyForm(rec) {
    const r = rec ? JSON.parse(JSON.stringify(rec)) : { date: U.today(), location: '', inspector: FBL.user.name, checks: {}, result: 'pass' };
    const items = D.SAFETY_ITEMS;
    const m = A.modal({
      title: rec ? 'ผลตรวจความปลอดภัย ' + U.thDate(r.date, 'short') : 'บันทึกการตรวจความปลอดภัย/การจัดการจราจร', size: 'wide',
      body: '<div class="grid grid-3"><div class="field"><label>วันที่ตรวจ</label><input type="date" id="sfDate" value="' + esc(r.date) + '"></div>' +
        '<div class="field"><label>จุด/ช่วง กม.</label><input id="sfLoc" value="' + esc(r.location || '') + '"></div>' +
        '<div class="field"><label>ผู้ตรวจ</label><input id="sfBy" value="' + esc(r.inspector || '') + '"></div></div>' +
        '<div class="table-wrap" style="margin-top:12px"><table class="data"><thead><tr><th>รายการตรวจ</th><th class="c">ผ่าน</th><th class="c">ไม่ผ่าน</th><th class="c">ไม่เกี่ยว</th></tr></thead><tbody>' +
        items.map(function (t, i) {
          const v = (r.checks || {})['i' + i] || '';
          return '<tr><td>' + esc(t) + '</td>' + ['ok', 'ng', 'na'].map(function (k) {
            return '<td class="c"><input type="radio" name="sf' + i + '" value="' + k + '"' + (v === k ? ' checked' : '') + '></td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="grid grid-2" style="margin-top:12px"><div class="field"><label>ข้อบกพร่องที่พบ / ข้อสั่งการ</label><textarea id="sfIssue">' + esc(r.issues || '') + '</textarea></div>' +
        '<div class="field"><label>การแก้ไขของผู้รับจ้าง</label><textarea id="sfFix">' + esc(r.fixNote || '') + '</textarea></div>' +
        '<div class="field"><label>กำหนดแก้ไขภายใน</label><input type="date" id="sfDue" value="' + esc(r.fixDue || '') + '"></div>' +
        '<div class="field"><label>วันที่แก้ไขแล้วเสร็จ</label><input type="date" id="sfFixed" value="' + esc(r.fixedDate || '') + '"></div></div>' +
        '<p class="hint">แนบรูปประกอบได้ที่แท็บรูปถ่าย หมวด "ความปลอดภัย/จราจร" วันที่เดียวกัน</p>',
      foot: (rec ? '<button class="btn btn-danger left" id="sfDel">ลบ</button>' : '') + '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="sfOk">บันทึก</button>'
    });
    m.q('#sfOk').onclick = async function () {
      r.date = m.q('#sfDate').value; r.location = A.val(m, '#sfLoc'); r.inspector = A.val(m, '#sfBy');
      r.checks = {}; let fail = false;
      items.forEach(function (t, i) { const s = m.q('input[name="sf' + i + '"]:checked'); if (s) { r.checks['i' + i] = s.value; if (s.value === 'ng') fail = true; } });
      r.result = fail ? 'fail' : 'pass'; r.issues = m.q('#sfIssue').value.trim(); r.fixNote = m.q('#sfFix').value.trim();
      r.fixDue = m.q('#sfDue').value; r.fixedDate = m.q('#sfFixed').value; r.items = items.slice();
      if (!r.date) return A.toast('ระบุวันที่ตรวจ', true);
      const done = A.busy(this);
      try { await A.save('safety', r, 'ตรวจความปลอดภัย ' + r.date); m.close(); A.toast('บันทึกแล้ว'); } catch (e) { done(); A.toast(e.message, true); }
    };
    if (rec) m.q('#sfDel').onclick = async function () { if (await A.confirm('ลบผลตรวจนี้?', 'ลบ', true)) { await A.softDelete('safety', rec, 'ตรวจความปลอดภัย ' + rec.date); m.close(); } };
  }

  /* ======================= ตั้งค่า ======================= */
  /* สมุดชื่อล็อกอิน (แผน 6) — เจ้าของระบบกดย้ายครั้งเดียว (ใช้ร่วม 3 ระบบ: หนังสือราชการ / ควบคุมงานโครงการ / ผังจราจร)
     หน้าล็อกอินเปิดดูได้โดยไม่ต้องล็อกอิน จึงอ่านได้เฉพาะ "ชื่อ → อีเมลสังเคราะห์" จากสมุดชื่อ (login_directory)
     หลังย้าย ตารางรายชื่อทีม (มีสถานะเจ้าของ/ผู้ดูแล) จะอ่านได้เฉพาะสมาชิกที่ล็อกอินแล้ว — ระหว่างย้ายไม่มีใครล็อกอินไม่ได้ */
  async function renderDirNotice(el) {
    const box = el.querySelector('#dirNotice');
    if (!box || !FBL.user || !FBL.user.isOwner || FBL.mode === 'demo' || !FBL.loginDirStatus) return;
    let st;
    try { st = await FBL.loginDirStatus(); } catch (e) { box.innerHTML = ''; return; }
    if (!box.isConnected) return;
    const bad = st.missing.length + st.extra.length;
    if (st.ready && !bad) { box.innerHTML = ''; return; }
    const why = !st.ready
      ? 'ยังไม่ได้ย้ายรายชื่อไปสมุดชื่อล็อกอิน — ตอนนี้คนนอกที่เปิดหน้านี้ยังเห็นว่าใครเป็นเจ้าของ/ผู้ดูแลระบบ กดปุ่มด้านล่างครั้งเดียวเพื่อย้าย (ไม่กระทบการล็อกอินของใคร; รายชื่อนี้ใช้ร่วมกับอีก 2 ระบบในโปรเจกต์เดียวกัน)'
      : 'สมุดชื่อล็อกอินไม่ตรงกับรายชื่อทีม ' + bad + ' ชื่อ (' + st.missing.concat(st.extra).join(', ') + ') — กดซิงก์เพื่อให้ตรงกัน';
    box.innerHTML = '<div style="margin-top:12px;padding:12px;border:1px solid #f59e0b;background:#fff8e1;border-radius:10px;color:#7a4b00;font-size:13px">⚠ ' + esc(why) +
      '<div style="margin-top:8px"><button class="btn btn-sm btn-primary" id="dirMigrate">' + (st.ready ? 'ซิงก์สมุดชื่อล็อกอิน' : 'ย้ายรายชื่อไปสมุดชื่อล็อกอิน') + '</button></div></div>';
    const b = box.querySelector('#dirMigrate');
    b.onclick = async function () {
      const done = A.busy(b, 'กำลังดำเนินการ...');
      try { const r = await FBL.migrateLoginDirectory(); A.toast('ย้ายสมุดชื่อล็อกอินเรียบร้อย (' + r.total + ' ชื่อ)'); }
      catch (e) { A.toast(e.message, true); }
      done();
      renderDirNotice(el);
    };
  }

  A.views.settings = function (el) {
    const u = FBL.user, owner = u.isOwner, priv = A.can();
    const trash = [];    if (S.p) FBL.SUBS.forEach(function (sub) { (S.subs[sub] || []).forEach(function (r) { if (r.deletedAt) trash.push({ sub: sub, r: r }); }); });
    const subName = { daily: 'บันทึกประจำวัน', docs: 'เอกสาร', tests: 'ผลทดสอบ', units: 'ชิ้นงาน', photos: 'รูปถ่าย', safety: 'ตรวจความปลอดภัย' };
    el.innerHTML =
      '<div class="split"><div>' +
      '<div class="card"><div class="section-title">บัญชีของฉัน</div><p style="margin:0 0 10px">' + esc(u.name) + ' · ' + (owner ? 'เจ้าของระบบ' : (u.isAdmin ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน')) + '</p>' +
      '<div class="grid grid-2"><div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label>' + A.pwField('myPw') + '</div><div class="field"><label>ยืนยันรหัสผ่าน</label>' + A.pwField('myPw2') + '</div></div>' +
      '<button class="btn btn-outline" id="myPwOk" style="margin-top:10px">เปลี่ยนรหัสผ่าน</button></div>' +
      (owner ? '<div class="card"><div class="section-title">ผู้ใช้งานระบบ<span class="right"><button class="btn btn-sm btn-outline" id="tmAdd">+ เพิ่มผู้ใช้</button></span></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>ชื่อ</th><th>สิทธิ์</th><th></th></tr></thead><tbody>' +
        FBL.team().map(function (t) {
          return '<tr><td>' + esc(t.name + A.roleTag(t)) + '</td><td>' + (t.isOwner ? 'เจ้าของระบบ' : (t.isAdmin ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน')) + '</td><td class="r nowrap">' +
            (t.isOwner ? '' : '<button class="btn btn-sm btn-ghost" data-adm="' + esc(t.name) + '" data-v="' + (t.isAdmin ? '0' : '1') + '">' + (t.isAdmin ? 'ถอดผู้ดูแล' : 'ตั้งเป็นผู้ดูแล') + '</button>' +
              '<button class="btn btn-sm btn-ghost" data-rpw="' + esc(t.name) + '">ตั้งรหัสใหม่</button><button class="btn btn-sm btn-ghost" style="color:var(--bad)" data-rm="' + esc(t.name) + '">ลบ</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div><div id="dirNotice"></div></div>' : '') +
      '<div class="card"><div class="section-title">สำรอง / ย้ายข้อมูล</div>' +
      (S.p ? usageHtml() : '') +
      '<p class="hint" style="margin-top:-6px">ไฟล์สำรอง (.json) มีข้อมูลโครงการทั้งหมดยกเว้นตัวไฟล์รูป/เอกสาร — เก็บไว้ในที่ปลอดภัย ห้ามอัปโหลดขึ้นที่สาธารณะ</p>' +
      '<div class="flex">' + (S.p ? '<button class="btn btn-outline" id="bkJson">ส่งออกโครงการนี้ (.json)</button><button class="btn btn-outline" id="bkXlsx">ส่งออก Excel ทั้งโครงการ</button>' : '') +
      '<button class="btn btn-outline" id="bkImp">นำเข้าจากไฟล์ .json</button></div>' +
      (priv && FBL.fileStore === 'drive' ? '<div style="margin-top:14px"><div class="small"><b>ย้ายรูป/ไฟล์เดิมจาก Firestore ไป Google Drive</b> (ทุกโครงการ)</div>' +
        '<p class="hint" style="margin:4px 0 8px">ทำครั้งเดียวหลังตั้งค่า Drive — ไฟล์ที่ Drive ยืนยันว่าครบแล้วเท่านั้นจึงลบออกจาก Firestore ถ้าหยุดกลางทางกดใหม่ได้ ทำต่อจากที่ค้าง</p>' +
        '<button class="btn btn-outline" id="mvDrive">เริ่มย้ายไฟล์</button><div id="mvInfo" class="hint" style="margin-top:6px"></div></div>' : '') +      (FBL.mode === 'demo' ? '<p class="hint" style="margin-top:12px">โหมดทดลอง: <button class="btn btn-sm btn-danger" id="demoReset">ล้างข้อมูลทดลองทั้งหมด</button></p>' : '') + '</div>' +
      '</div><div>' +
      '<div class="card"><div class="section-title">ถังขยะ <span class="sub">' + (S.p ? esc(S.p.code) : '') + ' · ' + trash.length + ' รายการ</span></div>' +
      (trash.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>ประเภท</th><th>รายการ</th><th>ลบเมื่อ</th><th></th></tr></thead><tbody>' +
        trash.map(function (x, i) {
          const r = x.r;
          const label = r.subject || r.item || r.desc || r.code || r.date || r.id;
          return '<tr><td>' + subName[x.sub] + '</td><td>' + esc(String(label).slice(0, 60)) + '</td><td class="nowrap">' + U.thDate(String(r.deletedAt).slice(0, 10), 'short') + ' ' + esc(r.deletedBy || '') +
            '</td><td class="r nowrap"><button class="btn btn-sm btn-ghost" data-rs="' + i + '">กู้คืน</button>' + (priv ? '<button class="btn btn-sm btn-ghost" style="color:var(--bad)" data-pd="' + i + '">ลบถาวร</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ถังขยะว่าง</div>') + '</div>' +
      (priv ? '<div class="card"><div class="section-title">ประวัติการแก้ไขข้อมูล<span class="right"><button class="btn btn-sm btn-outline" id="logLoad">โหลด</button></span></div><div id="logBox" class="hint">กด "โหลด" เพื่อดู 200 รายการล่าสุด</div></div>' : '') +
      (S.p && priv ? '<div class="card"><div class="section-title">ลบโครงการ</div><p class="hint">ปิดโครงการแทนการลบได้ที่ ข้อมูลสัญญา → สถานะ "ปิดโครงการ"</p><button class="btn btn-danger" id="prjDel">ลบโครงการ ' + esc(S.p.code) + '</button></div>' : '') +
      '</div></div>';

    el.querySelector('#myPwOk').onclick = async function () {
      const a = el.querySelector('#myPw').value, b = el.querySelector('#myPw2').value;
      if (a.length < 8) return A.toast('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร', true);
      if (a !== b) return A.toast('รหัสผ่านสองช่องไม่ตรงกัน', true);
      try { await FBL.changeMyPassword(a); A.toast('เปลี่ยนรหัสผ่านแล้ว'); } catch (e) { A.toast(e.message, true); }
    };
    el.querySelectorAll('.pw-toggle').forEach(bindPwToggle);
    if (owner) {
      renderDirNotice(el);
      el.querySelector('#tmAdd').onclick = function () {
        const m = A.modal({
          title: 'เพิ่มผู้ใช้งาน', size: 'narrow',
          body: '<div class="grid"><div class="field"><label>ชื่อ-นามสกุล</label><input id="tmName"></div><div class="field"><label>รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัวอักษร)</label>' + A.pwField('tmPw') + '</div>' +
            '<label><input type="checkbox" id="tmAdm"> ผู้ดูแลระบบ (ลบถาวร/ดูประวัติได้)</label></div>',
          foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="tmOk">เพิ่ม</button>'
        });
        m.q('#tmOk').onclick = async function () {
          const n = A.val(m, '#tmName'), pw = m.q('#tmPw').value;
          if (!n || pw.length < 8) return A.toast('กรอกชื่อและรหัสผ่านอย่างน้อย 8 ตัวอักษร', true);
          const done = A.busy(this);
          try { await FBL.addMember(n, pw, m.q('#tmAdm').checked); m.close(); A.toast('เพิ่มผู้ใช้แล้ว'); A.render(); } catch (e) { done(); A.toast(e.message, true); }
        };
      };
      el.querySelectorAll('[data-adm]').forEach(function (b) { b.onclick = async function () { try { await FBL.setMemberAdmin(b.dataset.adm, b.dataset.v === '1'); A.render(); } catch (e) { A.toast(e.message, true); } }; });
      el.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = async function () { if (await A.confirm('ลบผู้ใช้ ' + b.dataset.rm + '?', 'ลบ', true)) { try { await FBL.removeMember(b.dataset.rm); A.render(); } catch (e) { A.toast(e.message, true); } } }; });
      el.querySelectorAll('[data-rpw]').forEach(function (b) {
        b.onclick = function () {
          const m = A.modal({ title: 'ตั้งรหัสผ่านใหม่: ' + b.dataset.rpw, size: 'narrow', body: '<div class="field"><label>รหัสผ่านใหม่</label>' + A.pwField('rpw') + '</div>',
            foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="rpwOk">บันทึก</button>' });
          m.q('#rpwOk').onclick = async function () {
            const pw = m.q('#rpw').value; if (pw.length < 8) return A.toast('อย่างน้อย 8 ตัวอักษร', true);
            try { await FBL.resetMemberPassword(b.dataset.rpw, pw); m.close(); A.toast('ตั้งรหัสผ่านใหม่แล้ว'); } catch (e) { A.toast(e.message, true); }
          };
        };
      });
    }
    el.querySelectorAll('[data-rs]').forEach(function (b) { b.onclick = async function () { const x = trash[+b.dataset.rs]; try { await FBL.restore(S.pid, x.sub, x.r.id); A.toast('กู้คืนแล้ว'); } catch (e) { A.toast(e.message, true); } }; });
    el.querySelectorAll('[data-pd]').forEach(function (b) {
      b.onclick = async function () {
        const x = trash[+b.dataset.pd];
        if (!await A.confirm('ลบถาวร กู้คืนไม่ได้อีก' + (x.sub === 'photos' || x.r.filePath ? '\n(ไฟล์ที่แนบจะถูกลบด้วย)' : '') + '\nยืนยัน?', 'ลบถาวร', true)) return;
        try {
          for (const path of [x.r.path, x.r.thumbPath, x.r.filePath]) if (path) await FBL.deleteFile(path);
          await FBL.hardDelete(S.pid, x.sub, x.r.id, x.sub + ' ' + (x.r.date || ''));
          A.toast('ลบถาวรแล้ว');
        } catch (e) { A.toast(e.message, true); }
      };
    });
    const lg = el.querySelector('#logLoad');
    if (lg) lg.onclick = async function () {
      try {
        const rows = await FBL.loadLog(200);
        const an = { add: 'เพิ่ม', update: 'แก้ไข', delete: 'ลบ', restore: 'กู้คืน', permanentDelete: 'ลบถาวร', bulk: 'บันทึกชุด' };
        el.querySelector('#logBox').innerHTML = '<div class="table-wrap" style="max-height:420px"><table class="data"><thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th><th>รายการ</th></tr></thead><tbody>' +
          rows.map(function (r) {
            const d = r.ts ? new Date(r.ts) : null;
            return '<tr><td class="nowrap">' + (d ? U.thDate(U.iso(d), 'short') + ' ' + d.toTimeString().slice(0, 5) : '') + '</td><td>' + esc(r.actorName) + '</td><td>' + (an[r.action] || esc(r.action)) + '</td><td class="small">' + esc(r.summary || r.target || '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      } catch (e) { A.toast(e.message, true); }
    };
    const pd = el.querySelector('#prjDel');
    if (pd) pd.onclick = async function () {
      if (!await A.confirm('ลบโครงการ ' + S.p.code + ' ออกจากรายการ?\n(ข้อมูลย่อยยังอยู่ในฐานข้อมูล กู้คืนได้โดยผู้ดูแลผ่าน Firebase Console)', 'ลบโครงการ', true)) return;
      const pp = JSON.parse(JSON.stringify(S.p)); pp.deletedAt = new Date().toISOString(); pp.deletedBy = FBL.user.name;
      try { await A.saveProject(pp); S.pid = null; S.p = null; const v = visibleProjects(); fillProjectSelect(); if (v[0]) selectProject(v[0].id); else A.render(); } catch (e) { A.toast(e.message, true); }
    };
    const bj = el.querySelector('#bkJson');
    if (bj) bj.onclick = function () {
      const data = { format: 'pcs-project-v1', exportedAt: new Date().toISOString(), project: S.p, subs: {} };
      FBL.SUBS.forEach(function (k) { data.subs[k] = S.subs[k]; });
      U.download(U.safeName('สำรอง_' + S.p.code + '_' + U.today()) + '.json', new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    };
    const bx = el.querySelector('#bkXlsx');
    if (bx) bx.onclick = function () { R.exportExcel(); };
    el.querySelector('#bkImp').onclick = function () { A.importJsonDialog(); };
    const mv = el.querySelector('#mvDrive');
    if (mv) mv.onclick = async function () {
      if (!await A.confirm('ย้ายรูปและไฟล์เดิมทั้งหมดจาก Firestore ไป Google Drive?\nใช้เวลาประมาณ 1–2 วินาทีต่อไฟล์ ห้ามปิดหน้านี้จนกว่าจะเสร็จ', 'เริ่มย้าย')) return;
      const info = el.querySelector('#mvInfo');
      const done = A.busy(this, 'กำลังย้าย...');
      try {
        const r = await FBL.migrateFilesToDrive(function (ok, bad, path) { info.textContent = 'ย้ายแล้ว ' + ok + ' ไฟล์' + (bad ? ' · ไม่สำเร็จ ' + bad : '') + ' — ' + path; });
        info.innerHTML = 'เสร็จแล้ว: ย้าย <b>' + r.done + '</b> ไฟล์' + (r.failed.length
          ? ' · ไม่สำเร็จ <b style="color:var(--bad)">' + r.failed.length + '</b> ไฟล์ (ยังอยู่ใน Firestore เปิดดูได้ตามปกติ กดย้ายใหม่ได้)<br>' + r.failed.slice(0, 10).map(esc).join('<br>')
          : (r.done ? '' : ' (ไม่มีไฟล์เหลือใน Firestore แล้ว)'));
      } catch (e) { info.textContent = ''; A.toast(e.message, true); }
      done();
    };
    const dr = el.querySelector('#demoReset');
    if (dr) dr.onclick = async function () { if (await A.confirm('ล้างข้อมูลทดลองทั้งหมด (ผู้ใช้ โครงการ รูป) ในเบราว์เซอร์นี้?', 'ล้างข้อมูล', true)) { FBL.resetDemo(); location.reload(); } };
  };

  // พื้นที่ไฟล์ที่โครงการนี้ใช้ (ประมาณ) — เก็บใน Drive: เทียบพื้นที่บัญชี Google 15 GB · เก็บใน Firestore: เทียบโควตาฟรี 1 GB (รวมทุกโครงการ)
  function usageHtml() {
    let bytes = 0, n = 0;
    A.active('photos').forEach(function (x) { bytes += U.num(x.size) + (x.thumbPath ? (U.num(x.thumbSize) || U.num(x.size) * 0.1) : 0); n++; });   // รูปใหม่ไม่มีรูปย่อ
    A.active('docs').concat(A.active('tests')).forEach(function (x) { if (x.filePath) bytes += U.num(x.fileSize); });
    const drive = FBL.fileStore === 'drive';
    const mb = bytes / 1048576, pct = mb / (drive ? 15360 : 1024) * 100;
    return '<div style="margin:-4px 0 12px"><div class="small">พื้นที่ไฟล์ของโครงการนี้ประมาณ <b>' + mb.toFixed(1) + ' MB</b> (รูป ' + n + ' รูป) · ' +
      (drive ? 'เก็บใน Google Drive (พื้นที่ฟรีของบัญชี Google 15 GB ใช้ร่วมกับ Gmail)' : 'โควตาฟรีรวมทุกโครงการ 1 GB' +
        (FBL.mode === 'firebase' ? ' — ดูยอดจริงได้ที่ Firebase Console → Usage' : '')) +
      '</div><div class="bar"><span style="width:' + Math.min(100, Math.max(0.5, pct)).toFixed(1) + '%"></span></div></div>';
  }

  /* ======================= นำเข้า JSON ======================= */
  A.importJsonDialog = function () {
    const m = A.modal({
      title: 'นำเข้าข้อมูลโครงการจากไฟล์ .json', size: 'narrow',
      body: '<p class="hint" style="margin-top:0">ใช้ไฟล์สำรองที่ส่งออกจากระบบนี้ หรือไฟล์ข้อมูลตั้งต้นที่เตรียมไว้ (เช่น ข้อมูลนำเข้า_รย.23.json)</p>' +
        '<input type="file" id="ijFile" accept=".json,application/json"><div id="ijInfo" class="hint" style="margin-top:10px"></div>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="ijOk" disabled>นำเข้า</button>'
    });
    let data = null;
    m.q('#ijFile').onchange = async function () {
      data = null; m.q('#ijOk').disabled = true;
      try {
        const txt = await this.files[0].text(); const d = JSON.parse(txt);
        if (d.format !== 'pcs-project-v1' || !d.project) throw new Error('ไม่ใช่ไฟล์ข้อมูลของระบบนี้');
        const exists = S.projects.find(function (p) { return p.id === d.project.id && !p.deletedAt; });
        const cnt = FBL.SUBS.map(function (k) { return (d.subs && d.subs[k] ? d.subs[k].length : 0); });
        m.q('#ijInfo').innerHTML = '<b>' + esc(d.project.code + ' ' + (d.project.shortName || '')) + '</b><br>บันทึกประจำวัน ' + cnt[0] + ' · เอกสาร ' + cnt[1] + ' · ผลทดสอบ ' + cnt[2] +
          ' · ชิ้นงาน ' + cnt[3] + ' · รูป ' + cnt[4] + ' · ตรวจความปลอดภัย ' + cnt[5] +
          (exists ? '<br><span style="color:var(--bad)">มีโครงการนี้อยู่แล้ว — จะเขียนทับข้อมูลที่มีรหัสเดียวกัน</span>' : '') +
          ((d.subs && d.subs.photos && d.subs.photos.length) ? '<br>หมายเหตุ: ไฟล์รูปไม่ได้อยู่ในไฟล์ .json (นำเข้าเฉพาะรายการ)' : '');
        data = d; m.q('#ijOk').disabled = false;
      } catch (e) { m.q('#ijInfo').innerHTML = '<span style="color:var(--bad)">' + esc(e.message) + '</span>'; }
    };
    m.q('#ijOk').onclick = async function () {
      if (!data) return;
      const done = A.busy(this, 'กำลังนำเข้า...');
      try {
        const p = Object.assign({}, data.project); delete p.deletedAt;
        const id = await A.saveProject(p);
        for (const k of FBL.SUBS) {
          const recs = (data.subs && data.subs[k]) || [];
          if (recs.length) await FBL.saveSubBulk(id, k, recs, function (a, b) { m.q('#ijInfo').textContent = k + ': ' + a + '/' + b; });
        }
        m.close(); await waitProject(id); await selectProject(id); A.go('dash'); A.toast('นำเข้าข้อมูลแล้ว');
      } catch (e) { done(); A.toast(e.message, true); }
    };
  };

  window.addEventListener('load', boot);
})();
