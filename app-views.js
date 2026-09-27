/* ==========================================================================
   app-views.js — หน้าบันทึกประจำวัน, ความคืบหน้ารายจุด, คุณภาพ/ทดสอบ, รูปถ่าย, เอกสาร/แบบ, รายงาน
   ========================================================================== */
(function () {
  'use strict';
  const A = window.App, S = A.S, D = A.D, esc = U.esc;
  const SIDES = ['Cl.', 'Lt.', 'Rt.', 'LCl.', 'RCl.', 'Lt./Rt.', '-'];

  /* ======================= บันทึกประจำวัน ======================= */
  A.views.daily = function (el) {
    const p = S.p;
    const ui = S.ui.daily = S.ui.daily || { month: '', q: '' };
    let list = A.active('daily').sort(function (a, b) { return b.date.localeCompare(a.date); });
    const months = []; list.forEach(function (d) { const m = d.date.slice(0, 7); if (months.indexOf(m) < 0) months.push(m); });
    if (ui.month) list = list.filter(function (d) { return d.date.slice(0, 7) === ui.month; });
    if (ui.q) { const q = ui.q.toLowerCase(); list = list.filter(function (d) { return JSON.stringify(d.works || []).toLowerCase().indexOf(q) >= 0 || String(d.note || '').toLowerCase().indexOf(q) >= 0; }); }
    const photoCount = {}; A.active('photos').forEach(function (x) { photoCount[x.date] = (photoCount[x.date] || 0) + 1; });
    el.innerHTML = '<div class="card"><div class="section-title">บันทึกการปฏิบัติงานประจำวัน <span class="sub">' + list.length + ' วัน</span>' +
      '<span class="right"><button class="btn btn-primary" id="dyNew">+ บันทึกวันนี้</button></span></div>' +
      '<div class="toolbar"><select class="inp" id="dyMonth">' + A.opts(months.map(function (m) { return { key: m, name: U.thMonth(m) }; }), ui.month, 'ทุกเดือน') + '</select>' +
      '<input class="inp grow" id="dyQ" placeholder="ค้นหางาน/หมายเหตุ" value="' + esc(ui.q) + '"></div>' +
      (list.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>วันที่</th><th>รายละเอียดงาน</th><th>ช่วง กม.</th><th>ผลงาน</th><th>อากาศ</th><th class="r">คน</th><th class="c">รูป</th></tr></thead><tbody>' +
        list.map(function (d) {
          const ws = d.works || [];
          return '<tr class="clickable" data-id="' + esc(d.id) + '"><td class="nowrap">' + U.thDow(d.date) + ' ' + U.thDate(d.date, 'short') + '</td>' +
            '<td>' + (ws.length ? ws.map(function (w) { return esc(w.desc); }).join('<br>') : '<span class="muted">' + esc(d.noWork ? (d.note || 'ไม่มีการทำงาน') : '-') + '</span>') +
            (d.problems ? '<div class="small" style="color:var(--bad)">ปัญหา: ' + esc(d.problems) + '</div>' : '') + '</td>' +
            '<td class="nowrap small">' + ws.map(function (w) { return esc([w.staFrom, w.staTo].filter(Boolean).join(' – ') + (w.side ? ' ' + w.side : '')); }).join('<br>') + '</td>' +
            '<td class="small">' + ws.map(function (w) { return esc(w.qty || ''); }).join('<br>') + '</td><td>' + esc(d.weather || '') + '</td>' +
            '<td class="r">' + (U.num(d.foreman) + U.num(d.workers) || '') + '</td><td class="c">' + (photoCount[d.date] || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีบันทึก — กด "+ บันทึกวันนี้"</div>') + '</div>';
    el.querySelector('#dyNew').onclick = function () { A.dailyForm(null); };
    el.querySelector('#dyMonth').onchange = function () { ui.month = this.value; A.render(); };
    el.querySelector('#dyQ').oninput = function () { ui.q = this.value; clearTimeout(ui.t); ui.t = setTimeout(A.render, 300); };
    el.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.onclick = function () { A.dailyForm(A.active('daily').find(function (d) { return d.id === tr.dataset.id; })); };
    });
    if (ui.q) { const q = el.querySelector('#dyQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  };

  A.dailyForm = function (rec, presetDate) {
    const p = S.p;
    const all = A.active('daily');
    let r;
    if (rec) r = JSON.parse(JSON.stringify(rec));
    else {
      const date = presetDate || U.today();
      const exist = all.find(function (d) { return d.date === date; });
      if (exist) return A.dailyForm(exist);
      r = { date: date, timeFrom: '08.00', timeTo: '17.00', weather: 'แจ่มใส', works: [{ desc: '', staFrom: '', staTo: '', side: '', qty: '' }], machines: {}, foreman: 1, workers: '' };
    }
    r.works = r.works || []; r.machines = r.machines || {};
    const machines = p.machines || [];
    const m = A.modal({
      title: rec ? 'บันทึกประจำวัน ' + U.thDow(r.date) + ' ' + U.thDate(r.date) : 'บันทึกการปฏิบัติงานประจำวัน', size: 'wide',
      body: '<div class="grid grid-4"><div class="field"><label>วันที่</label><input type="date" id="dfDate" value="' + esc(r.date) + '"></div>' +
        '<div class="field"><label>เวลาทำงาน</label><div class="flex" style="flex-wrap:nowrap"><input class="inp" id="dfT1" value="' + esc(r.timeFrom || '') + '" placeholder="08.00"><span>-</span><input class="inp" id="dfT2" value="' + esc(r.timeTo || '') + '" placeholder="17.00"></div></div>' +
        '<div class="field"><label>สภาพอากาศ</label><input id="dfWeather" list="dfWx" value="' + esc(r.weather || '') + '"><datalist id="dfWx">' + D.WEATHER.map(function (w) { return '<option value="' + esc(w) + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><label>&nbsp;</label><label style="font-weight:400"><input type="checkbox" id="dfNo"' + (r.noWork ? ' checked' : '') + '> ไม่มีการทำงาน (หยุด/ฝนตก)</label></div></div>' +
        '<div class="sub-h">งานที่ทำ <button class="btn btn-sm btn-outline" id="dfAdd">+ เพิ่มงาน</button><button class="btn btn-sm btn-ghost" id="dfCopy">คัดลอกงานจากวันก่อน</button></div>' +
        '<div class="rows-edit" id="dfWorks"></div>' +
        '<div class="sub-h">เครื่องจักร/เครื่องมือ และบุคลากร <span class="hint">(ตรวจตามบัญชีที่ขออนุมัติ)</span></div>' +
        '<div class="grid grid-6">' + machines.map(function (mc, i) {
          return '<div class="field"><label>' + esc(mc) + '</label><input type="number" min="0" data-mc="' + i + '" value="' + esc(r.machines[mc] || '') + '"></div>';
        }).join('') + '<div class="field"><label>โฟร์แมน/ผู้ควบคุมงานผู้รับจ้าง</label><input type="number" min="0" id="dfFore" value="' + esc(r.foreman || '') + '"></div>' +
        '<div class="field"><label>คนงาน</label><input type="number" min="0" id="dfWork" value="' + esc(r.workers || '') + '"></div></div>' +
        '<div class="grid grid-3" style="margin-top:12px"><div class="field"><label>ปัญหาอุปสรรค</label><textarea id="dfProb">' + esc(r.problems || '') + '</textarea></div>' +
        '<div class="field"><label>ข้อสั่งการ / การตรวจสอบของผู้ควบคุมงาน</label><textarea id="dfOrder">' + esc(r.orders || '') + '</textarea></div>' +
        '<div class="field"><label>หมายเหตุ</label><textarea id="dfNote">' + esc(r.note || '') + '</textarea></div></div>' +
        '<p class="hint">ความคืบหน้ารายต้น/รายจุด ให้ติ๊กที่แท็บ "ความคืบหน้ารายจุด" — ระบบใช้คำนวณผลงานสะสมอัตโนมัติ</p>',
      foot: (rec ? '<button class="btn btn-danger left" id="dfDel">ลบ</button>' : '') + '<button class="btn btn-outline" id="dfPhoto">แนบรูปของวันนี้</button>' +
        '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="dfOk">บันทึก</button>'
    });
    const dl = '<datalist id="dfSides">' + SIDES.map(function (s) { return '<option value="' + s + '">'; }).join('') + '</datalist>';
    function drawWorks() {
      m.q('#dfWorks').innerHTML = dl + (r.works.length ? r.works.map(function (w, i) {
        return '<div class="row-edit" style="grid-template-columns:3fr 1fr 1fr 90px 1.2fr 30px">' +
          '<input class="inp" data-i="' + i + '" data-k="desc" placeholder="รายละเอียดงาน เช่น ขุดหลุมฐานเสาไฟ" value="' + esc(w.desc || '') + '">' +
          '<input class="inp" data-i="' + i + '" data-k="staFrom" placeholder="จาก Sta. 241+420" value="' + esc(w.staFrom || '') + '">' +
          '<input class="inp" data-i="' + i + '" data-k="staTo" placeholder="ถึง Sta." value="' + esc(w.staTo || '') + '">' +
          '<input class="inp" data-i="' + i + '" data-k="side" list="dfSides" placeholder="ฝั่ง" value="' + esc(w.side || '') + '">' +
          '<input class="inp" data-i="' + i + '" data-k="qty" placeholder="ผลงาน เช่น 21 ต้น" value="' + esc(w.qty || '') + '">' +
          '<button class="x" data-del="' + i + '" title="ลบ">×</button></div>';
      }).join('') : '<div class="hint">ไม่มีงาน</div>');
      m.qa('#dfWorks [data-k]').forEach(function (inp) { inp.oninput = function () { r.works[+inp.dataset.i][inp.dataset.k] = inp.value; }; });
      m.qa('#dfWorks [data-del]').forEach(function (b) { b.onclick = function () { r.works.splice(+b.dataset.del, 1); drawWorks(); }; });
    }
    drawWorks();
    m.q('#dfAdd').onclick = function () { r.works.push({ desc: '', staFrom: '', staTo: '', side: '', qty: '' }); drawWorks(); };
    m.q('#dfCopy').onclick = function () {
      const d = m.q('#dfDate').value;
      const prev = all.filter(function (x) { return x.date < d && x.works && x.works.length; }).sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
      if (!prev) return A.toast('ไม่พบบันทึกก่อนหน้า', true);
      r.works = JSON.parse(JSON.stringify(prev.works)); drawWorks();
      machines.forEach(function (mc, i) { const e = m.q('[data-mc="' + i + '"]'); if (e) e.value = (prev.machines || {})[mc] || ''; });
      m.q('#dfFore').value = prev.foreman || ''; m.q('#dfWork').value = prev.workers || '';
      A.toast('คัดลอกจาก ' + U.thDate(prev.date, 'short') + ' แล้ว — แก้ไขให้ตรงกับวันนี้');
    };
    function collect() {
      r.date = m.q('#dfDate').value; r.timeFrom = A.val(m, '#dfT1'); r.timeTo = A.val(m, '#dfT2'); r.weather = A.val(m, '#dfWeather');
      r.noWork = m.q('#dfNo').checked;
      r.works = r.works.filter(function (w) { return (w.desc || '').trim(); });
      r.machines = {}; machines.forEach(function (mc, i) { const v = U.num(m.q('[data-mc="' + i + '"]').value); if (v) r.machines[mc] = v; });
      r.foreman = U.num(A.val(m, '#dfFore')) || ''; r.workers = U.num(A.val(m, '#dfWork')) || '';
      r.problems = A.val(m, '#dfProb'); r.orders = A.val(m, '#dfOrder'); r.note = A.val(m, '#dfNote');
    }
    async function save(btn) {
      collect();
      if (!r.date) { A.toast('ระบุวันที่', true); return false; }
      const dup = all.find(function (d) { return d.date === r.date && d.id !== r.id; });
      if (dup) { A.toast('มีบันทึกของวันที่ ' + U.thDate(r.date, 'short') + ' แล้ว — เปิดแก้ไขรายการเดิมแทน', true); return false; }
      const done = A.busy(btn);
      try { r.id = await A.save('daily', r, 'บันทึกประจำวัน ' + r.date); A.toast('บันทึกแล้ว'); return true; }
      catch (e) { A.toast(e.message, true); return false; } finally { done(); }
    }
    m.q('#dfOk').onclick = async function () { if (await save(this)) m.close(); };
    m.q('#dfPhoto').onclick = async function () { if (await save(m.q('#dfOk'))) { m.close(); A.photoUpload({ date: r.date }); } };
    if (rec) m.q('#dfDel').onclick = async function () { if (await A.confirm('ลบบันทึกวันที่ ' + U.thDate(rec.date) + '?', 'ลบ', true)) { await A.softDelete('daily', rec, 'บันทึกประจำวัน ' + rec.date); m.close(); } };
  };

  /* ======================= ความคืบหน้ารายจุด (ทะเบียนชิ้นงาน) ======================= */
  A.views.units = function (el) {
    const p = S.p, stages = p.stages || [];
    const ui = S.ui.units = S.ui.units || { group: '', markDate: U.today(), sel: {} };
    const all = A.active('units').sort(function (a, b) {
      return String(a.group).localeCompare(String(b.group), 'th') || (U.num(a.seq) - U.num(b.seq)) || String(a.code).localeCompare(String(b.code), 'th', { numeric: true });
    });
    const groups = []; all.forEach(function (u) { if (u.group && groups.indexOf(u.group) < 0) groups.push(u.group); });
    const list = ui.group ? all.filter(function (u) { return u.group === ui.group; }) : all;
    const tracked = (p.boq || []).some(function (b) { return b.track === 'units'; });
    if (!all.length) {
      el.innerHTML = '<div class="card"><div class="section-title">ทะเบียนชิ้นงาน / ความคืบหน้ารายจุด</div>' +
        '<p>ใช้ติดตามงานทีละชิ้น เช่น เสาไฟแต่ละต้น ตามขั้นตอน ' + stages.map(function (s) { return '<span class="badge b-mute">' + esc(s.name) + '</span>'; }).join(' ') + '</p>' +
        '<p class="hint">สร้างจากตาราง "จุดติดตั้ง/ช่วงงาน" ในแท็บข้อมูลสัญญา (' + (p.locations || []).length + ' จุด, รวม ' + (p.locations || []).reduce(function (s, l) { return s + U.num(l.count); }, 0) + ' ชิ้นงาน)</p>' +
        '<div class="flex"><button class="btn btn-primary" id="unGen">สร้างทะเบียนชิ้นงานจากจุดติดตั้ง</button><button class="btn btn-outline" id="unAdd">+ เพิ่มชิ้นงานเอง</button></div></div>';
      el.querySelector('#unGen').onclick = generateUnits;
      el.querySelector('#unAdd').onclick = function () { unitForm(null); };
      return;
    }
    const sum = stages.map(function (s) {
      const n = list.filter(function (u) { return u.stages && u.stages[s.key]; }).length;
      return '<div class="s"><div class="small muted">' + esc(s.name) + ' <span class="badge b-mute">' + U.num(s.weight) + '%</span></div><b>' + n + '</b> / ' + list.length +
        '<div class="bar"><span style="width:' + (list.length ? n / list.length * 100 : 0) + '%"></span></div></div>';
    }).join('');
    const selCount = list.filter(function (u) { return ui.sel[u.id]; }).length;
    el.innerHTML = '<div class="card"><div class="section-title">ความคืบหน้ารายจุด <span class="sub">' + list.length + ' ชิ้นงาน' + (ui.group ? ' · ' + esc(ui.group) : '') + '</span>' +
      '<span class="right"><button class="btn btn-sm btn-outline" id="unAdd">+ เพิ่มชิ้นงาน</button><button class="btn btn-sm btn-outline" id="unGen">สร้างเพิ่มจากจุดติดตั้ง</button></span></div>' +
      (tracked ? '' : '<div class="alert warn" style="margin-bottom:12px"><span class="ic">⚠️</span><span>ยังไม่มีรายการ BOQ ที่ตั้ง "คิดผลงานจาก = ทะเบียนชิ้นงาน" ผลงานในหน้านี้จึงยังไม่ถูกนำไปคิด % ผลงาน</span><button class="btn btn-sm btn-ghost go" data-go="contract">ตั้งค่า →</button></div>') +
      '<div class="stage-sum">' + sum + '</div>' +
      '<div class="toolbar"><span class="chip' + (!ui.group ? ' active' : '') + '" data-g="">ทั้งหมด</span>' + groups.map(function (g) { return '<span class="chip' + (ui.group === g ? ' active' : '') + '" data-g="' + esc(g) + '">' + esc(g) + '</span>'; }).join('') + '</div>' +
      '<div class="toolbar" style="background:var(--paper-2);padding:8px 10px;border-radius:10px"><b class="small">คลิกช่องเพื่อบันทึกวันที่:</b><input type="date" class="inp" id="unDate" value="' + esc(ui.markDate) + '">' +
      '<span class="grow"></span><span class="small">เลือกแล้ว ' + selCount + ' ชิ้น →</span><select class="inp" id="unBulkSt">' + A.opts(stages.map(function (s) { return { key: s.key, name: s.name }; }), '') + '</select>' +
      '<button class="btn btn-sm btn-primary" id="unBulk"' + (selCount ? '' : ' disabled') + '>ใส่วันที่ให้ที่เลือก</button><button class="btn btn-sm btn-outline" id="unBulkClr"' + (selCount ? '' : ' disabled') + '>ล้าง</button></div>' +
      '<div class="table-wrap unit-grid"><table class="data"><thead><tr><th><input type="checkbox" id="unAll"></th><th>รหัส</th><th>จุด</th><th>กม.</th><th>ฝั่ง</th>' +
      stages.map(function (s) { return '<th class="c">' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      list.map(function (u) {
        return '<tr><td><input type="checkbox" data-sel="' + esc(u.id) + '"' + (ui.sel[u.id] ? ' checked' : '') + '></td><td><a href="#" data-ed="' + esc(u.id) + '">' + esc(u.code) + '</a></td><td class="small">' + esc(u.group || '') + '</td>' +
          '<td class="nowrap">' + esc(u.km || '') + '</td><td>' + esc(u.side || '') + '</td>' +
          stages.map(function (s) { const v = u.stages && u.stages[s.key]; return '<td class="st' + (v ? ' done' : '') + '" data-u="' + esc(u.id) + '" data-s="' + s.key + '">' + (v ? U.thDate(v, 'dm') : '·') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><p class="hint">คลิกช่องว่าง = ใส่วันที่ที่ตั้งไว้ด้านบน · คลิกช่องที่มีวันที่ = ลบวันที่</p></div>';
    A.bindGo(el);
    el.querySelector('#unAdd').onclick = function () { unitForm(null); };
    el.querySelector('#unGen').onclick = generateUnits;
    el.querySelectorAll('[data-g]').forEach(function (c) { c.onclick = function () { ui.group = c.dataset.g; ui.sel = {}; A.render(); }; });
    el.querySelector('#unDate').onchange = function () { ui.markDate = this.value; };
    el.querySelectorAll('[data-sel]').forEach(function (cb) { cb.onchange = function () { ui.sel[cb.dataset.sel] = cb.checked; A.render(); }; });
    el.querySelector('#unAll').onchange = function () { const v = this.checked; list.forEach(function (u) { ui.sel[u.id] = v; }); A.render(); };
    el.querySelectorAll('[data-ed]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); unitForm(all.find(function (u) { return u.id === a.dataset.ed; })); }; });
    el.querySelectorAll('td.st').forEach(function (td) {
      td.onclick = async function () {
        const u = JSON.parse(JSON.stringify(all.find(function (x) { return x.id === td.dataset.u; })));
        u.stages = u.stages || {};
        if (u.stages[td.dataset.s]) delete u.stages[td.dataset.s];
        else { if (!ui.markDate) return A.toast('เลือกวันที่ก่อน', true); u.stages[td.dataset.s] = ui.markDate; }
        td.classList.toggle('done', !!u.stages[td.dataset.s]); td.textContent = u.stages[td.dataset.s] ? U.thDate(u.stages[td.dataset.s], 'dm') : '·';
        try { await A.save('units', u, 'ชิ้นงาน ' + u.code); } catch (e) { A.toast(e.message, true); }
      };
    });
    async function bulk(clear) {
      const key = el.querySelector('#unBulkSt').value;
      const recs = list.filter(function (u) { return ui.sel[u.id]; }).map(function (u) {
        const x = JSON.parse(JSON.stringify(u)); x.stages = x.stages || {};
        if (clear) delete x.stages[key]; else x.stages[key] = ui.markDate;
        return x;
      });
      if (!recs.length) return;
      try { await FBL.saveSubBulk(S.pid, 'units', recs); ui.sel = {}; A.toast('บันทึก ' + recs.length + ' ชิ้นงานแล้ว'); } catch (e) { A.toast(e.message, true); }
    }
    el.querySelector('#unBulk').onclick = function () { bulk(false); };
    el.querySelector('#unBulkClr').onclick = function () { bulk(true); };
  };

  async function generateUnits() {
    const p = S.p, locs = (p.locations || []).filter(function (l) { return U.num(l.count) > 0; });
    if (!locs.length) { A.toast('ยังไม่มีจุดติดตั้งที่ระบุจำนวน — กรอกที่แท็บข้อมูลสัญญา', true); A.go('contract'); return; }
    const existing = A.active('units');
    const recs = [];
    locs.forEach(function (l) {
      const n = U.num(l.count), a = U.kmToM(l.kmFrom), b = U.kmToM(l.kmTo);
      const sides = l.sides === 'LR' ? ['Lt.', 'Rt.'] : [l.sides === 'L' ? 'Lt.' : (l.sides === 'R' ? 'Rt.' : 'Cl.')];
      const per = Math.ceil(n / sides.length);
      let seq = 0;
      sides.forEach(function (side, si) {
        const cnt = si === sides.length - 1 ? n - per * (sides.length - 1) : per;
        for (let i = 0; i < cnt; i++) {
          seq++;
          const km = a !== null && b !== null && cnt > 1 ? U.fmtKm(a + (b - a) * i / (cnt - 1)) : (a !== null ? U.fmtKm(a) : '');
          const code = (l.prefix || '') + String(seq).padStart(2, '0');
          if (existing.some(function (u) { return u.group === l.name && u.code === code; })) continue;
          recs.push({ code: code, group: l.name, seq: seq, km: km, side: side, stages: {}, note: '' });
        }
      });
    });
    if (!recs.length) return A.toast('ทะเบียนชิ้นงานครบแล้ว ไม่มีรายการใหม่');
    if (!await A.confirm('สร้างชิ้นงานใหม่ ' + recs.length + ' รายการ จาก ' + locs.length + ' จุด?\n(กม. จะกระจายเท่าๆ กันในช่วง — แก้ไขรายต้นได้ภายหลัง)', 'สร้าง')) return;
    try { await FBL.saveSubBulk(S.pid, 'units', recs); A.toast('สร้างทะเบียนชิ้นงานแล้ว'); } catch (e) { A.toast(e.message, true); }
  }

  function unitForm(rec) {
    const p = S.p, stages = p.stages || [];
    const u = rec ? JSON.parse(JSON.stringify(rec)) : { code: '', group: (p.locations && p.locations[0] && p.locations[0].name) || '', km: '', side: 'Cl.', stages: {} };
    u.stages = u.stages || {};
    const m = A.modal({
      title: rec ? 'ชิ้นงาน ' + u.code : 'เพิ่มชิ้นงาน', size: 'narrow',
      body: '<div class="grid grid-2"><div class="field"><label>รหัส/เลขเสา</label><input id="ufCode" value="' + esc(u.code) + '"></div>' +
        '<div class="field"><label>จุด/กลุ่ม</label><input id="ufGroup" list="ufG" value="' + esc(u.group || '') + '"><datalist id="ufG">' + (p.locations || []).map(function (l) { return '<option value="' + esc(l.name) + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><label>กม.</label><input id="ufKm" value="' + esc(u.km || '') + '" placeholder="241+420"></div>' +
        '<div class="field"><label>ฝั่ง</label><input id="ufSide" list="ufS" value="' + esc(u.side || '') + '"><datalist id="ufS">' + SIDES.map(function (s) { return '<option value="' + s + '">'; }).join('') + '</datalist></div></div>' +
        '<div class="sub-h">วันที่แล้วเสร็จแต่ละขั้นตอน</div><div class="grid grid-2">' +
        stages.map(function (s) { return '<div class="field"><label>' + esc(s.name) + '</label><input type="date" data-st="' + s.key + '" value="' + esc(u.stages[s.key] || '') + '"></div>'; }).join('') + '</div>' +
        '<div class="field" style="margin-top:10px"><label>หมายเหตุ (เช่น ค่าความต้านทานดิน, เลขมิเตอร์)</label><textarea id="ufNote">' + esc(u.note || '') + '</textarea></div>',
      foot: (rec ? '<button class="btn btn-danger left" id="ufDel">ลบ</button><button class="btn btn-outline" id="ufPh">ดูรูป</button>' : '') + '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="ufOk">บันทึก</button>'
    });
    m.q('#ufOk').onclick = async function () {
      u.code = A.val(m, '#ufCode'); u.group = A.val(m, '#ufGroup'); u.km = A.val(m, '#ufKm'); u.side = A.val(m, '#ufSide'); u.note = A.val(m, '#ufNote');
      if (!u.code) return A.toast('ระบุรหัส', true);
      u.stages = {}; m.qa('[data-st]').forEach(function (i) { if (i.value) u.stages[i.dataset.st] = i.value; });
      const done = A.busy(this);
      try { await A.save('units', u, 'ชิ้นงาน ' + u.code); m.close(); } catch (e) { done(); A.toast(e.message, true); }
    };
    if (rec) {
      m.q('#ufDel').onclick = async function () { if (await A.confirm('ลบชิ้นงาน ' + rec.code + '?', 'ลบ', true)) { await A.softDelete('units', rec, 'ชิ้นงาน ' + rec.code); m.close(); } };
      m.q('#ufPh').onclick = function () { m.close(); S.ui.photos = Object.assign(S.ui.photos || {}, { unit: rec.id, cat: '', from: '', to: '', q: '' }); A.go('photos'); };
    }
  }

  /* ======================= คุณภาพ / ทดสอบ ======================= */
  const TEST_ST = { pending: ['รอผล', 'b-warn'], pass: ['ผ่าน', 'b-ok'], fail: ['ไม่ผ่าน', 'b-bad'], na: ['ไม่ต้องทดสอบ', 'b-mute'] };
  A.views.quality = function (el) {
    const ui = S.ui.quality = S.ui.quality || { f: '' };
    let list = A.active('tests').sort(function (a, b) { return String(b.sampleDate || b.companyDate || b.createdAt).localeCompare(String(a.sampleDate || a.companyDate || a.createdAt)); });
    const cnt = { pending: 0, pass: 0, fail: 0 };
    list.forEach(function (t) { cnt[t.status || 'pending'] = (cnt[t.status || 'pending'] || 0) + 1; });
    if (ui.f) list = list.filter(function (t) { return (t.status || 'pending') === ui.f; });
    const t0 = U.today();
    el.innerHTML = '<div class="card"><div class="section-title">ทะเบียนตรวจสอบคุณภาพและผลทดสอบวัสดุ<span class="right"><button class="btn btn-primary" id="qNew">+ เพิ่มรายการ</button></span></div>' +
      '<p class="hint" style="margin-top:-6px">บันทึกทั้งการส่งตัวอย่างทดสอบ (เหล็ก ลูกปูน โคม ฯลฯ) และการตรวจสอบขนาด/ระดับหน้างานเทียบแบบ · กรอก "เกณฑ์ขั้นต่ำ" กับ "ค่าที่ได้" ระบบจะเทียบให้</p>' +
      '<div class="toolbar"><span class="chip' + (!ui.f ? ' active' : '') + '" data-f="">ทั้งหมด</span><span class="chip' + (ui.f === 'pending' ? ' active' : '') + '" data-f="pending">รอผล ' + (cnt.pending || 0) + '</span>' +
      '<span class="chip' + (ui.f === 'pass' ? ' active' : '') + '" data-f="pass">ผ่าน ' + (cnt.pass || 0) + '</span><span class="chip' + (ui.f === 'fail' ? ' active' : '') + '" data-f="fail">ไม่ผ่าน ' + (cnt.fail || 0) + '</span></div>' +
      (list.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>ประเภท / รายการ</th><th>ตำแหน่ง</th><th>เก็บ/เท</th><th>ส่งทดสอบ</th><th>ผลออก</th><th>เลขที่ผล</th><th>เกณฑ์ → ค่าที่ได้</th><th>สถานะ</th></tr></thead><tbody>' +
        list.map(function (t) {
          const st = TEST_ST[t.status || 'pending'];
          const isCube = /ลูกปูน|กำลังอัด/.test(t.type || '');
          const d28 = isCube && t.sampleDate ? U.addDays(t.sampleDate, 28) : '';
          return '<tr class="clickable" data-id="' + esc(t.id) + '"><td><div class="small muted">' + esc(t.type || '') + '</div>' + esc(t.item || '') + '</td><td class="small">' + esc(t.location || '') + '</td>' +
            '<td class="nowrap">' + U.thDate(t.sampleDate, 'short') + (d28 && (t.status || 'pending') === 'pending' ? '<div class="small ' + (t0 >= d28 ? '' : 'muted') + '">28 วัน: ' + U.thDate(d28, 'short') + '</div>' : '') + '</td>' +
            '<td class="nowrap small">' + (t.companyDate ? 'บริษัท ' + U.thDate(t.companyDate, 'short') + '<br>' : '') + (t.sentDate ? 'แขวง ' + U.thDate(t.sentDate, 'short') : '') + '</td>' +
            '<td class="nowrap">' + U.thDate(t.resultDate, 'short') + '</td><td class="small">' + esc(t.resultNo || '') + (t.filePath ? ' 📎' : '') + '</td>' +
            '<td class="small">' + esc(t.spec || '') + (t.value !== '' && t.value !== undefined && t.value !== null ? ' → <b>' + esc(t.value) + ' ' + esc(t.unit || '') + '</b>' : '') + '</td>' +
            '<td><span class="badge ' + st[1] + '">' + st[0] + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีรายการ</div>') + '</div>';
    el.querySelector('#qNew').onclick = function () { testForm(null); };
    el.querySelectorAll('[data-f]').forEach(function (c) { c.onclick = function () { ui.f = c.dataset.f; A.render(); }; });
    el.querySelectorAll('tr[data-id]').forEach(function (tr) { tr.onclick = function () { testForm(A.active('tests').find(function (t) { return t.id === tr.dataset.id; })); }; });
  };

  function testForm(rec) {
    const t = rec ? JSON.parse(JSON.stringify(rec)) : { type: D.TEST_TYPES[0], status: 'pending' };
    const m = A.modal({
      title: rec ? 'ผลทดสอบ: ' + (t.item || t.type) : 'เพิ่มรายการตรวจสอบ/ทดสอบ', size: 'wide',
      body: '<div class="grid grid-3"><div class="field"><label>ประเภท</label><select id="tfType">' + A.opts(D.TEST_TYPES, t.type) + '</select></div>' +
        '<div class="field span-2"><label>รายการ</label><input id="tfItem" value="' + esc(t.item || '') + '" placeholder="เช่น เหล็ก RB9, RB12 (SR24 มอก.20) / ลูกปูนฐานเสา ชุดที่ 1"></div>' +
        '<div class="field"><label>ตำแหน่ง/ชิ้นงาน</label><input id="tfLoc" value="' + esc(t.location || '') + '"></div>' +
        '<div class="field"><label>เกณฑ์ตามแบบ/สเปค</label><input id="tfSpec" value="' + esc(t.spec || '') + '" placeholder="เช่น ≥ 306 ksc (Cube 28 วัน)"></div>' +
        '<div class="field"><label>หน่วยทดสอบ</label><input id="tfLab" value="' + esc(t.lab || '') + '" placeholder="สำนักวิเคราะห์ / สทล.14 / กฟน."></div>' +
        '<div class="field"><label>เกณฑ์ขั้นต่ำ (ตัวเลข)</label><input id="tfMin" type="number" step="any" value="' + esc(t.specMin === undefined ? '' : t.specMin) + '"></div>' +
        '<div class="field"><label>เกณฑ์สูงสุด (ตัวเลข ถ้ามี)</label><input id="tfMax" type="number" step="any" value="' + esc(t.specMax === undefined ? '' : t.specMax) + '"></div>' +
        '<div class="field"><label>ค่าที่ได้ / หน่วย</label><div class="flex" style="flex-wrap:nowrap"><input class="inp" id="tfVal" type="number" step="any" value="' + esc(t.value === undefined ? '' : t.value) + '"><input class="inp" id="tfUnit" style="width:90px" value="' + esc(t.unit || '') + '" placeholder="ksc"></div></div>' +
        '<div class="field"><label>วันเก็บตัวอย่าง / วันเทคอนกรีต</label><input type="date" id="tfSample" value="' + esc(t.sampleDate || '') + '"></div>' +
        '<div class="field"><label>บริษัทส่งหนังสือ</label><input type="date" id="tfComp" value="' + esc(t.companyDate || '') + '"></div>' +
        '<div class="field"><label>แขวงส่งหนังสือ (ว.4-01)</label><input type="date" id="tfSent" value="' + esc(t.sentDate || '') + '"></div>' +
        '<div class="field"><label>วันที่ผลออก/อนุมัติ</label><input type="date" id="tfRes" value="' + esc(t.resultDate || '') + '"></div>' +
        '<div class="field"><label>เลขที่ผลทดสอบ</label><input id="tfNo" value="' + esc(t.resultNo || '') + '"></div>' +
        '<div class="field"><label>สถานะ</label><select id="tfSt">' + A.opts(Object.keys(TEST_ST).map(function (k) { return { key: k, name: TEST_ST[k][0] }; }), t.status || 'pending') + '</select><div id="tfAuto" class="hint"></div></div>' +
        '<div class="field span-all"><label>หมายเหตุ</label><textarea id="tfNote">' + esc(t.note || '') + '</textarea></div>' +
        '<div class="field span-all"><label>ไฟล์ผลทดสอบ (PDF/รูป)</label><div class="flex">' + (t.filePath ? '<button class="btn btn-sm btn-outline" id="tfOpen">เปิด ' + esc(t.fileName || 'ไฟล์') + '</button>' : '') +
        '<input type="file" id="tfFile" accept=".pdf,image/*"></div><div id="tfProg" class="hint"></div></div></div>',
      foot: (rec ? '<button class="btn btn-danger left" id="tfDel">ลบ</button>' : '') + '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="tfOk">บันทึก</button>'
    });
    function auto() {
      const v = m.q('#tfVal').value, mn = m.q('#tfMin').value, mx = m.q('#tfMax').value;
      if (v === '' || (mn === '' && mx === '')) { m.q('#tfAuto').textContent = ''; return; }
      const ok = (mn === '' || +v >= +mn) && (mx === '' || +v <= +mx);
      m.q('#tfAuto').innerHTML = ok ? '<span style="color:var(--ok)">ค่าที่ได้ผ่านเกณฑ์</span>' : '<span style="color:var(--bad)">ค่าที่ได้ไม่ผ่านเกณฑ์</span>';
      m.q('#tfSt').value = ok ? 'pass' : 'fail';
    }
    ['#tfVal', '#tfMin', '#tfMax'].forEach(function (s) { m.q(s).addEventListener('input', auto); });
    if (t.filePath) m.q('#tfOpen').onclick = async function () { const u = await FBL.fileUrl(t.filePath); if (u) window.open(u, '_blank', 'noopener'); };
    m.q('#tfOk').onclick = async function () {
      const g = function (s) { return A.val(m, s); };
      t.type = g('#tfType'); t.item = g('#tfItem'); t.location = g('#tfLoc'); t.spec = g('#tfSpec'); t.lab = g('#tfLab');
      t.specMin = g('#tfMin') === '' ? '' : +g('#tfMin'); t.specMax = g('#tfMax') === '' ? '' : +g('#tfMax');
      t.value = g('#tfVal') === '' ? '' : +g('#tfVal'); t.unit = g('#tfUnit');
      t.sampleDate = g('#tfSample'); t.companyDate = g('#tfComp'); t.sentDate = g('#tfSent'); t.resultDate = g('#tfRes'); t.resultNo = g('#tfNo');
      t.status = g('#tfSt'); t.note = g('#tfNote');
      if (!t.item) return A.toast('ระบุรายการ', true);
      const done = A.busy(this);
      try {
        const f = m.q('#tfFile').files[0];
        if (!t.id) t.id = FBL.newId();
        if (f) {
          const path = 'projects/' + S.pid + '/files/tests/' + t.id + '/' + Date.now() + '_' + U.safeName(f.name);
          await FBL.uploadFile(path, f, function (x) { m.q('#tfProg').textContent = 'อัปโหลด ' + Math.round(x * 100) + '%'; });
          t.filePath = path; t.fileName = f.name; t.fileSize = f.size;
        }
        await A.save('tests', t, 'ทดสอบ ' + t.item); m.close(); A.toast('บันทึกแล้ว');
      } catch (e) { done(); A.toast(e.message, true); }
    };
    if (rec) m.q('#tfDel').onclick = async function () { if (await A.confirm('ลบรายการนี้?', 'ลบ', true)) { await A.softDelete('tests', rec, 'ทดสอบ ' + rec.item); m.close(); } };
  }

  /* ======================= รูปถ่าย ======================= */
  let photoObserver = null;
  A.views.photos = function (el) {
    const ui = S.ui.photos = S.ui.photos || { cat: '', from: '', to: '', q: '', unit: '', sel: {}, selMode: false };
    ui.sel = ui.sel || {};
    const units = A.active('units');
    const unitMap = {}; units.forEach(function (u) { unitMap[u.id] = u; });
    let list = A.active('photos').sort(function (a, b) { return String(b.date + (b.time || '')).localeCompare(String(a.date + (a.time || ''))); });
    const total = list.length;
    if (ui.cat) list = list.filter(function (x) { return x.category === ui.cat; });
    if (ui.from) list = list.filter(function (x) { return x.date >= ui.from; });
    if (ui.to) list = list.filter(function (x) { return x.date <= ui.to; });
    if (ui.unit) list = list.filter(function (x) { return x.unitId === ui.unit; });
    if (ui.q) { const q = ui.q.toLowerCase(); list = list.filter(function (x) { return [x.desc, x.km, x.side, x.originalName, x.category].join(' ').toLowerCase().indexOf(q) >= 0; }); }
    const byDay = {}; list.forEach(function (x) { (byDay[x.date] = byDay[x.date] || []).push(x); });
    const days = Object.keys(byDay).sort().reverse();
    const selN = Object.keys(ui.sel).filter(function (k) { return ui.sel[k]; }).length;
    el.innerHTML = '<div class="card"><div class="section-title">คลังรูปถ่ายหน้างาน <span class="sub">แสดง ' + list.length + ' จาก ' + total + ' รูป</span>' +
      '<span class="right"><button class="btn btn-outline btn-sm" id="phSelMode">' + (ui.selMode ? 'เลิกเลือก' : 'เลือกรูปทำรายงาน') + '</button><button class="btn btn-primary" id="phUp">+ อัปโหลดรูป</button></span></div>' +
      '<div class="toolbar"><select class="inp" id="phCat">' + A.opts(D.PHOTO_CATEGORIES, ui.cat, 'ทุกหมวด') + '</select>' +
      '<input type="date" class="inp" id="phFrom" value="' + esc(ui.from) + '" title="ตั้งแต่วันที่"><input type="date" class="inp" id="phTo" value="' + esc(ui.to) + '" title="ถึงวันที่">' +
      '<select class="inp" id="phUnit">' + A.opts(units.map(function (u) { return { key: u.id, name: u.code + ' ' + (u.km || '') }; }), ui.unit, 'ทุกชิ้นงาน') + '</select>' +
      '<input class="inp grow" id="phQ" placeholder="ค้นหา คำอธิบาย/กม." value="' + esc(ui.q) + '"><button class="btn btn-sm btn-ghost" id="phClr">ล้างตัวกรอง</button></div>' +
      (ui.selMode ? '<div class="alert info" style="margin-bottom:10px"><span class="ic">☑</span><span>เลือกแล้ว ' + selN + ' รูป</span><span class="go flex"><button class="btn btn-sm btn-outline" id="phSelAll">เลือกทั้งหมดที่แสดง</button><button class="btn btn-sm btn-primary" id="phReport"' + (selN ? '' : ' disabled') + '>สร้างรายงานรูปถ่าย</button></span></div>' : '') +
      (days.length ? days.map(function (d) {
        return '<div class="day-head">' + U.thDow(d) + ' ' + U.thDate(d) + ' <span class="n">' + byDay[d].length + ' รูป</span></div><div class="gallery">' +
          byDay[d].map(function (x) {
            const u = unitMap[x.unitId];
            return '<div class="ph" data-id="' + esc(x.id) + '">' + (ui.selMode ? '<input type="checkbox" class="sel" data-sel="' + esc(x.id) + '"' + (ui.sel[x.id] ? ' checked' : '') + '>' : '') +
              (x.flag ? '<span class="flag badge b-warn" title="' + esc(x.flag) + '">!</span>' : '') +
              '<div class="img" data-thumb="' + esc(x.thumbPath || x.path) + '"></div><div class="cap"><b>' + esc(x.desc || x.category || '') + '</b><span>' +
              esc([x.time, u ? u.code : '', x.km ? 'กม.' + x.km : '', x.side].filter(Boolean).join(' · ')) + '</span></div></div>';
          }).join('') + '</div>';
      }).join('') : '<div class="empty">ยังไม่มีรูปตามเงื่อนไข</div>') + '</div>';
    const setUi = function (k, v) { ui[k] = v; A.render(); };
    el.querySelector('#phUp').onclick = function () { A.photoUpload({ date: ui.from && ui.from === ui.to ? ui.from : '' }); };
    el.querySelector('#phCat').onchange = function () { setUi('cat', this.value); };
    el.querySelector('#phFrom').onchange = function () { setUi('from', this.value); };
    el.querySelector('#phTo').onchange = function () { setUi('to', this.value); };
    el.querySelector('#phUnit').onchange = function () { setUi('unit', this.value); };
    el.querySelector('#phQ').oninput = function () { ui.q = this.value; clearTimeout(ui.t); ui.t = setTimeout(function () { A.render(); const q = document.getElementById('phQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 350); };
    el.querySelector('#phClr').onclick = function () { Object.assign(ui, { cat: '', from: '', to: '', q: '', unit: '' }); A.render(); };
    el.querySelector('#phSelMode').onclick = function () { ui.selMode = !ui.selMode; if (!ui.selMode) ui.sel = {}; A.render(); };
    if (ui.selMode) {
      el.querySelector('#phSelAll').onclick = function () { list.forEach(function (x) { ui.sel[x.id] = true; }); A.render(); };
      el.querySelector('#phReport').onclick = function () {
        const chosen = A.active('photos').filter(function (x) { return ui.sel[x.id]; }).sort(function (a, b) { return String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))); });
        A.photoReportDialog(chosen);
      };
      el.querySelectorAll('[data-sel]').forEach(function (cb) { cb.onclick = function (e) { e.stopPropagation(); ui.sel[cb.dataset.sel] = cb.checked; const n = Object.keys(ui.sel).filter(function (k) { return ui.sel[k]; }).length; const b = el.querySelector('#phReport'); b.disabled = !n; el.querySelector('.alert.info span:nth-child(2)').textContent = 'เลือกแล้ว ' + n + ' รูป'; }; });
    }
    el.querySelectorAll('.ph').forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.matches('input')) return;
        if (ui.selMode) { const cb = card.querySelector('input'); cb.checked = !cb.checked; cb.onclick({ stopPropagation: function () {} }); return; }
        openLightbox(list, list.findIndex(function (x) { return x.id === card.dataset.id; }));
      };
    });
    // โหลดรูปย่อเมื่อเลื่อนมาเห็น
    if (photoObserver) photoObserver.disconnect();
    photoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        const div = en.target; photoObserver.unobserve(div);
        FBL.fileUrl(div.dataset.thumb).then(function (u) { if (u) div.style.backgroundImage = 'url("' + u + '")'; });
      });
    }, { rootMargin: '300px' });
    el.querySelectorAll('[data-thumb]').forEach(function (d) { photoObserver.observe(d); });
  };

  function openLightbox(list, idx) {
    const lb = document.getElementById('lightbox');
    const unitsById = {}; A.active('units').forEach(function (u) { unitsById[u.id] = u; });
    function show() {
      const x = list[idx]; if (!x) return;
      const u = unitsById[x.unitId];
      lb.innerHTML = '<div class="lb-img"><img id="lbImg" alt=""></div>' +
        '<button class="nav prev" id="lbPrev" aria-label="ก่อนหน้า">‹</button><button class="nav next" id="lbNext" aria-label="ถัดไป">›</button>' +
        '<div class="lb-bar"><div class="grow"><b>' + esc(x.desc || x.category || '') + '</b><br><span class="small">' +
        esc([U.thDate(x.date), x.time, x.category, u ? 'ชิ้นงาน ' + u.code : '', x.km ? 'กม.' + x.km : '', x.side, (x.exif && (x.exif.make || x.exif.model)) ? '📷 ' + [x.exif.make, x.exif.model].filter(Boolean).join(' ') : ''].filter(Boolean).join(' · ')) +
        (x.flag ? ' · ⚠ ' + esc(x.flag) : '') + (x.noExif ? ' · ไม่มีข้อมูลกล้องในไฟล์' : '') + ' · ' + (idx + 1) + '/' + list.length + '</span></div>' +
        (x.exif && x.exif.lat ? '<a class="btn btn-sm btn-header" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + x.exif.lat + ',' + x.exif.lng + '">แผนที่</a>' : '') +
        '<button class="btn btn-sm btn-header" id="lbDl">ดาวน์โหลด</button><button class="btn btn-sm btn-header" id="lbEd">แก้ไข</button><button class="btn btn-sm btn-header" id="lbX">ปิด ✕</button></div>';
      FBL.fileUrl(x.path).then(function (url) { const i = document.getElementById('lbImg'); if (i) i.src = url; });
      document.getElementById('lbPrev').onclick = function () { if (idx > 0) { idx--; show(); } };
      document.getElementById('lbNext').onclick = function () { if (idx < list.length - 1) { idx++; show(); } };
      document.getElementById('lbX').onclick = close;
      document.getElementById('lbDl').onclick = async function () {
        const url = await FBL.fileUrl(x.path);
        try { const b = await (await fetch(url)).blob(); U.download(U.safeName(x.date + '_' + (x.desc || x.category || x.id)) + '.jpg', b); } catch (e) { window.open(url, '_blank', 'noopener'); }
      };
      document.getElementById('lbEd').onclick = function () { close(); photoEdit(x); };
    }
    function key(e) { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft' && idx > 0) { idx--; show(); } if (e.key === 'ArrowRight' && idx < list.length - 1) { idx++; show(); } }
    function close() { lb.classList.remove('show'); lb.innerHTML = ''; document.removeEventListener('keydown', key); }
    document.addEventListener('keydown', key);
    lb.classList.add('show'); show();
  }

  function unitOptions(sel) {
    return A.opts(A.active('units').sort(function (a, b) { return String(a.code).localeCompare(String(b.code), 'th', { numeric: true }); })
      .map(function (u) { return { key: u.id, name: u.code + (u.km ? ' · กม.' + u.km : '') + (u.side ? ' ' + u.side : '') }; }), sel, '— ไม่ระบุ —');
  }
  function photoEdit(x) {
    const r = JSON.parse(JSON.stringify(x));
    const m = A.modal({
      title: 'ข้อมูลรูปถ่าย', size: 'narrow',
      body: '<div class="grid grid-2"><div class="field"><label>วันที่</label><input type="date" id="peDate" value="' + esc(r.date) + '"></div><div class="field"><label>เวลา</label><input id="peTime" value="' + esc(r.time || '') + '"></div>' +
        '<div class="field span-all"><label>หมวด</label><select id="peCat">' + A.opts(D.PHOTO_CATEGORIES, r.category) + '</select></div>' +
        '<div class="field span-all"><label>ชิ้นงาน</label><select id="peUnit">' + unitOptions(r.unitId) + '</select></div>' +
        '<div class="field"><label>กม.</label><input id="peKm" value="' + esc(r.km || '') + '"></div><div class="field"><label>ฝั่ง</label><input id="peSide" value="' + esc(r.side || '') + '"></div>' +
        '<div class="field span-all"><label>คำอธิบาย</label><textarea id="peDesc">' + esc(r.desc || '') + '</textarea></div>' +
        '<div class="field span-all"><label>ข้อสังเกต (ถ้าเว้นว่าง = ไม่มี)</label><input id="peFlag" value="' + esc(r.flag || '') + '"></div></div>' +
        '<p class="hint">ไฟล์: ' + esc(r.originalName || '') + (r.exif && r.exif.dateTime ? ' · EXIF ' + esc(r.exif.dateTime) : ' · ไม่มีข้อมูล EXIF') + '</p>',
      foot: '<button class="btn btn-danger left" id="peDel">ลบรูป</button><button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="peOk">บันทึก</button>'
    });
    m.q('#peUnit').onchange = function () { const u = A.active('units').find(function (z) { return z.id === this.value; }, this); if (u) { m.q('#peKm').value = u.km || ''; m.q('#peSide').value = u.side || ''; } };
    m.q('#peOk').onclick = async function () {
      r.date = m.q('#peDate').value; r.time = A.val(m, '#peTime'); r.category = A.val(m, '#peCat'); r.unitId = A.val(m, '#peUnit');
      const u = A.active('units').find(function (z) { return z.id === r.unitId; }); r.unitCode = u ? u.code : '';
      r.km = A.val(m, '#peKm'); r.side = A.val(m, '#peSide'); r.desc = A.val(m, '#peDesc'); r.flag = A.val(m, '#peFlag');
      try { await A.save('photos', r, 'รูป ' + r.date); m.close(); } catch (e) { A.toast(e.message, true); }
    };
    m.q('#peDel').onclick = async function () { if (await A.confirm('ย้ายรูปนี้ไปถังขยะ?', 'ลบ', true)) { await A.softDelete('photos', x, 'รูป ' + x.date); m.close(); } };
  }

  A.photoUpload = function (preset) {
    preset = preset || {};
    if (!FBL.storageReady) return A.toast('ระบบเก็บไฟล์ยังไม่พร้อม', true);
    let files = [];
    const m = A.modal({
      title: 'อัปโหลดรูปถ่ายหน้างาน', size: 'wide',
      body: '<div class="drop" id="upDrop">ลากรูปมาวางที่นี่ หรือ <b>คลิกเพื่อเลือกรูป</b> (เลือกได้หลายรูป)<br><span class="hint">ระบบย่อขนาดเหลือด้านยาว 1,280 px อัตโนมัติ และอ่านวันที่/พิกัดจากไฟล์รูป</span>' +
        '<input type="file" id="upFile" accept="image/*" multiple style="display:none"></div>' +
        '<div class="sub-h">ข้อมูลที่ใช้กับทุกรูปในชุดนี้</div>' +
        '<div class="grid grid-3"><div class="field"><label>วันที่ถ่าย</label><input type="date" id="upDate" value="' + esc(preset.date || '') + '"><span class="hint">ว่าง = ใช้วันที่จากไฟล์รูป</span></div>' +
        '<div class="field"><label>หมวด</label><select id="upCat">' + A.opts(D.PHOTO_CATEGORIES, preset.category || 'ระหว่างดำเนินการ') + '</select></div>' +
        '<div class="field"><label>ชิ้นงาน</label><select id="upUnit">' + unitOptions(preset.unitId || '') + '</select></div>' +
        '<div class="field"><label>กม.</label><input id="upKm" placeholder="241+420"></div><div class="field"><label>ฝั่ง</label><input id="upSide" list="upS"><datalist id="upS">' + SIDES.map(function (s) { return '<option value="' + s + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><label>คำอธิบาย</label><input id="upDesc" placeholder="เช่น เทคอนกรีตฐานเสา"></div></div>' +
        '<div id="upList" style="margin-top:12px"></div>',
      foot: '<button class="btn btn-outline" data-close>ปิด</button><button class="btn btn-primary" id="upOk" disabled>อัปโหลด</button>'
    });
    m.q('#upDrop').insertAdjacentHTML('afterend', '<p class="hint">แนะนำ: อัปโหลดไฟล์จากแกลเลอรีมือถือโดยตรง อย่าใช้รูปที่ส่งผ่าน LINE เพราะ LINE ลบวันที่ถ่ายและพิกัดออก ทำให้รูปขาดหลักฐานยืนยัน</p>');
    const drop = m.q('#upDrop'), inp = m.q('#upFile');
    drop.onclick = function () { inp.click(); };
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = function () { drop.classList.remove('over'); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); };
    inp.onchange = function () { addFiles(inp.files); inp.value = ''; };
    m.q('#upUnit').onchange = function () { const u = A.active('units').find(function (z) { return z.id === m.q('#upUnit').value; }); if (u) { m.q('#upKm').value = u.km || ''; m.q('#upSide').value = u.side || ''; } };
    function addFiles(fl) {
      [].forEach.call(fl, function (f) { if (/^image\//.test(f.type)) files.push({ f: f, st: 'รอ' }); });
      draw();
    }
    function draw() {
      m.q('#upList').innerHTML = files.map(function (x, i) {
        return '<div class="upl-row"><span style="width:26px" class="muted">' + (i + 1) + '</span><span class="grow" style="flex:1">' + esc(x.f.name) + ' <span class="muted small">(' + (x.f.size / 1048576).toFixed(1) + ' MB)</span></span><span>' + esc(x.st) + '</span></div>';
      }).join('');
      m.q('#upOk').disabled = !files.some(function (x) { return x.st === 'รอ'; });
      m.q('#upOk').textContent = 'อัปโหลด ' + files.filter(function (x) { return x.st === 'รอ'; }).length + ' รูป';
    }
    m.q('#upOk').onclick = async function () {
      const btn = this; btn.disabled = true;
      // กด "ลองใหม่" หลังมีรูปที่อัปโหลดไม่สำเร็จ → ส่งเฉพาะรูปที่ไม่สำเร็จอีกครั้ง
      files.forEach(function (x) { if (x.err) { x.err = false; x.st = 'รอ'; } });
      const base = { date: m.q('#upDate').value, category: m.q('#upCat').value, unitId: m.q('#upUnit').value, km: A.val(m, '#upKm'), side: A.val(m, '#upSide'), desc: A.val(m, '#upDesc') };
      const u = A.active('units').find(function (z) { return z.id === base.unitId; });
      let ok = 0;
      for (const x of files) {
        if (x.st !== 'รอ') continue;
        try {
          x.st = 'กำลังย่อรูป...'; draw();
          const pr = await U.processPhoto(x.f);
          const id = FBL.newId();
          const date = base.date || pr.exif.date || (x.f.lastModified ? U.iso(new Date(x.f.lastModified)) : U.today());
          const dir = 'projects/' + S.pid + '/photos/' + date + '/';
          x.st = 'กำลังอัปโหลด...'; draw();
          await FBL.uploadFile(dir + id + '.jpg', pr.full, function (f) { x.st = 'อัปโหลด ' + Math.round(f * 100) + '%'; draw(); });
          await FBL.uploadFile(dir + 'thumbs/' + id + '.jpg', pr.thumb);
          // flag = ข้อสังเกตที่ต้องตรวจก่อนใช้เป็นหลักฐาน (ขึ้นเตือนที่หน้าภาพรวม)
          // noExif = ไม่มีข้อมูลกล้อง/วันที่ถ่าย — ปกติของรูปที่ส่งผ่าน LINE จึงแค่บันทึกไว้ ไม่เตือน
          let flag = '';
          if (/gemini|dall|midjourney|generated|firefly|stable.?diffusion|chatgpt/i.test(x.f.name + ' ' + (pr.exif.software || ''))) flag = 'ชื่อไฟล์/ซอฟต์แวร์บ่งชี้ว่าอาจเป็นภาพสร้างด้วย AI';
          const noExif = !pr.exif.make && !pr.exif.model && !pr.exif.dateTime;
          await A.save('photos', {
            id: id, date: date, time: pr.exif.time || '', category: base.category, unitId: base.unitId, unitCode: u ? u.code : '', km: base.km, side: base.side, desc: base.desc,
            path: dir + id + '.jpg', thumbPath: dir + 'thumbs/' + id + '.jpg', width: pr.width, height: pr.height, size: pr.full.size, thumbSize: pr.thumb.size,
            originalName: x.f.name, originalSize: x.f.size, exif: { make: pr.exif.make || '', model: pr.exif.model || '', software: pr.exif.software || '', dateTime: pr.exif.dateTime || '', lat: pr.exif.lat || null, lng: pr.exif.lng || null },
            flag: flag, noExif: noExif
          }, 'รูป ' + date);
          x.st = flag ? '✓ (มีข้อสังเกต: ' + flag + ')' : (noExif ? '✓ เสร็จ (ไม่มีข้อมูลกล้องในไฟล์ — ใช้วันที่ ' + U.thDate(date, 'short') + ')' : '✓ เสร็จ'); ok++;
        } catch (e) { x.st = '✗ ' + e.message; x.err = true; }
        draw();
      }
      const failed = files.filter(function (x) { return x.err; }).length;
      const flagged = files.filter(function (x) { return /มีข้อสังเกต/.test(x.st); }).length;
      if (!failed) {
        // สำเร็จครบทุกรูป → ปิดหน้าต่างเอง
        m.close();
        A.toast('อัปโหลดสำเร็จ ' + ok + ' รูป' + (flagged ? ' — มี ' + flagged + ' รูปที่อาจเป็นภาพสร้างด้วย AI โปรดตรวจสอบ' : ''), !!flagged);
        return;
      }
      // มีรูปที่ไม่สำเร็จ → คงหน้าต่างไว้ให้เห็นสาเหตุ และกดลองใหม่เฉพาะรูปที่ไม่สำเร็จได้
      A.toast('อัปโหลดสำเร็จ ' + ok + ' รูป · ไม่สำเร็จ ' + failed + ' รูป (ดูสาเหตุในหน้าต่าง)', true);
      btn.disabled = false;
      btn.textContent = 'ลองใหม่ ' + failed + ' รูป';
    };
  };

  A.photoReportDialog = function (photos) {
    const m = A.modal({
      title: 'สร้างรายงานรูปถ่าย (' + photos.length + ' รูป)', size: 'narrow',
      body: '<div class="grid"><div class="field"><label>หัวเรื่อง</label><input id="prT" value="รูปถ่ายประกอบรายงาน"></div>' +
        '<div class="field"><label>คำอธิบายใต้หัวเรื่อง</label><input id="prS" value="' + esc(S.p.shortName || '') + '"></div></div><p class="hint">6 รูปต่อหน้า A4</p>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="prOk">สร้าง</button>'
    });
    m.q('#prOk').onclick = async function () {
      const done = A.busy(this, 'กำลังเตรียมรูป...');
      try { const r = await R.build('photos', { photos: photos, title: A.val(m, '#prT'), subtitle: A.val(m, '#prS') }); m.close(); R.openPreview(r, {}); }
      catch (e) { done(); A.toast(e.message, true); }
    };
  };

  /* ======================= เอกสาร / แบบ ======================= */
  A.views.docs = function (el) {
    const ui = S.ui.docs = S.ui.docs || { type: '', q: '' };
    let list = A.active('docs').sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no), 'th', { numeric: true }); });
    const cnt = {}; list.forEach(function (d) { cnt[d.type] = (cnt[d.type] || 0) + 1; });
    if (ui.type) list = list.filter(function (d) { return d.type === ui.type; });
    if (ui.q) { const q = ui.q.toLowerCase(); list = list.filter(function (d) { return [d.no, d.subject, d.party, d.note, d.fileName].join(' ').toLowerCase().indexOf(q) >= 0; }); }
    const tn = {}; D.DOC_TYPES.forEach(function (t) { tn[t.key] = t.name; });
    el.innerHTML = '<div class="card"><div class="section-title">ทะเบียนเอกสาร หนังสือ และแบบแปลน <span class="sub">เลขที่หนังสือออกถัดไป: <b>' + esc(U.nextDocNo(S.p, A.active('docs'))) + '</b></span>' +
      '<span class="right"><button class="btn btn-primary" id="dcNew">+ เพิ่มเอกสาร</button></span></div>' +
      '<div class="toolbar"><span class="chip' + (!ui.type ? ' active' : '') + '" data-t="">ทั้งหมด</span>' +
      D.DOC_TYPES.map(function (t) { return '<span class="chip' + (ui.type === t.key ? ' active' : '') + '" data-t="' + t.key + '">' + esc(t.name.split(' (')[0]) + ' ' + (cnt[t.key] || 0) + '</span>'; }).join('') +
      '<input class="inp grow" id="dcQ" placeholder="ค้นหาเลขที่/เรื่อง" value="' + esc(ui.q) + '"></div>' +
      (list.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>ประเภท</th><th>เลขที่</th><th>วันที่</th><th>เรื่อง</th><th>จาก/ถึง</th><th>ไฟล์</th></tr></thead><tbody>' +
        list.map(function (d) {
          const drawing = d.type === 'drawing';
          return '<tr class="clickable" data-id="' + esc(d.id) + '"><td class="small">' + esc((tn[d.type] || d.type || '').split(' (')[0]) + '</td><td class="nowrap">' + esc(d.no || '') + '</td>' +
            '<td class="nowrap">' + U.thDate(d.date, 'short') + '</td><td>' + esc(d.subject || '') +
            (drawing ? ' <span class="badge ' + (d.drawingStatus === 'superseded' ? 'b-mute">ยกเลิก/มีฉบับใหม่' : 'b-ok">ฉบับใช้งาน') + '</span>' + (d.rev ? ' <span class="badge b-info">Rev.' + esc(d.rev) + '</span>' : '') : '') +
            (d.reportKey ? ' <span class="badge b-info">รายงาน</span>' : '') + '</td><td class="small">' + esc(d.party || '') + '</td>' +
            '<td class="small">' + (d.filePath ? '<a href="#" data-open="' + esc(d.id) + '">📎 เปิด</a>' : (d.link ? (/^https?:/i.test(d.link) ? '<a href="' + esc(d.link) + '" target="_blank" rel="noopener">🔗 ลิงก์</a>' : '<span title="' + esc(d.link) + '">📁 ในเครื่อง</span>') : '')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีเอกสาร</div>') + '</div>';
    el.querySelector('#dcNew').onclick = function () { docForm(null); };
    el.querySelectorAll('[data-t]').forEach(function (c) { c.onclick = function () { ui.type = c.dataset.t; A.render(); }; });
    el.querySelector('#dcQ').oninput = function () { ui.q = this.value; clearTimeout(ui.t); ui.t = setTimeout(function () { A.render(); const q = document.getElementById('dcQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); };
    el.querySelectorAll('[data-open]').forEach(function (a) {
      a.onclick = async function (e) { e.preventDefault(); e.stopPropagation(); const d = list.find(function (x) { return x.id === a.dataset.open; }); const u = await FBL.fileUrl(d.filePath); if (u) window.open(u, '_blank', 'noopener'); };
    });
    el.querySelectorAll('tr[data-id]').forEach(function (tr) { tr.onclick = function (e) { if (e.target.closest('a')) return; docForm(list.find(function (d) { return d.id === tr.dataset.id; })); }; });
  };

  function docForm(rec) {
    const d = rec ? JSON.parse(JSON.stringify(rec)) : { type: S.ui.docs && S.ui.docs.type || 'in', date: U.today() };
    const m = A.modal({
      title: rec ? 'เอกสาร ' + (d.no || '') : 'เพิ่มเอกสาร', size: 'wide',
      body: '<div class="grid grid-3"><div class="field"><label>ประเภท</label><select id="dfType">' + A.opts(D.DOC_TYPES, d.type) + '</select></div>' +
        '<div class="field"><label>เลขที่</label><div class="flex" style="flex-wrap:nowrap"><input class="inp" id="dfNo" value="' + esc(d.no || '') + '"><button class="btn btn-sm btn-outline" id="dfNext" title="ใส่เลขที่หนังสือออกถัดไป">ถัดไป</button></div></div>' +
        '<div class="field"><label>วันที่</label><input type="date" id="dfDate" value="' + esc(d.date || '') + '"></div>' +
        '<div class="field span-2"><label>เรื่อง / ชื่อแบบ</label><input id="dfSubj" value="' + esc(d.subject || '') + '"></div>' +
        '<div class="field"><label>จาก / ถึง</label><input id="dfParty" value="' + esc(d.party || '') + '" placeholder="เช่น บ.ผู้รับจ้าง / ผอ.ขท."></div>' +
        '<div class="field dwg"><label>ฉบับแก้ไข (Rev.)</label><input id="dfRev" value="' + esc(d.rev || '') + '"></div>' +
        '<div class="field dwg"><label>สถานะแบบ</label><select id="dfDst">' + A.opts([{ key: 'current', name: 'ฉบับใช้งาน' }, { key: 'superseded', name: 'ยกเลิก/มีฉบับใหม่แทน' }], d.drawingStatus || 'current') + '</select></div>' +
        '<div class="field"><label>ลิงก์ หรือ ที่เก็บในเครื่อง</label><input id="dfLink" value="' + esc(d.link || '') + '" placeholder="https://... หรือ D:\\...\\ไฟล์.pdf"></div>' +
        '<div class="field span-all"><label>แนบไฟล์ (PDF/รูป/Word/Excel/DWG ≤ ' + Math.round(FBL.maxFileBytes / 1048576) + ' MB)</label><div class="flex">' + (d.filePath ? '<button class="btn btn-sm btn-outline" id="dfOpen">เปิด ' + esc(d.fileName || 'ไฟล์') + '</button>' : '') +
        '<input type="file" id="dfFile"></div><div id="dfProg" class="hint"></div></div>' +
        '<div class="field span-all"><label>หมายเหตุ</label><textarea id="dfNote">' + esc(d.note || '') + '</textarea></div></div>',
      foot: (rec ? '<button class="btn btn-danger left" id="dfDel">ลบ</button>' : '') + '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="dfOk">บันทึก</button>'
    });
    function tg() { const dw = m.q('#dfType').value === 'drawing'; m.qa('.dwg').forEach(function (e) { e.style.display = dw ? '' : 'none'; }); }
    m.q('#dfType').onchange = tg; tg();
    m.q('#dfNext').onclick = function () { m.q('#dfNo').value = U.nextDocNo(S.p, A.active('docs')); m.q('#dfType').value = 'out'; tg(); };
    if (d.filePath) m.q('#dfOpen').onclick = async function () { const u = await FBL.fileUrl(d.filePath); if (u) window.open(u, '_blank', 'noopener'); };
    m.q('#dfOk').onclick = async function () {
      d.type = A.val(m, '#dfType'); d.no = A.val(m, '#dfNo'); d.date = m.q('#dfDate').value; d.subject = A.val(m, '#dfSubj'); d.party = A.val(m, '#dfParty');
      d.rev = A.val(m, '#dfRev'); d.drawingStatus = d.type === 'drawing' ? A.val(m, '#dfDst') : ''; d.link = A.val(m, '#dfLink'); d.note = A.val(m, '#dfNote');
      if (!d.subject) return A.toast('ระบุเรื่อง', true);
      const done = A.busy(this);
      try {
        if (!d.id) d.id = FBL.newId();
        const f = m.q('#dfFile').files[0];
        if (f) {
          const path = 'projects/' + S.pid + '/files/docs/' + d.id + '/' + Date.now() + '_' + U.safeName(f.name);
          await FBL.uploadFile(path, f, function (x) { m.q('#dfProg').textContent = 'อัปโหลด ' + Math.round(x * 100) + '%'; });
          d.filePath = path; d.fileName = f.name; d.fileSize = f.size;
        }
        await A.save('docs', d, 'เอกสาร ' + (d.no || d.subject)); m.close(); A.toast('บันทึกแล้ว');
      } catch (e) { done(); A.toast(e.message, true); }
    };
    if (rec) m.q('#dfDel').onclick = async function () { if (await A.confirm('ลบเอกสารนี้?', 'ลบ', true)) { await A.softDelete('docs', rec, 'เอกสาร ' + rec.no); m.close(); } };
  }

  /* ======================= รายงาน ======================= */
  A.views.reports = function (el) {
    const p = S.p, c = U.contract(p), t = U.today();
    const pr = U.periods(p);
    const docs = A.active('docs'); const reg = {};
    docs.forEach(function (d) { if (d.reportKey) reg[d.reportKey] = d; });
    const rows = [];
    if (pr.threeDay) rows.push({ type: '3day', key: '3day', name: 'รายงาน 3 วันทำการ', range: U.thRange(pr.threeDay.from, pr.threeDay.to), due: pr.threeDay.due });
    pr.weeks.forEach(function (w) { rows.push({ type: 'weekly', key: w.key, name: 'สัปดาห์ที่ ' + w.n, range: U.thRange(w.from, w.to), due: w.due }); });
    pr.months.forEach(function (m) { rows.push({ type: 'monthly', key: m.key, name: 'ประจำเดือน ' + U.thMonth(m.ym), range: U.thRange(m.from, m.to), due: m.due }); });
    rows.sort(function (a, b) { return a.due.localeCompare(b.due) || (a.type === 'monthly' ? 1 : -1); });
    const tiles = [
      ['daily', 'รายงานประจำวัน', 'บันทึกงาน เครื่องจักร คน + รูปถ่ายของวันนั้น'],
      ['letter', 'หนังสือ/บันทึกข้อความอื่น', 'ส่งลูกปูน ขอวัดแสง ขอนัดตรวจรับ ฯลฯ'],
      ['photosR', 'รายงานรูปถ่าย', 'เลือกรูปจากคลังตามช่วงวันที่/หมวด'],
      ['delivery', 'บัญชีปริมาณงานที่ขอส่ง', 'สำหรับส่งงาน/เบิกจ่าย'],
      ['tests', 'ทะเบียนผลทดสอบ', 'รายละเอียดการส่งตัวอย่าง'],
      ['excel', 'ส่งออก Excel ทั้งโครงการ', 'บันทึกประจำวัน ชิ้นงาน ผลทดสอบ ฯลฯ']
    ];
    el.innerHTML = '<div class="split"><div class="card"><div class="section-title">รายงานตามรอบ <span class="sub">3 วันทำการ / สัปดาห์ (ตัดวันอาทิตย์) / เดือน (ตัดวันที่ 25)</span></div>' +
      (rows.length ? '<div class="table-wrap" style="max-height:640px"><table class="data"><thead><tr><th>รายงาน</th><th>ช่วง</th><th>กำหนดส่ง</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          const d = reg[r.key];
          const stt = d ? '<span class="badge b-ok">' + esc(d.no || 'ลงทะเบียนแล้ว') + '</span>' : (r.due < t ? '<span class="badge b-warn">ยังไม่ลงทะเบียน</span>' : (U.diffDays(t, r.due) <= 2 ? '<span class="badge b-info">ใกล้กำหนด</span>' : '<span class="badge b-mute">ยังไม่ถึง</span>'));
          return '<tr><td>' + esc(r.name) + '</td><td class="nowrap small">' + esc(r.range) + '</td><td class="nowrap">' + U.thDate(r.due, 'short') + '</td><td>' + stt + '</td>' +
            '<td class="r"><button class="btn btn-sm btn-outline" data-mk="' + r.type + '|' + r.key + '">สร้าง</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">กรอกวันเริ่มสัญญาและระยะเวลาก่อน</div>') + '</div>' +
      '<div><div class="card"><div class="section-title">รายงานอื่นๆ</div><div class="grid grid-2">' +
      tiles.map(function (x) { return '<button class="btn btn-outline" style="flex-direction:column;align-items:flex-start;white-space:normal;text-align:left;padding:12px" data-tile="' + x[0] + '"><span>' + esc(x[1]) + '</span><span class="small muted" style="font-family:Sarabun;font-weight:400">' + esc(x[2]) + '</span></button>'; }).join('') +
      '</div></div><div class="card"><div class="section-title">หมายเหตุ</div><ul class="small" style="margin:0;padding-left:18px">' +
      '<li>บันทึกข้อความใช้รูปแบบเดียวกับหนังสือเดิมของโครงการ: ตราครุฑ · TH SarabunIT๙ 16 · ต้นฉบับ + สำเนาเรียนกรรมการ ตามระเบียบงานสารบรรณ</li>' +
      '<li>"ดาวน์โหลด Word (.docx)" ได้ไฟล์ Word จริง หน้าตาเดียวกับ PDF และแก้ไขต่อได้</li>' +
      '<li>เมื่อส่งหนังสือแล้ว กด "ลงทะเบียนหนังสือออก" เพื่อให้เลขที่รันต่อและสถานะรายงานเปลี่ยนเป็นส่งแล้ว</li></ul></div></div></div>';
    el.querySelectorAll('[data-mk]').forEach(function (b) { b.onclick = function () { const a = b.dataset.mk.split('|'); periodDialog(a[0], a[1]); }; });
    el.querySelectorAll('[data-tile]').forEach(function (b) {
      b.onclick = function () {
        const k = b.dataset.tile;
        if (k === 'excel') return R.exportExcel();
        if (k === 'daily') return dailyReportDialog();
        if (k === 'letter') return letterDialog();
        if (k === 'photosR') return photoRangeDialog();
        if (k === 'delivery') return deliveryDialog();
        if (k === 'tests') return run('tests', {}, {});
      };
    });
  };

  async function run(type, o, meta, btn) {
    const done = btn ? A.busy(btn, 'กำลังสร้าง...') : function () {};
    try { const r = await R.build(type, o); done(); R.openPreview(r, meta); return true; }
    catch (e) { done(); A.toast(e.message, true); return false; }
  }
  function periodDialog(type, key) {
    const pr = U.periods(S.p);
    let def = U.today();
    if (type === '3day') def = pr.threeDay.due;
    if (type === 'weekly') def = (pr.weeks.find(function (w) { return w.key === key; }) || {}).due || def;
    if (type === 'monthly') def = (pr.months.find(function (x) { return x.key === key; }) || {}).due || def;
    if (def > U.today()) def = U.today();
    const df = R.defaults(type, { period: key });
    const ATT = { summary: 'สรุปผลการปฏิบัติงานประจำสัปดาห์', daily: 'แบบบันทึกการปฏิบัติงานประจำวัน', photos: 'รูปถ่าย (จากคลังรูปของช่วงนี้)', plan: 'ตารางแผนและผลงานประจำเดือน' };
    const m = A.modal({
      title: 'สร้างรายงาน', size: 'wide',
      body: '<div class="grid grid-3">' +
        '<div class="field"><label>เลขที่หนังสือ</label><input id="rpNo" value="' + esc(U.nextDocNo(S.p, A.active('docs'))) + '"></div>' +
        '<div class="field"><label>ลงวันที่</label><input type="date" id="rpDate" value="' + esc(def) + '"></div>' +
        '<div class="field"><label>จำนวนสำเนา (มี "สำเนาเรียน" กรรมการ)</label><input type="number" min="0" max="9" id="rpCopies" value="' + df.copies + '"></div>' +
        '<div class="field span-all"><label>เรื่อง</label><input id="rpSubj" value="' + esc(df.subject) + '"></div>' +
        '<div class="field span-all"><label><input type="checkbox" id="rpContract" checked> ขึ้นต้นด้วยย่อหน้าอ้างสัญญา (ตามสัญญาจ้างเลขที่ ... นั้น)</label></div>' +
        '<div class="field span-all"><label>เนื้อความ (ขึ้นบรรทัดใหม่ = ย่อหน้าใหม่)</label><textarea id="rpBody" rows="4">' + esc(df.body) + '</textarea></div>' +
        '<div class="field span-all"><label>ปิดท้าย</label><input id="rpClose" value="' + esc(df.closing) + '"></div>' +
        '<div class="field span-all"><label>เอกสารแนบ</label><div class="flex">' + Object.keys(df.attach).map(function (k) {
          return '<label style="font-weight:400"><input type="checkbox" data-att="' + k + '"' + (df.attach[k] ? ' checked' : '') + '> ' + ATT[k] + '</label>';
        }).join('') + '</div></div></div>' +
        (type === 'monthly' ? '<p class="hint">บรรทัด "สรุป แผนงานเดือน / แผนงานรวม / ผลงานเดือน / ผลงานรวม" คำนวณให้อัตโนมัติ</p>' : '') +
        '<p class="hint">ตรวจบันทึกประจำวันของช่วงนี้ให้ครบก่อนสร้างรายงาน · รูปแบบหน้าเป็นไปตามบันทึกข้อความเดิมของโครงการ (ตราครุฑ · TH SarabunIT๙)</p>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="rpOk">สร้างรายงาน</button>'
    });
    m.q('#rpOk').onclick = async function () {
      const attach = {}; m.qa('[data-att]').forEach(function (c) { attach[c.dataset.att] = c.checked; });
      const o = { period: key, no: A.val(m, '#rpNo'), date: m.q('#rpDate').value, subject: A.val(m, '#rpSubj'), body: m.q('#rpBody').value,
        contract: m.q('#rpContract').checked, closing: A.val(m, '#rpClose'), copies: U.num(m.q('#rpCopies').value), attach: attach };
      if (!o.subject) return A.toast('ระบุเรื่อง', true);
      if (await run(type, o, { register: true, no: o.no, date: o.date, fileName: o.no.replace(/\//g, '-') + ' ' + o.subject }, this)) m.close();
    };
  }
  function dailyReportDialog() {
    const m = A.modal({
      title: 'รายงานประจำวัน', size: 'narrow', body: '<div class="field"><label>วันที่</label><input type="date" id="rdD" value="' + U.today() + '"></div>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="rdOk">สร้าง</button>'
    });
    m.q('#rdOk').onclick = async function () { if (await run('daily', { date2: m.q('#rdD').value }, {}, this)) m.close(); };
  }
  function letterDialog() {
    const T = D.LETTER_TEMPLATES;
    const m = A.modal({
      title: 'หนังสือ/บันทึกข้อความ', size: 'wide',
      body: '<div class="grid grid-3"><div class="field"><label>แบบฟอร์ม</label><select id="ltT">' + A.opts(T.map(function (x) { return { key: x.key, name: x.subject || 'เขียนเอง' }; }), T[0].key) + '</select></div>' +
        '<div class="field"><label>เลขที่หนังสือ</label><input id="rpNo" value="' + esc(U.nextDocNo(S.p, A.active('docs'))) + '"></div>' +
        '<div class="field"><label>ลงวันที่</label><input type="date" id="rpDate" value="' + U.today() + '"></div>' +
        '<div class="field span-2"><label>เรื่อง</label><input id="ltS"></div><div class="field"><label>เรียน</label><input id="ltTo" value="' + esc(S.p.addressee || '') + '"></div>' +
        '<div class="field span-all"><label>เนื้อความ (ขึ้นบรรทัดใหม่ = ย่อหน้าใหม่ · {สัญญา} = ย่อหน้าอ้างสัญญาอัตโนมัติ)</label><textarea id="ltB" rows="9"></textarea></div>' +
        '<div class="field span-2"><label>ปิดท้าย</label><input id="ltC" value="จึงเรียนมาเพื่อโปรดทราบ"></div>' +
        '<div class="field"><label>จำนวนสำเนา (มี "สำเนาเรียน" กรรมการ)</label><input type="number" min="0" max="9" id="ltCopies" value="0"></div></div>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="ltOk">สร้าง</button>'
    });
    // คำปิดท้ายตามหนังสือจริง: ขอ/ส่ง → "จึงเรียนมาเพื่อโปรดพิจารณาดำเนินการต่อไป" · แจ้ง/รายงาน → "จึงเรียนมาเพื่อโปรดทราบ"
    function fill() { const x = T.find(function (t) { return t.key === m.q('#ltT').value; }); m.q('#ltS').value = x.subject; m.q('#ltB').value = x.body; m.q('#ltC').value = /ขอ|ส่ง/.test(x.subject) && x.key !== 'stop' ? 'จึงเรียนมาเพื่อโปรดพิจารณาดำเนินการต่อไป' : 'จึงเรียนมาเพื่อโปรดทราบ'; }
    m.q('#ltT').onchange = fill; fill();
    m.q('#ltOk').onclick = async function () {
      const body = m.q('#ltB').value;
      const o = { no: A.val(m, '#rpNo'), date: m.q('#rpDate').value, subject: A.val(m, '#ltS'), to: A.val(m, '#ltTo'), body: body, contract: body.indexOf('{สัญญา}') >= 0,
        closing: A.val(m, '#ltC'), copies: U.num(m.q('#ltCopies').value) };
      if (!o.subject) return A.toast('ระบุเรื่อง', true);
      if (await run('letter', o, { register: true, no: o.no, date: o.date, fileName: o.no.replace(/\//g, '-') + ' ' + o.subject }, this)) m.close();
    };
  }
  function photoRangeDialog() {
    const m = A.modal({
      title: 'รายงานรูปถ่าย', size: 'narrow',
      body: '<div class="grid grid-2"><div class="field"><label>ตั้งแต่วันที่</label><input type="date" id="prF"></div><div class="field"><label>ถึงวันที่</label><input type="date" id="prTo"></div>' +
        '<div class="field span-all"><label>หมวด</label><select id="prC">' + A.opts(D.PHOTO_CATEGORIES, '', 'ทุกหมวด') + '</select></div></div>' +
        '<p class="hint">หรือเลือกรูปทีละรูปได้ที่แท็บรูปถ่าย → "เลือกรูปทำรายงาน"</p>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="prOk">ต่อไป</button>'
    });
    m.q('#prOk').onclick = function () {
      const f = m.q('#prF').value, to = m.q('#prTo').value, cat = m.q('#prC').value;
      const list = A.active('photos').filter(function (x) { return (!f || x.date >= f) && (!to || x.date <= to) && (!cat || x.category === cat); })
        .sort(function (a, b) { return String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))); });
      if (!list.length) return A.toast('ไม่มีรูปตามเงื่อนไข', true);
      m.close(); A.photoReportDialog(list);
    };
  }
  function deliveryDialog() {
    const m = A.modal({
      title: 'บัญชีแสดงปริมาณงานและเงินค่างานที่ขอส่ง', size: 'narrow',
      body: '<div class="grid grid-2"><div class="field"><label>ครั้งที่ (ข้อความ)</label><input id="dvR" value="1 (ครั้งสุดท้าย)"></div><div class="field"><label>ผลงาน ณ วันที่</label><input type="date" id="dvD" value="' + esc(S.p.completedDate || U.today()) + '"></div></div>' +
        '<p class="hint">รายการที่จ่ายจริงไม่เท่าราคา (เช่น ค่าธรรมเนียมการไฟฟ้า) ให้กรอก "เงินที่ขอส่งจริง" ในตาราง BOQ แท็บข้อมูลสัญญา</p>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="dvOk">สร้าง</button>'
    });
    m.q('#dvOk').onclick = async function () { if (await run('delivery', { round: A.val(m, '#dvR'), date: m.q('#dvD').value }, {}, this)) m.close(); };
  }
})();
