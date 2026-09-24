import type { Employee, Machinery, MachineryHours } from './types';

const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function getArabicDayName(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return ARABIC_DAYS[d.getDay()] || '';
  } catch {
    return '';
  }
}

export function getSaturdayOfWeek(dStr: string): string {
  try {
    const d = new Date(dStr + 'T00:00:00');
    const day = d.getDay(); // 0: Sun, ..., 6: Sat
    const diff = (day + 1) % 7;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  } catch {
    return dStr;
  }
}

export function getWeekDays(startDate: string, count = 7): string[] {
  const days: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  for (let i = 0; i < count; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    days.push(cur.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * 📊 تصدير تقرير تشغيل المعدات الأسبوعي الشامل بصيغة Excel منسقة باللغة العربية
 */
export function exportWeeklyMachineryExcel(
  weekDays: string[],
  machineryList: Machinery[],
  allHours: MachineryHours[],
  title = 'تقرير تشغيل وتتبع المعدات الأسبوعي',
  employees: Employee[] = []
) {
  const esc = (val: unknown): string =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const startDate = weekDays[0] || '';
  const endDate = weekDays[weekDays.length - 1] || '';

  // خريطة الموظفين بالـ ID
  const empMap = new Map<number, string>();
  for (const emp of employees) {
    empMap.set(emp.id, emp.name);
  }

  // خريطة سريعة للبيانات: [machineryId_date] -> MachineryHours
  const dataMap = new Map<string, MachineryHours>();
  for (const h of allHours) {
    if (h && h.machineryId && h.date) {
      const key = `${h.machineryId}_${h.date}`;
      dataMap.set(key, h);
    }
  }

  // حساب إجماليات كل يوم
  const dayTotals = weekDays.map((d) => {
    let hours = 0;
    let trips = 0;
    for (const m of machineryList) {
      const entry = dataMap.get(`${m.id}_${d}`);
      if (entry) {
        hours += Number(entry.hours) || 0;
        trips += Number(entry.trips) || 0;
      }
    }
    return { date: d, hours, trips };
  });

  const totalWeekHours = dayTotals.reduce((s, d) => s + d.hours, 0);
  const totalWeekTrips = dayTotals.reduce((s, d) => s + d.trips, 0);

  // 1) بناء أعمدة العناوين
  let topHeaderCells = `
    <th rowspan="2" style="background:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px;font-size:13px;text-align:center;">م</th>
    <th rowspan="2" style="background:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px;font-size:13px;min-width:140px;text-align:right;">نوع وحجم المعدة</th>
    <th rowspan="2" style="background:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px;font-size:13px;min-width:110px;text-align:right;">المالك</th>
    <th rowspan="2" style="background:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px;font-size:13px;min-width:100px;text-align:right;">السائق</th>
  `;

  let subHeaderCells = '';

  weekDays.forEach((d) => {
    const dayName = getArabicDayName(d);
    topHeaderCells += `
      <th colspan="3" style="background:#1e3a8a;color:#ffffff;border:1px solid #3b82f6;padding:8px;font-size:12px;text-align:center;">
        ${dayName} (${d.slice(5)})
      </th>
    `;

    subHeaderCells += `
      <th style="background:#2563eb;color:#ffffff;border:1px solid #60a5fa;padding:6px 4px;font-size:11px;min-width:55px;text-align:center;">ساعة</th>
      <th style="background:#0284c7;color:#ffffff;border:1px solid #38bdf8;padding:6px 4px;font-size:11px;min-width:55px;text-align:center;">نقلة</th>
      <th style="background:#0d9488;color:#ffffff;border:1px solid #2dd4bf;padding:6px 8px;font-size:11px;min-width:140px;text-align:right;">تقرير الشغل والموقع</th>
    `;
  });

  topHeaderCells += `
    <th colspan="2" style="background:#065f46;color:#ffffff;border:1px solid #10b981;padding:8px;font-size:13px;text-align:center;">إجمالي الأسبوع</th>
  `;

  subHeaderCells += `
    <th style="background:#059669;color:#ffffff;border:1px solid #34d399;padding:6px 4px;font-size:12px;min-width:70px;text-align:center;">إجمالي الساعات</th>
    <th style="background:#047857;color:#ffffff;border:1px solid #34d399;padding:6px 4px;font-size:12px;min-width:70px;text-align:center;">إجمالي النقلات</th>
  `;

  // 2) بناء صفوف المعدات
  let rowsHtml = '';
  machineryList.forEach((m, idx) => {
    let machTotalHours = 0;
    let machTotalTrips = 0;
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? '#f8fafc' : '#ffffff';

    let dayCells = '';
    weekDays.forEach((d) => {
      const entry = dataMap.get(`${m.id}_${d}`);
      const h = entry ? Number(entry.hours) || 0 : 0;
      const t = entry ? Number(entry.trips) || 0 : 0;
      const n = entry ? (entry.notes || '').trim() : '';

      machTotalHours += h;
      machTotalTrips += t;

      dayCells += `
        <td style="padding:6px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:${h > 0 ? 'bold' : 'normal'};color:${h > 0 ? '#1e3a8a' : '#94a3b8'};">
          ${h > 0 ? h : '—'}
        </td>
        <td style="padding:6px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:${t > 0 ? 'bold' : 'normal'};color:${t > 0 ? '#0369a1' : '#94a3b8'};">
          ${t > 0 ? t : '—'}
        </td>
        <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-size:11px;color:#334155;">
          ${n ? esc(n) : '—'}
        </td>
      `;
    });

    const kindLabel = [m.kind, m.size].filter(Boolean).join(' ');

    rowsHtml += `
      <tr style="background:${rowBg};">
        <td style="padding:8px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#64748b;">${idx + 1}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;color:#0f172a;">${esc(kindLabel)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;color:#475569;">${esc(m.owner || '—')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;color:#475569;">${esc(m.driver || '—')}</td>
        ${dayCells}
        <td style="padding:8px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:black;font-size:13px;background:#ecfdf5;color:#065f46;">
          ${machTotalHours > 0 ? machTotalHours : '—'}
        </td>
        <td style="padding:8px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:black;font-size:13px;background:#ecfdf5;color:#065f46;">
          ${machTotalTrips > 0 ? machTotalTrips : '—'}
        </td>
      </tr>
    `;
  });

  // 3) بناء صف الإجماليات
  let dayTotalCells = '';
  dayTotals.forEach((d) => {
    dayTotalCells += `
      <td style="padding:8px 4px;border:1px solid #64748b;text-align:center;font-weight:black;font-size:12px;background:#dbeafe;color:#1e3a8a;">
        ${d.hours > 0 ? d.hours : 0}
      </td>
      <td style="padding:8px 4px;border:1px solid #64748b;text-align:center;font-weight:black;font-size:12px;background:#e0f2fe;color:#0369a1;">
        ${d.trips > 0 ? d.trips : 0}
      </td>
      <td style="padding:8px 4px;border:1px solid #64748b;text-align:center;font-size:11px;background:#f1f5f9;color:#64748b;">
        —
      </td>
    `;
  });

  const totalsRowHtml = `
    <tr style="background:#1e293b;color:#ffffff;font-weight:bold;">
      <td colspan="4" style="padding:10px 8px;border:1px solid #64748b;text-align:center;font-size:13px;color:#ffffff;">
        📊 الإجماليات اليومية والعامة
      </td>
      ${dayTotalCells}
      <td style="padding:10px 4px;border:1px solid #64748b;text-align:center;font-size:14px;background:#059669;color:#ffffff;">
        ${totalWeekHours} ساعة
      </td>
      <td style="padding:10px 4px;border:1px solid #64748b;text-align:center;font-size:14px;background:#047857;color:#ffffff;">
        ${totalWeekTrips} نقلة
      </td>
    </tr>
  `;

  // 4) بناء كشف الحركات اليومية المنفصل في نفس الملف (Daily Log Sheet)
  let logRowsHtml = '';
  let logCounter = 0;
  weekDays.forEach((d) => {
    const dayName = getArabicDayName(d);
    machineryList.forEach((m) => {
      const entry = dataMap.get(`${m.id}_${d}`);
      if (entry && (entry.hours > 0 || (entry.trips ?? 0) > 0 || entry.notes)) {
        logCounter++;
        const kindLabel = [m.kind, m.size].filter(Boolean).join(' ');
        const recordedBy = entry.hoursByName ||
          entry.tripsByName ||
          entry.notesByName ||
          (entry.createdBy ? empMap.get(entry.createdBy) : '') ||
          (entry.hoursBy ? empMap.get(entry.hoursBy) : '') ||
          '—';

        logRowsHtml += `
          <tr style="background:${logCounter % 2 === 0 ? '#f8fafc' : '#ffffff'};">
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${logCounter}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;">${d}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${dayName}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;">${esc(kindLabel)}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;">${esc(m.owner || '—')}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;">${esc(m.driver || '—')}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#1e3a8a;">${entry.hours || 0}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#0369a1;">${entry.trips || 0}</td>
            <td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:right;">${esc(entry.notes || '—')}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#64748b;">${esc(recordedBy)}</td>
          </tr>
        `;
      }
    });
  });

  const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 15px; direction: rtl; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 30px; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px; }
  .title-box { text-align: center; margin-bottom: 20px; }
  .title { color: #0f172a; font-size: 18px; font-weight: bold; margin: 0; }
  .subtitle { color: #64748b; font-size: 12px; margin: 4px 0 0 0; }
</style>
</head>
<body>

<div class="title-box">
  <h2 class="title">🚜 ${esc(title)}</h2>
  <p class="subtitle">الفترة من: <b>${startDate} (${getArabicDayName(startDate)})</b> إلى <b>${endDate} (${getArabicDayName(endDate)})</b></p>
  <p class="subtitle">إجمالي المعدات: ${machineryList.length} • إجمالي ساعات الأسبوع: <b>${totalWeekHours} ساعة</b> • إجمالي النقلات: <b>${totalWeekTrips} نقلة</b></p>
</div>

<!-- 1️⃣ شيت التقرير الأسبوعي المجمع -->
<h3 style="color:#1e3a8a;margin-bottom:8px;">📋 شيت تشغيل المعدات الأسبوعي الشامل (مصفوفة الأيام والساعات والنقلات والتقارير)</h3>
<table>
  <thead>
    <tr>${topHeaderCells}</tr>
    <tr>${subHeaderCells}</tr>
  </thead>
  <tbody>
    ${rowsHtml}
    ${totalsRowHtml}
  </tbody>
</table>

<!-- 2️⃣ كشف الحركات اليومية المفصلة -->
<h3 style="color:#1e3a8a;margin-top:25px;margin-bottom:8px;">📝 سجل الحركات والتقارير اليومية بالتفصيل (${logCounter} حركة)</h3>
<table>
  <thead>
    <tr style="background:#0f172a;color:#ffffff;text-align:center;">
      <th style="padding:8px;border:1px solid #334155;">م</th>
      <th style="padding:8px;border:1px solid #334155;">التاريخ</th>
      <th style="padding:8px;border:1px solid #334155;">اليوم</th>
      <th style="padding:8px;border:1px solid #334155;">المعدة</th>
      <th style="padding:8px;border:1px solid #334155;">المالك</th>
      <th style="padding:8px;border:1px solid #334155;">السائق</th>
      <th style="padding:8px;border:1px solid #334155;">الساعات</th>
      <th style="padding:8px;border:1px solid #334155;">النقلات</th>
      <th style="padding:8px;border:1px solid #334155;text-align:right;min-width:200px;">تقرير الشغل والملاحظات</th>
      <th style="padding:8px;border:1px solid #334155;">مسجل البيان</th>
    </tr>
  </thead>
  <tbody>
    ${logRowsHtml || '<tr><td colspan="10" style="text-align:center;padding:15px;color:#94a3b8;">لا توجد حركات مسجلة في هذا الأسبوع</td></tr>'}
  </tbody>
</table>

</body>
</html>`;

  const filename = `تقرير_المعدات_الأسبوعي_${startDate}_إلى_${endDate}`;
  const blob = new Blob(['\uFEFF' + fullHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
