import type { Employee, Machinery, MachineryHours } from './types';

export const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYMD(str: string): Date {
  const clean = String(str || '').slice(0, 10);
  const parts = clean.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0); // ساعة 12 ظهراً لتجنب أي فرق توقيت أو تغيير توقيت صيفي
  }
  const fallback = new Date();
  fallback.setHours(12, 0, 0, 0);
  return fallback;
}

export function getArabicDayName(dateStr: string): string {
  try {
    const d = parseYMD(dateStr);
    return ARABIC_DAYS[d.getDay()] || '';
  } catch {
    return '';
  }
}

/**
 * يرجع تاريخ يوم السبت الخاص بالأسبوع الذي يحتوي على هذا التاريخ (الأسبوع من السبت إلى الجمعة)
 */
export function getSaturdayOfWeek(dStr: string): string {
  try {
    const d = parseYMD(dStr);
    const day = d.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
    const diff = (day + 1) % 7; // Sat -> 0, Sun -> 1, Mon -> 2, ..., Fri -> 6
    d.setDate(d.getDate() - diff);
    return formatYMD(d);
  } catch {
    return String(dStr).slice(0, 10);
  }
}

/**
 * يرجع مصفوفة 7 أيام تبدأ بالسبت وتنتهي بالجمعة: [السبت, الأحد, الاثنين, الثلاثاء, الأربعاء, الخميس, الجمعة]
 */
export function getWeekDays(startDate: string, count = 7): string[] {
  const satStart = getSaturdayOfWeek(startDate);
  const days: string[] = [];
  const start = parseYMD(satStart);
  for (let i = 0; i < count; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    days.push(formatYMD(cur));
  }
  return days;
}

export function shiftDateDays(dStr: string, delta: number): string {
  const d = parseYMD(dStr);
  d.setDate(d.getDate() + delta);
  return formatYMD(d);
}

/**
 * 📊 تصدير تقرير تشغيل المعدات الأسبوعي الشامل بصيغة Excel منسقة بالكامل بالألوان (من السبت إلى الجمعة)
 */
