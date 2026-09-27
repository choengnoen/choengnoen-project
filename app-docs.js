/* ==========================================================================
   app-docs.js — ตัวสร้างเอกสารราชการ (บันทึกข้อความ + เอกสารแนบ)
   สร้าง "แบบจำลองหน้า" ชุดเดียว แล้วแปลงเป็น 2 รูปแบบ
     - toHtml()  → พิมพ์ / บันทึกเป็น PDF จากเบราว์เซอร์
     - toDocx()  → ไฟล์ Word จริง (.docx) เปิดแก้ไขต่อได้
   รูปแบบคัดลอกค่าจากไฟล์ Word/Excel ที่ผู้ควบคุมงานใช้จริง (รย.23/2569) ตามระเบียบงานสารบรรณ
     หน้า A4 ขอบบน 2.0 ซ้าย 3.0 ขวา 2.0 ล่าง 2.25 ซม. · ครุฑ 1.6 ซม. ชิดซ้าย · "บันทึกข้อความ" 28 pt หนา
     หัวข้อ 18 pt หนา · เนื้อความ TH SarabunIT๙ 16 pt · ย่อหน้า 2.54 ซม. · เว้นหลังย่อหน้า 6 pt
   หน่วยภายใน: twips (1/1440 นิ้ว, 1 ซม. = 567) · ขนาดตัวอักษร: ครึ่งพอยต์แบบ Word (32 = 16 pt)
   ========================================================================== */
