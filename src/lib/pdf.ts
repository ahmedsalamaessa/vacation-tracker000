export function printHtml(title: string, bodyHtml: string) {
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    alert("المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة وحاول مرة أخرى.");
    return;
  }
  win.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: 'Cairo', Arial, sans-serif; padding: 28px; color: #0f172a; direction: rtl; }
          h1 { text-align: center; margin-bottom: 8px; }
          .subtitle { text-align: center; color: #64748b; margin-bottom: 24px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
          th { background: #f1f5f9; }
          .footer { margin-top: 28px; text-align: center; font-weight: 800; color: #334155; }
          @media print { button { display: none; } body { padding: 12px; } }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="subtitle">نظام إدارة الإجازات • قسم المساحة</div>
        ${bodyHtml}
        <div class="footer">Developed & Maintained by Eng Ahmed Salama</div>
        <script>window.onload = () => { window.print(); };</script>
      </body>
    </html>
  `);
  win.document.close();
}