export function exportWeeklyMachineryExcel(
  weekDaysInput: string[],
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

  // التأكد من أن الأيام تبدأ من السبت إلى الجمعة دائماً
  const rawStart = weekDaysInput && weekDaysInput.length > 0 ? weekDaysInput[0] : formatYMD(new Date());
  const weekDays = getWeekDays(rawStart, 7);
  const startDate = weekDays[0]; // السبت
  const endDate = weekDays[6]; // الجمعة

  // خريطة الموظفين بالـ ID
  const empMap = new Map<number, string>();
  for (const emp of employees) {
    if (emp && emp.id) empMap.set(emp.id, emp.name);
  }

  // خريطة سريعة ودقيقة للبيانات مع توحيد التاريخ والـ ID
  const dataMap = new Map<string, MachineryHours>();
  for (const h of allHours) {
    if (h && h.machineryId != null && h.date) {
      const dateClean = String(h.date).slice(0, 10);
      const key = `${Number(h.machineryId)}_${dateClean}`;
      dataMap.set(key, h);
    }
  }

  // حساب إجماليات كل يوم من السبت إلى الجمعة
  const dayTotals = weekDays.map((d) => {
    let hours = 0;
    let trips = 0;
    for (const m of machineryList) {
      const entry = dataMap.get(`${Number(m.id)}_${d}`);
      if (entry) {
        hours += Number(entry.hours) || 0;
        trips += Number(entry.trips) || 0;
      }
    }
    return { date: d, hours, trips };
  });

  const totalWeekHours = dayTotals.reduce((s, d) => s + d.hours, 0);
  const totalWeekTrips = dayTotals.reduce((s, d) => s + d.trips, 0);

  // 1) بناء أعمدة العناوين (Top Headers & Sub Headers)
  let topHeaderCells = `
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 6px;font-size:13px;text-align:center;font-weight:bold;width:40px;">م</th>
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 8px;font-size:13px;min-width:140px;text-align:right;font-weight:bold;">المعدة والمقاس</th>
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 8px;font-size:13px;min-width:110px;text-align:right;font-weight:bold;">المالك</th>
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 8px;font-size:13px;min-width:100px;text-align:right;font-weight:bold;">السائق</th>
  `;

  let subHeaderCells = '';

  // التكرار بالترتيب الصارم: السبت ← الأحد ← الاثنين ← الثلاثاء ← الأربعاء ← الخميس ← الجمعة
  weekDays.forEach((d) => {
    const dayName = getArabicDayName(d);
    topHeaderCells += `
      <th colspan="3" style="background-color:#1e40af;color:#ffffff;border:1px solid #3b82f6;padding:8px;font-size:12px;text-align:center;font-weight:bold;">
        <div style="font-size:13px;font-weight:bold;">${dayName}</div>
        <div style="font-size:10px;opacity:0.85;color:#bfdbfe;">${d}</div>
      </th>
    `;

    subHeaderCells += `
      <th style="background-color:#1d4ed8;color:#ffffff;border:1px solid #60a5fa;padding:6px 4px;font-size:11px;min-width:55px;text-align:center;font-weight:bold;">ساعة</th>
      <th style="background-color:#0284c7;color:#ffffff;border:1px solid #38bdf8;padding:6px 4px;font-size:11px;min-width:55px;text-align:center;font-weight:bold;">نقلة</th>
      <th style="background-color:#0f766e;color:#ffffff;border:1px solid #2dd4bf;padding:6px 8px;font-size:11px;min-width:160px;text-align:right;font-weight:bold;">تقرير الشغل</th>
    `;
  });

  topHeaderCells += `
    <th colspan="2" style="background-color:#065f46;color:#ffffff;border:1px solid #10b981;padding:8px;font-size:13px;text-align:center;font-weight:bold;">إجمالي الأسبوع</th>
  `;

  subHeaderCells += `
    <th style="background-color:#059669;color:#ffffff;border:1px solid #34d399;padding:6px 4px;font-size:12px;min-width:75px;text-align:center;font-weight:bold;">ساعات</th>
    <th style="background-color:#047857;color:#ffffff;border:1px solid #34d399;padding:6px 4px;font-size:12px;min-width:75px;text-align:center;font-weight:bold;">نقلات</th>
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
      const entry = dataMap.get(`${Number(m.id)}_${d}`);
      const h = entry ? Number(entry.hours) || 0 : 0;
      const t = entry ? Number(entry.trips) || 0 : 0;
      const n = entry ? (entry.notes || '').trim() : '';

      machTotalHours += h;
      machTotalTrips += t;

      const hourCell = h > 0
        ? `<td style="padding:6px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#eff6ff;color:#1e3a8a;font-size:12px;">${h}</td>`
        : `<td style="padding:6px 4px;border:1px solid #e2e8f0;text-align:center;color:#cbd5e1;">—</td>`;

      const tripCell = t > 0
        ? `<td style="padding:6px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fffbeb;color:#b45309;font-size:12px;">${t}ن</td>`
        : `<td style="padding:6px 4px;border:1px solid #e2e8f0;text-align:center;color:#cbd5e1;">—</td>`;

      const noteCell = n
        ? `<td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right;font-size:11px;font-weight:bold;background-color:#f0fdfa;color:#115e59;">
            <div style="background-color:#ccfbf1;border:1px solid #99f6e4;color:#134e4a;padding:3px 6px;border-radius:4px;display:inline-block;">${esc(n)}</div>
          </td>`
        : `<td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;color:#cbd5e1;">—</td>`;

      dayCells += hourCell + tripCell + noteCell;
    });

    const kindLabel = [m.kind, m.size].filter(Boolean).join(' ');

    rowsHtml += `
      <tr style="background-color:${rowBg};">
        <td style="padding:8px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#64748b;">${idx + 1}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;color:#0f172a;font-size:12px;">${esc(kindLabel)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;color:#334155;font-weight:bold;">${esc(m.owner || '—')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;color:#1e40af;">${esc(m.driver || '—')}</td>
        ${dayCells}
        <td style="padding:8px 4px;border:1px solid #a7f3d0;text-align:center;font-weight:bold;font-size:13px;background-color:#ecfdf5;color:#065f46;">
          ${machTotalHours > 0 ? machTotalHours + ' س' : '—'}
        </td>
        <td style="padding:8px 4px;border:1px solid #a7f3d0;text-align:center;font-weight:bold;font-size:13px;background-color:#ecfdf5;color:#065f46;">
          ${machTotalTrips > 0 ? machTotalTrips + ' ن' : '—'}
        </td>
      </tr>
    `;
  });

  // 3) بناء صف الإجماليات اليومية والعامة
  let dayTotalCells = '';
  dayTotals.forEach((d) => {
    dayTotalCells += `
      <td style="padding:8px 4px;border:1px solid #64748b;text-align:center;font-weight:bold;font-size:12px;background-color:#dbeafe;color:#1e3a8a;">
        ${d.hours > 0 ? d.hours : 0}
      </td>
      <td style="padding:8px 4px;border:1px solid #64748b;text-align:center;font-weight:bold;font-size:12px;background-color:#fef3c7;color:#92400e;">
        ${d.trips > 0 ? d.trips : 0}
      </td>
      <td style="padding:8px 4px;border:1px solid #64748b;text-align:center;font-size:11px;background-color:#1e293b;color:#94a3b8;">
        —
      </td>
    `;
  });

  const totalsRowHtml = `
    <tr style="background-color:#0f172a;color:#ffffff;font-weight:bold;">
      <td colspan="4" style="padding:10px 8px;border:1px solid #64748b;text-align:center;font-size:13px;color:#ffffff;font-weight:bold;">
        📊 الإجماليات اليومية والعامة
      </td>
      ${dayTotalCells}
      <td style="padding:10px 4px;border:1px solid #10b981;text-align:center;font-size:13px;background-color:#059669;color:#ffffff;font-weight:bold;">
        ${totalWeekHours} س
      </td>
      <td style="padding:10px 4px;border:1px solid #10b981;text-align:center;font-size:13px;background-color:#047857;color:#ffffff;font-weight:bold;">
        ${totalWeekTrips} ن
      </td>
    </tr>
  `;

  // 4) بناء كشف الحركات والتقارير التفصيلية
  let logRowsHtml = '';
  let logCounter = 0;
  weekDays.forEach((d) => {
    const dayName = getArabicDayName(d);
    machineryList.forEach((m) => {
      const entry = dataMap.get(`${Number(m.id)}_${d}`);
      if (entry && (Number(entry.hours) > 0 || Number(entry.trips ?? 0) > 0 || entry.notes)) {
        logCounter++;
        const kindLabel = [m.kind, m.size].filter(Boolean).join(' ');
        const recordedBy =
          entry.hoursByName ||
          entry.tripsByName ||
          entry.notesByName ||
          (entry.createdBy ? empMap.get(entry.createdBy) : '') ||
          (entry.hoursBy ? empMap.get(entry.hoursBy) : '') ||
          '—';

        logRowsHtml += `
          <tr style="background-color:${logCounter % 2 === 0 ? '#f8fafc' : '#ffffff'};">
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#64748b;">${logCounter}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#0f172a;">${d}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#1e40af;">${dayName}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;color:#0f172a;">${esc(kindLabel)}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;color:#334155;">${esc(m.owner || '—')}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;color:#1e40af;">${esc(m.driver || '—')}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#eff6ff;color:#1e3a8a;">${entry.hours || 0}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fffbeb;color:#b45309;">${entry.trips || 0}</td>
            <td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;background-color:#f0fdfa;color:#115e59;">${esc(entry.notes || '—')}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#64748b;">${esc(recordedBy)}</td>
          </tr>
        `;
      }
    });
  });

  const fullHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40"
      dir="rtl"
      lang="ar">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Excel.Sheet">