window.DOCS = (function () {
  'use strict';
  const FONT = 'TH SarabunIT๙';
  const esc = U.esc;
  const PORTRAIT = { w: 11906, h: 16838, m: [1135, 1133, 1276, 1701] };            // บน ขวา ล่าง ซ้าย (ตามไฟล์ Word จริง)
  const LAND = { w: 16838, h: 11906, m: [794, 283, 1077, 283] };                   // เอกสารแนบแนวนอน (ตามไฟล์ Excel)
  const PHOTO = { w: 11906, h: 16838, m: [1077, 737, 1077, 737] };                 // หน้ารูปถ่ายแนวตั้ง
  const TEXT_W = PORTRAIT.w - PORTRAIT.m[1] - PORTRAIT.m[3];                         // 9072
  const CM = 567;

  /* ---------------- ตัวช่วยสร้างบล็อก ---------------- */
  function run(t, o) { return Object.assign({ t: String(t === undefined || t === null ? '' : t) }, o || {}); }
  function P(runs, o) { return Object.assign({ k: 'p', runs: typeof runs === 'string' ? [run(runs)] : runs }, o || {}); }
  function blank(n, sz) { return { k: 'blank', n: n || 1, sz: sz || 32 }; }
  function tabrow(cells, o) { return Object.assign({ k: 'tabrow', cells: cells }, o || {}); }
  function stripTitle(name) { return String(name || '').replace(/^(นางสาว|นาง|นาย|ว่าที่\s*ร\.ต\.\s*|ว่าที่ร้อยตรี\s*)/, '').trim(); }
  // แยกชื่องานเป็นบรรทัดแบบในไฟล์ Excel: [ชื่องาน] / [ทางหลวงหมายเลข ...] / [และทางหลวง ... ปริมาณงาน]
  function splitName(name) {
    const s = String(name || '');
    const i = s.indexOf(' ทางหลวงหมายเลข'); const j = s.indexOf(' และทางหลวง');
    const k = s.search(/\sปริมาณงาน/);
    const out = [];
    if (i > 0) { out.push(s.slice(0, i).trim()); if (j > i) { out.push(s.slice(i, j).trim()); out.push(s.slice(j).trim()); } else out.push(s.slice(i).trim()); }
    else if (k > 0) { out.push(s.slice(0, k).trim()); out.push(s.slice(k).trim()); }
    else out.push(s);
    return out;
  }

  /* ======================= บันทึกข้อความ ======================= */
  function contractPara(p) {
    const c = U.contract(p);
    return 'ตามสัญญาจ้างเลขที่ ' + (p.contractNo || p.code || '') + (p.contractDate ? ' ลงวันที่ ' + U.thDate(p.contractDate) : '') + ' ' + (p.name || p.shortName || '') +
      (p.contractor ? ' โดย ' + p.contractor + ' เป็นผู้รับจ้าง' : '') +
      (c.start ? ' เริ่มสัญญาวันที่ ' + U.thDate(c.start) + ' สิ้นสุดสัญญาวันที่ ' + U.thDate(c.end) + ' เวลาทำการ ' + c.days + ' วัน' : '') +
      ' ค่างาน ' + U.money(c.value) + ' บาท ค่าปรับวันละ ' + U.money(c.finePerDay) + ' บาท นั้น';
  }
  function ccList(p) {
    return (p.committee || []).filter(function (m) { return m.role !== 'ประธานกรรมการ' && m.position; }).map(function (m) { return m.position + ' (กรรมการฯ)'; });
  }
  /* o: { no, date, subject, to, paras:[ข้อความ], closing, closingGap, sumLines:[{label, value}], sumMonth, copies, cc:[] }
     คืนหน้า: ต้นฉบับ 1 หน้า + สำเนา o.copies หน้า (สำเนามีชื่อพิมพ์ + สำเนาเรียน + ลงชื่อรับรองสำเนา) */
  function memoPages(p, o) {
    const sv = p.supervisor || {};
    const role = o.role || 'ผู้ควบคุมงาน';
    const cc = o.cc || ccList(p);
    function body(copy) {
      const b = [];
      b.push({ k: 'head' });
      b.push(P([run('ส่วนราชการ', { b: 1, sz: 36 }), run('    ' + (p.office || '') + (p.phone ? '  โทรศัพท์ ' + p.phone : ''))]));
      b.push(tabrow([{ x: 0, runs: [run('ที่', { b: 1, sz: 36 })] }, { x: 426, runs: [run(String(o.no || '').replace(/\s*\/\s*/g, ' / '))] },
        { x: 4395, runs: [run('วันที่', { b: 1, sz: 36 }), run('    ' + (o.date ? U.thDate(o.date) : ''))] }]));
      b.push({ k: 'lbl', label: 'เรื่อง', lb: 1, lsz: 36, text: o.subject || '', pos: 720 });
      b.push({ k: 'lbl', label: 'เรียน', lb: 0, lsz: 36, text: o.to || p.addressee || '', pos: 720, after: 120 });
      (o.paras || []).forEach(function (t, i) {
        b.push(P(t, { jc: 'both', ind: { fl: 1440 }, after: 120 }));
      });
      (o.sumLines || []).forEach(function (s, i) {
        b.push(tabrow([
          { x: 1440, runs: [run(i === 0 ? 'สรุป' : '', { u: 1 })] }, { x: 1980, runs: [run(s.label)] },
          { x: 5040, runs: [run('=')] }, { x: 5760, runs: [run(s.value)] }]));
      });
      b.push(P(o.closing || 'จึงเรียนมาเพื่อโปรดทราบ', { jc: 'both', ind: { fl: 1440 }, before: o.sumLines && o.sumLines.length ? 120 : 0 }));
      b.push(blank(1));
      if (copy) b.push(P(stripTitle(sv.name), { jc: 'center', ind: { l: 4320, r: 1300 } })); else b.push(blank(1));
      b.push(P('(' + (sv.name || '') + ')', { jc: 'center', ind: { l: 4320, r: 1300 } }));
      b.push(P(role, { jc: 'center', ind: { l: 4320, r: 1300 } }));
      if (copy && cc.length) {
        b.push(blank(3));
        cc.forEach(function (c, i) {
          b.push(tabrow([{ x: 0, runs: [run(i === 0 ? 'สำเนาเรียน' : '')] }, { x: 1260, runs: [run('-  ' + c)] }]));
        });
        b.push(tabrow([{ x: 1260, runs: [run('เพื่อโปรดทราบ')] }], { before: 120 }));
        b.push(blank(2));
        b.push(P('(' + (sv.name || '') + ')', { jc: 'center', ind: { l: 1134, r: 4700 } }));
        b.push(P(role, { jc: 'center', ind: { l: 1134, r: 4700 } }));
      }
      return b;
    }
    const pages = [{ size: PORTRAIT, blocks: body(false) }];
    for (let i = 0; i < (o.copies || 0); i++) pages.push({ size: PORTRAIT, blocks: body(true) });
    return pages;
  }

  /* ======================= เอกสารแนบ ======================= */
  function head(p, title, sub, sz) {
    const b = [P([run(title, { b: 1, sz: sz + 8 })], { jc: 'center' })];
    splitName(p.name || p.shortName).forEach(function (l) { b.push(P([run(l, { sz: sz })], { jc: 'center' })); });
    (sub || []).forEach(function (l) { b.push(P([run(l, { sz: sz })], { jc: 'center' })); });
    return b;
  }
  function signAttach(p, sz, x) {
    const sv = p.supervisor || {};
    return [blank(1, sz),
      tabrow([{ x: x, runs: [run('ผู้ควบคุมงาน/ผู้รายงาน   :', { sz: sz })] }]),
      blank(1, sz),
      P([run('(' + (sv.name || '') + ')', { sz: sz })], { jc: 'center', ind: { l: x + 1800, r: 400 } }),
      P([run(sv.position || '', { sz: sz })], { jc: 'center', ind: { l: x + 1800, r: 400 } })];
  }
  // แปลงความกว้างคอลัมน์ Excel (ตัวอักษร) × สเกลการพิมพ์ → twips
  // ถ้ากว้างเกินหน้ากระดาษแนวนอน ย่อทุกคอลัมน์ตามสัดส่วนให้พอดี
  function xlCols(ws, scale) {
    const cols = ws.map(function (w) { return Math.round((w * 7 + 5) * 15 * scale); });
    const avail = LAND.w - LAND.m[1] - LAND.m[3] - 60;
    const sum = cols.reduce(function (s, v) { return s + v; }, 0);
    return sum > avail ? cols.map(function (v) { return Math.floor(v * avail / sum); }) : cols;
  }
  function parseQty(s) {
    const m = String(s || '').replace(/,/g, '').match(/^\s*([\d.]+)\s*(.*)$/);
    return m ? { n: parseFloat(m[1]), u: m[2].trim() } : null;
  }
  function fmtN(n) { return n % 1 ? n.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : n.toLocaleString('th-TH'); }
  function kmVal(s) { const v = U.kmToM(s); return v === null ? null : v; }

  // สรุปผลการปฏิบัติงานประจำสัปดาห์ (รวมตามลักษณะงาน)
  function weeklySummaryPage(p, w) {
    const sz = 30;   // 16 pt × 93%
    const daily = App.active('daily').filter(function (d) { return d.date >= w.from && d.date <= w.to; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    const groups = []; const idx = {};
    daily.forEach(function (d) {
      (d.works || []).forEach(function (x) {
        const k = (x.desc || '').trim(); if (!k) return;
        if (!(k in idx)) { idx[k] = groups.length; groups.push({ desc: k, items: [] }); }
        groups[idx[k]].items.push(x);
      });
    });
    const rows = groups.map(function (g, i) {
      const ks = g.items.map(function (x) { return [kmVal(x.staFrom), kmVal(x.staTo)]; }).reduce(function (a, b) { return a.concat(b); }, []).filter(function (v) { return v !== null; });
      const sides = g.items.map(function (x) { return (x.side || '').trim(); }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
      let side = sides.length === 1 ? sides[0] : (sides.length ? (sides.every(function (s) { return /cl/i.test(s); }) ? 'Cl.' : sides.join(', ')) : '-');
      const qs = g.items.map(function (x) { return parseQty(x.qty); });
      let qty = '-';
      if (qs.length && qs.every(function (q) { return q && q.u === qs[0].u; })) qty = fmtN(qs.reduce(function (s, q) { return s + q.n; }, 0)) + (qs[0].u ? ' ' + qs[0].u : '');
      return [{ t: String(i + 1), jc: 'c' }, { t: g.desc }, { t: ks.length ? U.fmtKm(Math.min.apply(null, ks)) : '-', jc: 'c' }, { t: ks.length ? U.fmtKm(Math.max.apply(null, ks)) : '-', jc: 'c' },
        { t: side, jc: 'c' }, { t: '-', jc: 'c' }, { t: qty, jc: 'c' }];
    });
    while (rows.length < 9) rows.push([{ t: '' }, { t: '' }, { t: '' }, { t: '' }, { t: '' }, { t: '' }, { t: '' }]);
    const hdr = [
      [{ t: 'อันดับที่', rs: 2, b: 1, jc: 'c' }, { t: 'รายการ', rs: 2, b: 1, jc: 'c' }, { t: 'ช่วงดำเนินการ', cs: 4, b: 1, jc: 'c' }, { t: 'ผลงานที่ได้', rs: 2, b: 1, jc: 'c' }],
      [{ t: 'Sta.', b: 1, jc: 'c' }, { t: 'Sta.', b: 1, jc: 'c' }, { t: 'Lt. / Rt.', b: 1, jc: 'c' }, { t: 'กว้าง', b: 1, jc: 'c' }]
    ];
    return { size: LAND, blocks: head(p, 'สรุปผลการปฏิบัติงานประจำสัปดาห์', [
      'สัญญาจ้างเลขที่ ' + (p.contractNo || p.code) + (p.contractDate ? ' ลงวันที่ ' + U.thDate(p.contractDate) : ''),
      'สัปดาห์ที่ ' + w.n + ' ระหว่างวันที่ ' + U.thDate(w.from) + ' - ' + U.thDate(w.to)], sz)
      .concat([blank(1, sz), { k: 'table', cols: xlCols([8.6, 62.2, 15.6, 15.6, 10.1, 13.4, 18.9], 0.93), sz: sz, rowH: 430, head: 2, rows: hdr.concat(rows) }])
      .concat(signAttach(p, sz, 9500)) };
  }

  // แบบบันทึกการปฏิบัติงานประจำวัน (แบ่งหน้าไม่ตัดกลางวัน, 21 แถว/หน้า) + รายการเครื่องมือและอุปกรณ์
  function dailyFormPages(p, from, to) {
    const sz = 22;   // 16 pt × 67%
    const c = U.contract(p);
    const daily = App.active('daily').filter(function (d) { return d.date >= from && d.date <= to; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    const byDate = {}; daily.forEach(function (d) { byDate[d.date] = d; });
    const days = [];
    for (let d = from; d <= to; d = U.addDays(d, 1)) if (byDate[d]) days.push(byDate[d]);
    const ROWS = 19;
    const chunks = []; let cur = [], n = 0;
    days.forEach(function (d) {
      const k = Math.max(1, (d.works || []).length);
      if (n + k > ROWS && cur.length) { chunks.push(cur); cur = []; n = 0; }
      cur.push(d); n += k;
    });
    if (cur.length || !chunks.length) chunks.push(cur);
    const mcs = (p.machines || []).slice();
    const pi = mcs.findIndex(function (m) { return /ปิคอัพ/.test(m); });
    const equipNames = mcs.slice(0, pi + 1).concat(['โฟร์แมน', 'คนงาน'], mcs.slice(pi + 1));
    return chunks.map(function (ds) {
      const equip = equipNames.map(function (nm) {
        let v = 0;
        ds.forEach(function (d) { v = Math.max(v, nm === 'โฟร์แมน' ? U.num(d.foreman) : (nm === 'คนงาน' ? U.num(d.workers) : U.num((d.machines || {})[nm]))); });
        return { nm: nm, v: v };
      });
      const lines = [];
      ds.forEach(function (d) {
        const ws = d.works && d.works.length ? d.works : [{ desc: d.noWork ? (d.note || 'ไม่มีการทำงาน') : '' }];
        ws.forEach(function (w, i) {
          lines.push({ date: i ? '' : U.thDate(d.date, 'short'), desc: w.desc || '', a: w.staFrom || '-', b: w.staTo || '-', side: w.side || '-', qty: w.qty || '-',
            time: i ? '' : (d.works && d.works.length ? (d.timeFrom || '') + ' น. - ' + (d.timeTo || '') + ' น.' : '-'), wx: i ? '' : (d.weather || '-'), prob: i ? '' : (d.problems || '-') });
        });
      });
      const rows = [];
      for (let i = 0; i < ROWS; i++) {
        const l = lines[i] || {}; const e = equip[i];
        rows.push([{ t: l.date || '', jc: 'c' }, { t: l.desc || '' }, { t: l.desc ? l.a : '', jc: 'c' }, { t: l.desc ? l.b : '', jc: 'c' }, { t: l.desc ? l.side : '', jc: 'c' },
          { t: l.desc ? l.qty : '', jc: 'c' }, { t: l.time || '', jc: 'c' }, { t: l.wx || '', jc: 'c' }, { t: l.prob || '', jc: 'c' },
          { t: e ? e.nm : '' }, { t: e && e.v ? String(e.v) : '', jc: 'c' }]);
      }
      const hdr = [
        [{ t: 'วัน/เดือน/ปี', rs: 2, b: 1, jc: 'c' }, { t: 'ลักษณะงานที่ทำ', rs: 2, b: 1, jc: 'c' }, { t: 'ช่วงดำเนินการ', cs: 3, b: 1, jc: 'c' }, { t: 'ผลงานที่ได้', rs: 2, b: 1, jc: 'c' },
          { t: 'เวลา', rs: 2, b: 1, jc: 'c' }, { t: 'สภาพภูมิอากาศ', rs: 2, b: 1, jc: 'c' }, { t: 'ปัญหาและอุปสรรค', rs: 2, b: 1, jc: 'c' }, { t: 'เครื่องมือและอุปกรณ์', cs: 2, b: 1, jc: 'c' }],
        [{ t: 'Sta.', b: 1, jc: 'c' }, { t: 'Sta.', b: 1, jc: 'c' }, { t: 'Lt. / Rt.', b: 1, jc: 'c' }, { t: 'ชนิด', b: 1, jc: 'c' }, { t: 'จำนวน', b: 1, jc: 'c' }]
      ];
      return { size: LAND, blocks: head(p, 'แบบบันทึกการปฏิบัติงานประจำวัน', [
        'สัญญาจ้างเลขที่ ' + (p.contractNo || p.code) + (p.contractDate ? ' ลงวันที่ ' + U.thDate(p.contractDate) : '') + ' เริ่มสัญญาวันที่ ' + U.thDate(c.start) +
        ' และสิ้นสุดสัญญาวันที่ ' + U.thDate(c.end) + ' ระยะเวลาดำเนินการ ' + c.days + ' วัน ค่างาน ' + U.money(c.value) + ' บาท ค่าปรับวันละ ' + U.money(c.finePerDay) + ' บาท'], sz)
        .concat([blank(1, sz), { k: 'table', cols: xlCols([24.4, 42.1, 15.7, 15.7, 8.9, 16.9, 25.2, 18.7, 18.7, 20.7, 8.7], 0.67), sz: sz, rowH: 300, head: 2, rows: hdr.concat(rows) }])
        .concat(signAttach(p, sz, 10500)) };
    });
  }

  // หน้ารูปถ่าย (แนวตั้ง 2 คอลัมน์ × 4 แถว)
  function photoPages(p, photos, title) {
    const pages = [];
    for (let i = 0; i < photos.length; i += 8) {
      pages.push({ size: PHOTO, blocks: [
        P([run(title || ('สัญญาจ้างเลขที่ ' + (p.contractNo || p.code) + (p.contractDate ? ' ลงวันที่ ' + U.thDate(p.contractDate) : '')), { b: 1, sz: 32 })], { jc: 'center', after: 120 }),
        { k: 'photos', items: photos.slice(i, i + 8), cols: 2, imgH: 3290, sz: 26 }] });
    }
    return pages;
  }

  // แผนและผลงานประจำเดือน (ตารางแบบไฟล์ "แผน-ผล")
  function monthlyPage(p, m) {
    const sz = 17;   // สเกลพิมพ์ 47% ของ Excel
    const units = App.active('units');
    const c = U.contract(p);
    const total = U.boqTotal(p) || 1;
    const plan = (p.plan || []).filter(function (x) { return x.month; });
    const prev = U.addDays(m.from, -1);
    const monthEnd = function (ym) { return U.iso(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0)); };
    const pct = function (v) { return (v * 100).toFixed(3) + '%'; };
    const years = []; plan.forEach(function (x) { const y = +x.month.slice(0, 4) + 543; const g = years.find(function (z) { return z.y === y; }); if (g) g.n++; else years.push({ y: y, n: 1 }); });
    const hdr1 = [{ t: 'ลำดับที่', rs: 2, b: 1, jc: 'c' }, { t: 'รายการ', rs: 2, b: 1, jc: 'c' }, { t: 'ปริมาณงาน', rs: 2, b: 1, jc: 'c' }, { t: 'หน่วย', rs: 2, b: 1, jc: 'c' },
      { t: 'ราคาต่อหน่วย\n(บาท)', rs: 2, b: 1, jc: 'c' }, { t: 'รวมเงิน\n(บาท)', rs: 2, b: 1, jc: 'c' }, { t: '% งาน', rs: 2, b: 1, jc: 'c' },
      { t: 'สะสมยกมา', cs: 2, b: 1, jc: 'c' }, { t: 'ผลงานประจำเดือน', cs: 4, b: 1, jc: 'c' }, { t: 'ผลงานแล้วเสร็จสะสม', cs: 3, b: 1, jc: 'c' }]
      .concat(years.map(function (y) { return { t: 'พ.ศ. ' + y.y, cs: y.n, b: 1, jc: 'c' }; }));
    const hdr2 = [{ t: '% งาน', b: 1, jc: 'c' }, { t: 'ปริมาณงาน', b: 1, jc: 'c' }, { t: 'ปริมาณงาน', b: 1, jc: 'c' }, { t: 'เป็นเงิน (บาท)', b: 1, jc: 'c' },
      { t: '% ของรายการ', b: 1, jc: 'c' }, { t: '% งาน', b: 1, jc: 'c' }, { t: '% งาน', b: 1, jc: 'c' }, { t: 'ปริมาณงาน', b: 1, jc: 'c' }, { t: 'เงิน (บาท)', b: 1, jc: 'c' }]
      .concat(plan.map(function (x) { return { t: U.TH_MON[+x.month.slice(5, 7) - 1], b: 1, jc: 'c' }; }));
    const rows = [hdr1, hdr2];
    let sPrev = 0, sMonthVal = 0, sCum = 0, sCumVal = 0;
    (p.boq || []).forEach(function (b, i) {
      const val = U.num(b.qty) * U.num(b.unitPrice), w = val / total;
      const fp = prev >= c.start ? U.itemFraction(p, b, units, prev) : 0, fn = U.itemFraction(p, b, units, m.to);
      sPrev += w * fp; sMonthVal += val * (fn - fp); sCum += w * fn; sCumVal += val * fn;
      let prevM = 0;
      const act = plan.map(function (x) {
        const e = monthEnd(x.month); const d = e > m.to ? m.to : e;
        if (x.month + '-01' > m.to) return '';
        const f = U.itemFraction(p, b, units, d); const v = f - prevM; prevM = f; return pct(v);
      });
      rows.push([{ t: String(i + 1), rs: 2, jc: 'c', v: 1 }, { t: b.desc, rs: 2, v: 1 }, { t: fmtN(U.num(b.qty)), rs: 2, jc: 'c', v: 1 }, { t: b.unit || '', rs: 2, jc: 'c', v: 1 },
        { t: U.money(b.unitPrice), rs: 2, jc: 'r', v: 1 }, { t: U.money(val), rs: 2, jc: 'r', v: 1 }, { t: pct(w), rs: 2, jc: 'r', v: 1 },
        { t: pct(w * fp), rs: 2, jc: 'r', v: 1 }, { t: fmtN(+(U.num(b.qty) * fp).toFixed(2)), rs: 2, jc: 'c', v: 1 },
        { t: fmtN(+(U.num(b.qty) * (fn - fp)).toFixed(2)), rs: 2, jc: 'c', v: 1 }, { t: U.money(val * (fn - fp)), rs: 2, jc: 'r', v: 1 }, { t: pct(fn - fp), rs: 2, jc: 'r', v: 1 },
        { t: pct(w * (fn - fp)), rs: 2, jc: 'r', v: 1 }, { t: pct(w * fn), rs: 2, jc: 'r', v: 1 }, { t: fmtN(+(U.num(b.qty) * fn).toFixed(2)), rs: 2, jc: 'c', v: 1 }, { t: U.money(val * fn), rs: 2, jc: 'r', v: 1 }]
        .concat(plan.map(function (x) { return { t: pct(U.num(x.pct) / 100), jc: 'r' }; })));
      rows.push(act.map(function (a) { return { t: a, jc: 'r' }; }));
    });
    const blanksM = plan.map(function () { return { t: '' }; });
    rows.push([{ t: 'รวมทั้งสิ้น', cs: 5, b: 1, jc: 'c' }, { t: U.money(total), jc: 'r', b: 1 }, { t: '100.000%', jc: 'r', b: 1 }, { t: pct(sPrev), jc: 'r', b: 1 }, { t: '' }, { t: '' },
      { t: U.money(sMonthVal), jc: 'r', b: 1 }, { t: '' }, { t: pct(sCum - sPrev), jc: 'r', b: 1 }, { t: pct(sCum), jc: 'r', b: 1 }, { t: '' }, { t: U.money(sCumVal), jc: 'r', b: 1 }].concat(blanksM));
    // แผนงาน / ผลงาน ประจำเดือน และสะสม (บาท/%)
    let cumP = 0, cumA = 0;
    const pm = [], pc = [], am = [], ac = [];
    plan.forEach(function (x) {
      const e = monthEnd(x.month);
      const v = U.num(x.pct) / 100; cumP += v; pm.push(v); pc.push(cumP);
      if (x.month + '-01' > m.to) { am.push(null); ac.push(null); return; }
      const a = U.actualCum(p, units, e > m.to ? m.to : e) / 100; am.push(a - cumA); cumA = a; ac.push(a);
    });
    // ส่วนสรุปใต้ตาราง (แบบไฟล์ Excel): ป้าย แผนงาน/ผลงาน (คอลัมน์ 11–12) · ประจำเดือน/สะสม (13–15) · หน่วย (16) · ค่ารายเดือน
    const blankL = function () { return { t: '', cs: 10, nb: 1 }; };
    const L = function (t, rs, cs) { return { t: t, rs: rs, cs: cs, b: 1, jc: 'c', v: 1 }; };
    const vals = function (arr, money) { return arr.map(function (v) { return { t: v === null ? '' : (money ? U.money(v * total) : pct(v)), jc: 'r' }; }); };
    [['แผนงาน', pm, pc], ['ผลงาน', am, ac]].forEach(function (g) {
      rows.push([blankL(), L(g[0], 4, 2), L('ประจำเดือน', 2, 3), { t: '(บาท)', jc: 'c' }].concat(vals(g[1], true)));
      rows.push([blankL(), { t: '(%)', jc: 'c' }].concat(vals(g[1], false)));
      rows.push([blankL(), L('สะสม', 2, 3), { t: '(บาท)', jc: 'c' }].concat(vals(g[2], true)));
      rows.push([blankL(), { t: '(%)', jc: 'c' }].concat(vals(g[2], false)));
    });
    const colW = [6.6, 18.6 + 36.7, 11.6, 6.4, 17.4, 17.4, 11.1, 11.1, 11.6, 11.6, 18.1, 14.5, 11.1, 11.1, 10.6, 17.4].concat(plan.map(function () { return 12; }));
    // แทรกคอลัมน์สรุปให้ตรงตำแหน่ง: ป้าย "แผนงาน/ผลงาน" อยู่ใต้คอลัมน์ 12–13, หน่วยอยู่คอลัมน์ 16
    const sv = p.supervisor || {};
    const info = [
      tabrow([{ x: 0, runs: [run('สัญญาจ้างเลขที่', { sz: sz + 2 })] }, { x: 2200, runs: [run((p.contractNo || p.code) + (p.contractDate ? ' ลงวันที่ ' + U.thDate(p.contractDate) : ''), { sz: sz + 2 })] },
        { x: 13000, runs: [run('เริ่มต้นสัญญา   ' + U.thDate(c.start, 'num'), { sz: sz + 2 })] }]),
      tabrow([{ x: 0, runs: [run('ควบคุมการก่อสร้างโดย', { sz: sz + 2 })] }, { x: 2200, runs: [run(sv.name || '', { sz: sz + 2 })] },
        { x: 13000, runs: [run('สิ้นสุดสัญญา   ' + U.thDate(c.end, 'num'), { sz: sz + 2 })] }]),
      tabrow([{ x: 0, runs: [run('ดำเนินการก่อสร้างโดย', { sz: sz + 2 })] }, { x: 2200, runs: [run(p.contractor || '', { sz: sz + 2 })] },
        { x: 13000, runs: [run('ราคาค่าก่อสร้าง   ' + U.money(c.value), { sz: sz + 2 })] }]),
      tabrow([{ x: 0, runs: [run('ระยะเวลาดำเนินการ', { sz: sz + 2 })] }, { x: 2200, runs: [run(c.days + ' วัน', { sz: sz + 2 })] },
        { x: 13000, runs: [run('ค่าปรับวันละ   ' + U.money(c.finePerDay), { sz: sz + 2 })] }])
    ];
    const titleLines = splitName('แผนและผล ' + (p.name || p.shortName));
    return { size: LAND, blocks: titleLines.map(function (l, i) { return P([run(l, { b: i === 0 ? 1 : 0, sz: sz + 6 })], { jc: 'center' }); })
      .concat([P([run('ประจำเดือน ' + U.thMonth(m.ym) + ' (ระหว่างวันที่ ' + U.thDate(m.from) + ' - ' + U.thDate(m.to) + ')', { sz: sz + 4 })], { jc: 'center', after: 60 })])
      .concat(info).concat([blank(1, sz), { k: 'table', cols: xlCols(colW, 0.62), sz: sz, rowH: 300, head: 2, rows: rows }])
      .concat(signAttach(p, sz + 4, 11500)) };
  }

  // บัญชีแสดงปริมาณงานและเงินค่างานที่ขอส่ง (แบบไฟล์ "รายการคำนวน")
  function deliveryPage(p, o) {
    const units = App.active('units'); const d = o.date || U.today();
    let tot = 0, del = 0;
    const rows = [[{ t: 'ลำดับที่', rs: 2, b: 1, jc: 'c', v: 1 }, { t: 'รายการงาน', rs: 2, b: 1, jc: 'c', v: 1 }, { t: 'หน่วย', rs: 2, b: 1, jc: 'c', v: 1 }, { t: 'ราคาต่อหน่วย (บาท)', rs: 2, b: 1, jc: 'c', v: 1 },
      { t: 'ปริมาณงานตามสัญญา', cs: 2, b: 1, jc: 'c' }, { t: 'ปริมาณงานที่ขอส่ง' + (o.round ? 'ครั้งที่ ' + o.round : ''), cs: 2, b: 1, jc: 'c' }, { t: '% แล้วเสร็จ', rs: 2, b: 1, jc: 'c', v: 1 }, { t: 'หมายเหตุ', rs: 2, b: 1, jc: 'c', v: 1 }],
      [{ t: 'ปริมาณ', b: 1, jc: 'c' }, { t: 'เงิน (บาท)', b: 1, jc: 'c' }, { t: 'ปริมาณ', b: 1, jc: 'c' }, { t: 'เงิน (บาท)', b: 1, jc: 'c' }]];
    (p.boq || []).forEach(function (b, i) {
      const val = U.num(b.qty) * U.num(b.unitPrice); const f = U.itemFraction(p, b, units, d);
      const manual = b.deliveredAmount !== '' && b.deliveredAmount !== undefined && b.deliveredAmount !== null && f >= 0.999;
      const dv = manual ? U.num(b.deliveredAmount) : val * f;
      tot += val; del += dv;
      rows.push([{ t: String(i + 1), jc: 'c' }, { t: b.desc }, { t: b.unit || '', jc: 'c' }, { t: U.money(b.unitPrice), jc: 'r' }, { t: fmtN(U.num(b.qty)), jc: 'c' }, { t: U.money(val), jc: 'r' },
        { t: fmtN(+(U.num(b.qty) * f).toFixed(2)), jc: 'c' }, { t: U.money(dv), jc: 'r' }, { t: (f * 100).toFixed(2) + '%', jc: 'c' }, { t: manual && Math.abs(dv - val) > 0.01 ? 'จ่ายจริงตามใบเสร็จรับเงิน' : '' }]);
    });
    rows.push([{ t: '', cs: 5 }, { t: U.money(tot), jc: 'r', b: 1 }, { t: '' }, { t: U.money(del), jc: 'r', b: 1 }, { t: '' }, { t: '' }]);
    rows.push([{ t: '', cs: 5, nb: 1 }, { t: 'เงินคงเหลือ', jc: 'c', nb: 1 }, { t: '', nb: 1 }, { t: U.money(tot - del), jc: 'r', b: 1 }, { t: '', cs: 2, nb: 1 }]);
    const sz = 28;
    return { size: LAND, blocks: [P([run('บัญชีแสดงปริมาณงานและเงินค่างานที่ขอส่ง' + (o.round ? 'ครั้งที่ ' + o.round : ''), { b: 1, sz: 32 })], { jc: 'center' }),
      P([run('สัญญาจ้างเลขที่ ' + (p.contractNo || p.code) + (p.contractDate ? ' ลงวันที่ ' + U.thDate(p.contractDate) : ''), { sz: sz })], { jc: 'center' })]
      .concat(splitName(p.name || p.shortName).map(function (l) { return P([run(l, { sz: sz })], { jc: 'center' }); }))
      .concat([blank(1, sz), { k: 'table', cols: [700, 5600, 900, 1500, 1000, 1700, 1000, 1700, 1000, 1900], sz: sz, rowH: 400, head: 2, rows: rows }, blank(1, sz),
        tabrow([{ x: 9800, runs: [run('ลงชื่อ ..................................................... ผู้ควบคุมงาน', { sz: sz })] }]),
        P([run('(' + ((p.supervisor || {}).name || '') + ')', { sz: sz })], { jc: 'center', ind: { l: 9800, r: 1800 } }),
        P([run((p.supervisor || {}).position || '', { sz: sz })], { jc: 'center', ind: { l: 9800, r: 1800 } })]) };
  }

  // รายละเอียดการส่งตัวอย่าง (แบบชีต "Check List เอกสารโครงการ")
  function testsPage(p) {
    const tests = App.active('tests').sort(function (a, b) { return String(a.companyDate || a.sampleDate || '').localeCompare(String(b.companyDate || b.sampleDate || '')); });
    const stn = { pending: 'รอผล', pass: 'ผ่าน', fail: 'ไม่ผ่าน', na: '-' };
    const rows = [[{ t: 'ที่', rs: 2, b: 1, jc: 'c', v: 1 }, { t: 'ประเภท', rs: 2, b: 1, jc: 'c', v: 1 }, { t: 'รายการที่ต้องส่งตัวอย่าง', rs: 2, b: 1, jc: 'c', v: 1 },
      { t: 'บริษัทส่งหนังสือ/', b: 1, jc: 'c' }, { t: 'แขวงส่งหนังสือ', rs: 2, b: 1, jc: 'c', v: 1 }, { t: 'สำนัก/เขต', b: 1, jc: 'c' }, { t: 'ลำดับผลทดลอง', rs: 2, b: 1, jc: 'c', v: 1 },
      { t: 'ผล', rs: 2, b: 1, jc: 'c', v: 1 }, { t: 'หมายเหตุ', rs: 2, b: 1, jc: 'c', v: 1 }],
      [{ t: 'ผู้ควบคุมงานส่งหนังสือ', b: 1, jc: 'c' }, { t: 'แขวงฯ อนุมัติ', b: 1, jc: 'c' }]];
    tests.forEach(function (t, i) {
      rows.push([{ t: String(i + 1), jc: 'c' }, { t: t.type || '' }, { t: (t.item || '') + (t.location ? '\n' + t.location : '') }, { t: U.thDate(t.companyDate, 'num'), jc: 'c' },
        { t: U.thDate(t.sentDate, 'num'), jc: 'c' }, { t: U.thDate(t.resultDate, 'num'), jc: 'c' }, { t: t.resultNo || '-', jc: 'c' }, { t: stn[t.status] || 'รอผล', jc: 'c' }, { t: t.note || '' }]);
    });
    const sz = 28;
    return { size: LAND, blocks: [P([run('รายละเอียดการส่งตัวอย่าง ' + (p.contractNo || p.code) + (p.contractDate ? ' ลงวันที่ ' + U.thDate(p.contractDate) : ''), { b: 1, sz: 32 })], { jc: 'center' })]
      .concat(splitName(p.name || p.shortName).map(function (l) { return P([run(l, { sz: sz })], { jc: 'center' }); }))
      .concat([blank(1, sz), { k: 'table', cols: [600, 2200, 4200, 1700, 1600, 1600, 2200, 900, 1500], sz: sz, rowH: 400, head: 2, rows: rows }, blank(2, sz),
        tabrow([{ x: 9000, runs: [run('ลงชื่อ ....................................................... (ผู้ควบคุมงาน)', { sz: sz })] }]),
        P([run('(' + ((p.supervisor || {}).name || '') + ')', { sz: sz })], { jc: 'center', ind: { l: 9000, r: 2600 } }),
        P([run((p.supervisor || {}).position || '', { sz: sz })], { jc: 'center', ind: { l: 9000, r: 2600 } })]) };
  }

  /* ======================= แปลงเป็น HTML (พิมพ์ / PDF) ======================= */
  const pt = function (tw) { return (tw / 20) + 'pt'; };
  function runsHtml(runs, baseSz) {
    // เว้นวรรคหลายช่องแบบ Word (เบราว์เซอร์จะยุบเหลือช่องเดียวถ้าไม่แปลง)
    const sp = function (s) { return s.replace(/ {2,}/g, function (m) { return '&nbsp;'.repeat(m.length); }); };
    return runs.map(function (r) {
      const st = [];
      if (r.sz && r.sz !== baseSz) st.push('font-size:' + (r.sz / 2) + 'pt');
      if (r.b) st.push('font-weight:bold'); if (r.u) st.push('text-decoration:underline');
      const t = sp(esc(r.t)).replace(/\n/g, '<br>');
      return st.length ? '<span style="' + st.join(';') + '">' + t + '</span>' : t;
    }).join('');
  }
  function pStyle(b) {
    const s = ['font-size:' + ((b.sz || 32) / 2) + 'pt'];
    const ind = b.ind || {};
    if (ind.l) s.push('padding-left:' + pt(ind.l)); if (ind.r) s.push('padding-right:' + pt(ind.r));
    if (ind.fl) s.push('text-indent:' + pt(ind.fl)); if (ind.h) s.push('text-indent:-' + pt(ind.h));
    if (b.before) s.push('margin-top:' + pt(b.before)); if (b.after) s.push('margin-bottom:' + pt(b.after));
    s.push('text-align:' + ({ center: 'center', right: 'right', both: 'justify' }[b.jc] || 'left'));
    return s.join(';');
  }
  function blockHtml(b, pg, urls) {
    if (b.k === 'head') {
      return '<img class="krut" src="krut.png" alt="" style="left:' + pt(pg.size.m[3]) + ';top:' + pt(pg.size.m[0] - 174) + '">' +
        '<p style="font-size:28pt;font-weight:bold;text-align:center">บันทึกข้อความ</p><p style="font-size:8pt">&nbsp;</p>';
    }
    if (b.k === 'p') return '<p style="' + pStyle(b) + '">' + (runsHtml(b.runs, b.sz || 32) || '&nbsp;') + '</p>';
    if (b.k === 'blank') { let h = ''; for (let i = 0; i < b.n; i++) h += '<p style="font-size:' + (b.sz / 2) + 'pt">&nbsp;</p>'; return h; }
    if (b.k === 'lbl') {
      return '<p style="font-size:16pt;padding-left:' + pt(b.pos) + ';text-indent:-' + pt(b.pos) + (b.after ? ';margin-bottom:' + pt(b.after) : '') + '">' +
        '<span style="display:inline-block;text-indent:0;min-width:' + pt(b.pos) + ';font-size:' + (b.lsz / 2) + 'pt' + (b.lb ? ';font-weight:bold' : '') + '">' + esc(b.label) + '</span>' + esc(b.text) + '</p>';
    }
    if (b.k === 'tabrow') {
      const cells = b.cells;
      return '<div class="tr" style="font-size:16pt' + (b.before ? ';margin-top:' + pt(b.before) : '') + '">' + cells.map(function (c, i) {
        const w = i < cells.length - 1 ? (cells[i + 1].x - c.x) : null;
        return '<span style="left:' + pt(c.x) + (w ? ';width:' + pt(w) : '') + '">' + (runsHtml(c.runs, 32) || '&nbsp;') + '</span>';
      }).join('') + '&nbsp;</div>';
    }
    if (b.k === 'table') {
      const W = b.cols.reduce(function (s, x) { return s + x; }, 0);
      let h = '<table class="gt" style="width:' + pt(W) + ';font-size:' + (b.sz / 2) + 'pt"><colgroup>' + b.cols.map(function (c) { return '<col style="width:' + pt(c) + '">'; }).join('') + '</colgroup>';
      b.rows.forEach(function (r, ri) {
        h += '<tr style="height:' + pt(b.rowH || 360) + '">' + r.map(function (c) {
          const st = []; if (c.b) st.push('font-weight:bold'); if (c.jc) st.push('text-align:' + ({ c: 'center', r: 'right' }[c.jc] || 'left'));
          if (c.v || ri < (b.head || 0)) st.push('vertical-align:middle'); if (c.nb) st.push('border:none');
          return '<td' + (c.cs ? ' colspan="' + c.cs + '"' : '') + (c.rs ? ' rowspan="' + c.rs + '"' : '') + (st.length ? ' style="' + st.join(';') + '"' : '') + '>' + esc(c.t || '').replace(/\n/g, '<br>') + '</td>';
        }).join('') + '</tr>';
      });
      return h + '</table>';
    }
    if (b.k === 'photos') {
      let h = '<table class="pt" style="font-size:' + (b.sz / 2) + 'pt">';
      for (let i = 0; i < b.items.length; i += b.cols) {
        h += '<tr>';
        for (let j = 0; j < b.cols; j++) {
          const x = b.items[i + j];
          h += '<td style="width:' + (100 / b.cols) + '%">' + (x ? '<div class="cap">' + esc([U.thDate(x.date, 'short'), x.desc || x.category, x.km ? 'กม.' + x.km : '', x.side].filter(Boolean).join(' · ')) + '</div>' +
            '<img src="' + esc(urls[x.id] || '') + '" style="height:' + pt(b.imgH) + '">' : '') + '</td>';
        }
        h += '</tr>';
      }
      return h + '</table>';
    }
    return '';
  }
  async function photoUrls(pages) {
    // ขอทุกรูปพร้อมกัน — ชั้นไฟล์จะรวมเป็นคำขอชุดเดียว (รูปจาก Google Drive โหลดทีละรูปจะช้า)
    const items = [];
    for (const pg of pages) for (const b of pg.blocks) if (b.k === 'photos') for (const x of b.items) items.push(x);
    const got = await Promise.all(items.map(function (x) { return FBL.fileUrl(x.path); }));
    const urls = {};
    items.forEach(function (x, i) { urls[x.id] = got[i]; });
    return urls;
  }
  async function toHtml(pages, title) {
    const urls = await photoUrls(pages);
    const named = function (s) { return s === LAND ? 'land' : (s === PHOTO ? 'photo' : 'memo'); };
    const css =
      '@page memo{size:A4 portrait;margin:' + [0, 1, 2, 3].map(function (i) { return pt(PORTRAIT.m[i]); }).join(' ') + '}' +
      '@page land{size:A4 landscape;margin:' + [0, 1, 2, 3].map(function (i) { return pt(LAND.m[i]); }).join(' ') + '}' +
      '@page photo{size:A4 portrait;margin:' + [0, 1, 2, 3].map(function (i) { return pt(PHOTO.m[i]); }).join(' ') + '}' +
      // Chrome หา "TH SarabunIT๙" ด้วยชื่อสกุลฟอนต์ไม่เจอ ต้องเรียกด้วยชื่อ PostScript (THSarabunIT๙) ผ่าน local()
      '@font-face{font-family:"DocIT9";src:local("THSarabunIT๙"),local("' + FONT + '");font-weight:400}' +
      '@font-face{font-family:"DocIT9";src:local("THSarabunIT๙-Bold"),local("' + FONT + ' Bold");font-weight:700}' +
      '*{box-sizing:border-box}body{margin:0;font-family:"DocIT9","' + FONT + '","TH SarabunPSK","TH Sarabun New","Sarabun",sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'p{margin:0;line-height:1.2;overflow-wrap:anywhere}.pg{position:relative;break-after:page}.pg:last-child{break-after:auto}.pg.memo{page:memo}.pg.land{page:land}.pg.photo{page:photo}' +
      '.krut{position:absolute;width:45.35pt;height:45.35pt}' +
      '.tr{position:relative;line-height:1.2;white-space:nowrap}.tr>span{position:absolute;bottom:0;white-space:nowrap}' +
      'table.gt{border-collapse:collapse;margin:0 auto;table-layout:fixed;line-height:1.1}table.gt td{border:1px solid #000;padding:0 3pt;vertical-align:top;overflow:hidden;overflow-wrap:anywhere}' +
      'table.pt{width:100%;border-collapse:collapse;table-layout:fixed}table.pt td{text-align:center;vertical-align:top;padding:2pt 4pt 8pt}table.pt img{max-width:100%;object-fit:contain;border:1px solid #888}table.pt .cap{min-height:18pt;margin-bottom:2pt}' +
      '@media screen{body{background:#dfe6f0;padding:10px 0}.pg{background:#fff;margin:0 auto 12px;box-shadow:0 2px 8px rgba(0,0,0,.25)}' +
      '.pg.memo,.pg.photo{width:210mm;min-height:297mm}.pg.land{width:297mm;min-height:210mm}}' +
      '@media print{.pg{padding:0!important}}';
    const body = pages.map(function (pg) {
      const m = pg.size.m;
      return '<div class="pg ' + named(pg.size) + '" style="padding:' + [m[0], m[1], m[2], m[3]].map(pt).join(' ') + '">' +
        pg.blocks.map(function (b) { return blockHtml(b, { size: { m: [0, 0, 0, 0].map(function (_, i) { return m[i]; }) } }, urls); }).join('') + '</div>';
    }).join('');
    // ตำแหน่งครุฑคำนวณจากขอบกระดาษ — ตอนพิมพ์ padding เป็น 0 จึงต้องชดเชยด้วย CSS
    const krutFix = '@media print{.pg .krut{left:0!important;top:-8.7pt!important}}';
    return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + esc(title || 'เอกสาร') + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap"><style>' + css + krutFix + '</style></head><body>' + body + '</body></html>';
  }

  /* ======================= แปลงเป็น Word (.docx) ======================= */
  function x(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function rPr(r, baseSz) {
    const sz = r.sz || baseSz || 32;
    return '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/>' + (r.b ? '<w:b/><w:bCs/>' : '') + (r.u ? '<w:u w:val="single"/>' : '') +
      '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr>';
  }
  function runX(r, baseSz) {
    return String(r.t).split('\n').map(function (seg, i) {
      return (i ? '<w:r>' + rPr(r, baseSz) + '<w:br/></w:r>' : '') + (seg ? '<w:r>' + rPr(r, baseSz) + '<w:t xml:space="preserve">' + x(seg) + '</w:t></w:r>' : '');
    }).join('');
  }
  function pPrX(o) {
    const ind = o.ind || {};
    let s = '<w:pPr>';
    if (o.tabs && o.tabs.length) s += '<w:tabs>' + o.tabs.map(function (t) { return '<w:tab w:val="left" w:pos="' + t + '"/>'; }).join('') + '</w:tabs>';
    s += '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after || 0) + '" w:line="240" w:lineRule="auto"/>';
    if (ind.l || ind.r || ind.fl || ind.h) s += '<w:ind' + (ind.l ? ' w:left="' + ind.l + '"' : '') + (ind.r ? ' w:right="' + ind.r + '"' : '') + (ind.fl ? ' w:firstLine="' + ind.fl + '"' : '') + (ind.h ? ' w:hanging="' + ind.h + '"' : '') + '/>';
    s += '<w:jc w:val="' + ({ center: 'center', right: 'right', both: 'thaiDistribute' }[o.jc] || 'left') + '"/>';
    s += '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/><w:sz w:val="' + (o.sz || 32) + '"/><w:szCs w:val="' + (o.sz || 32) + '"/></w:rPr>';
    return s + '</w:pPr>';
  }
  const EMU = 635;   // 1 twip = 635 EMU
  function drawingInline(rid, id, cx, cy) {
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="Picture ' + id + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Picture ' + id + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
  // ครุฑแบบลอย ชิดขอบซ้าย เลื่อนขึ้น 0.31 ซม. ขนาด 1.6 ซม. (ค่าเดียวกับไฟล์ Word จริง)
  function drawingKrut(rid, id) {
    return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">' +
      '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="margin"><wp:align>left</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-110490</wp:posOffset></wp:positionV>' +
      '<wp:extent cx="576000" cy="576000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + id + '" name="Krut ' + id + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="krut.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="576000" cy="576000"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
  }
  function tableX(b) {
    const W = b.cols.reduce(function (s, v) { return s + v; }, 0);
    let s = '<w:tbl><w:tblPr><w:tblW w:w="' + W + '" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (e) { return '<w:' + e + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>'; }).join('') +
      '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      b.cols.map(function (c) { return '<w:gridCol w:w="' + c + '"/>'; }).join('') + '</w:tblGrid>';
    const carry = [];   // carry[col] = { left: แถวที่เหลือ, span }
    b.rows.forEach(function (r, ri) {
      s += '<w:tr><w:trPr><w:trHeight w:val="' + (b.rowH || 360) + '"/>' + (ri < (b.head || 0) ? '<w:tblHeader/>' : '') + '</w:trPr>';
      let col = 0, ci = 0;
      const emitCont = function () {
        while (carry[col] && carry[col].left > 0) {
          const cc = carry[col]; cc.left--;
          const w = b.cols.slice(col, col + cc.span).reduce(function (a, v) { return a + v; }, 0);
          s += '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (cc.span > 1 ? '<w:gridSpan w:val="' + cc.span + '"/>' : '') + '<w:vMerge/></w:tcPr><w:p>' + pPrX({ sz: b.sz }) + '</w:p></w:tc>';
          col += cc.span;
        }
      };
      emitCont();
      while (ci < r.length && col < b.cols.length) {
        const c = r[ci++]; const span = c.cs || 1;
        const w = b.cols.slice(col, col + span).reduce(function (a, v) { return a + v; }, 0);
        if (c.rs > 1) carry[col] = { left: c.rs - 1, span: span };
        const vc = c.v || ri < (b.head || 0);
        s += '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') + (c.rs > 1 ? '<w:vMerge w:val="restart"/>' : '') +
          (c.nb ? '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>' : '') + (vc ? '<w:vAlign w:val="center"/>' : '') + '</w:tcPr>' +
          String(c.t || '').split('\n').map(function (line) {
            return '<w:p>' + pPrX({ sz: b.sz, jc: { c: 'center', r: 'right' }[c.jc] }) + runX(run(line, { b: c.b }), b.sz) + '</w:p>';
          }).join('') + '</w:tc>';
        col += span;
        emitCont();
      }
      s += '</w:tr>';
    });
    return s + '</w:tbl>';
  }
  async function toDocx(pages) {
    await photoUrls(pages);   // โหลดรูปทั้งหมดล่วงหน้าพร้อมกัน ด้านล่างจึงได้จากแคชทันที
    if (typeof JSZip === 'undefined') {
      await new Promise(function (res, rej) {
        const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        sc.onload = res; sc.onerror = function () { rej(new Error('โหลดตัวสร้างไฟล์ Word ไม่สำเร็จ (ตรวจอินเทอร์เน็ต)')); }; document.head.appendChild(sc);
      });
    }
    const zip = new JSZip();
    const media = []; let did = 1;
    function addMedia(data, ext) { const id = 'rIdM' + (media.length + 1); media.push({ id: id, name: 'image' + (media.length + 1) + '.' + ext, data: data }); return id; }
    let krutRid = null;
    async function krut() { if (!krutRid) krutRid = addMedia(new Uint8Array(await (await fetch('krut.png')).arrayBuffer()), 'png'); return krutRid; }
    let body = '';
    for (let pi = 0; pi < pages.length; pi++) {
      const pg = pages[pi];
      for (const b of pg.blocks) {
        if (b.k === 'head') {
          const rid = await krut();
          body += '<w:p>' + pPrX({ jc: 'center', sz: 56 }) + drawingKrut(rid, did++) + runX(run('บันทึกข้อความ', { b: 1, sz: 56 }), 56) + '</w:p>';
          body += '<w:p>' + pPrX({ jc: 'center', sz: 16 }) + '</w:p>';
        } else if (b.k === 'p') {
          body += '<w:p>' + pPrX(Object.assign({}, b, { sz: b.sz || 32 })) + b.runs.map(function (r) { return runX(r, b.sz || 32); }).join('') + '</w:p>';
        } else if (b.k === 'blank') {
          for (let i = 0; i < b.n; i++) body += '<w:p>' + pPrX({ sz: b.sz }) + '</w:p>';
        } else if (b.k === 'lbl') {
          body += '<w:p>' + pPrX({ ind: { l: b.pos, h: b.pos }, tabs: [b.pos], after: b.after }) + runX(run(b.label, { b: b.lb, sz: b.lsz }), 32) + '<w:r><w:tab/></w:r>' + runX(run(b.text), 32) + '</w:p>';
        } else if (b.k === 'tabrow') {
          const tabs = b.cells.map(function (c) { return c.x; }).filter(function (v) { return v > 0; });
          body += '<w:p>' + pPrX({ tabs: tabs, before: b.before }) + b.cells.map(function (c, i) {
            return (c.x > 0 ? '<w:r><w:tab/></w:r>' : '') + c.runs.map(function (r) { return runX(r, 32); }).join('');
          }).join('') + '</w:p>';
        } else if (b.k === 'table') {
          body += tableX(b) + '<w:p>' + pPrX({ sz: 4 }) + '</w:p>';
        } else if (b.k === 'photos') {
          const inner = pg.size.w - pg.size.m[1] - pg.size.m[3];
          const cw = Math.floor(inner / b.cols);
          let t = '<w:tbl><w:tblPr><w:tblW w:w="' + inner + '" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' +
            Array(b.cols).fill('<w:gridCol w:w="' + cw + '"/>').join('') + '</w:tblGrid>';
          for (let i = 0; i < b.items.length; i += b.cols) {
            t += '<w:tr>';
            for (let j = 0; j < b.cols; j++) {
              const it = b.items[i + j];
              let cell = '';
              if (it) {
                const url = await FBL.fileUrl(it.path);
                let img = '';
                if (url) {
                  const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
                  const rid = addMedia(data, 'jpg');
                  const maxW = cw - 200, maxH = b.imgH;
                  const r = (it.width && it.height) ? it.width / it.height : 4 / 3;
                  let w = maxW, h = Math.round(maxW / r); if (h > maxH) { h = maxH; w = Math.round(maxH * r); }
                  img = drawingInline(rid, did++, w * EMU, h * EMU);
                }
                const cap = [U.thDate(it.date, 'short'), it.desc || it.category, it.km ? 'กม.' + it.km : '', it.side].filter(Boolean).join(' · ');
                cell = '<w:p>' + pPrX({ jc: 'center', sz: b.sz }) + runX(run(cap), b.sz) + '</w:p><w:p>' + pPrX({ jc: 'center', after: 160 }) + img + '</w:p>';
              } else cell = '<w:p/>';
              t += '<w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/></w:tcPr>' + cell + '</w:tc>';
            }
            t += '</w:tr>';
          }
          body += t + '</w:tbl>';
        }
      }
      // จบหน้า = จบ section (กำหนดแนวกระดาษ/ขอบของแต่ละหน้าได้อิสระ)
      const s = pg.size;
      const sect = '<w:sectPr><w:pgSz w:w="' + s.w + '" w:h="' + s.h + '"' + (s.w > s.h ? ' w:orient="landscape"' : '') + '/>' +
        '<w:pgMar w:top="' + s.m[0] + '" w:right="' + s.m[1] + '" w:bottom="' + s.m[2] + '" w:left="' + s.m[3] + '" w:header="709" w:footer="709" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>';
      if (pi < pages.length - 1) body += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="14" w:lineRule="exact"/>' + sect + '<w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
      else body += sect;
    }
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' + body + '</w:body></w:document>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/><w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    const settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      media.map(function (m) { return '<Relationship Id="' + m.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>'; }).join('') + '</Relationships>');
    zip.file('word/document.xml', doc);
    zip.file('word/styles.xml', styles);
    zip.file('word/settings.xml', settings);
    media.forEach(function (m) { zip.file('word/media/' + m.name, m.data); });
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  return {
    PORTRAIT: PORTRAIT, LAND: LAND, contractPara: contractPara, ccList: ccList, stripTitle: stripTitle, splitName: splitName,
    memoPages: memoPages, weeklySummaryPage: weeklySummaryPage, dailyFormPages: dailyFormPages, photoPages: photoPages,
    monthlyPage: monthlyPage, deliveryPage: deliveryPage, testsPage: testsPage, toHtml: toHtml, toDocx: toDocx
  };
})();
