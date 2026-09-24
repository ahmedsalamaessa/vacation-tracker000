import type { Machinery, MachineryHours } from './types';
import { getArabicDayName, getWeekDays, formatYMD } from './exportMachineryWeekly';

interface WeeklyStats {
  totalHours: number;
  totalTrips: number;
  activeMachines: number;
  totalLogs: number;
}

/**
 * دالة فتح نافذة الطباعة المنفصلة والمعزولة بالكامل
 */
function openPrintDocument(title: string, fullHtml: string) {
  const w = window.open('', '_blank', 'width=1150,height=800,scrollbars=yes,resizable=yes');
  if (!w) {
    // Fallback: If popup is blocked by aggressive browser settings
    const iframe = document.createElement('iframe');
    iframe.id = 'machinery-fallback-iframe';
    iframe.setAttribute('style', 'position:fixed;top:0;left:0;width:100vw;height:100vh;opacity:0.01;z-index:-9999;pointer-events:none;border:none;');
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc && iframe.contentWindow) {
      doc.open();
      doc.write(fullHtml);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.print();
        }
      }, 300);
    } else {
      window.print();
    }
    return;
  }

  w.document.open();
  w.document.write(fullHtml);
  w.document.close();

  // Trigger print cleanly once content is ready
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch (e) {
      console.warn('Auto print error', e);
    }
  }, 400);
}

/**
 * 🖨️ طباعة تقرير تشغيل وتتبع المعدات الأسبوعي (من السبت إلى الجمعة) في صفحة واحدة احترافية
 */
