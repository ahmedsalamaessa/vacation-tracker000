/**
 * 🚚 نقل كل الداتا من قاعدة Neon القديمة إلى الجديدة — دمج ذكي
 * يشغّل:  OLD_URL='...' NEW_URL='...' node migrate.mjs
 * (أول سبتمبر لما حصة القديمة تتجدد)
 */
import { neon } from '@neondatabase/serverless';

const clean = u => u.replace('&channel_binding=require', '');
const oldSql = neon(clean(process.env.OLD_URL));
const newSql = neon(clean(process.env.NEW_URL));

const log = m => console.log(m);

async function cols(sql, table) {
  const r = await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${table} ORDER BY ordinal_position`;
  return r.map(x => x.column_name);
}

async function count(sql, table) {
  try { const r = await sql`SELECT count(*)::int AS n FROM ${sql.table(table)}`; return r[0].n; } catch { return -1; }
}

/** ينفذ insert بصفوف كتير مع أسماء الأعمدة */
async function insertRows(sql, table, columns, rows, conflict) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const values = [];
    const placeholders = chunk.map(row => {
      const vals = columns.map(c => {
        values.push(row[c]);
        return '$' + values.length;
      });
      return '(' + vals.join(',') + ')';
    });
    let q = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')}`;
    if (conflict) q += ` ON CONFLICT (${conflict}) DO NOTHING`;
    await sql.query(q, values);
    done += chunk.length;
  }
  return done;
}

