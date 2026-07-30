import { getEmployees, getAttendance, getVacations, getLocations } from './db';
import { calculateEmployeeBalance, sumApprovedByTypes } from './balance';
import type { Employee } from './types';

interface EmployeeRow {
  emp: Employee;
  totalPresent: number;
  effectivePresent: number;
  stageName: string;
  earned: number;
  taken: number;
  saharBal: number;
  finalBalance: number;
  deficitDays: number;
  hasDeficit: boolean;
  absent: number;
  sick: number;
  official: number;
  annual: number;
  unpaid: number;
  locationNames: string;
}

function getStageName(effectivePresent: number): string {
  if (effectivePresent < 0) return 'عجز';
  if (effectivePresent === 0) return 'قبل البداية';
  if (effectivePresent <= 12) return 'الأولى (1-12)';
  if (effectivePresent <= 18) return 'الثانية (13-18)';
  return 'الثالثة (19+)';
}

function buildRow(emp: Employee): EmployeeRow {
  const attAll = getAttendance();
  const vacAll = getVacations();
  const locAll = getLocations();

  const empAtt = attAll.filter(a => a.employeeId === emp.id);
  const empVac = vacAll.filter(v => v.employeeId === emp.id);

  const bd = calculateEmployeeBalance(empAtt, empVac);
  const c = (s: string) => empAtt.filter(r => r.status === s).length;

  const saharEarned = c('سهر');
  const saharSpentAtt = c('بدل سهرة');
  const saharSpentVac = sumApprovedByTypes(empVac, ['سهرة']);
  const saharBal = Math.max(0, saharEarned - (saharSpentAtt + saharSpentVac));

  const locationNames = (emp.locationIds || [])
    .map(id => locAll.find(l => l.id === id)?.name)
    .filter(Boolean)
    .join('، ') || '—';

  return {
    emp,
    totalPresent: bd.totalPresent,
    effectivePresent: bd.effectivePresent,
    stageName: getStageName(bd.effectivePresent),
    earned: bd.earned,
    taken: bd.taken,
    saharBal,
    finalBalance: bd.netBalance + saharBal,
    deficitDays: bd.deficitDays,
    hasDeficit: bd.hasDeficit,
    absent: c('غياب'),
    sick: c('إجازة مرضية'),
    official: c('إجازة رسمية'),
    annual: c('إجازة سنوية'),
    unpaid: c('بدون مرتب'),
    locationNames,
  };
}

const printStyle = `
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Cairo', 'Arial', sans-serif; direction: rtl; margin: 20px; color: #1e293b; }
    h1 { text-align: center; color: #1e40af; margin-bottom: 5px; font-size: 22px; }
    .subtitle { text-align: center; color: #64748b; font-size: 12px; margin-bottom: 20px; }
    .print-date { text-align: left; color: #64748b; font-size: 11px; margin-bottom: 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: #1e40af; color: white; padding: 10px 6px; text-align: center; font-weight: bold; }
    td { padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center; }
    tr:nth-child(even) td { background: #f8fafc; }
    .deficit { color: #dc2626; font-weight: bold; background: #fee2e2 !important; }
    .positive { color: #059669; font-weight: bold; }
    .name-col { text-align: right; font-weight: bold; }
    .header-box { border: 2px solid #1e40af; border-radius: 8px; padding: 15px; margin-bottom: 20px; background: #eff6ff; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
    .info-item { background: #f1f5f9; padding: 8px 12px; border-radius: 6px; }
    .info-label { font-size: 10px; color: #64748b; margin-bottom: 3px; }
    .info-value { font-weight: bold; color: #1e293b; font-size: 13px; }
    .card-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; }
    .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; background: white; }
    .card-label { font-size: 10px; color: #64748b; margin-bottom: 4px; }
    .card-value { font-size: 20px; font-weight: bold; color: #1e40af; }
    .card-value.red { color: #dc2626; }
    .card-value.green { color: #059669; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; }
    .sig-box { text-align: center; width: 30%; }
    .sig-line { border-top: 1px solid #1e293b; margin-top: 40px; padding-top: 5px; font-size: 11px; }
    .deficit-badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }
    .page-break { page-break-after: always; }
    @media print {
      body { margin: 10px; }
      .no-print { display: none !important; }
      button { display: none !important; }
    }
  </style>
`;

