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
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
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
 * يرجع مصفوفة 7 أيام تبدأ بالسبت وتنتهي بالجمعة
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
 * يرجع مصفوفة التواريخ بين تاريخين محددين
 */
export function getDaysInRange(startDateStr: string, endDateStr: string, maxDays = 90): string[] {
  try {
    let s = parseYMD(startDateStr);
    let e = parseYMD(endDateStr);
    if (s > e) {
      const tmp = s;
      s = e;
      e = tmp;
    }
    const days: string[] = [];
    const cur = new Date(s);
    while (cur <= e && days.length < maxDays) {
      days.push(formatYMD(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days.length > 0 ? days : [formatYMD(new Date())];
  } catch {
    return [formatYMD(new Date())];
  }
}

/**
 * 🔤 تحويل رقم العمود إلى حرف الإكسيل المقابل (0 -> A, 1 -> B, 25 -> Z, 26 -> AA, 27 -> AB)
 */
export function colToExcelLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

const esc = (val: unknown): string =>
  String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * 📊 تصدير تقرير تشغيل المعدات الأسبوعي / الشامل بصيغة Excel منسقة مع معادلات رياضية حية (=SUM) وأرقام صافية
 */
export function exportWeeklyMachineryExcel(
  daysListInput: string[],
  machineryList: Machinery[],
  allHours: MachineryHours[],
  title = 'تقرير تشغيل وتتبع المعدات',
  employees: Employee[] = []
) {
  const weekDays = (daysListInput && daysListInput.length > 0)
    ? daysListInput
    : getWeekDays(formatYMD(new Date()), 7);
  const startDate = weekDays[0];
  const endDate = weekDays[weekDays.length - 1];
  const startDayName = getArabicDayName(startDate);
  const endDayName = getArabicDayName(endDate);

  const empMap = new Map<number, string>();
  for (const emp of employees) {
    if (emp && emp.id) empMap.set(emp.id, emp.name);
  }

  const dataMap = new Map<string, MachineryHours>();
  for (const h of allHours) {
    if (h && h.machineryId != null && h.date) {
      const dateClean = String(h.date).slice(0, 10);
      const key = `${Number(h.machineryId)}_${dateClean}`;
      dataMap.set(key, h);
    }
  }

  // إجماليات الأيام
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

  // إجمالي الأعمدة في الجدول
  const totalCols = 4 + weekDays.length * 3 + 2;

  // ترقيم الصفوف الفعلي في Excel:
  // Row 1: العنوان الرئيسي
  // Row 2: التفاصيل والفترة
  // Row 3: الترويسة الرئيسية (Top Header: م، المعدة، المالك، السائق، الأيام، إجمالي الفترة)
  // Row 4: الترويسة الفرعية (Sub Header: ساعة، نقلة، تقرير الشغل ...)
  // Row 5: أول معدة في القائمة (startRow = 5)
  // Row 4 + N: آخر معدة في القائمة (endRow = 4 + machineryList.length)
  // Row 5 + N: صف الإجماليات (totalsRow = 5 + machineryList.length)
  const startRow = 5;
  const endRow = machineryList.length > 0 ? 4 + machineryList.length : startRow;
  const totalsRow = 5 + machineryList.length;

  // أعمدة الساعات والنقلات لكل يوم
  const dayHourColLetters: string[] = [];
  const dayTripColLetters: string[] = [];

  // 1) بناء ترويسة الجدول
  let topHeaderCells = `
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 6px;font-size:13px;text-align:center;font-weight:bold;width:40px;">م</th>
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 8px;font-size:13px;min-width:140px;text-align:right;font-weight:bold;">المعدة والمقاس</th>
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 8px;font-size:13px;min-width:110px;text-align:right;font-weight:bold;">المالك</th>
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 8px;font-size:13px;min-width:100px;text-align:right;font-weight:bold;">السائق</th>
  `;

  let subHeaderCells = '';

  weekDays.forEach((d, dIdx) => {
    const dayName = getArabicDayName(d);
    const isFri = dayName === 'الجمعة';
    const headerBg = isFri ? '#b45309' : '#1e40af';

    topHeaderCells += `
      <th colspan="3" style="background-color:${headerBg};color:#ffffff;border:1px solid #3b82f6;padding:8px;font-size:12px;text-align:center;font-weight:bold;">
        <div style="font-size:13px;font-weight:bold;">${dayName} ${isFri ? '🌴' : ''}</div>
        <div style="font-size:10px;opacity:0.85;color:#bfdbfe;">${d}</div>
      </th>
    `;

    subHeaderCells += `
      <th style="background-color:#1d4ed8;color:#ffffff;border:1px solid #60a5fa;padding:6px 4px;font-size:11px;min-width:55px;text-align:center;font-weight:bold;">ساعة</th>
      <th style="background-color:#0284c7;color:#ffffff;border:1px solid #38bdf8;padding:6px 4px;font-size:11px;min-width:55px;text-align:center;font-weight:bold;">نقلة</th>
      <th style="background-color:#0f766e;color:#ffffff;border:1px solid #2dd4bf;padding:6px 8px;font-size:11px;min-width:160px;text-align:right;font-weight:bold;">تقرير الشغل</th>
    `;

    const hColIdx = 4 + dIdx * 3;
    const tColIdx = 4 + dIdx * 3 + 1;
    dayHourColLetters.push(colToExcelLetter(hColIdx));
    dayTripColLetters.push(colToExcelLetter(tColIdx));
  });

  const totHoursColLetter = colToExcelLetter(4 + weekDays.length * 3);
  const totTripsColLetter = colToExcelLetter(4 + weekDays.length * 3 + 1);

  topHeaderCells += `
    <th colspan="2" style="background-color:#065f46;color:#ffffff;border:1px solid #10b981;padding:8px;font-size:13px;text-align:center;font-weight:bold;">إجمالي الفترة</th>
  `;

  subHeaderCells += `
    <th style="background-color:#059669;color:#ffffff;border:1px solid #34d399;padding:6px 4px;font-size:12px;min-width:75px;text-align:center;font-weight:bold;">ساعات</th>
    <th style="background-color:#047857;color:#ffffff;border:1px solid #34d399;padding:6px 4px;font-size:12px;min-width:75px;text-align:center;font-weight:bold;">نقلات</th>
  `;

  // 2) بناء صفوف المعدات مع أرقام صافية ومعادلات الجمع للأسبوع
  let rowsHtml = '';
  machineryList.forEach((m, idx) => {
    const currentRow = startRow + idx;
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

      // خلية الساعات: رقم صافي بدون أي بوينت أو حروف
      const hourCell = h > 0
        ? `<td x:num="${h}" style="mso-number-format:General;padding:6px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#eff6ff;color:#1e3a8a;font-size:12px;">${h}</td>`
        : `<td x:num="0" style="mso-number-format:General;padding:6px 4px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;">0</td>`;

      // خلية النقلات: رقم صافي بدون أي بوينت أو حروف
      const tripCell = t > 0
        ? `<td x:num="${t}" style="mso-number-format:General;padding:6px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fffbeb;color:#b45309;font-size:12px;">${t}</td>`
        : `<td x:num="0" style="mso-number-format:General;padding:6px 4px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;">0</td>`;

      // تقرير الشغل كنص
      const noteCell = n
        ? `<td style="mso-number-format:\\@;padding:5px 8px;border:1px solid #cbd5e1;text-align:right;font-size:11px;font-weight:bold;background-color:#f0fdfa;color:#115e59;">${esc(n)}</td>`
        : `<td style="mso-number-format:\\@;padding:6px 8px;border:1px solid #e2e8f0;text-align:center;color:#cbd5e1;">—</td>`;

      dayCells += hourCell + tripCell + noteCell;
    });

    const kindLabel = [m.kind, m.size].filter(Boolean).join(' ');

    // معادلة إجمالي ساعات المعدة في الأسبوع =SUM(E5,H5,K5,N5,Q5,T5,W5)
    const machHourFormula = `=SUM(${dayHourColLetters.map(col => `${col}${currentRow}`).join(',')})`;
    // معادلة إجمالي نقلات المعدة في الأسبوع =SUM(F5,I5,L5,O5,R5,U5,X5)
    const machTripFormula = `=SUM(${dayTripColLetters.map(col => `${col}${currentRow}`).join(',')})`;

    rowsHtml += `
      <tr style="background-color:${rowBg};">
        <td style="mso-number-format:0;padding:8px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#64748b;">${idx + 1}</td>
        <td style="mso-number-format:\\@;padding:8px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;color:#0f172a;font-size:12px;">${esc(kindLabel)}</td>
        <td style="mso-number-format:\\@;padding:8px;border:1px solid #cbd5e1;text-align:right;color:#334155;font-weight:bold;">${esc(m.owner || '—')}</td>
        <td style="mso-number-format:\\@;padding:8px;border:1px solid #cbd5e1;text-align:right;color:#1e40af;">${esc(m.driver || '—')}</td>
        ${dayCells}
        <td x:num="${machTotalHours}" x:fmla="${machHourFormula}" style="mso-number-format:General;padding:8px 4px;border:1px solid #a7f3d0;text-align:center;font-weight:bold;font-size:13px;background-color:#ecfdf5;color:#065f46;">
          ${machTotalHours}
        </td>
        <td x:num="${machTotalTrips}" x:fmla="${machTripFormula}" style="mso-number-format:General;padding:8px 4px;border:1px solid #a7f3d0;text-align:center;font-weight:bold;font-size:13px;background-color:#ecfdf5;color:#065f46;">
          ${machTotalTrips}
        </td>
      </tr>
    `;
  });

  // 3) صف الإجماليات بمعادلات الإكسيل الحية =SUM(col5:colEnd)
  let totalsDayCells = '';
  weekDays.forEach((_, dIdx) => {
    const hCol = dayHourColLetters[dIdx];
    const tCol = dayTripColLetters[dIdx];
    const sumH = dayTotals[dIdx]?.hours || 0;
    const sumT = dayTotals[dIdx]?.trips || 0;

    const fmlaH = machineryList.length > 0 ? `=SUM(${hCol}${startRow}:${hCol}${endRow})` : `=0`;
    const fmlaT = machineryList.length > 0 ? `=SUM(${tCol}${startRow}:${tCol}${endRow})` : `=0`;

    totalsDayCells += `
      <td x:num="${sumH}" x:fmla="${fmlaH}" style="mso-number-format:General;padding:10px 4px;border:1px solid #334155;text-align:center;font-size:13px;font-weight:bold;background-color:#1e40af;color:#ffffff;">
        ${sumH}
      </td>
      <td x:num="${sumT}" x:fmla="${fmlaT}" style="mso-number-format:General;padding:10px 4px;border:1px solid #334155;text-align:center;font-size:13px;font-weight:bold;background-color:#1e40af;color:#fde68a;">
        ${sumT}
      </td>
      <td style="mso-number-format:\\@;padding:10px 4px;border:1px solid #334155;text-align:center;font-size:11px;background-color:#0f172a;color:#94a3b8;">
        —
      </td>
    `;
  });

  const grandHoursFmla = machineryList.length > 0 ? `=SUM(${totHoursColLetter}${startRow}:${totHoursColLetter}${endRow})` : `=0`;
  const grandTripsFmla = machineryList.length > 0 ? `=SUM(${totTripsColLetter}${startRow}:${totTripsColLetter}${endRow})` : `=0`;

  const totalsRowHtml = `
    <tr style="background-color:#0f172a;color:#ffffff;font-weight:bold;">
      <td colspan="4" style="mso-number-format:\\@;padding:10px 8px;border:1px solid #334155;text-align:center;font-size:13px;font-weight:bold;background-color:#0f172a;color:#ffffff;">
        📊 إجمالي الفترة
      </td>
      ${totalsDayCells}
      <td x:num="${totalWeekHours}" x:fmla="${grandHoursFmla}" style="mso-number-format:General;padding:10px 6px;border:1px solid #10b981;text-align:center;font-size:14px;font-weight:bold;background-color:#065f46;color:#ffffff;">
        ${totalWeekHours}
      </td>
      <td x:num="${totalWeekTrips}" x:fmla="${grandTripsFmla}" style="mso-number-format:General;padding:10px 6px;border:1px solid #10b981;text-align:center;font-size:14px;font-weight:bold;background-color:#065f46;color:#fde68a;">
        ${totalWeekTrips}
      </td>
    </tr>
  `;

  // 4) كشف الحركات والتقارير اليومية بالتفصيل
  let logCounter = 0;
  let logRowsHtml = '';

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
            <td style="mso-number-format:0;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#64748b;">${logCounter}</td>
            <td style="mso-number-format:yyyy-mm-dd;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#0f172a;">${d}</td>
            <td style="mso-number-format:\\@;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#1e40af;">${dayName}</td>
            <td style="mso-number-format:\\@;padding:6px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;color:#0f172a;">${esc(kindLabel)}</td>
            <td style="mso-number-format:\\@;padding:6px;border:1px solid #cbd5e1;text-align:right;color:#334155;">${esc(m.owner || '—')}</td>
            <td style="mso-number-format:\\@;padding:6px;border:1px solid #cbd5e1;text-align:right;color:#1e40af;">${esc(m.driver || '—')}</td>
            <td x:num="${entry.hours || 0}" style="mso-number-format:General;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#eff6ff;color:#1e3a8a;">${entry.hours || 0}</td>
            <td x:num="${entry.trips || 0}" style="mso-number-format:General;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fffbeb;color:#b45309;">${entry.trips || 0}</td>
            <td style="mso-number-format:\\@;padding:6px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;background-color:#f0fdfa;color:#115e59;">${esc(entry.notes || '—')}</td>
            <td style="mso-number-format:\\@;padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#64748b;">${esc(recordedBy)}</td>
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
</style>
</head>
<body>

<!-- 1️⃣ شيت التقرير الأسبوعي المجمع: من السبت إلى الجمعة -->
<table border="1" style="border-collapse:collapse;border:1px solid #cbd5e1;">
  <thead>
    <!-- Row 1: العنوان الرئيسي -->
    <tr style="height:38px;">
      <th colspan="${totalCols}" style="background-color:#0f172a;color:#ffffff;font-size:16px;text-align:center;padding:8px;font-weight:bold;">
        🚜 ${esc(title)}
      </th>
    </tr>
    <!-- Row 2: التفاصيل والفترة -->
    <tr style="height:26px;">
      <th colspan="${totalCols}" style="background-color:#1e293b;color:#cbd5e1;font-size:12px;text-align:center;padding:5px;font-weight:bold;">
        الفترة من: ${startDayName} ${startDate} إلى ${endDayName} ${endDate} (أسبوع عمل كامل 7 أيام) • إجمالي المعدات: ${machineryList.length} • إجمالي الساعات: ${totalWeekHours} • إجمالي النقلات: ${totalWeekTrips}
      </th>
    </tr>
    <!-- Row 3: الترويسة الرئيسية -->
    <tr>${topHeaderCells}</tr>
    <!-- Row 4: الترويسة الفرعية -->
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

  const filename = `تقرير_المعدات_الأسبوعي_من_${startDate}_إلى_${endDate}`;
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

/**
 * 📊 تصدير شيت تشغيل وساعات ونقلات المعدات الشهري التراكمي بصيغة Excel ملونة مع معادلات رياضية حية (=SUM) وأرقام صافية
 */
export function exportMonthlyMachineryExcel(
  month: string,
  histList: Machinery[],
  allHours: MachineryHours[],
  deptName = 'قسم المساحة',
  employees: Employee[] = []
) {
  const [yearStr, monthStr] = (month || formatYMD(new Date()).slice(0, 7)).split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysCount = new Date(year, monthNum, 0).getDate();
  const monthDays: string[] = [];
  for (let d = 1; d <= daysCount; d++) {
    monthDays.push(`${month}-${String(d).padStart(2, '0')}`);
  }

  const empMap = new Map<number, string>();
  for (const emp of employees) {
    if (emp && emp.id) empMap.set(emp.id, emp.name);
  }

  const dataMap = new Map<string, MachineryHours>();
  for (const h of allHours) {
    if (h && h.machineryId != null && h.date) {
      const dateClean = String(h.date).slice(0, 10);
      dataMap.set(`${Number(h.machineryId)}_${dateClean}`, h);
    }
  }

  // حساب إجماليات كل يوم
  const dayTotals = monthDays.map((d) => {
    let hours = 0;
    let trips = 0;
    for (const m of histList) {
      const entry = dataMap.get(`${Number(m.id)}_${d}`);
      if (entry) {
        hours += Number(entry.hours) || 0;
        trips += Number(entry.trips) || 0;
      }
    }
    return { date: d, hours, trips };
  });

  const grandHours = dayTotals.reduce((s, d) => s + d.hours, 0);
  const grandTrips = dayTotals.reduce((s, d) => s + d.trips, 0);

  // إجمالي الأعمدة
  const totalCols = 1 + histList.length * 3 + 2;

  // ترقيم الصفوف الفعلي في Excel:
  // Row 1: العنوان الرئيسي
  // Row 2: التفاصيل والفترة
  // Row 3: الترويسة الرئيسية (Top Header)
  // Row 4: الترويسة الفرعية (Sub Header)
  // Row 5: أول يوم في الشهر (startRow = 5)
  // Row 4 + N: آخر يوم في الشهر (endRow = 4 + monthDays.length)
  // Row 5 + N: صف الإجمالي العام (totalsRow = 5 + monthDays.length)
  const startRow = 5;
  const endRow = monthDays.length > 0 ? 4 + monthDays.length : startRow;
  const totalsRow = 5 + monthDays.length;

  // أعمدة كل معدة
  const machHourColLetters: string[] = [];
  const machTripColLetters: string[] = [];

  // 1) ترويسة الجدول
  let topHeaderCells = `
    <th rowspan="2" style="background-color:#0f172a;color:#ffffff;border:1px solid #334155;padding:10px 8px;font-size:13px;text-align:center;font-weight:bold;width:95px;">📅 اليوم والتاريخ</th>
  `;

  let subHeaderCells = '';

  histList.forEach((m, mIdx) => {
    const machTitle = [m.kind, m.size].filter(Boolean).join(' ');
    const ownerLabel = m.owner ? ` (${m.owner})` : '';
    const driverLabel = m.driver ? ` · السائق: ${m.driver}` : '';

    topHeaderCells += `
      <th colspan="3" style="background-color:#1e3a8a;color:#ffffff;border:1px solid #3b82f6;padding:8px;font-size:12px;text-align:center;font-weight:bold;">
        <div style="font-size:13px;font-weight:bold;">${esc(machTitle)}${esc(ownerLabel)}</div>
        <div style="font-size:10px;opacity:0.85;color:#bfdbfe;">${esc(driverLabel)}</div>
      </th>
    `;

    subHeaderCells += `
      <th style="background-color:#1d4ed8;color:#ffffff;border:1px solid #60a5fa;padding:6px 4px;font-size:11px;min-width:50px;text-align:center;font-weight:bold;">ساعة</th>
      <th style="background-color:#0284c7;color:#ffffff;border:1px solid #38bdf8;padding:6px 4px;font-size:11px;min-width:50px;text-align:center;font-weight:bold;">نقلة</th>
      <th style="background-color:#0f766e;color:#ffffff;border:1px solid #2dd4bf;padding:6px 8px;font-size:11px;min-width:140px;text-align:right;font-weight:bold;">تقرير الشغل</th>
    `;

    const hColIdx = 1 + mIdx * 3;
    const tColIdx = 1 + mIdx * 3 + 1;
    machHourColLetters.push(colToExcelLetter(hColIdx));
    machTripColLetters.push(colToExcelLetter(tColIdx));
  });

  const dayTotHColLetter = colToExcelLetter(1 + histList.length * 3);
  const dayTotTColLetter = colToExcelLetter(1 + histList.length * 3 + 1);

  topHeaderCells += `
    <th colspan="2" style="background-color:#065f46;color:#ffffff;border:1px solid #10b981;padding:8px;font-size:13px;text-align:center;font-weight:bold;">إجمالي اليوم</th>
  `;

  subHeaderCells += `
    <th style="background-color:#059669;color:#ffffff;border:1px solid #34d399;padding:6px 4px;font-size:12px;min-width:70px;text-align:center;font-weight:bold;">ساعات</th>
    <th style="background-color:#047857;color:#ffffff;border:1px solid #34d399;padding:6px 4px;font-size:12px;min-width:70px;text-align:center;font-weight:bold;">نقلات</th>
  `;

  // 2) صفوف أيام الشهر مع أرقام صافية ومعادلات الجمع لليوم
  let dayRowsHtml = '';
  monthDays.forEach((d, idx) => {
    const currentRow = startRow + idx;
    const dayNum = d.slice(8);
    const dayName = getArabicDayName(d);
    const isFri = dayName === 'الجمعة';
    const rowBg = isFri ? '#fef3c7' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc');

    let machineCells = '';
    let daySumH = 0;
    let daySumT = 0;

    histList.forEach((m) => {
      const entry = dataMap.get(`${Number(m.id)}_${d}`);
      const h = entry ? Number(entry.hours) || 0 : 0;
      const t = entry ? Number(entry.trips) || 0 : 0;
      const n = entry ? (entry.notes || '').trim() : '';

      daySumH += h;
      daySumT += t;

      const hourCell = h > 0
        ? `<td x:num="${h}" style="mso-number-format:General;padding:5px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#eff6ff;color:#1e3a8a;font-size:12px;">${h}</td>`
        : `<td x:num="0" style="mso-number-format:General;padding:5px 4px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;">0</td>`;

      const tripCell = t > 0
        ? `<td x:num="${t}" style="mso-number-format:General;padding:5px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fffbeb;color:#b45309;font-size:12px;">${t}</td>`
        : `<td x:num="0" style="mso-number-format:General;padding:5px 4px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;">0</td>`;

      const noteCell = n
        ? `<td style="mso-number-format:\\@;padding:5px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;background-color:#f0fdfa;color:#115e59;font-size:11px;">${esc(n)}</td>`
        : `<td style="mso-number-format:\\@;padding:5px 4px;border:1px solid #e2e8f0;text-align:center;color:#cbd5e1;">—</td>`;

      machineCells += hourCell + tripCell + noteCell;
    });

    const dayHourFmla = histList.length > 0 ? `=SUM(${machHourColLetters.map(col => `${col}${currentRow}`).join(',')})` : `=0`;
    const dayTripFmla = histList.length > 0 ? `=SUM(${machTripColLetters.map(col => `${col}${currentRow}`).join(',')})` : `=0`;

    const dayTotalHCell = `
      <td x:num="${daySumH}" x:fmla="${dayHourFmla}" style="mso-number-format:General;padding:5px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#dbeafe;color:#1e40af;font-size:12px;">
        ${daySumH}
      </td>
    `;

    const dayTotalTCell = `
      <td x:num="${daySumT}" x:fmla="${dayTripFmla}" style="mso-number-format:General;padding:5px 4px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fef3c7;color:#92400e;font-size:12px;">
        ${daySumT}
      </td>
    `;

    dayRowsHtml += `
      <tr style="background-color:${rowBg};">
        <td style="mso-number-format:\\@;padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;white-space:nowrap;color:${isFri ? '#92400e' : '#0f172a'};">
          ${dayNum} — ${dayName} ${isFri ? '🌴' : ''}
        </td>
        ${machineCells}
        ${dayTotalHCell}
        ${dayTotalTCell}
      </tr>
    `;
  });

  // 3) صف إجمالي الشهر لكل معدة بمعادلات الإكسيل الحية
  let monthTotalsMachineCells = '';
  histList.forEach((m, mIdx) => {
    let mTotalH = 0;
    let mTotalT = 0;
    monthDays.forEach((d) => {
      const entry = dataMap.get(`${Number(m.id)}_${d}`);
      if (entry) {
        mTotalH += Number(entry.hours) || 0;
        mTotalT += Number(entry.trips) || 0;
      }
    });

    const hCol = machHourColLetters[mIdx];
    const tCol = machTripColLetters[mIdx];
    const fmlaH = monthDays.length > 0 ? `=SUM(${hCol}${startRow}:${hCol}${endRow})` : `=0`;
    const fmlaT = monthDays.length > 0 ? `=SUM(${tCol}${startRow}:${tCol}${endRow})` : `=0`;

    monthTotalsMachineCells += `
      <td x:num="${mTotalH}" x:fmla="${fmlaH}" style="mso-number-format:General;padding:8px 4px;border:1px solid #334155;text-align:center;font-weight:bold;background-color:#064e3b;color:#6ee7b7;font-size:13px;">${mTotalH}</td>
      <td x:num="${mTotalT}" x:fmla="${fmlaT}" style="mso-number-format:General;padding:8px 4px;border:1px solid #334155;text-align:center;font-weight:bold;background-color:#064e3b;color:#fde68a;font-size:13px;">${mTotalT}</td>
      <td style="mso-number-format:\\@;padding:8px 4px;border:1px solid #334155;text-align:center;background-color:#0f172a;color:#64748b;font-size:11px;">—</td>
    `;
  });

  const grandHoursFmla = monthDays.length > 0 ? `=SUM(${dayTotHColLetter}${startRow}:${dayTotHColLetter}${endRow})` : `=0`;
  const grandTripsFmla = monthDays.length > 0 ? `=SUM(${dayTotTColLetter}${startRow}:${dayTotTColLetter}${endRow})` : `=0`;

  const monthGrandTotalRow = `
    <tr style="background-color:#0f172a;color:#ffffff;font-weight:bold;">
      <td style="mso-number-format:\\@;padding:10px 8px;border:1px solid #334155;text-align:center;font-size:13px;font-weight:bold;background-color:#0f172a;color:#ffffff;">
        📊 إجمالي شهر ${month}
      </td>
      ${monthTotalsMachineCells}
      <td x:num="${grandHours}" x:fmla="${grandHoursFmla}" style="mso-number-format:General;padding:10px 6px;border:1px solid #10b981;text-align:center;font-size:14px;font-weight:bold;background-color:#1e40af;color:#ffffff;">
        ${grandHours}
      </td>
      <td x:num="${grandTrips}" x:fmla="${grandTripsFmla}" style="mso-number-format:General;padding:10px 6px;border:1px solid #10b981;text-align:center;font-size:14px;font-weight:bold;background-color:#1e40af;color:#fde68a;">
        ${grandTrips}
      </td>
    </tr>
  `;

  // 4) ملخص الملاك للشهر
  const ownersMap = new Map<string, { machines: Machinery[]; hours: number; trips: number }>();
  histList.forEach((m) => {
    const ownerName = (m.owner || 'بدون مالك').trim();
    if (!ownersMap.has(ownerName)) {
      ownersMap.set(ownerName, { machines: [], hours: 0, trips: 0 });
    }
    const o = ownersMap.get(ownerName)!;
    o.machines.push(m);
    monthDays.forEach((d) => {
      const entry = dataMap.get(`${Number(m.id)}_${d}`);
      if (entry) {
        o.hours += Number(entry.hours) || 0;
        o.trips += Number(entry.trips) || 0;
      }
    });
  });

  let ownersRowsHtml = '';
  let ownerIdx = 0;
  ownersMap.forEach((data, ownerName) => {
    ownerIdx++;
    const machListStr = data.machines.map(m => [m.kind, m.size].filter(Boolean).join(' ')).join('، ');
    ownersRowsHtml += `
      <tr style="background-color:${ownerIdx % 2 === 0 ? '#f8fafc' : '#ffffff'};">
        <td style="mso-number-format:0;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#64748b;">${ownerIdx}</td>
        <td style="mso-number-format:\\@;padding:6px 10px;border:1px solid #cbd5e1;font-weight:bold;color:#0f172a;">👤 ${esc(ownerName)}</td>
        <td style="mso-number-format:0;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#1e40af;">${data.machines.length}</td>
        <td style="mso-number-format:\\@;padding:6px 10px;border:1px solid #cbd5e1;color:#475569;font-size:11px;">${esc(machListStr)}</td>
        <td x:num="${data.hours}" style="mso-number-format:General;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#eff6ff;color:#1e3a8a;font-size:13px;">${data.hours}</td>
        <td x:num="${data.trips}" style="mso-number-format:General;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fffbeb;color:#b45309;font-size:13px;">${data.trips}</td>
      </tr>
    `;
  });

  // 5) سجل الحركات التفصيلية
  let logCounter = 0;
  let logRowsHtml = '';

  monthDays.forEach((d) => {
    const dayName = getArabicDayName(d);
    histList.forEach((m) => {
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
            <td style="mso-number-format:0;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#64748b;">${logCounter}</td>
            <td style="mso-number-format:yyyy-mm-dd;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#0f172a;">${d}</td>
            <td style="mso-number-format:\\@;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#1e40af;">${dayName}</td>
            <td style="mso-number-format:\\@;padding:6px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;color:#0f172a;">${esc(kindLabel)}</td>
            <td style="mso-number-format:\\@;padding:6px;border:1px solid #cbd5e1;text-align:right;color:#334155;">${esc(m.owner || '—')}</td>
            <td style="mso-number-format:\\@;padding:6px;border:1px solid #cbd5e1;text-align:right;color:#1e40af;">${esc(m.driver || '—')}</td>
            <td x:num="${entry.hours || 0}" style="mso-number-format:General;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#eff6ff;color:#1e3a8a;">${entry.hours || 0}</td>
            <td x:num="${entry.trips || 0}" style="mso-number-format:General;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fffbeb;color:#b45309;">${entry.trips || 0}</td>
            <td style="mso-number-format:\\@;padding:6px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;background-color:#f0fdfa;color:#115e59;">${esc(entry.notes || '—')}</td>
            <td style="mso-number-format:\\@;padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#64748b;">${esc(recordedBy)}</td>
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
    <x:Name>شيت ساعات المعدات شهر ${month}</x:Name>
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
</style>
</head>
<body>

<!-- 1️⃣ شيت التقرير الشهري التراكمي المجمع: الأيام × المعدات -->
<table border="1" style="border-collapse:collapse;border:1px solid #cbd5e1;">
  <thead>
    <!-- Row 1: العنوان الرئيسي -->
    <tr style="height:38px;">
      <th colspan="${totalCols}" style="background-color:#0f172a;color:#ffffff;font-size:16px;text-align:center;padding:8px;font-weight:bold;">
        🚜 ${esc(deptName)} — شيت تشغيل وساعات ونقلات المعدات الشهري التراكمي
      </th>
    </tr>
    <!-- Row 2: التفاصيل والفترة -->
    <tr style="height:26px;">
      <th colspan="${totalCols}" style="background-color:#1e293b;color:#cbd5e1;font-size:12px;text-align:center;padding:5px;font-weight:bold;">
        شهر: ${month} (إجمالي أيام الشهر: ${daysCount} يوم) • إجمالي المعدات: ${histList.length} • إجمالي الساعات: ${grandHours} • إجمالي النقلات: ${grandTrips}
      </th>
    </tr>
    <!-- Row 3: الترويسة الرئيسية -->
    <tr>${topHeaderCells}</tr>
    <!-- Row 4: الترويسة الفرعية -->
    <tr>${subHeaderCells}</tr>
  </thead>
  <tbody>
    ${dayRowsHtml}
    ${monthGrandTotalRow}
  </tbody>
</table>

<!-- 2️⃣ ملخص كشف الملاك للشهر -->
<h3 style="color:#0f172a;margin-top:30px;margin-bottom:8px;font-size:15px;font-weight:bold;">👤 ملخص كشف ساعات ونقلات الملاك لشهر ${month}</h3>
<table border="1" style="border-collapse:collapse;border:1px solid #cbd5e1;">
  <thead>
    <tr style="background-color:#0f172a;color:#ffffff;text-align:center;font-weight:bold;">
      <th style="padding:8px;border:1px solid #334155;width:40px;">م</th>
      <th style="padding:8px;border:1px solid #334155;text-align:right;">المالك</th>
      <th style="padding:8px;border:1px solid #334155;width:90px;">عدد المعدات</th>
      <th style="padding:8px;border:1px solid #334155;text-align:right;">قائمة المعدات</th>
      <th style="padding:8px;border:1px solid #334155;width:110px;">إجمالي الساعات</th>
      <th style="padding:8px;border:1px solid #334155;width:110px;">إجمالي النقلات</th>
    </tr>
  </thead>
  <tbody>
    ${ownersRowsHtml}
  </tbody>
  <tfoot>
    <tr style="background-color:#0f172a;color:#ffffff;font-weight:bold;">
      <td colspan="4" style="mso-number-format:\\@;padding:8px;border:1px solid #334155;text-align:center;">الإجمالي العام لكافة الملاك</td>
      <td x:num="${grandHours}" style="mso-number-format:General;padding:8px;border:1px solid #334155;text-align:center;color:#6ee7b7;font-size:13px;font-weight:bold;">${grandHours}</td>
      <td x:num="${grandTrips}" style="mso-number-format:General;padding:8px;border:1px solid #334155;text-align:center;color:#fde68a;font-size:13px;font-weight:bold;">${grandTrips}</td>
    </tr>
  </tfoot>
</table>

<!-- 3️⃣ سجل الحركات والتقارير اليومية المفصلة للشهر -->
<h3 style="color:#0f172a;margin-top:30px;margin-bottom:8px;font-size:15px;font-weight:bold;">📝 سجل الحركات والتقارير اليومية بالتفصيل لشهر ${month} (${logCounter} حركة)</h3>
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
    ${logRowsHtml || '<tr><td colspan="10" style="text-align:center;padding:15px;color:#94a3b8;">لا توجد حركات مسجلة في هذا الشهر</td></tr>'}
  </tbody>
</table>

</body>
</html>`;

  const filename = `شيت_ساعات_ونقلات_المعدات_التراكمي_شهر_${month}`;
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

/**
 * 📊 تصدير كشف يوم واحد للمعدات بصيغة Excel ملونة مع معادلات الإكسيل الحية (=SUM)
 */
export function exportDailyMachineryExcel(
  dayDate: string,
  activeMachinery: Machinery[],
  draftHours: Record<number, string>,
  draftTrips: Record<number, string>,
  draftNotes: Record<number, string>,
  deptName = 'قسم المساحة'
) {
  const dayName = getArabicDayName(dayDate);
  const startRow = 4;
  const endRow = activeMachinery.length > 0 ? 3 + activeMachinery.length : startRow;
  const totalsRow = 4 + activeMachinery.length;

  let totalHours = 0;
  let totalTrips = 0;

  let rowsHtml = '';
  activeMachinery.forEach((m, idx) => {
    const h = parseFloat(draftHours[m.id] || '') || 0;
    const t = parseFloat(draftTrips[m.id] || '') || 0;
    const n = (draftNotes[m.id] || '').trim();
    totalHours += h;
    totalTrips += t;

    const kindLabel = [m.kind, m.size].filter(Boolean).join(' ');

    rowsHtml += `
      <tr style="background-color:${idx % 2 === 0 ? '#f8fafc' : '#ffffff'};">
        <td style="mso-number-format:0;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;color:#64748b;">${idx + 1}</td>
        <td style="mso-number-format:\\@;padding:6px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;color:#0f172a;">${esc(kindLabel)}</td>
        <td style="mso-number-format:\\@;padding:6px 10px;border:1px solid #cbd5e1;text-align:right;color:#334155;">${esc(m.owner || '—')}</td>
        <td style="mso-number-format:\\@;padding:6px 10px;border:1px solid #cbd5e1;text-align:right;color:#1e40af;">${esc(m.driver || '—')}</td>
        <td x:num="${h}" style="mso-number-format:General;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#eff6ff;color:#1e3a8a;">${h}</td>
        <td x:num="${t}" style="mso-number-format:General;padding:6px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;background-color:#fffbeb;color:#b45309;">${t}</td>
        <td style="mso-number-format:\\@;padding:6px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;background-color:#f0fdfa;color:#115e59;">${esc(n || '—')}</td>
      </tr>
    `;
  });

  const fmlaH = activeMachinery.length > 0 ? `=SUM(E${startRow}:E${endRow})` : `=0`;
  const fmlaT = activeMachinery.length > 0 ? `=SUM(F${startRow}:F${endRow})` : `=0`;

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
    <x:Name>كشف يوم ${dayDate}</x:Name>
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
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 15px; direction: rtl; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { vertical-align: middle; }
</style>
</head>
<body>

<table border="1" style="border-collapse:collapse;border:1px solid #cbd5e1;">
  <thead>
    <tr style="height:36px;">
      <th colspan="7" style="background-color:#0f172a;color:#ffffff;font-size:16px;text-align:center;padding:8px;font-weight:bold;">
        🚜 ${esc(deptName)} — كشف تشغيل وساعات ونقلات المعدات اليومي
      </th>
    </tr>
    <tr style="height:26px;">
      <th colspan="7" style="background-color:#1e293b;color:#cbd5e1;font-size:12px;text-align:center;padding:5px;font-weight:bold;">
        يوم: ${dayName} (${dayDate}) • إجمالي المعدات: ${activeMachinery.length}
      </th>
    </tr>
    <tr style="background-color:#0f172a;color:#ffffff;text-align:center;font-weight:bold;">
      <th style="padding:8px;border:1px solid #334155;width:40px;">م</th>
      <th style="padding:8px;border:1px solid #334155;text-align:right;">المعدة والمقاس</th>
      <th style="padding:8px;border:1px solid #334155;text-align:right;">المالك</th>
      <th style="padding:8px;border:1px solid #334155;text-align:right;">السائق</th>
      <th style="padding:8px;border:1px solid #334155;width:80px;">الساعات</th>
      <th style="padding:8px;border:1px solid #334155;width:80px;">النقلات</th>
      <th style="padding:8px;border:1px solid #334155;text-align:right;">تقرير الشغل والموقع</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
  <tfoot>
    <tr style="background-color:#0f172a;color:#ffffff;font-weight:bold;">
      <td colspan="4" style="mso-number-format:\\@;padding:10px 8px;border:1px solid #334155;text-align:center;font-size:13px;">إجمالي اليوم</td>
      <td x:num="${totalHours}" x:fmla="${fmlaH}" style="mso-number-format:General;padding:10px;border:1px solid #10b981;text-align:center;font-size:14px;background-color:#1e40af;color:#ffffff;">${totalHours}</td>
      <td x:num="${totalTrips}" x:fmla="${fmlaT}" style="mso-number-format:General;padding:10px;border:1px solid #10b981;text-align:center;font-size:14px;background-color:#1e40af;color:#fde68a;">${totalTrips}</td>
      <td style="mso-number-format:\\@;padding:10px;border:1px solid #334155;text-align:center;color:#94a3b8;">—</td>
    </tr>
  </tfoot>
</table>

</body>
</html>`;

  const filename = `ساعات_ونقلات_معدات_${dayDate}`;
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
