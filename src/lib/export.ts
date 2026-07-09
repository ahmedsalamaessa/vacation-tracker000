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
