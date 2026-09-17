/**
 * WhatsApp Reminder & Notification Helper
 * نظام إرسال تذكيرات ورسائل الواتساب الذكية للمساحين والموظفين
 */

/**
 * تنظيف وتنسيق رقم الهاتف ليتوافق مع رابط واتساب الدولي
 */
export function formatWhatsAppPhone(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';
  let clean = rawPhone.replace(/[\s\-\+\(\)]/g, '');
  
  // تحويل الأرقام المصرية (010, 011, 012, 015) للصيغة الدولية 2010...
  if (clean.startsWith('01')) {
    clean = '20' + clean.slice(1);
  } else if (clean.startsWith('0020')) {
    clean = '20' + clean.slice(4);
  } else if (clean.startsWith('+20')) {
    clean = '20' + clean.slice(3);
  }
  
  return clean;
}

/**
 * توليد رابط واتساب مع نص الرسالة المشفر
 */
export function createWhatsAppLink(phone: string | null | undefined, message: string): string {
  const formattedPhone = formatWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(message);
  if (!formattedPhone) {
    return `https://wa.me/?text=${encodedText}`;
  }
  return `https://wa.me/${formattedPhone}?text=${encodedText}`;
}

/**
 * نص تذكير البصمة بعد الساعة 12 ظهراً للمساح
 */
export function getCheckInReminderMessage(
  employeeName: string,
  dateString: string = 'اليوم',
  siteUrl: string = 'https://vacation-tracker000.vercel.app'
): string {
  return `السلام عليكم ورحمة الله يا بشمهندس ${employeeName} 👷‍♂️

⏰ *تذكير من إدارة قسم المساحة*
الساعة تجاوزت 12:00 ظهراً ولم يتم تسجيل بصمة حضورك لليوم (${dateString}) على النظام حتى الآن.

📍 *فضلاً افتح الرابط وسجل بصمتك في موقع العمل المعتمد لتفادي احتساب اليوم غياباً:*
🔗 ${siteUrl}

شكراً لتعاونكم 🤝`;
}

/**
 * فتح رابط الواتساب مباشرة للمساح
 */
export function sendWhatsAppCheckInReminder(
  employeeName: string,
  phone: string | null | undefined,
  dateString?: string
): boolean {
  const msg = getCheckInReminderMessage(employeeName, dateString);
  const link = createWhatsAppLink(phone, msg);
  window.open(link, '_blank');
  return true;
}