export function printMachineryWeeklyReport(
  weekDaysInput: string[],
  machineryList: Machinery[],
  allHours: MachineryHours[],
  deptName = 'قسم المساحة والتشغيل',
  stats?: WeeklyStats,
  mode: 'matrix' | 'logs' = 'matrix'
) {
  const rawStart = weekDaysInput && weekDaysInput.length > 0 ? weekDaysInput[0] : formatYMD(new Date());
  const weekDays = getWeekDays(rawStart, 7);
  const startDate = weekDays[0]; // السبت
  const endDate = weekDays[6]; // الجمعة
  const todayStr = formatYMD(new Date());

  // Map of hours by machineId_date
  const dataMap = new Map<string, MachineryHours>();
  for (const h of allHours) {
    if (h && h.machineryId != null && h.date) {
      const dateClean = String(h.date).slice(0, 10);
      dataMap.set(`${Number(h.machineryId)}_${dateClean}`, h);
    }
  }

  // Calculate day totals
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

  const totalWeekHours = stats ? stats.totalHours : dayTotals.reduce((s, d) => s + d.hours, 0);
  const totalWeekTrips = stats ? stats.totalTrips : dayTotals.reduce((s, d) => s + d.trips, 0);
  const activeCount = stats ? stats.activeMachines : machineryList.length;
  const totalLogsCount = stats ? stats.totalLogs : 0;

  let bodyContent = '';

  if (mode === 'matrix') {
    // 1) Table Headers
    let topHeaderCells = `
      <th rowspan="2" class="th-fixed w-idx">م</th>
      <th rowspan="2" class="th-fixed w-mach">المعدة والمقاس</th>
      <th rowspan="2" class="th-fixed w-owner">المالك</th>
      <th rowspan="2" class="th-fixed w-driver">السائق</th>
    `;

    let subHeaderCells = '';

    weekDays.forEach((d) => {
      const dayName = getArabicDayName(d);
      topHeaderCells += `
        <th colspan="3" class="th-day">
          <div class="day-name">${dayName}</div>
          <div class="day-date">${d}</div>
        </th>
      `;

      subHeaderCells += `
        <th class="th-sub th-h">ساعة</th>
        <th class="th-sub th-t">نقلة</th>
        <th class="th-sub th-n">تقرير الشغل</th>
      `;
    });

    topHeaderCells += `
      <th colspan="2" class="th-total-head">إجمالي الأسبوع</th>
    `;

    subHeaderCells += `
      <th class="th-sub th-tot">ساعات</th>
      <th class="th-sub th-tot">نقلات</th>
    `;

    // 2) Table Rows
    let rowsHtml = '';
    if (machineryList.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="${4 + weekDays.length * 3 + 2}" style="padding: 20px; text-align: center; color: #64748b; font-weight: bold;">
            لا توجد معدات مسجلة في هذا الأسبوع
          </td>
        </tr>
      `;
    } else {
      machineryList.forEach((m, idx) => {
        let machH = 0;
        let machT = 0;
        let dayCells = '';

        weekDays.forEach((d) => {
          const entry = dataMap.get(`${Number(m.id)}_${d}`);
          const h = entry ? Number(entry.hours) || 0 : 0;
          const t = entry ? Number(entry.trips) || 0 : 0;
          const n = entry ? (entry.notes || '').trim() : '';

          machH += h;
          machT += t;

          const hourCell = h > 0
            ? `<td class="td-cell td-h font-bold">${h}</td>`
            : `<td class="td-cell td-empty">—</td>`;

          const tripCell = t > 0
            ? `<td class="td-cell td-t font-bold">${t}ن</td>`
            : `<td class="td-cell td-empty">—</td>`;

          const noteCell = n
            ? `<td class="td-cell td-note"><span class="badge-note">${n}</span></td>`
            : `<td class="td-cell td-empty">—</td>`;

          dayCells += hourCell + tripCell + noteCell;
        });

        const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
        const machTitle = [m.kind, m.size].filter(Boolean).join(' ');

        rowsHtml += `
          <tr class="${rowClass}">
            <td class="td-cell td-center text-muted font-bold">${idx + 1}</td>
            <td class="td-cell td-mach font-black">${machTitle}</td>
            <td class="td-cell td-text">${m.owner || '—'}</td>
            <td class="td-cell td-text">${m.driver || '—'}</td>
            ${dayCells}
            <td class="td-cell td-grand-h font-black">${machH > 0 ? machH + ' س' : '—'}</td>
            <td class="td-cell td-grand-t font-black">${machT > 0 ? machT + ' ن' : '—'}</td>
          </tr>
        `;
      });
    }

    // 3) Totals Row
    let dayTotalCells = '';
    dayTotals.forEach((dt) => {
      dayTotalCells += `
        <td class="td-cell tf-h font-black">${dt.hours > 0 ? dt.hours : 0}</td>
        <td class="td-cell tf-t font-black">${dt.trips > 0 ? dt.trips : 0}</td>
        <td class="td-cell tf-empty">—</td>
      `;
    });

    bodyContent = `
      <table class="report-table">
        <thead>
          <tr class="tr-top">${topHeaderCells}</tr>
          <tr class="tr-sub">${subHeaderCells}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr class="tr-foot">
            <td colspan="4" class="tf-label">📊 الإجماليات اليومية والعامة</td>
            ${dayTotalCells}
            <td class="tf-grand font-black">${totalWeekHours} س</td>
            <td class="tf-grand font-black">${totalWeekTrips} ن</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else {
    // Mode: Detailed Logs
    const logsList: { date: string; dayName: string; machine: Machinery; entry: MachineryHours }[] = [];
    weekDays.forEach((d) => {
      const dayName = getArabicDayName(d);
      machineryList.forEach((m) => {
        const entry = dataMap.get(`${Number(m.id)}_${d}`);
        if (entry && (Number(entry.hours) > 0 || Number(entry.trips ?? 0) > 0 || entry.notes)) {
          logsList.push({ date: d, dayName, machine: m, entry });
        }
      });
    });

    let logsRows = '';
    if (logsList.length === 0) {
      logsRows = `<tr><td colspan="9" style="padding:20px;text-align:center;color:#64748b;">لا توجد تقارير شغل مسجلة في هذا الأسبوع</td></tr>`;
    } else {
      logsList.forEach((item, idx) => {
        const machTitle = [item.machine.kind, item.machine.size].filter(Boolean).join(' ');
        logsRows += `
          <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
            <td class="td-cell td-center font-bold">${idx + 1}</td>
            <td class="td-cell td-center">${item.date}</td>
            <td class="td-cell td-center font-bold text-indigo">${item.dayName}</td>
            <td class="td-cell td-mach font-black">${machTitle}</td>
            <td class="td-cell td-text">${item.machine.owner || '—'}</td>
            <td class="td-cell td-text">${item.machine.driver || '—'}</td>
            <td class="td-cell td-h font-black">${item.entry.hours > 0 ? item.entry.hours + ' س' : '—'}</td>
            <td class="td-cell td-t font-black">${(item.entry.trips ?? 0) > 0 ? item.entry.trips + ' ن' : '—'}</td>
            <td class="td-cell td-note font-bold">${item.entry.notes || '—'}</td>
          </tr>
        `;
      });
    }

    bodyContent = `
      <table class="report-table">
        <thead>
          <tr class="tr-top">
            <th class="th-fixed" style="width:30px;">م</th>
            <th class="th-fixed" style="width:75px;">التاريخ</th>
            <th class="th-fixed" style="width:65px;">اليوم</th>
            <th class="th-fixed" style="width:120px;">المعدة</th>
            <th class="th-fixed" style="width:100px;">المالك</th>
            <th class="th-fixed" style="width:90px;">السائق</th>
            <th class="th-fixed" style="width:55px;">الساعات</th>
            <th class="th-fixed" style="width:55px;">النقلات</th>
            <th class="th-fixed">📝 تقرير الشغل والموقع المنفذ</th>
          </tr>
        </thead>
        <tbody>
          ${logsRows}
        </tbody>
      </table>
    `;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تقرير تشغيل المعدات الأسبوعي (${startDate} إلى ${endDate})</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Segoe UI', Tahoma, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      font-size: 8.5pt;
      line-height: 1.15;
      direction: rtl;
    }
    
    /* Screen toolbar (hidden in print) */
    .screen-toolbar {
      background: #0f172a;
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      color: #ffffff;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .btn-print {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-print:hover { background: #1d4ed8; }
    .btn-close {
      background: #475569;
      color: #ffffff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-close:hover { background: #334155; }

    .page-container {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      padding: 2px 6px;
    }
    
    /* Header */
    .report-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 3px;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-right { text-align: right; }
    .header-center { text-align: center; }
    .header-left { text-align: left; }
    .dept-title { font-size: 8.5pt; font-weight: 800; color: #475569; }
    .main-title { font-size: 11.5pt; font-weight: 900; color: #0f172a; margin: 1px 0; }
    .period-badge {
      display: inline-block;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: bold;
      color: #1e293b;
    }

    /* KPI Summary Strip */
    .kpi-strip {
      display: flex;
      gap: 6px;
      margin-bottom: 5px;
      justify-content: space-between;
    }
    .kpi-box {
      flex: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2.5px 7px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      font-size: 8pt;
    }
    .kpi-box.blue { background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a; }
    .kpi-box.amber { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .kpi-box.emerald { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
    .kpi-box.purple { background: #faf5ff; border-color: #e9d5ff; color: #6b21a8; }
    .kpi-val { font-weight: 900; font-size: 9.5pt; }

    /* Table */
    .report-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 7.5pt;
    }
    .th-fixed {
      background: #0f172a;
      color: #ffffff;
      border: 1px solid #334155;
      padding: 3.5px 2px;
      text-align: center;
      font-weight: bold;
    }
    .th-day {
      background: #1e3a8a;
      color: #ffffff;
      border: 1px solid #3b82f6;
      padding: 3px 2px;
      text-align: center;
    }
    .day-name { font-size: 8pt; font-weight: 900; }
    .day-date { font-size: 6.5pt; color: #bfdbfe; }
    
    .th-sub {
      color: #ffffff;
      padding: 2.5px 1px;
      font-size: 7pt;
      font-weight: bold;
      text-align: center;
      border: 1px solid #475569;
    }
    .th-h { background: #1d4ed8; }
    .th-t { background: #0284c7; }
    .th-n { background: #0f766e; }
    .th-total-head { background: #065f46; color: #fff; border: 1px solid #10b981; padding: 3px 2px; text-align: center; font-size: 8pt; font-weight: 900; }
    .th-tot { background: #047857; }

    .w-idx { width: 18px; }
    .w-mach { width: 88px; }
    .w-owner { width: 68px; }
    .w-driver { width: 62px; }

    /* Table cells */
    .td-cell {
      border: 1px solid #cbd5e1;
      padding: 2px 2px;
      vertical-align: middle;
      height: 19px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row-even { background: #ffffff; }
    .row-odd { background: #f8fafc; }
    
    .td-center { text-align: center; }
    .td-mach { text-align: right; color: #0f172a; }
    .td-text { text-align: right; color: #334155; }
    .td-h { text-align: center; background: #eff6ff; color: #1e3a8a; }
    .td-t { text-align: center; background: #fffbeb; color: #92400e; }
    .td-note { text-align: right; padding: 1.5px 3px; }
    .td-grand-h { text-align: center; background: #ecfdf5; color: #065f46; }
    .td-grand-t { text-align: center; background: #ecfdf5; color: #065f46; }
    .td-empty { text-align: center; color: #cbd5e1; font-weight: normal; }

    .badge-note {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: #f0fdfa;
      border: 0.5px solid #99f6e4;
      color: #134e4a;
      padding: 0 3px;
      border-radius: 3px;
      font-size: 6.8pt;
      font-weight: bold;
    }

    /* Footer & Totals */
    .tr-foot {
      background: #0f172a;
      color: #ffffff;
      font-weight: bold;
    }
    .tf-label {
      border: 1px solid #334155;
      padding: 3px 4px;
      text-align: center;
      background: #0f172a;
      color: #ffffff;
      font-size: 7.5pt;
    }
    .tf-h { border: 1px solid #334155; text-align: center; background: #172554; color: #93c5fd; }
    .tf-t { border: 1px solid #334155; text-align: center; background: #451a03; color: #fde68a; }
    .tf-empty { border: 1px solid #334155; text-align: center; background: #0f172a; color: #64748b; }
    .tf-grand { border: 1px solid #10b981; text-align: center; background: #064e3b; color: #6ee7b7; font-size: 8.5pt; }

    /* Signatures */
    .signatures-block {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      padding-top: 5px;
      border-top: 1.5px solid #0f172a;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-box {
      text-align: center;
      width: 28%;
      font-size: 8pt;
      font-weight: bold;
    }
    .sig-title { color: #475569; margin-bottom: 18px; }
    .sig-dots { color: #94a3b8; font-weight: normal; }

    .font-bold { font-weight: bold; }
    .font-black { font-weight: 900; }
    .text-muted { color: #64748b; }
    .text-indigo { color: #4338ca; }

    @media print {
      .screen-toolbar {
        display: none !important;
      }
      .page-container {
        padding: 0 !important;
      }
    }
  </style>
</head>
<body>
  <div class="screen-toolbar">
    <div style="font-weight:bold;font-size:12px;">🚜 تقرير تشغيل المعدات الأسبوعي (جاهز للطباعة والـ PDF في صفحة واحدة A4 Landscape)</div>
    <div style="display:flex;gap:8px;">
      <button class="btn-print" onclick="window.print()">🖨️ طباعة الآن / حفظ PDF</button>
      <button class="btn-close" onclick="window.close()">✕ إغلاق</button>
    </div>
  </div>

  <div class="page-container">
    <div class="report-header">
      <div class="header-right">
        <div class="dept-title">${deptName}</div>
        <div class="main-title">🚜 تقرير تشغيل وتتبع المعدات الأسبوعي</div>
      </div>
      <div class="header-center">
        <div class="period-badge">
          الفترة: من <b>السبت (${startDate})</b> إلى <b>الجمعة (${endDate})</b>
        </div>
      </div>
      <div class="header-left">
        <div style="font-size:7.5pt; color:#64748b;">تاريخ الطباعة: <b>${todayStr}</b></div>
      </div>
    </div>

    <div class="kpi-strip">
      <div class="kpi-box blue">
        <span>⏱️ إجمالي الساعات:</span>
        <span class="kpi-val">${totalWeekHours} س</span>
      </div>
      <div class="kpi-box amber">
        <span>🚛 إجمالي النقلات:</span>
        <span class="kpi-val">${totalWeekTrips} ن</span>
      </div>
      <div class="kpi-box emerald">
        <span>🚜 المعدات العاملة:</span>
        <span class="kpi-val">${activeCount} معدة</span>
      </div>
      <div class="kpi-box purple">
        <span>📝 تقارير الشغل:</span>
        <span class="kpi-val">${totalLogsCount} تقرير</span>
      </div>
    </div>

    ${bodyContent}

    <div class="signatures-block">
      <div class="sig-box">
        <div class="sig-title">مسؤول الحركة والمعدات</div>
        <div class="sig-dots">...........................................</div>
      </div>
      <div class="sig-box">
        <div class="sig-title">مهندس / مدير الموقع</div>
        <div class="sig-dots">...........................................</div>
      </div>
      <div class="sig-box">
        <div class="sig-title">المالك / المقاول</div>
        <div class="sig-dots">...........................................</div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch(e) {}
      }, 350);
    };
  </script>
</body>
</html>`;

  openPrintDocument('تقرير تشغيل المعدات الأسبوعي', fullHtml);
}

/**
 * 🖨️ طباعة الشيت الشهري الرأسي في صفحة واحدة احترافية
 */
export function printMachineryMonthlyGrid(
  month: string,
  deptName: string,
  histList: Machinery[],
  monthDays: string[],
  hoursOf: (id: number, d: string) => number,
  tripsOf: (id: number, d: string) => number,
  dayGridTotal: (d: string) => number,
  dayGridTotalTrips: (d: string) => number,
  monthGridTotal: (id: number) => number,
  monthGridTotalTrips: (id: number) => number,
  monthGridGrand: number,
  monthGridGrandTrips: number
) {
  const todayStr = formatYMD(new Date());

  let thMachines = '';
  histList.forEach((m) => {
    const title = [m.kind, m.size].filter(Boolean).join(' ');
    thMachines += `
      <th style="border:1px solid #475569;background:#f1f5f9;color:#0f172a;padding:3px;text-align:center;">
        <div style="font-weight:900;font-size:7.5pt;">${title}</div>
        <div style="font-size:6.5pt;color:#64748b;">${m.owner || ''}${m.driver ? ` · ${m.driver}` : ''}</div>
      </th>
    `;
  });

  let rows = '';
  monthDays.forEach((d, i) => {
    const wd = ['أحد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'][new Date(d + 'T12:00:00').getDay()];
    const dayT = dayGridTotal(d);
    const dayTT = dayGridTotalTrips(d);

    let cells = '';
    histList.forEach((m) => {
      const v = hoursOf(m.id, d);
      const tv = tripsOf(m.id, d);
      let text = '—';
      let style = 'color:#cbd5e1;';
      if (v > 0 && tv > 0) {
        text = `${v}س / ${tv}ن`;
        style = 'font-weight:bold;color:#0f172a;background:#eff6ff;';
      } else if (v > 0) {
        text = `${v}س`;
        style = 'font-weight:bold;color:#1e3a8a;background:#eff6ff;';
      } else if (tv > 0) {
        text = `${tv}ن`;
        style = 'font-weight:bold;color:#92400e;background:#fffbeb;';
      }
      cells += `<td style="border:1px solid #cbd5e1;padding:2px;text-align:center;${style}">${text}</td>`;
    });

    const daySumText = dayT > 0 && dayTT > 0 ? `${dayT}س / ${dayTT}ن` : dayT > 0 ? `${dayT}س` : dayTT > 0 ? `${dayTT}ن` : '—';
    const daySumStyle = dayT > 0 || dayTT > 0 ? 'background:#dbeafe;color:#1e40af;font-weight:900;' : 'color:#cbd5e1;';

    rows += `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="border:1px solid #cbd5e1;padding:2px 4px;font-weight:bold;white-space:nowrap;">${d.slice(8)} — ${wd}</td>
        ${cells}
        <td style="border:1px solid #cbd5e1;padding:2px;text-align:center;${daySumStyle}">${daySumText}</td>
      </tr>
    `;
  });

  let tfMachines = '';
  histList.forEach((m) => {
    const t = monthGridTotal(m.id);
    const tt = monthGridTotalTrips(m.id);
    let text = '—';
    if (t > 0 && tt > 0) text = `${t}س / ${tt}ن`;
    else if (t > 0) text = `${t}س`;
    else if (tt > 0) text = `${tt}ن`;
    tfMachines += `<td style="border:1px solid #334155;padding:3px;text-align:center;font-weight:900;color:#6ee7b7;background:#064e3b;">${text}</td>`;
  });

  const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>شيت تشغيل المعدات الشهري — شهر ${month}</title>
  <style>
    @page { size: A4 landscape; margin: 4mm 5mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 7.5pt; margin: 0; padding: 2px 6px; direction: rtl; }
    .screen-toolbar {
      background: #0f172a;
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      color: #ffffff;
      border-radius: 6px;
    }
    .btn-print { background: #2563eb; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; }
    .btn-close { background: #475569; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; font-size: 7.2pt; }
    @media print { .screen-toolbar { display: none !important; } }
  </style>
</head>
<body>
  <div class="screen-toolbar">
    <div style="font-weight:bold;font-size:12px;">📊 شيت ساعات ونقلات المعدات الشهري — شهر ${month}</div>
    <div style="display:flex;gap:8px;">
      <button class="btn-print" onclick="window.print()">🖨️ طباعة الآن / PDF</button>
      <button class="btn-close" onclick="window.close()">✕ إغلاق</button>
    </div>
  </div>

  <div style="border-bottom:2px solid #0f172a;padding-bottom:3px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:8pt;font-weight:bold;color:#475569;">${deptName}</div>
      <div style="font-size:11pt;font-weight:900;color:#0f172a;">📊 شيت ساعات ونقلات المعدات — شهر ${month}</div>
    </div>
    <div style="font-size:8pt;font-weight:bold;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;padding:2px 8px;border-radius:4px;">
      إجمالي الشهر: <b>${monthGridGrand}</b> ساعة · <b>${monthGridGrandTrips}</b> نقلة
    </div>
    <div style="font-size:7pt;color:#64748b;">تاريخ الطباعة: ${todayStr}</div>
  </div>

  <table>
    <thead>
      <tr style="background:#0f172a;color:#ffffff;">
        <th style="border:1px solid #334155;padding:3px;width:70px;">📅 اليوم</th>
        ${thMachines}
        <th style="border:1px solid #334155;padding:3px;background:#1e3a8a;width:65px;">اليومي</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr style="background:#0f172a;color:#ffffff;font-weight:bold;">
        <td style="border:1px solid #334155;padding:3px;text-align:center;">إجمالي الشهر</td>
        ${tfMachines}
        <td style="border:1px solid #10b981;padding:3px;text-align:center;font-weight:900;color:#ffffff;background:#1e40af;">
          ${monthGridGrand}س / ${monthGridGrandTrips}ن
        </td>
      </tr>
    </tfoot>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() {
        try { window.focus(); window.print(); } catch(e) {}
      }, 350);
    };
  </script>
</body>
</html>`;

  openPrintDocument('شيت تشغيل المعدات الشهري', fullHtml);
}

/**
 * 🖨️ طباعة كشف مالك المعدات للتوقيع في صفحة واحدة احترافية
 */
export function printMachineryOwnerSheet(
  owner: {
    owner: string;
    machines: Machinery[];
    mon: number;
    monTrips: number;
    total: number;
    totalTrips: number;
  },
  deptName: string,
  month: string,
  historyMap: MachineryHours[]
) {
  const todayStr = formatYMD(new Date());

  let rows = '';
  owner.machines.forEach((m, idx) => {
    const title = [m.kind, m.size].filter(Boolean).join(' ');
    const machEntries = historyMap.filter(
      (h) => Number(h.machineryId) === Number(m.id) && String(h.date || '').startsWith(month)
    );
    const mHours = machEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
    const mTrips = machEntries.reduce((s, e) => s + (Number(e.trips) || 0), 0);

    rows += `
      <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:bold;">${idx + 1}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;text-align:right;">${title}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:right;">${m.driver || '—'}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:bold;color:#1e3a8a;">${mHours > 0 ? mHours + ' س' : '—'}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:bold;color:#92400e;">${mTrips > 0 ? mTrips + ' ن' : '—'}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:right;color:#64748b;">${m.notes || '—'}</td>
      </tr>
    `;
  });

  const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كشف تشغيل معدات المالك: ${owner.owner}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 9pt; margin: 0; padding: 4px; direction: rtl; color: #0f172a; }
    .screen-toolbar {
      background: #0f172a;
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      color: #ffffff;
      border-radius: 6px;
    }
    .btn-print { background: #2563eb; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; }
    .btn-close { background: #475569; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8.5pt; }
    @media print { .screen-toolbar { display: none !important; } }
  </style>
</head>
<body>
  <div class="screen-toolbar">
    <div style="font-weight:bold;font-size:12px;">🚜 كشف تشغيل معدات المالك: ${owner.owner}</div>
    <div style="display:flex;gap:8px;">
      <button class="btn-print" onclick="window.print()">🖨️ طباعة الآن / PDF</button>
      <button class="btn-close" onclick="window.close()">✕ إغلاق</button>
    </div>
  </div>

  <div style="border-bottom:3px double #0f172a;padding-bottom:6px;text-align:center;">
    <div style="font-size:10pt;font-weight:bold;color:#475569;">${deptName}</div>
    <div style="font-size:14pt;font-weight:900;color:#0f172a;margin-top:2px;">🚜 كشف ساعات ونقلات معدات — شهر ${month}</div>
  </div>

  <div style="margin-top:10px;display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;padding:8px 12px;border-radius:6px;">
    <div>👤 المالك: <b style="font-size:10pt;color:#1e3a8a;">${owner.owner}</b></div>
    <div>🚜 عدد المعدات: <b>${owner.machines.length}</b></div>
    <div>⏱️ ساعات الشهر: <b style="color:#1e3a8a;">${owner.mon || 0} س</b></div>
    <div>🚛 نقلات الشهر: <b style="color:#92400e;">${owner.monTrips || 0} ن</b></div>
  </div>

  <table>
    <thead>
      <tr style="background:#0f172a;color:#ffffff;">
        <th style="border:1px solid #334155;padding:6px;width:30px;text-align:center;">م</th>
        <th style="border:1px solid #334155;padding:6px;text-align:right;">المعدة والمقاس</th>
        <th style="border:1px solid #334155;padding:6px;text-align:right;width:120px;">السائق</th>
        <th style="border:1px solid #334155;padding:6px;text-align:center;width:75px;">ساعات الشهر</th>
        <th style="border:1px solid #334155;padding:6px;text-align:center;width:75px;">نقلات الشهر</th>
        <th style="border:1px solid #334155;padding:6px;text-align:right;">ملاحظات</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr style="background:#f1f5f9;font-weight:900;">
        <td colspan="3" style="border:1px solid #cbd5e1;padding:6px;text-align:center;">الإجمالي العام</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;color:#1e3a8a;font-size:9.5pt;">${owner.mon || 0} س</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;color:#92400e;font-size:9.5pt;">${owner.monTrips || 0} ن</td>
        <td style="border:1px solid #cbd5e1;padding:6px;"></td>
      </tr>
    </tfoot>
  </table>

  <div style="margin-top:25px;display:flex;justify-content:space-between;padding-top:15px;border-top:1.5px solid #0f172a;text-align:center;font-weight:bold;font-size:8.5pt;">
    <div style="width:28%;">
      <div style="color:#475569;">مسؤول الحركة والمعدات</div>
      <div style="margin-top:25px;color:#94a3b8;">...................................</div>
    </div>
    <div style="width:28%;">
      <div style="color:#475569;">مهندس / مدير الموقع</div>
      <div style="margin-top:25px;color:#94a3b8;">...................................</div>
    </div>
    <div style="width:28%;">
      <div style="color:#475569;">توقيع المالك / المقاول</div>
      <div style="margin-top:25px;color:#94a3b8;">...................................</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        try { window.focus(); window.print(); } catch(e) {}
      }, 350);
    };
  </script>
</body>
</html>`;

  openPrintDocument('كشف تشغيل معدات المالك', fullHtml);
}
