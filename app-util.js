/* ==========================================================================
   app-util.js — ตัวช่วยและตัวคำนวณของระบบ (ไม่ยุ่งกับหน้าจอ)
   วันที่เก็บเป็น 'YYYY-MM-DD' (ค.ศ.) แสดงผลเป็น พ.ศ.
   ========================================================================== */
window.U = (function () {
  'use strict';

  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ---------- วันที่ ---------- */
  function parse(iso) {
    if (!iso) return null;
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function iso(d) {
    if (!d) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() { return iso(new Date()); }
  function addDays(s, n) { const d = parse(s); if (!d) return ''; d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { // b - a (วัน)
    const da = parse(a), db = parse(b); if (!da || !db) return 0;
    return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
  }
  function dow(s) { const d = parse(s); return d ? d.getDay() : 0; }
  function thDate(s, style) {
    const d = parse(s); if (!d) return '';
    const y = d.getFullYear() + 543;
    if (style === 'short') return d.getDate() + ' ' + TH_MON[d.getMonth()] + ' ' + String(y).slice(-2);
    if (style === 'num') return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + y;
    if (style === 'dm') return d.getDate() + ' ' + TH_MON[d.getMonth()];
    return d.getDate() + ' ' + TH_MONTHS[d.getMonth()] + ' ' + y;
  }
  // ช่วงวันที่แบบย่อ: "2 - 8 มี.ค. 69" / "26 ม.ค. - 1 ก.พ. 69"
  function thRange(a, b, full) {
    if (!a) return '';
    if (!b || a === b) return thDate(a, full ? '' : 'short');
    const da = parse(a), db = parse(b);
    if (full) return thDate(a) + ' – ' + thDate(b);
    if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()) return da.getDate() + ' - ' + thDate(b, 'short');
    if (da.getFullYear() === db.getFullYear()) return thDate(a, 'dm') + ' - ' + thDate(b, 'short');
    return thDate(a, 'short') + ' - ' + thDate(b, 'short');
  }
  function thMonth(ym) { // '2026-03' → 'มีนาคม 2569'
    const m = String(ym || '').match(/^(\d{4})-(\d{2})/); if (!m) return '';
    return TH_MONTHS[+m[2] - 1] + ' ' + (+m[1] + 543);
  }
  function thMonthShort(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})/); if (!m) return '';
    return TH_MON[+m[2] - 1] + ' ' + String(+m[1] + 543).slice(-2);
  }
  function thDow(s) { return TH_DOW[dow(s)]; }
  function fiscalYear(s) { const d = parse(s); if (!d) return ''; return d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0); }

  /* ---------- ตัวเลข / กม. ---------- */
  function num(v) { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function money(v, dec) { return num(v).toLocaleString('th-TH', { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec }); }
  function pct(v, dec) { return (isFinite(v) ? v : 0).toFixed(dec === undefined ? 2 : dec) + '%'; }
  // "241+420" / "241.420" / 241420 → เมตร
  function kmToM(s) {
    if (s === null || s === undefined || s === '') return null;
    const t = String(s).trim().replace(/^กม\.?\s*/, '');
    let m = t.match(/^(\d+)\s*\+\s*(\d{1,3})$/);
    if (m) return +m[1] * 1000 + +m[2];
    m = t.match(/^(\d+)\.(\d+)$/);
    if (m) return Math.round(parseFloat(t) * 1000);
    if (/^\d+$/.test(t)) return +t >= 1000 ? +t : +t * 1000;
    return null;
  }
  function fmtKm(meters) {
    if (meters === null || meters === undefined || meters === '' || !isFinite(meters)) return '';
    const k = Math.floor(meters / 1000), r = Math.round(meters - k * 1000);
    return k + '+' + String(r).padStart(3, '0');
  }

  /* ---------- สัญญา ---------- */
  function contract(p) {
    const start = p.startDate || '';
    const days = num(p.days);
    const ext = (p.extensions || []).reduce(function (s, e) { return s + num(e.days); }, 0);
    const end = start && days ? addDays(start, days - 1) : '';
    const endExt = start && days ? addDays(start, days + ext - 1) : '';
    const value = num(p.value);
    const finePerDay = num(p.finePerDay) || (value ? value * 0.0025 : 0);
    const q1 = start && days ? addDays(start, Math.ceil(days / 4) - 1) : '';
    const q2 = start && days ? addDays(start, Math.ceil(days / 2) - 1) : '';
    const t = today();
    const refDay = p.completedDate || t;
    const elapsed = start ? Math.max(0, Math.min(diffDays(start, refDay) + 1, days + ext)) : 0;
    const late = endExt && p.completedDate ? Math.max(0, diffDays(endExt, p.completedDate)) : (endExt ? Math.max(0, diffDays(endExt, t)) : 0);
    return { start: start, days: days, ext: ext, end: end, endExt: endExt, value: value, finePerDay: finePerDay,
      q1: q1, q2: q2, elapsed: elapsed, totalDays: days + ext, late: late, fine: late * finePerDay,
      remaining: endExt ? diffDays(t, endExt) : 0 };
  }

  function boqTotal(p) { return (p.boq || []).reduce(function (s, b) { return s + num(b.qty) * num(b.unitPrice); }, 0); }

  /* แผนงานสะสม (%) ณ วันที่ d
     p.plan = [{ month:'2025-12', pct: 11.295 }] (ร้อยละรายเดือน) — กระจายเท่าๆ กันตามจำนวนวันสัญญาในเดือนนั้น
     ไม่มีแผน → เส้นตรงตลอดอายุสัญญา */
  function planCum(p, d) {
    const c = contract(p);
    if (!c.start || !c.days || !d) return 0;
    if (d < c.start) return 0;
    if (d >= c.end) return 100;
    const plan = (p.plan || []).filter(function (x) { return x.month && num(x.pct) > 0; });
    if (!plan.length) return Math.min(100, (diffDays(c.start, d) + 1) / c.days * 100);
    let sum = 0;
    for (let i = 0; i < plan.length; i++) {
      const ym = plan[i].month;
      const mStart = ym + '-01';
      const mEnd = iso(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0));
      const a = mStart > c.start ? mStart : c.start;
      const b = mEnd < c.end ? mEnd : c.end;
      const daysIn = diffDays(a, b) + 1;
      if (daysIn <= 0) { if (d >= mStart) sum += num(plan[i].pct); continue; }
      if (d >= b) sum += num(plan[i].pct);
      else if (d >= a) sum += num(plan[i].pct) * (diffDays(a, d) + 1) / daysIn;
    }
    return Math.min(100, sum);
  }

  /* ผลงานจริงสะสม (%) ณ วันที่ d — คิดตามมูลค่า BOQ
     - รายการที่ track='units' : ใช้ทะเบียนชิ้นงาน × น้ำหนักขั้นตอน
     - รายการ manual           : ใช้ progress [{date, pct}] ล่าสุดที่ไม่เกินวันที่ d */
  function itemFraction(p, item, units, d) {
    if (item.track === 'units') {
      const us = (units || []).filter(function (u) { return !u.deletedAt; });
      if (!us.length) return 0;
      const stages = p.stages || [];
      const wsum = stages.reduce(function (s, x) { return s + num(x.weight); }, 0) || 1;
      let f = 0;
      stages.forEach(function (st) {
        const done = us.filter(function (u) { const v = u.stages && u.stages[st.key]; return v && v <= d; }).length;
        f += (num(st.weight) / wsum) * (done / us.length);
      });
      return f;
    }
    let best = null;
    (item.progress || []).forEach(function (x) { if (x.date && x.date <= d && (!best || x.date >= best.date)) best = x; });
    return best ? Math.min(1, num(best.pct) / 100) : 0;
  }
  function actualCum(p, units, d) {
    const total = boqTotal(p);
    if (!total) return 0;
    let done = 0;
    (p.boq || []).forEach(function (b) { done += num(b.qty) * num(b.unitPrice) * itemFraction(p, b, units, d); });
    return done / total * 100;
  }
  function actualValue(p, units, d) { return actualCum(p, units, d) / 100 * boqTotal(p); }

  /* ---------- รอบรายงาน ---------- */
  // คืน { threeDay, weeks:[{n,from,to,due,key}], months:[{ym,from,to,due,key}] }
  function periods(p) {
    const c = contract(p);
    if (!c.start || !c.days) return { threeDay: null, weeks: [], months: [] };
    const last = p.completedDate && p.completedDate < c.endExt ? p.completedDate : c.endExt;
    const threeDay = { key: '3day', from: c.start, to: addDays(c.start, 2), due: addDays(c.start, 3) };
    const weeks = [];
    let from = addDays(c.start, 3), n = 1;
    while (from <= last) {
      let to = addDays(from, (7 - dow(from)) % 7); // ถึงวันอาทิตย์
      if (to > last) to = last;
      weeks.push({ key: 'w' + n, n: n, from: from, to: to, due: addDays(to, 1) });
      from = addDays(to, 1); n++;
      if (n > 400) break;
    }
    const months = [];
    let mFrom = c.start;
    while (mFrom <= last) {
      const d = parse(mFrom);
      let cut = iso(new Date(d.getFullYear(), d.getMonth(), 25));
      if (cut < mFrom) cut = iso(new Date(d.getFullYear(), d.getMonth() + 1, 25));
      const to = cut > last ? last : cut;
      const ym = cut.slice(0, 7);   // ตั้งชื่อตามเดือนของวันตัดยอด (25) — ช่วงท้ายสัญญาจะไม่ซ้ำกับเดือนก่อน
      months.push({ key: 'm' + ym, ym: ym, from: mFrom, to: to, due: addDays(cut, 1) });
      mFrom = addDays(to, 1);
      if (months.length > 60) break;
    }
    return { threeDay: threeDay, weeks: weeks, months: months };
  }

  /* ---------- เลขที่หนังสือ ---------- */
  // prefix เช่น "รย.23/2569" → เลขถัดไปจากทะเบียนหนังสือออก
  function nextDocNo(p, docs) {
    const prefix = (p.docPrefix || p.code || '').trim();
    let max = 0;
    (docs || []).forEach(function (d) {
      if (d.deletedAt || d.type !== 'out') return;
      const m = String(d.no || '').match(/\/\s*(\d+)(?:\.\d+)?\s*$/);
      if (m && String(d.no).replace(/\s/g, '').indexOf(prefix.replace(/\s/g, '')) === 0) max = Math.max(max, +m[1]);
    });
    return prefix ? prefix + '/' + (max + 1) : String(max + 1);
  }

  /* ---------- รูปภาพ: ย่อขนาด + อ่าน EXIF ---------- */
  function readExif(buf) {
    const out = {};
    try {
      const v = new DataView(buf);
      if (v.getUint16(0) !== 0xFFD8) return out;
      let off = 2;
      while (off < v.byteLength - 4) {
        const marker = v.getUint16(off);
        const len = v.getUint16(off + 2);
        if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) { parseTiff(v, off + 10, out); break; }
        if ((marker & 0xFF00) !== 0xFF00) break;
        off += 2 + len;
      }
    } catch (e) { /* ไม่มี EXIF */ }
    return out;
  }
  function parseTiff(v, t, out) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = function (o) { return v.getUint16(t + o, le); };
    const u32 = function (o) { return v.getUint32(t + o, le); };
    const str = function (o, n) { let s = ''; for (let i = 0; i < n - 1; i++) { const c = v.getUint8(t + o + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
    const rat = function (o) { const a = u32(o), b = u32(o + 4); return b ? a / b : 0; };
    function ifd(o, cb) {
      const n = u16(o);
      for (let i = 0; i < n; i++) {
        const e = o + 2 + i * 12;
        const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type] || 1;
        const valOff = cnt * size <= 4 ? e + 8 : u32(e + 8);
        cb(tag, type, cnt, valOff, e);
      }
    }
    let exifPtr = 0, gpsPtr = 0;
    ifd(u32(4), function (tag, type, cnt, vo, e) {
      if (tag === 0x010F) out.make = str(vo, cnt);
      if (tag === 0x0110) out.model = str(vo, cnt);
      if (tag === 0x0131) out.software = str(vo, cnt);
      if (tag === 0x0132 && !out.dateTime) out.dateTime = str(vo, cnt);
      if (tag === 0x8769) exifPtr = u32(e + 8);
      if (tag === 0x8825) gpsPtr = u32(e + 8);
    });
    if (exifPtr) ifd(exifPtr, function (tag, type, cnt, vo) { if (tag === 0x9003) out.dateTime = str(vo, cnt); });
    if (gpsPtr) {
      const g = {};
      ifd(gpsPtr, function (tag, type, cnt, vo, e) {
        if (tag === 1) g.latRef = String.fromCharCode(v.getUint8(e + 8));
        if (tag === 3) g.lngRef = String.fromCharCode(v.getUint8(e + 8));
        if (tag === 2) g.lat = rat(vo) + rat(vo + 8) / 60 + rat(vo + 16) / 3600;
        if (tag === 4) g.lng = rat(vo) + rat(vo + 8) / 60 + rat(vo + 16) / 3600;
      });
      if (g.lat && g.lng) {
        out.lat = +(g.latRef === 'S' ? -g.lat : g.lat).toFixed(6);
        out.lng = +(g.lngRef === 'W' ? -g.lng : g.lng).toFixed(6);
      }
    }
    if (out.dateTime) {
      const m = out.dateTime.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
      if (m) { out.date = m[1] + '-' + m[2] + '-' + m[3]; out.time = m[4] + ':' + m[5]; }
    }
  }
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปไม่ได้: ' + file.name)); };
      img.src = url;
    });
  }
  function toJpeg(img, maxSide, quality) {
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
    return new Promise(function (resolve) { cv.toBlob(function (b) { resolve({ blob: b, w: w, h: h }); }, 'image/jpeg', quality); });
  }
  // คืน { full, thumb, exif, width, height }
  async function processPhoto(file) {
    const buf = await file.arrayBuffer();
    const exif = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name) ? readExif(buf) : {};
    const li = await loadImage(file);
    try {
      const full = await toJpeg(li.img, 1280, 0.72);   // ~150–250 KB ประหยัดโควตาฟรี 1 GB ของ Firestore
      const thumb = await toJpeg(li.img, 360, 0.65);   // ~15–25 KB สำหรับหน้าคลังรูป
      return { full: full.blob, thumb: thumb.blob, exif: exif, width: full.w, height: full.h };
    } finally { URL.revokeObjectURL(li.url); }
  }
  // รูปย่อจากรูปที่อัปโหลดไว้แล้ว (ใช้สร้างรูปย่อให้รูปเดิมที่ยังไม่มี)
  async function makeThumb(blob) {
    const li = await loadImage(blob);
    try { return (await toJpeg(li.img, 360, 0.65)).blob; } finally { URL.revokeObjectURL(li.url); }
  }

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120); }

  return {
    TH_MONTHS: TH_MONTHS, TH_MON: TH_MON, esc: esc, parse: parse, iso: iso, today: today, addDays: addDays, diffDays: diffDays,
    dow: dow, thDate: thDate, thRange: thRange, thMonth: thMonth, thMonthShort: thMonthShort, thDow: thDow, fiscalYear: fiscalYear,
    num: num, money: money, pct: pct, kmToM: kmToM, fmtKm: fmtKm, contract: contract, boqTotal: boqTotal,
    planCum: planCum, actualCum: actualCum, actualValue: actualValue, itemFraction: itemFraction, periods: periods,
    nextDocNo: nextDocNo, readExif: readExif, processPhoto: processPhoto, makeThumb: makeThumb, download: download, safeName: safeName
  };
})();