<meta name="Generator" content="Microsoft Excel 15">
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>تقرير تشغيل المعدات الأسبوعي</x:Name>
    <x:WorksheetOptions>
     <x:DisplayRightToLeft/>
     <x:Selected/>
     <x:DoNotDisplayGridlines/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    margin: 15px;
    direction: rtl;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 30px;
    font-size: 12px;
  }
  th, td {
    vertical-align: middle;
  }
  .title-box {
    text-align: center;
    margin-bottom: 20px;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
  }
  .title {
    color: #0f172a;
    font-size: 20px;
    font-weight: bold;
    margin: 0;
  }
  .subtitle {
    color: #475569;
    font-size: 13px;
    margin: 4px 0 0 0;
    font-weight: bold;
  }
</style>
</head>
<body>

<div class="title-box">
  <h2 class="title">🚜 ${esc(title)}</h2>
  <p class="subtitle">الفترة من: <b>السبت ${startDate}</b> إلى <b>الجمعة ${endDate}</b> (أسبوع عمل كامل 7 أيام)</p>
  <p class="subtitle">إجمالي المعدات: <b>${machineryList.length}</b> • إجمالي الساعات: <b style="color:#1e40af;">${totalWeekHours} ساعة</b> • إجمالي النقلات: <b style="color:#b45309;">${totalWeekTrips} نقلة</b></p>