function formatDate(): string {
  const d = new Date();
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function openPrintWindow(html: string) {
  const w = window.open('', '_blank', 'width=1000,height=700');
  if (!w) {
    alert('لم يتم فتح نافذة الطباعة - تأكد من السماح للمنبثقات');
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 500);
}

/**
 * 🖨️ طباعة جدول مجمع لكل الموظفين
 */
export function printAllBalancesTable(employeeIds?: number[]) {
  const allEmps = getEmployees().filter(e => e.active);
  const targetEmps = employeeIds && employeeIds.length > 0
    ? allEmps.filter(e => employeeIds.includes(e.id))
    : allEmps;

  const rows = targetEmps
    .sort((a, b) => {
      const roleOrder: Record<string, number> = { admin: 0, manager: 1, employee: 2 };
      const diff = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    })
    .map(buildRow);

  const tableRows = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="name-col">${r.emp.name}</td>
      <td>${r.emp.jobTitle || '—'}</td>
      <td>${r.locationNames}</td>
      <td>${r.totalPresent}</td>
      <td class="${r.effectivePresent < 0 ? 'deficit' : ''}">${r.effectivePresent}</td>
      <td>${r.stageName}</td>
      <td class="positive">${r.earned}</td>
      <td>${r.taken}</td>
      <td>${r.saharBal}</td>
      <td class="${r.finalBalance < 0 ? 'deficit' : 'positive'}">${r.finalBalance}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>تقرير أرصدة الموظفين</title>
      ${printStyle}
    </head>
    <body>
      <h1>📊 تقرير أرصدة الإجازات - جميع الموظفين</h1>
      <div class="subtitle">قسم المساحة · نظام إدارة الإجازات</div>
      <div class="print-date">🗓️ تاريخ الطباعة: ${formatDate()} | إجمالي الموظفين: ${rows.length}</div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>الاسم</th>
            <th>الوظيفة</th>
            <th>الموقع</th>
            <th>إجمالي الحضور</th>
            <th>الأيام الفعلية</th>
            <th>المرحلة</th>
            <th>مستحقة</th>
            <th>مأخوذة</th>
            <th>بدل السهرة</th>
            <th>صافي الرصيد</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="signature-area">
        <div class="sig-box">
          <div>مدير الموارد البشرية</div>
          <div class="sig-line">التوقيع</div>
        </div>
        <div class="sig-box">
          <div>مدير القسم</div>
          <div class="sig-line">التوقيع</div>
        </div>
        <div class="sig-box">
          <div>الموظف المسؤول</div>
          <div class="sig-line">التوقيع</div>
        </div>
      </div>
    </body>
    </html>
  `;

  openPrintWindow(html);
}

/**
 * 🖨️ طباعة ورقة فردية لكل موظف (كل موظف في صفحة منفصلة)
 */
export function printIndividualBalances(employeeIds?: number[]) {
  const allEmps = getEmployees().filter(e => e.active);
  const targetEmps = employeeIds && employeeIds.length > 0
    ? allEmps.filter(e => employeeIds.includes(e.id))
    : allEmps;

  const rows = targetEmps
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(buildRow);

  const pages = rows.map((r, idx) => `
    <div class="${idx < rows.length - 1 ? 'page-break' : ''}">
      <h1>📄 كشف رصيد إجازات</h1>
      <div class="subtitle">قسم المساحة · نظام إدارة الإجازات</div>
      <div class="print-date">🗓️ تاريخ الطباعة: ${formatDate()}</div>

      <div class="header-box">
        <h2 style="margin:0 0 10px 0; color:#1e40af;">
          👤 ${r.emp.name}
          ${r.hasDeficit ? `<span class="deficit-badge">⚠️ عجز ${r.deficitDays} يوم</span>` : ''}
        </h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">الوظيفة</div>
            <div class="info-value">${r.emp.jobTitle || '—'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">اسم المستخدم</div>
            <div class="info-value">@${r.emp.username || '—'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">الهاتف</div>
            <div class="info-value">${r.emp.phone || '—'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">الموقع</div>
            <div class="info-value">${r.locationNames}</div>
          </div>
        </div>
      </div>

      <h3 style="color:#1e40af; border-bottom:2px solid #1e40af; padding-bottom:5px;">📊 ملخص الرصيد</h3>
      <div class="card-grid">
        <div class="card">
          <div class="card-label">إجمالي الحضور</div>
          <div class="card-value">${r.totalPresent}</div>
        </div>
        <div class="card">
          <div class="card-label">الأيام الفعلية</div>
          <div class="card-value ${r.effectivePresent < 0 ? 'red' : ''}">${r.effectivePresent}</div>
        </div>
        <div class="card">
          <div class="card-label">المرحلة الحالية</div>
          <div class="card-value" style="font-size:14px;">${r.stageName}</div>
        </div>
        <div class="card">
          <div class="card-label">بدل السهرة</div>
          <div class="card-value">${r.saharBal}</div>
        </div>
        <div class="card">
          <div class="card-label">إجازات مستحقة</div>
          <div class="card-value green">${r.earned}</div>
        </div>
        <div class="card">
          <div class="card-label">إجازات مأخوذة</div>
          <div class="card-value">${r.taken}</div>
        </div>
        <div class="card">
          <div class="card-label">صافي الرصيد</div>
          <div class="card-value ${r.finalBalance < 0 ? 'red' : 'green'}">${r.finalBalance} يوم</div>
        </div>
        <div class="card">
          <div class="card-label">${r.hasDeficit ? 'أيام العجز' : 'الحالة'}</div>
          <div class="card-value ${r.hasDeficit ? 'red' : 'green'}" style="font-size:14px;">
            ${r.hasDeficit ? r.deficitDays + ' يوم' : '✅ سليم'}
          </div>
        </div>
      </div>

      <h3 style="color:#1e40af; border-bottom:2px solid #1e40af; padding-bottom:5px;">📋 تفاصيل إضافية</h3>
      <table>
        <tr>
          <th>غياب</th>
          <th>إجازة مرضية</th>
          <th>إجازة رسمية</th>
          <th>إجازة سنوية</th>
          <th>بدون مرتب</th>
        </tr>
        <tr>
          <td>${r.absent}</td>
          <td>${r.sick}</td>
          <td>${r.official}</td>
          <td>${r.annual}</td>
          <td>${r.unpaid}</td>
        </tr>
      </table>

      <div class="signature-area">
        <div class="sig-box">
          <div>الموظف</div>
          <div class="sig-line">التوقيع</div>
        </div>
        <div class="sig-box">
          <div>مدير القسم</div>
          <div class="sig-line">التوقيع</div>
        </div>
        <div class="sig-box">
          <div>الموارد البشرية</div>
          <div class="sig-line">التوقيع</div>
        </div>
      </div>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>كشوف أرصدة الموظفين</title>
      ${printStyle}
    </head>
    <body>
      ${pages}
    </body>
    </html>
  `;

  openPrintWindow(html);
}

/**
 * 🖨️ طباعة موظف واحد (ورقة فردية)
 */
export function printSingleEmployee(employeeId: number) {
  printIndividualBalances([employeeId]);
}
