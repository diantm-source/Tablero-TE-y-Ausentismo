import React, { useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  searchPlaceholder?: string;
  defaultPageSize?: number;
  emptyMessage?: string;
  headerAction?: React.ReactNode;
}

export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = 'Buscar en la tabla...',
  defaultPageSize = 10,
  emptyMessage = 'No se encontraron registros.',
  headerAction,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: defaultPageSize,
      },
    },
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Top Filter and Actions Bar */}
      <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <i className="bi bi-search absolute left-3 top-2.5 text-slate-400 text-xs"></i>
          <input
            type="text"
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {headerAction}

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Mostrar:</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setPageSize(newSize);
                table.setPageSize(newSize);
              }}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} filas
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 select-none">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSortable = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`px-3 py-2.5 transition-colors ${
                        isSortable ? 'cursor-pointer hover:bg-slate-200/70' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {isSortable && (
                          <span className="text-slate-400">
                            {sortDir === 'asc' ? (
                              <i className="bi bi-arrow-up text-blue-600 font-bold"></i>
                            ) : sortDir === 'desc' ? (
                              <i className="bi bi-arrow-down text-blue-600 font-bold"></i>
                            ) : (
                              <i className="bi bi-arrow-down-up text-[10px]"></i>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 text-slate-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
        <div>
          Mostrando página{' '}
          <span className="font-semibold text-slate-800">
            {table.getState().pagination.pageIndex + 1}
          </span>{' '}
          de <span className="font-semibold text-slate-800">{Math.max(table.getPageCount(), 1)}</span> (Total:{' '}
          <span className="font-semibold text-slate-800">{table.getFilteredRowModel().rows.length}</span> registros)
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="px-2 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 font-semibold"
            title="Primera página"
          >
            <i className="bi bi-chevron-double-left"></i>
          </button>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
          >
            Siguiente
          </button>
          <button
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="px-2 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 font-semibold"
            title="Última página"
          >
            <i className="bi bi-chevron-double-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