</div>

<!-- 1️⃣ شيت التقرير الأسبوعي المجمع: من السبت إلى الجمعة -->
<h3 style="color:#0f172a;margin-bottom:8px;font-size:15px;font-weight:bold;">📋 شيت تشغيل المعدات الأسبوعي الشامل (من السبت إلى الجمعة)</h3>
<table border="1" style="border-collapse:collapse;border:1px solid #cbd5e1;">
  <thead>
    <tr>${topHeaderCells}</tr>
    <tr>${subHeaderCells}</tr>
  </thead>
  <tbody>
    ${rowsHtml}
    ${totalsRowHtml}
  </tbody>
</table>

<!-- 2️⃣ كشف الحركات والتقارير اليومية المفصلة -->
<h3 style="color:#0f172a;margin-top:30px;margin-bottom:8px;font-size:15px;font-weight:bold;">📝 سجل الحركات والتقارير اليومية بالتفصيل (${logCounter} حركة)</h3>
<table border="1" style="border-collapse:collapse;border:1px solid #cbd5e1;">
  <thead>
    <tr style="background-color:#0f172a;color:#ffffff;text-align:center;font-weight:bold;">
      <th style="padding:8px;border:1px solid #334155;">م</th>
      <th style="padding:8px;border:1px solid #334155;">التاريخ</th>
      <th style="padding:8px;border:1px solid #334155;">اليوم</th>
      <th style="padding:8px;border:1px solid #334155;">المعدة</th>
      <th style="padding:8px;border:1px solid #334155;">المالك</th>
      <th style="padding:8px;border:1px solid #334155;">السائق</th>
      <th style="padding:8px;border:1px solid #334155;">الساعات</th>
      <th style="padding:8px;border:1px solid #334155;">النقلات</th>
      <th style="padding:8px;border:1px solid #334155;text-align:right;min-width:220px;">تقرير الشغل والملاحظات</th>
      <th style="padding:8px;border:1px solid #334155;">مسجل البيان</th>
    </tr>
  </thead>
  <tbody>
    ${logRowsHtml || '<tr><td colspan="10" style="text-align:center;padding:15px;color:#94a3b8;">لا توجد حركات مسجلة في هذا الأسبوع</td></tr>'}
  </tbody>
</table>

</body>
</html>`;

  const filename = `تقرير_المعدات_الأسبوعي_من_السبت_${startDate}_إلى_الجمعة_${endDate}`;
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
