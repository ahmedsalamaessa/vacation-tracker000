export function exportToCSV(
  rows: Record<string, unknown>[],
  filename: string,
  headers: Record<string, string>,
): void {
  const keys = Object.keys(headers);

  const escape = (val: unknown): string => {
    const s = val == null ? "" : String(val);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    keys.map((k) => escape(headers[k])).join(","),
    ...rows.map((row) => keys.map((k) => escape(row[k])).join(",")),
  ];

  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 📊 تصدير تقرير Excel منسق (RTL بألوان وحدود)
 * بيفتح مباشرة في Excel و Google Sheets
 */
export function exportToExcelHTML(
  rows: Record<string, unknown>[],
  filename: string,
  headers: Record<string, string>,
  title: string,
): void {
  const keys = Object.keys(headers);

  const esc = (val: unknown): string =>
    String(val ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const th = keys.map((k) => `<th style="background:#1e3a8a;color:#fff;padding:8px;border:1px solid #334155;font-size:12px;">${esc(headers[k])}</th>`).join("");
  const trs = rows
    .map(
      (row, i) =>
        `<tr style="background:${i % 2 === 0 ? "#f8fafc" : "#ffffff"}">` +
        keys.map((k) => `<td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:12px;text-align:center;">${esc(row[k])}</td>`).join("") +
        `</tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Tahoma,sans-serif;">
<h2 style="color:#1e3a8a;text-align:center;margin-bottom:4px;">${esc(title)}</h2>
<p style="text-align:center;color:#64748b;font-size:11px;margin-top:0;">عدد الموظفين: ${rows.length} — تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}</p>
<table style="border-collapse:collapse;width:100%;direction:rtl;">
<thead><tr>${th}</tr></thead>
<tbody>${trs}</tbody>
</table>
</body>
</html>`;

  const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
