/* ==========================================================================
   firebase-layer.js — ชั้นเชื่อมต่อข้อมูล (Authentication + Firestore · รูป/ไฟล์เก็บใน Google Drive ผ่าน drive-bridge.gs
                       ไม่ต้องใช้แพ็กเกจ Blaze — ถ้ายังไม่ตั้ง DRIVE_BRIDGE_URL จะเก็บใน Firestore แบบเดิม)
   ระบบควบคุมงานโครงการ หมวดทางหลวงเชิงเนิน แขวงทางหลวงระยอง

   ใช้โครงเดียวกับระบบงานอุบัติเหตุ:
     - ล็อกอินด้วยชื่อ + รหัสผ่าน (อีเมลสังเคราะห์ ...@project.invalid ไม่มีการส่งอีเมลจริง)
     - เจ้าของระบบคนแรกตั้งได้ครั้งเดียว (config/bootstrap) แล้วประตูปิดถาวร
     - สิทธิ์บังคับที่ firestore.rules ไม่ใช่แค่ซ่อนปุ่ม
     - ทุกการเขียนบันทึก activity_log ในคำสั่งเดียวกัน (atomic batch)

   มี 2 โหมด
     1) firebase — เมื่อใส่ firebaseConfig จริงแล้ว
     2) demo     — ยังไม่ได้ใส่ config หรือเปิดด้วย ?demo=1 : เก็บข้อมูลในเบราว์เซอร์เครื่องนี้เท่านั้น
                   (ใช้ทดลองหน้าจอก่อนตั้งค่า Firebase — ข้อมูลไม่ออกนอกเครื่อง)

   หมายเหตุ: ค่า firebaseConfig เป็นค่าสาธารณะโดยออกแบบ (ไม่ใช่รหัสลับ) ความปลอดภัยจริงอยู่ที่ไฟล์ rules
   ========================================================================== */
