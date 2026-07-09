/**
 * Virtualized table for large attendance sheets
 * Renders only visible rows to prevent browser freeze with 50+ employees
 */

import { useRef, useCallback, useState, useEffect } from 'react';

interface VirtualTableProps {
  headers: { label: string; width?: number; className?: string }[];
  rows: {
    stickyRight: React.ReactNode;
    cells: React.ReactNode[];
    key: string | number;
  }[];
  rowHeight?: number;
  overscan?: number;
  stickyHeader?: boolean;
  emptyMessage?: string;
}

export default function VirtualTable({
  headers,
  rows,
  rowHeight = 56,
  overscan = 5,
  stickyHeader = true,
  emptyMessage = 'لا توجد بيانات',
}: VirtualTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [visibleHeight, setVisibleHeight] = useState(600);

  const totalHeight = rows.length * rowHeight;
  const visibleCount = Math.ceil(visibleHeight / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollY / rowHeight) - overscan);
  const endIndex = Math.min(rows.length, startIndex + visibleCount + overscan * 2);
  const visibleRows = rows.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollY(el.scrollTop);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setVisibleHeight(el.clientHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (rows.length === 0) {
    return (
      <div ref={containerRef} className="overflow-auto max-h-[500px] border border-slate-200 rounded-xl">
        <div className="text-center text-slate-500 py-10 font-bold">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-auto" style={{ maxHeight: '500px' }} onScroll={handleScroll}>
      <table className="border-collapse text-sm w-full">
        <thead>
          <tr className={stickyHeader ? 'sticky top-0 z-10 bg-slate-100 shadow-sm' : 'bg-slate-100'}>
            <th className={`border border-slate-200 p-2 text-right min-w-[140px] bg-slate-100 z-20 ${stickyHeader ? 'sticky right-0' : ''}`}>الموظف</th>
            {headers.map((h, i) => (
              <th key={i} className={`border border-slate-200 p-1 min-w-[64px] ${h.className || ''}`}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody style={{ position: 'relative' }}>
          {/* Spacer before visible rows */}
          <tr style={{ height: offsetY + 'px' }}>
            <td colSpan={headers.length + 1} style={{ padding: 0, border: 'none' }}></td>
          </tr>
          {/* Visible rows */}
          {visibleRows.map((row, vi) => {
            const globalIndex = startIndex + vi;
            return (
              <tr key={row.key} style={{ height: rowHeight + 'px' }}>
                <td className={`sticky right-0 bg-white border border-slate-200 p-2 text-right z-10 ${globalIndex % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                  {row.stickyRight}
                </td>
                {row.cells.map((cell, ci) => (
                  <td key={ci} className="border border-slate-200 p-0.5 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
          {/* Spacer after visible rows */}
          <tr style={{ height: (totalHeight - offsetY - visibleRows.length * rowHeight) + 'px' }}>
            <td colSpan={headers.length + 1} style={{ padding: 0, border: 'none' }}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
