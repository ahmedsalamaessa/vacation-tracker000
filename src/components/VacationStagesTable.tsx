import React, { useState } from 'react';

export default function VacationStagesTable() {
  const [isVisible, setIsVisible] = useState(false);

  if (!isVisible) {
    return (
      <button 
        onClick={() => setIsVisible(true)}
        className="flex items-center gap-2 mx-auto px-4 py-2 text-xs font-black text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all shadow-sm"
      >
        <span>📖 عرض دليل حساب الإجازات</span>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button 
          onClick={() => setIsVisible(false)}
          className="px-4 py-2 text-xs font-black text-slate-500 bg-slate-100 border border-slate-200 rounded-full hover:bg-slate-200 transition-all"
        >
          ✕ إخفاء الدليل
        </button>
      </div>
      
      <div className="rounded-[2rem] border-2 border-yellow-200 bg-yellow-50 p-4 shadow-sm overflow-hidden">
        <div className="text-center mb-4">
          <h3 className="text-lg font-black text-yellow-800 flex items-center justify-center gap-2">
            📋 نظام الإجازات المعتمد
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center border-collapse bg-white rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-yellow-100 text-yellow-900 font-black">
                <th className="p-3 border border-yellow-200">المرحلة</th>
                <th className="p-3 border border-yellow-200">الأيام</th>
                <th className="p-3 border border-yellow-200">الحساب</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-slate-700">
                <td className="p-3 border border-yellow-100 font-bold">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full text-[10px] ml-2">1</span>
                  المرحلة الأولى
                </td>
                <td className="p-3 border border-yellow-100">1 إلى 12 يوم عمل</td>
                <td className="p-3 border border-yellow-100 font-medium">الإجازات = أيام العمل ÷ 4 ثم تقريب لأسفل</td>
              </tr>
              <tr className="text-slate-700">
                <td className="p-3 border border-yellow-100 font-bold">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full text-[10px] ml-2">2</span>
                  المرحلة الثانية
                </td>
                <td className="p-3 border border-yellow-100">13 إلى 18 يوم عمل</td>
                <td className="p-3 border border-yellow-100 font-medium">الإجازات = أيام العمل ÷ 4.5 ثم تقريب لأسفل</td>
              </tr>
              <tr className="text-slate-700">
                <td className="p-3 border border-yellow-100 font-bold">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full text-[10px] ml-2">3</span>
                  المرحلة الثالثة
                </td>
                <td className="p-3 border border-yellow-100">19 يوم عمل أو أكثر</td>
                <td className="p-3 border border-yellow-100 font-medium">الإجازات = أيام العمل ÷ 5 ثم تقريب لأسفل</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 p-3 bg-white/50 rounded-xl border border-yellow-100 text-center">
          <div className="text-xs font-black text-yellow-800 mb-2">جدول تحقق سريع:</div>
          <div className="text-sm font-bold text-slate-600 flex flex-wrap justify-center gap-x-4 gap-y-1">
            <span>4 = 1</span>
            <span>12 = 3</span>
            <span>17 = 3</span>
            <span>18 = 4</span>
            <span>25 = 5</span>
            <span>30 = 6</span>
            <span>50 = 10</span>
          </div>
        </div>
      </div>
    </div>
  );
}
