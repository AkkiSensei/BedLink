import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
  accessor?: (row: T) => any;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyMessage?: string;
  headerActions?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  searchable = true,
  searchPlaceholder = 'Search records...',
  searchFilter,
  emptyTitle,
  emptyDescription = 'Try adjusting your search query or filters.',
  emptyMessage,
  headerActions
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const filteredData = useMemo(() => {
    let result = [...data];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (searchFilter) {
        result = result.filter(row => searchFilter(row, q));
      } else {
        result = result.filter(row => {
          return columns.some(col => {
            const val = col.accessor ? col.accessor(row) : (row as any)[col.key];
            return String(val ?? '').toLowerCase().includes(q);
          });
        });
      }
    }

    if (sortKey) {
      const col = columns.find(c => c.key === sortKey);
      result.sort((a, b) => {
        const valA = col?.accessor ? col.accessor(a) : (a as any)[sortKey];
        const valB = col?.accessor ? col.accessor(b) : (b as any)[sortKey];

        if (valA === valB) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;

        const compare = valA > valB ? 1 : -1;
        return sortDirection === 'asc' ? compare : -compare;
      });
    }

    return result;
  }, [data, searchQuery, searchFilter, columns, sortKey, sortDirection]);

  return (
    <div className="flex flex-col gap-2.5 w-full flex-1 min-h-0">
      {(searchable || headerActions) && (
        <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
          {searchable && (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-lg text-[var(--text-app)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
              />
            </div>
          )}
          {headerActions && (
            <div className="flex items-center gap-2 ml-auto">
              {headerActions}
            </div>
          )}
        </div>
      )}

      <div className="border border-[var(--border-app)] rounded-xl overflow-hidden bg-[var(--bg-surface)] shadow-xs flex-1 flex flex-col min-h-0">
        <div className="overflow-auto min-h-0 flex-1" data-scroll-region>
          <table className="w-full text-left text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--bg-surface-raised)]" data-scroll-pinned>
              <tr className="border-b border-[var(--border-app)] bg-[var(--bg-surface-raised)] text-[var(--text-muted)] font-medium text-xs uppercase tracking-wider">
                {columns.map(col => {
                  const isSorted = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      style={{ width: col.width }}
                      className={`px-4 py-3 select-none ${
                        col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                      } ${col.sortable ? 'cursor-pointer hover:text-[var(--text-app)] transition-colors' : ''}`}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      <div className={`inline-flex items-center gap-1.5 ${
                        col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'
                      }`}>
                        <span>{col.header}</span>
                        {col.sortable && (
                          <span className="text-[var(--text-muted)]">
                            {isSorted ? (
                              sortDirection === 'asc' ? (
                                <ChevronUp className="w-3.5 h-3.5 text-[var(--primary)]" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-[var(--primary)]" />
                              )
                            ) : (
                              <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-app)]">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center">
                      <div className="w-10 h-10 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center mb-3">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <p className="font-semibold text-[var(--text-app)] text-sm mb-1">{emptyMessage || emptyTitle || 'No records found'}</p>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">{emptyDescription}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => (
                  <tr
                    key={keyExtractor ? keyExtractor(row) : idx}
                    onClick={() => onRowClick?.(row)}
                    className={`transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-[var(--bg-app)]' : ''
                    }`}
                  >
                    {columns.map(col => {
                      const content = col.render
                        ? col.render(row, idx)
                        : col.accessor
                        ? col.accessor(row)
                        : (row as any)[col.key];

                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 font-normal text-[var(--text-app)] ${
                            col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-[var(--bg-surface-raised)] border-t border-[var(--border-app)] text-xs text-[var(--text-muted)] flex items-center justify-between shrink-0">
          <span>Showing <strong className="font-semibold text-[var(--text-app)]">{filteredData.length}</strong> of <strong className="font-semibold text-[var(--text-app)]">{data.length}</strong> records</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[var(--primary)] hover:underline font-medium"
            >
              Clear search filter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