async function main() {
  log('=== قراءة القاعدة القديمة ===');
  const oldEmps = await oldSql`SELECT * FROM employees ORDER BY id`;
  log('موظفين قديمين: ' + oldEmps.length);

  // ===== 1) الموظفين: دمج بالاسم المستخدم =====
  const newEmps = await newSql`SELECT id, username FROM employees`;
  const byUsername = new Map(newEmps.map(e => [e.username, e.id]));
  const usedIds = new Set(newEmps.map(e => e.id));
  const empMap = new Map(); // old_id -> new_id
  let seq = Math.max(...usedIds, 0);
  for (const e of oldEmps) {
    if (byUsername.has(e.username)) { empMap.set(e.id, byUsername.get(e.username)); continue; }
    if (!usedIds.has(e.id)) { usedIds.add(e.id); empMap.set(e.id, e.id); continue; }
    seq++; usedIds.add(seq); empMap.set(e.id, seq); // مكان مشغول → id جديد
  }
  // تنفيذ الدمج
  for (const e of oldEmps) {
    const target = empMap.get(e.id);
    const exists = byUsername.has(e.username);
    const c = await cols(oldSql, 'employees');
    const row = {}; for (const k of c) row[k] = e[k];
    row.id = target;
    if (exists) {
      const sets = c.filter(k => k !== 'id').map((k, i) => `${k}=$${i + 2}`);
      await newSql.query(`UPDATE employees SET ${sets.join(',')} WHERE username=$1`, [e.username, ...c.filter(k => k !== 'id').map(k => row[k])]);
    } else {
      await insertRows(newSql, 'employees', c, [row]);
    }
  }
  log('✅ الموظفين اتركّبوا (خريطة الـ ids جاهزة)');

  const mapVal = v => (v == null ? v : (empMap.get(v) ?? v));
  const mapArr = arr => Array.isArray(arr) ? arr.map(mapVal) : arr;

  // ===== 2) العدة والمعدات: خرايط بالمفتاح الطبيعي =====
  async function copyWithMap(table, naturalCols, outMap) {
    const src = await oldSql`SELECT * FROM ${oldSql.table(table)}`;
    if (src.length === 0) { log(`${table}: فاضي`); return; }
    const c = await cols(oldSql, table);
    // نتأكد إن الجدول موجود في الجديد
    const destCols = await cols(newSql, table);
    if (destCols.length === 0) { log(`⚠️ ${table} مش موجود في الجديد — اتخطى`); return; }
    const dest = await newSql`SELECT * FROM ${newSql.table(table)}`;
    const keyOf = row => naturalCols.map(k => String(row[k] ?? '')).join('|');
    const destKeys = new Map(dest.map(d => [keyOf(d), d.id]));
    let nextId = Math.max(0, ...dest.map(d => d.id));
    for (const row0 of src) {
      const row = {}; for (const k of c) row[k] = row0[k];
      const k = keyOf(row);
      if (destKeys.has(k)) { outMap.set(row.id, destKeys.get(k)); continue; }
      nextId++; destKeys.set(k, nextId); outMap.set(row.id, nextId);
      row.id = nextId;
      if (destCols.includes('custody_employee_id')) row.custody_employee_id = mapVal(row.custody_employee_id);
      await insertRows(newSql, table, destCols, [row]);
    }
    await newSql.query(`SELECT setval(pg_get_serial_sequence('${table}','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM ${table}), 1))`, []);
    log(`✅ ${table}: ${src.length} صف`);
  }

  const eqMap = new Map();
  await copyWithMap('equipment', ['serial_number'], eqMap);
  const machMap = new Map();
  await copyWithMap('machinery', ['kind', 'owner', 'size', 'driver'], machMap);

  // ===== 3) باقي الجداول: صفوف جديدة بترجمة الـ FK =====
  async function copyTable(table, fkCols) {
    const src = await oldSql`SELECT * FROM ${oldSql.table(table)}`;
    if (src.length === 0) { log(`${table}: فاضي`); return; }
    const c = await cols(oldSql, table);
    const destCols = await cols(newSql, table);
    if (destCols.length === 0) { log(`⚠️ ${table} مش موجود — اتخطى`); return; }
    const use = c.filter(k => destCols.includes(k) && k !== 'id');
    const rows = src.map(row0 => {
      const row = {};
      for (const k of use) {
        let v = row0[k];
        if (fkCols.emp?.includes(k)) v = mapVal(v);
        if (fkCols.empArr?.includes(k)) v = mapArr(v);
        if (fkCols.eq?.includes(k)) v = v == null ? v : (eqMap.get(v) ?? v);
        if (fkCols.mach?.includes(k)) v = v == null ? v : (machMap.get(v) ?? v);
        row[k] = v;
      }
      return row;
    });
    const n = await insertRows(newSql, table, use, rows, fkCols.conflict);
    await newSql.query(`SELECT setval(pg_get_serial_sequence('${table}','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM ${table}), 1))`, []);
    log(`✅ ${table}: ${n} صف`);
  }

  await copyTable('work_locations', {});
  await copyTable('attendance', { emp: ['employee_id'] });
  await copyTable('vacations', { emp: ['employee_id', 'requested_by', 'approved_by'] });
  await copyTable('audit_logs', { emp: ['actor_id', 'employee_id'] });
  await copyTable('check_in_attempts', { emp: ['employee_id'] });
  await copyTable('month_locks', {});
  await copyTable('notifications', { emp: ['employee_id'], empArr: ['target_user_ids', 'read_by'] });
  await copyTable('equipment_checkouts', { emp: ['surveyor_id', 'assistant_id', 'created_by'], eq: ['equipment_id'] });
  await copyTable('equipment_maintenance', { emp: ['created_by'], eq: ['equipment_id'] });
  await copyTable('machinery_hours', { emp: ['created_by'], mach: ['machinery_id'], conflict: 'machinery_id, date' });

  // ===== 4) الإعدادات: القديم هو الأصل =====
  const sets = await oldSql`SELECT key, value FROM settings`;
  for (const s of sets) {
    await newSql`INSERT INTO settings (key, value) VALUES (${s.key}, ${s.value}) ON CONFLICT (key) DO UPDATE SET value = ${s.value}`;
  }
  log(`✅ الإعدادات: ${sets.length}`);

  // ===== 5) تقرير نهائي =====
  log('=== المقارنة النهائية (قديم → جديد) ===');
  for (const t of ['employees', 'attendance', 'vacations', 'equipment', 'equipment_checkouts', 'machinery', 'machinery_hours', 'work_locations']) {
    log(`${t}: ${await count(oldSql, t)} → ${await count(newSql, t)}`);
  }
  log('🎉 اكتمل النقل');
}

main().catch(e => { console.error('فشل: ' + e.message); process.exit(1); });