(function () {
  'use strict';

  // ▼▼▼ วางค่าจาก Firebase Console → Project settings → Your apps → SDK setup and configuration ▼▼▼
  const firebaseConfig = {
    apiKey: "AIzaSyCbItTxZa9nbBbmCp0vwzUAvKeMdV--Aok",
    authDomain: "choengnoen-project.firebaseapp.com",
    projectId: "choengnoen-project",
    storageBucket: "choengnoen-project.firebasestorage.app",
    messagingSenderId: "694075265572",
    appId: "1:694075265572:web:14109f2bc45f53285ebeb1"
  };
  // ▲▲▲ ------------------------------------------------------------------------------------ ▲▲▲

  // ▼▼▼ วาง URL ของ drive-bridge (Apps Script → Deploy → Web app ลงท้ายด้วย /exec) ▼▼▼
  //     เว้นว่าง = เก็บรูป/ไฟล์ใน Firestore แบบเดิม (พื้นที่ฟรีรวม 1 GB)
  const DRIVE_BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbzkhJTRPGBtYsaS7oiuo-eMjSKLCYgkJalxebDJUBfrjoNDEVx4MrSGFvpuir8l8S7e/exec';
  // ▲▲▲ ------------------------------------------------------------------------------------ ▲▲▲

  const EMAIL_DOMAIN = 'project.invalid';
  const SUBS = ['daily', 'docs', 'tests', 'units', 'photos', 'safety'];

  const params = new URLSearchParams(location.search);
  const configured = /^AIza/.test(firebaseConfig.apiKey || '');
  const DEMO = params.has('demo') || !configured || typeof firebase === 'undefined';

  const FBL = { mode: DEMO ? 'demo' : 'firebase', user: null, onError: null, SUBS: SUBS };
  window.FBL = FBL;

  /* ---------- ตัวช่วยทั่วไป ---------- */
  function thErr(e) {
    const code = (e && e.code) || '';
    const map = {
      'auth/invalid-credential': 'รหัสผ่านไม่ถูกต้อง',
      'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
      'auth/invalid-login-credentials': 'รหัสผ่านไม่ถูกต้อง',
      'auth/user-not-found': 'ไม่พบบัญชีนี้ในระบบ',
      'auth/too-many-requests': 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
      'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจสอบสัญญาณแล้วลองใหม่',
      'auth/weak-password': 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร',
      'auth/email-already-in-use': 'เกิดบัญชีซ้ำโดยบังเอิญ กรุณาลองอีกครั้ง',
      'auth/requires-recent-login': 'กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ก่อนเปลี่ยนรหัสผ่าน',
      'auth/operation-not-allowed': 'ยังไม่ได้เปิดการเข้าสู่ระบบแบบ Email/Password ใน Firebase Console',
      'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase (Authentication → Settings → Authorized domains)',
      'permission-denied': 'ไม่มีสิทธิ์ทำรายการนี้ (ตรวจสอบว่าได้วางกฎ firestore.rules ชุดล่าสุดแล้ว และล็อกอินด้วยบัญชีที่มีสิทธิ์)',
      'resource-exhausted': 'เกินโควตาฟรีของ Firestore (พื้นที่ 1 GB หรือจำนวนครั้งต่อวัน) — ส่งออกและลบโครงการเก่า หรือรอวันถัดไป',
      'storage/unauthorized': 'ไม่มีสิทธิ์อัปโหลด/เปิดไฟล์ (ตรวจสอบว่าได้วางกฎ storage.rules แล้ว)',
      'storage/quota-exceeded': 'พื้นที่เก็บไฟล์เต็ม หรือยังไม่ได้เปิดแพ็กเกจ Blaze',
      'storage/retry-limit-exceeded': 'อัปโหลดไม่สำเร็จ สัญญาณอินเทอร์เน็ตไม่เสถียร',
      'storage/object-not-found': 'ไม่พบไฟล์ (อาจถูกลบไปแล้ว)',
      'unavailable': 'เชื่อมต่อฐานข้อมูลไม่ได้ในขณะนี้ กรุณาลองใหม่',
      'failed-precondition': 'ฐานข้อมูลไม่พร้อมทำรายการนี้'
    };
    return map[code] || ((e && e.message) ? e.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
  }
  FBL.errorText = thErr;

  function nowIso() { return new Date().toISOString(); }
  function randomId(n) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, n);
  }
  FBL.newId = function () { return Date.now().toString(36) + randomId(6); };
  function newEmail() { return 'm-' + randomId(12) + '@' + EMAIL_DOMAIN; }
  // Firestore ไม่รับ undefined / NaN / Infinity — ล้างแบบลึก
  function clean(v) {
    if (v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && !(v instanceof Date) && !(v && v._methodName)) {
      const out = {};
      Object.keys(v).forEach(function (k) { if (v[k] !== undefined && k !== '__id') out[k] = clean(v[k]); });
      return out;
    }
    return v;
  }
  FBL.clean = clean;
  function requireOwner() { if (!FBL.user || !FBL.user.isOwner) throw new Error('เฉพาะเจ้าของระบบเท่านั้น'); }
  function requirePrivileged() { if (!FBL.user || !(FBL.user.isOwner || FBL.user.isAdmin)) throw new Error('เฉพาะเจ้าของระบบหรือผู้ดูแลระบบเท่านั้น'); }
  function sortTeam(t) {
    t.sort(function (a, b) { return (b.isOwner ? 1 : 0) - (a.isOwner ? 1 : 0) || String(a.name).localeCompare(String(b.name), 'th'); });
    return t;
  }

  let team = [];
  FBL.team = function () { return team.slice(); };

  if (DEMO) setupDemo(); else setupFirebase();

  /* ======================================================================
     โหมด Firebase
     ====================================================================== */
  function setupFirebase() {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    try {
      db.enablePersistence({ synchronizeTabs: true }).catch(function (e) { console.warn('offline cache unavailable', e && e.code); });
    } catch (e) { /* เบราว์เซอร์ไม่รองรับ */ }
    let suppressAuthEvents = false;

    FBL.loadTeam = async function () {
      const snap = await db.collection('team').get();
      team = sortTeam(snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); }));
      return team.slice();
    };

    FBL.onAuth = function (cb) {
      auth.onAuthStateChanged(async function (u) {
        if (suppressAuthEvents) return;
        if (!u) { FBL.user = null; cb(null); return; }
        try {
          const d = await db.collection('team').doc(u.uid).get();
          if (!d.exists) {
            FBL.user = null; await auth.signOut();
            cb(null, 'บัญชีนี้ไม่ได้อยู่ในรายชื่อผู้ใช้งาน กรุณาติดต่อเจ้าของระบบ'); return;
          }
          FBL.user = { uid: u.uid, name: d.data().name, isOwner: !!d.data().isOwner, isAdmin: !!d.data().isAdmin };
          cb(FBL.user);
        } catch (e) { FBL.user = null; cb(null, thErr(e)); }
      });
    };

    FBL.login = async function (name, password) {
      const m = team.find(function (x) { return x.name === String(name || '').trim(); });
      if (!m) throw new Error('ไม่พบชื่อนี้ในระบบ');
      try { await auth.signInWithEmailAndPassword(m.email, password); } catch (e) { throw new Error(thErr(e)); }
    };

    FBL.logout = async function () { FBL.stopAll(); await auth.signOut(); };

    FBL.bootstrapOwner = async function (name, password) {
      name = String(name || '').trim();
      if (!name) throw new Error('กรอกชื่อ-นามสกุลก่อน');
      suppressAuthEvents = true;
      try {
        const email = newEmail();
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;
        try {
          const batch = db.batch();
          batch.set(db.collection('team').doc(uid), { name: name, email: email, isOwner: true, isAdmin: false, createdAt: nowIso() });
          batch.set(db.collection('config').doc('bootstrap'), { uid: uid, at: nowIso() });
          await batch.commit();
        } catch (e) { try { await cred.user.delete(); } catch (_) { /* ล้างบัญชีค้าง */ } throw e; }
        FBL.user = { uid: uid, name: name, isOwner: true, isAdmin: false };
        team = [{ uid: uid, name: name, email: email, isOwner: true, isAdmin: false }];
        return FBL.user;
      } catch (e) { throw new Error(thErr(e)); } finally { suppressAuthEvents = false; }
    };

    async function createAuthUserSecondary(email, password) {
      const sec = firebase.apps.find(function (a) { return a.name === 'secondary'; }) || firebase.initializeApp(firebaseConfig, 'secondary');
      const cred = await sec.auth().createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      await sec.auth().signOut();
      return uid;
    }

    FBL.addMember = async function (name, password, isAdmin) {
      requireOwner();
      name = String(name || '').trim();
      if (!name) throw new Error('กรอกชื่อ-นามสกุลก่อน');
      if (team.some(function (t) { return t.name === name; })) throw new Error('มีชื่อนี้อยู่แล้ว');
      try {
        const email = newEmail();
        const uid = await createAuthUserSecondary(email, password);
        await db.collection('team').doc(uid).set({ name: name, email: email, isOwner: false, isAdmin: !!isAdmin, createdAt: nowIso() });
        team.push({ uid: uid, name: name, email: email, isOwner: false, isAdmin: !!isAdmin });
        sortTeam(team);
      } catch (e) { throw new Error(thErr(e)); }
    };

    FBL.removeMember = async function (name) {
      requireOwner();
      const m = team.find(function (t) { return t.name === name; });
      if (!m) return;
      if (m.isOwner) throw new Error('ลบเจ้าของระบบไม่ได้');
      try { await db.collection('team').doc(m.uid).delete(); team = team.filter(function (t) { return t.uid !== m.uid; }); }
      catch (e) { throw new Error(thErr(e)); }
    };

    FBL.setMemberAdmin = async function (name, makeAdmin) {
      requireOwner();
      const m = team.find(function (t) { return t.name === name; });
      if (!m) throw new Error('ไม่พบชื่อนี้');
      if (m.isOwner) throw new Error('เจ้าของระบบมีสิทธิ์ครบอยู่แล้ว');
      try { await db.collection('team').doc(m.uid).update({ isAdmin: !!makeAdmin }); m.isAdmin = !!makeAdmin; }
      catch (e) { throw new Error(thErr(e)); }
    };

    // Firebase ฝั่งเบราว์เซอร์แก้รหัสผ่านคนอื่นตรงๆ ไม่ได้ → สร้างบัญชีล็อกอินใหม่ให้แล้วสลับรายชื่อ
    FBL.resetMemberPassword = async function (name, newPassword) {
      requireOwner();
      const m = team.find(function (t) { return t.name === name; });
      if (!m) throw new Error('ไม่พบชื่อนี้');
      try {
        if (FBL.user && m.uid === FBL.user.uid) { await auth.currentUser.updatePassword(newPassword); return; }
        const email = newEmail();
        const uid = await createAuthUserSecondary(email, newPassword);
        const batch = db.batch();
        batch.delete(db.collection('team').doc(m.uid));
        batch.set(db.collection('team').doc(uid), { name: m.name, email: email, isOwner: !!m.isOwner, isAdmin: !!m.isAdmin, createdAt: nowIso() });
        await batch.commit();
        team = team.filter(function (t) { return t.uid !== m.uid; });
        team.push({ uid: uid, name: m.name, email: email, isOwner: !!m.isOwner, isAdmin: !!m.isAdmin });
        sortTeam(team);
      } catch (e) { throw new Error(thErr(e)); }
    };

    FBL.changeMyPassword = async function (newPassword) {
      try { await auth.currentUser.updatePassword(newPassword); } catch (e) { throw new Error(thErr(e)); }
    };

    /* ---------- อ่านแบบ realtime ---------- */
    const subs = {};
    function watchRef(key, ref, onChange) {
      if (subs[key]) { subs[key].onChange = onChange || subs[key].onChange; return subs[key].first; }
      const s = subs[key] = { docs: [], firstDone: false, onChange: onChange };
      s.first = new Promise(function (resolve) {
        s.unsub = ref.onSnapshot(function (snap) {
          s.docs = snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); });
          if (!s.firstDone) { s.firstDone = true; resolve(s.docs); }
          else if (s.onChange) { try { s.onChange(s.docs); } catch (e) { console.error(e); } }
        }, function (err) {
          console.error('watch ' + key + ' failed', err);
          if (FBL.onError) FBL.onError(thErr(err));
          if (!s.firstDone) { s.firstDone = true; resolve([]); }
        });
      });
      return s.first;
    }
    function unwatch(prefix) {
      Object.keys(subs).forEach(function (k) {
        if (k.indexOf(prefix) === 0) { if (subs[k].unsub) subs[k].unsub(); delete subs[k]; }
      });
    }
    FBL.watchProjects = function (onChange) { return watchRef('projects', db.collection('projects'), onChange); };
    FBL.watchSub = function (pid, sub, onChange) {
      return watchRef('p/' + pid + '/' + sub, db.collection('projects').doc(pid).collection(sub), onChange);
    };
    FBL.unwatchProject = function (pid) { unwatch('p/' + pid + '/'); };
    FBL.stopAll = function () { unwatch(''); };

    /* ---------- เขียน (+ activity_log ใน batch เดียวกัน) ---------- */
    function logEntry(action, target, summary) {
      return {
        ts: firebase.firestore.FieldValue.serverTimestamp(),
        actorName: FBL.user ? FBL.user.name : '',
        actorUid: FBL.user ? FBL.user.uid : '',
        action: action, target: target, summary: String(summary || '').slice(0, 300)
      };
    }
    function stamp(rec, isNew) {
      const r = Object.assign({}, rec);
      r.updatedAt = nowIso(); r.updatedBy = FBL.user ? FBL.user.name : '';
      if (isNew) { r.createdAt = r.createdAt || r.updatedAt; r.createdBy = r.createdBy || r.updatedBy; }
      return r;
    }
    function subRef(pid, sub, id) { return db.collection('projects').doc(pid).collection(sub).doc(id); }

    FBL.saveProject = async function (p) {
      const isNew = !p.id;
      const id = p.id || FBL.newId();
      const data = clean(stamp(Object.assign({}, p, { id: id }), isNew));
      const batch = db.batch();
      batch.set(db.collection('projects').doc(id), data, { merge: false });
      batch.set(db.collection('activity_log').doc(), logEntry(isNew ? 'add' : 'update', 'projects/' + id, p.code || p.name));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
      return id;
    };
    FBL.saveSub = async function (pid, sub, rec, summary) {
      const isNew = !rec.id;
      const id = rec.id || FBL.newId();
      const data = clean(stamp(Object.assign({}, rec, { id: id }), isNew));
      const batch = db.batch();
      batch.set(subRef(pid, sub, id), data, { merge: false });
      batch.set(db.collection('activity_log').doc(), logEntry(isNew ? 'add' : 'update', pid + '/' + sub + '/' + id, summary));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
      return id;
    };
    // บันทึกหลายรายการพร้อมกัน (นำเข้า/สร้างทะเบียนชิ้นงาน) — แบ่งชุดละ 400
    FBL.saveSubBulk = async function (pid, sub, recs, progress) {
      const ids = [];
      for (let i = 0; i < recs.length; i += 400) {
        const batch = db.batch();
        recs.slice(i, i + 400).forEach(function (rec) {
          const id = rec.id || FBL.newId(); ids.push(id);
          batch.set(subRef(pid, sub, id), clean(stamp(Object.assign({}, rec, { id: id }), true)));
        });
        try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
        if (progress) progress(Math.min(i + 400, recs.length), recs.length);
      }
      await db.collection('activity_log').add(logEntry('bulk', pid + '/' + sub, recs.length + ' รายการ'));
      return ids;
    };
    FBL.softDelete = async function (pid, sub, id, summary) {
      const batch = db.batch();
      batch.update(subRef(pid, sub, id), { deletedAt: nowIso(), deletedBy: FBL.user ? FBL.user.name : '' });
      batch.set(db.collection('activity_log').doc(), logEntry('delete', pid + '/' + sub + '/' + id, summary));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
    };
    FBL.restore = async function (pid, sub, id) {
      const batch = db.batch();
      batch.update(subRef(pid, sub, id), { deletedAt: null, deletedBy: '' });
      batch.set(db.collection('activity_log').doc(), logEntry('restore', pid + '/' + sub + '/' + id, ''));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
    };
    FBL.hardDelete = async function (pid, sub, id, summary) {
      requirePrivileged();
      const batch = db.batch();
      batch.delete(subRef(pid, sub, id));
      batch.set(db.collection('activity_log').doc(), logEntry('permanentDelete', pid + '/' + sub + '/' + id, summary));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
    };

    FBL.loadLog = async function (limit) {
      requirePrivileged();
      const snap = await db.collection('activity_log').orderBy('ts', 'desc').limit(limit || 200).get();
      return snap.docs.map(function (d) {
        const x = d.data();
        return Object.assign({}, x, { ts: x.ts && x.ts.toDate ? x.ts.toDate().toISOString() : '' });
      });
    };

    /* ---------- ไฟล์ ----------
       หลัก: Google Drive ผ่าน drive-bridge.gs (Apps Script) — ไม่กินพื้นที่ Firestore 1 GB
             อ่านแล้วเก็บสำเนาไว้ในเครื่อง (Cache Storage) ไฟล์ไม่เปลี่ยนหลังอัปโหลด จึงไม่ต้องโหลดซ้ำ
             คำขออ่านที่เกิดพร้อมกัน (เช่น รูปย่อทั้งหน้า) รวมเป็นคำขอเดียว ครั้งละไม่เกิน 15 ไฟล์
       เดิม: เก็บเป็นชิ้นใน Firestore — files/{fid} (ข้อมูลไฟล์ + ชิ้นแรก d0) + files/{fid}/chunks/{1..n-1}
             ยังอ่าน/ลบได้ จนกว่าจะกด "ย้ายไฟล์เดิมไป Google Drive" ในหน้าตั้งค่า */
    const DRIVE = /^https:\/\/script\.google\.com\/.+\/exec$/.test(DRIVE_BRIDGE_URL);
    const CHUNK = 900 * 1024;
    const urlCache = {}, pending = {};
    FBL.storageReady = true;
    FBL.fileStore = DRIVE ? 'drive' : 'firestore';
    FBL.maxFileBytes = (DRIVE ? 20 : 10) * 1024 * 1024;
    function tooBig() { return new Error('ไฟล์ใหญ่เกิน ' + (FBL.maxFileBytes / 1048576) + ' MB — ให้เก็บใน Google Drive แล้วใส่เป็นลิงก์แทน'); }

    /* --- Firestore (แบบเดิม) --- */
    function fid(path) { return String(path).replace(/\//g, '~'); }
    function fileRef(path) { return db.collection('files').doc(fid(path)); }
    function toBlobField(u8) { return firebase.firestore.Blob.fromUint8Array(u8); }
    async function getCacheFirst(ref) {
      try { const s = await ref.get({ source: 'cache' }); if (s.exists) return s; } catch (e) { /* ไม่มีในแคช */ }
      return ref.get();
    }
    async function legacyUpload(path, u8, type, onProgress) {
      const n = Math.max(1, Math.ceil(u8.length / CHUNK));
      const ref = fileRef(path);
      try {
        // ชิ้นที่ 2 เป็นต้นไปก่อน แล้วค่อยเขียนเอกสารหลัก (มีเอกสารหลัก = ไฟล์ครบ)
        for (let i = 1; i < n; i++) {
          await ref.collection('chunks').doc(String(i)).set({ d: toBlobField(u8.subarray(i * CHUNK, (i + 1) * CHUNK)) });
          if (onProgress) onProgress(i / n);
        }
        await ref.set({
          path: path, type: type, size: u8.length, n: n,
          d0: toBlobField(u8.subarray(0, CHUNK)),
          uploadedAt: nowIso(), uploadedBy: FBL.user ? FBL.user.name : ''
        });
      } catch (e) { throw new Error(thErr(e)); }
    }
    async function legacyBlobFrom(snap) {
      const m = snap.data();
      const parts = [m.d0.toUint8Array()];
      for (let i = 1; i < (m.n || 1); i++) {
        const c = await getCacheFirst(snap.ref.collection('chunks').doc(String(i)));
        if (!c.exists) throw new Error('ไฟล์ไม่ครบ');
        parts.push(c.data().d.toUint8Array());
      }
      return new Blob(parts, { type: m.type || 'application/octet-stream' });
    }
    async function legacyBlob(path) {
      const snap = await getCacheFirst(fileRef(path));
      return snap.exists ? legacyBlobFrom(snap) : null;
    }
    async function legacyDeleteSnap(snap) {
      const n = snap.data().n || 1;
      for (let i = 1; i < n; i++) await snap.ref.collection('chunks').doc(String(i)).delete();
      await snap.ref.delete();
    }

    /* --- Google Drive --- */
    async function bridge(body) {
      if (!auth.currentUser) throw new Error('ยังไม่ได้ล็อกอิน');
      body.idToken = await auth.currentUser.getIdToken();
      let r, j;
      // text/plain = ไม่ต้องมีคำขอ preflight (Apps Script ไม่รองรับ OPTIONS)
      try { r = await fetch(DRIVE_BRIDGE_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); }
      catch (e) { throw new Error('เชื่อมต่อ Google Drive ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); }
      try { j = await r.json(); } catch (e) { throw new Error('ตัวกลาง Google Drive ตอบกลับผิดรูปแบบ (ตรวจสอบการ Deploy ของ drive-bridge ว่าเลือก Who has access = Anyone)'); }
      if (!j.ok) throw new Error(j.error || 'Google Drive ทำรายการไม่สำเร็จ');
      return j;
    }
    function toB64(u8) {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    }
    function fromB64(s) {
      const bin = atob(s), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    }
    async function drivePut(path, u8, type) {
      const j = await bridge({ action: 'put', path: path, type: type, data: toB64(u8) });
      if (j.size !== u8.length) throw new Error('อัปโหลดไม่ครบ กรุณาลองใหม่');
    }
    let queue = [], timer = null;
    function driveGet(path) {
      return new Promise(function (resolve, reject) {
        queue.push({ path: path, resolve: resolve, reject: reject });
        if (!timer) timer = setTimeout(flushQueue, 40);
      });
    }
    function flushQueue() {
      timer = null;
      const all = queue.splice(0, queue.length);
      for (let i = 0; i < all.length; i += 15) {
        const part = all.slice(i, i + 15);
        bridge({ action: 'get', paths: part.map(function (x) { return x.path; }) }).then(function (j) {
          const by = {};
          (j.files || []).forEach(function (f) { by[f.path] = f; });
          part.forEach(function (x) {
            const f = by[x.path];
            x.resolve(f && !f.missing ? new Blob([fromB64(f.data)], { type: f.type || 'application/octet-stream' }) : null);
          });
        }, function (e) { part.forEach(function (x) { x.reject(e); }); });
      }
    }

    /* --- สำเนาในเครื่อง (Cache Storage) — ใช้ไม่ได้ก็ข้ามไป --- */
    const LOCAL = 'pcs-files-v1';
    function localKey(path) { return new URL('__pcs_files__/' + encodeURIComponent(path), location.href).href; }
    async function localGet(path) {
      try { const r = await (await caches.open(LOCAL)).match(localKey(path)); return r ? await r.blob() : null; } catch (e) { return null; }
    }
    async function localPut(path, blob) {
      try { await (await caches.open(LOCAL)).put(localKey(path), new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } })); } catch (e) { /* ข้าม */ }
    }
    async function localDel(path) { try { await (await caches.open(LOCAL)).delete(localKey(path)); } catch (e) { /* ข้าม */ } }

    /* --- ใช้งาน --- */
    FBL.uploadFile = async function (path, blob, onProgress) {
      if (blob.size > FBL.maxFileBytes) throw tooBig();
      const u8 = new Uint8Array(await blob.arrayBuffer());
      const type = blob.type || 'application/octet-stream';
      if (DRIVE) {
        if (onProgress) onProgress(0.05);
        await drivePut(path, u8, type);
        await localPut(path, blob);
      } else await legacyUpload(path, u8, type, onProgress);
      if (onProgress) onProgress(1);
      return path;
    };
    FBL.fileUrl = function (path) {
      if (!path) return Promise.resolve('');
      if (urlCache[path]) return Promise.resolve(urlCache[path]);
      if (pending[path]) return pending[path];
      pending[path] = (async function () {
        try {
          let blob = DRIVE ? await localGet(path) : null;
          if (!blob && DRIVE) { blob = await driveGet(path); if (blob) localPut(path, blob); }
          if (!blob) blob = await legacyBlob(path);   // ไฟล์เก่าที่ยังไม่ได้ย้ายออกจาก Firestore
          if (!blob) return '';
          urlCache[path] = URL.createObjectURL(blob);
          return urlCache[path];
        } catch (e) { console.warn('fileUrl', path, e && (e.code || e.message)); return ''; }
        finally { delete pending[path]; }
      })();
      return pending[path];
    };
    FBL.deleteFile = async function (path) {
      requirePrivileged();
      try {
        if (DRIVE) await bridge({ action: 'del', path: path });   // เข้าถังขยะของ Drive (กู้คืนได้ 30 วัน)
        const snap = await fileRef(path).get();
        if (snap.exists) await legacyDeleteSnap(snap);
      } catch (e) { throw new Error(thErr(e)); }
      await localDel(path);
      if (urlCache[path]) { URL.revokeObjectURL(urlCache[path]); delete urlCache[path]; }
    };

    // ย้ายไฟล์เดิมทั้งหมดจาก Firestore ไป Drive — ลบออกจาก Firestore เฉพาะไฟล์ที่ Drive ยืนยันขนาดตรงกันแล้ว
    // onProgress(ย้ายแล้ว, ไม่สำเร็จ, path ล่าสุด) · กดซ้ำได้ ไฟล์ที่ย้ายแล้วจะไม่อยู่ใน Firestore อีก
    FBL.migrateFilesToDrive = async function (onProgress) {
      requirePrivileged();
      if (!DRIVE) throw new Error('ยังไม่ได้ตั้งค่า DRIVE_BRIDGE_URL ใน firebase-layer.js');
      await bridge({ action: 'ping' });
      let done = 0, last = null;
      const failed = [];
      for (;;) {
        let q = db.collection('files').orderBy(firebase.firestore.FieldPath.documentId()).limit(10);
        if (last) q = q.startAfter(last);
        let snap;
        try { snap = await q.get(); } catch (e) { throw new Error(thErr(e)); }
        if (snap.empty) break;
        for (const d of snap.docs) {
          last = d;
          const path = d.data().path || d.id.replace(/~/g, '/');
          try {
            const blob = await legacyBlobFrom(d);
            await drivePut(path, new Uint8Array(await blob.arrayBuffer()), blob.type);
            await localPut(path, blob);
            await legacyDeleteSnap(d);
            done++;
          } catch (e) { failed.push(path + ' — ' + (e.message || thErr(e))); }
          if (onProgress) onProgress(done, failed.length, path);
        }
      }
      return { done: done, failed: failed };
    };
  }

  /* ======================================================================
     โหมดทดลอง (demo) — เก็บทุกอย่างในเบราว์เซอร์เครื่องนี้ (localStorage + IndexedDB)
     ====================================================================== */
  function setupDemo() {
    const KEY = 'pcs_demo_v1';
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    let S = load();
    S.team = S.team || []; S.projects = S.projects || {}; S.subs = S.subs || {}; S.log = S.log || [];
    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify(S)); }
      catch (e) { if (FBL.onError) FBL.onError('พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (โหมดทดลอง)'); }
    }
    async function hash(s) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pcs|' + s));
        return Array.from(new Uint8Array(buf)).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      } catch (e) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'x' + h; }
    }
    const listeners = {};   // key -> [cb]
    function emit(key) {
      (listeners[key] || []).forEach(function (cb) { setTimeout(function () { try { cb(list(key)); } catch (e) { console.error(e); } }, 0); });
    }
    function list(key) {
      const src = key === 'projects' ? S.projects : (S.subs[key] || {});
      return Object.keys(src).map(function (id) { return JSON.parse(JSON.stringify(src[id])); });
    }
    function log(action, target, summary) {
      S.log.unshift({ ts: nowIso(), actorName: FBL.user ? FBL.user.name : '', actorUid: FBL.user ? FBL.user.uid : '', action: action, target: target, summary: summary || '' });
      S.log = S.log.slice(0, 500);
    }
    function stamp(rec, isNew) {
      const r = Object.assign({}, rec);
      r.updatedAt = nowIso(); r.updatedBy = FBL.user ? FBL.user.name : '';
      if (isNew) { r.createdAt = r.createdAt || r.updatedAt; r.createdBy = r.createdBy || r.updatedBy; }
      return r;
    }

    FBL.loadTeam = async function () { team = sortTeam(S.team.map(function (t) { return Object.assign({}, t); })); return team.slice(); };
    let authCb = null;
    FBL.onAuth = function (cb) {
      authCb = cb;
      const uid = sessionStorage.getItem('pcs_demo_uid');
      const m = uid && S.team.find(function (t) { return t.uid === uid; });
      if (m) { FBL.user = { uid: m.uid, name: m.name, isOwner: !!m.isOwner, isAdmin: !!m.isAdmin }; cb(FBL.user); }
      else cb(null);
    };
    FBL.login = async function (name, password) {
      const m = S.team.find(function (t) { return t.name === name; });
      if (!m) throw new Error('ไม่พบชื่อนี้ในระบบ');
      if (m.pw !== await hash(password)) throw new Error('รหัสผ่านไม่ถูกต้อง');
      sessionStorage.setItem('pcs_demo_uid', m.uid);
      FBL.user = { uid: m.uid, name: m.name, isOwner: !!m.isOwner, isAdmin: !!m.isAdmin };
      if (authCb) authCb(FBL.user);
    };
    FBL.logout = async function () { sessionStorage.removeItem('pcs_demo_uid'); FBL.user = null; FBL.stopAll(); };
    FBL.bootstrapOwner = async function (name, password) {
      name = String(name || '').trim();
      if (!name) throw new Error('กรอกชื่อ-นามสกุลก่อน');
      if (S.team.length) throw new Error('ตั้งเจ้าของระบบไปแล้ว');
      const m = { uid: 'u-' + randomId(8), name: name, isOwner: true, isAdmin: false, pw: await hash(password), createdAt: nowIso() };
      S.team.push(m); persist();
      sessionStorage.setItem('pcs_demo_uid', m.uid);
      FBL.user = { uid: m.uid, name: name, isOwner: true, isAdmin: false };
      team = [Object.assign({}, m)];
      return FBL.user;
    };
    FBL.addMember = async function (name, password, isAdmin) {
      requireOwner();
      name = String(name || '').trim();
      if (!name) throw new Error('กรอกชื่อ-นามสกุลก่อน');
      if (S.team.some(function (t) { return t.name === name; })) throw new Error('มีชื่อนี้อยู่แล้ว');
      S.team.push({ uid: 'u-' + randomId(8), name: name, isOwner: false, isAdmin: !!isAdmin, pw: await hash(password), createdAt: nowIso() });
      persist(); await FBL.loadTeam();
    };
    FBL.removeMember = async function (name) {
      requireOwner();
      const m = S.team.find(function (t) { return t.name === name; });
      if (m && m.isOwner) throw new Error('ลบเจ้าของระบบไม่ได้');
      S.team = S.team.filter(function (t) { return t.name !== name; }); persist(); await FBL.loadTeam();
    };
    FBL.setMemberAdmin = async function (name, makeAdmin) {
      requireOwner();
      const m = S.team.find(function (t) { return t.name === name; });
      if (m) { m.isAdmin = !!makeAdmin; persist(); await FBL.loadTeam(); }
    };
    FBL.resetMemberPassword = async function (name, pw) {
      requireOwner();
      const m = S.team.find(function (t) { return t.name === name; });
      if (!m) throw new Error('ไม่พบชื่อนี้');
      m.pw = await hash(pw); persist();
    };
    FBL.changeMyPassword = async function (pw) {
      const m = S.team.find(function (t) { return FBL.user && t.uid === FBL.user.uid; });
      if (m) { m.pw = await hash(pw); persist(); }
    };

    function watchKey(key, onChange) {
      listeners[key] = listeners[key] || [];
      if (onChange && listeners[key].indexOf(onChange) < 0) listeners[key].push(onChange);
      return Promise.resolve(list(key));
    }
    FBL.watchProjects = function (onChange) { return watchKey('projects', onChange); };
    FBL.watchSub = function (pid, sub, onChange) { return watchKey(pid + '/' + sub, onChange); };
    FBL.unwatchProject = function (pid) { Object.keys(listeners).forEach(function (k) { if (k.indexOf(pid + '/') === 0) delete listeners[k]; }); };
    FBL.stopAll = function () { Object.keys(listeners).forEach(function (k) { delete listeners[k]; }); };

    FBL.saveProject = async function (p) {
      const isNew = !p.id; const id = p.id || FBL.newId();
      S.projects[id] = clean(stamp(Object.assign({}, p, { id: id }), isNew));
      log(isNew ? 'add' : 'update', 'projects/' + id, p.code || p.name); persist(); emit('projects');
      return id;
    };
    FBL.saveSub = async function (pid, sub, rec, summary) {
      const key = pid + '/' + sub; const isNew = !rec.id; const id = rec.id || FBL.newId();
      S.subs[key] = S.subs[key] || {};
      S.subs[key][id] = clean(stamp(Object.assign({}, rec, { id: id }), isNew));
      log(isNew ? 'add' : 'update', key + '/' + id, summary); persist(); emit(key);
      return id;
    };
    FBL.saveSubBulk = async function (pid, sub, recs, progress) {
      const key = pid + '/' + sub; S.subs[key] = S.subs[key] || {};
      const ids = recs.map(function (rec) {
        const id = rec.id || FBL.newId();
        S.subs[key][id] = clean(stamp(Object.assign({}, rec, { id: id }), true));
        return id;
      });
      if (progress) progress(recs.length, recs.length);
      log('bulk', key, recs.length + ' รายการ'); persist(); emit(key);
      return ids;
    };
    FBL.softDelete = async function (pid, sub, id, summary) {
      const key = pid + '/' + sub; const r = S.subs[key] && S.subs[key][id];
      if (r) { r.deletedAt = nowIso(); r.deletedBy = FBL.user ? FBL.user.name : ''; log('delete', key + '/' + id, summary); persist(); emit(key); }
    };
    FBL.restore = async function (pid, sub, id) {
      const key = pid + '/' + sub; const r = S.subs[key] && S.subs[key][id];
      if (r) { r.deletedAt = null; r.deletedBy = ''; log('restore', key + '/' + id, ''); persist(); emit(key); }
    };
    FBL.hardDelete = async function (pid, sub, id, summary) {
      requirePrivileged();
      const key = pid + '/' + sub;
      if (S.subs[key]) { delete S.subs[key][id]; log('permanentDelete', key + '/' + id, summary); persist(); emit(key); }
    };
    FBL.loadLog = async function (limit) { requirePrivileged(); return S.log.slice(0, limit || 200); };

    /* ---------- ไฟล์ใน IndexedDB ---------- */
    let dbp = null;
    function idb() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        const rq = indexedDB.open('pcs_demo_files', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('files'); };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { reject(rq.error); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return idb().then(function (d) {
        return new Promise(function (resolve, reject) {
          const t = d.transaction('files', mode); const st = t.objectStore('files');
          const rq = fn(st);
          t.oncomplete = function () { resolve(rq && rq.result); };
          t.onerror = function () { reject(t.error); };
        });
      });
    }
    const urlCache = {};
    FBL.storageReady = true;
    FBL.fileStore = 'demo';
    FBL.maxFileBytes = 10 * 1024 * 1024;   // เท่าโหมด Firebase
    FBL.uploadFile = async function (path, blob, onProgress) {
      if (blob.size > FBL.maxFileBytes) throw new Error('ไฟล์ใหญ่เกิน 10 MB — ให้เก็บใน Google Drive แล้วใส่เป็นลิงก์แทน');
      await tx('readwrite', function (st) { return st.put(blob, path); });
      if (onProgress) onProgress(1);
      return path;
    };
    FBL.fileUrl = async function (path) {
      if (!path) return '';
      if (urlCache[path]) return urlCache[path];
      const blob = await tx('readonly', function (st) { return st.get(path); });
      if (!blob) return '';
      urlCache[path] = URL.createObjectURL(blob);
      return urlCache[path];
    };
    FBL.deleteFile = async function (path) {
      await tx('readwrite', function (st) { return st.delete(path); });
      if (urlCache[path]) { URL.revokeObjectURL(urlCache[path]); delete urlCache[path]; }
    };
    FBL.resetDemo = function () {
      localStorage.removeItem(KEY); sessionStorage.removeItem('pcs_demo_uid');
      try { indexedDB.deleteDatabase('pcs_demo_files'); } catch (e) { /* ข้าม */ }
    };
  }
})();
