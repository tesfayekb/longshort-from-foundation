import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { ReactNode } from 'react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/lib/table-constants';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /**
   * FP-030 — when true, cell + header get `text-right font-mono tabular-nums`
   * so digit columns align as columns regardless of width.
   */
  numeric?: boolean;
}

export type DataTableDensity = 'comfortable' | 'compact';

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Total count for server-side pagination */
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  /**
   * FP-030 — when provided, the pagination footer renders a page-size
   * selector (25 / 50 / 100 by default). Backward-compatible: existing
   * consumers that don't pass this don't get the selector.
   */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  /**
   * FP-030 — `'compact'` reduces row + header vertical padding for
   * dense Long-Short tables. Default `'comfortable'` preserves the
   * pre-FP-030 appearance for admin / non-longshort consumers.
   */
  density?: DataTableDensity;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<T>({
  columns,
  data,
  total,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  density = 'comfortable',
  onRowClick,
  emptyTitle = 'No data',
  emptyDescription = 'No records found.',
}: DataTableProps<T>) {
  const totalPages = total != null ? Math.ceil(total / pageSize) : 1;
  const showPagination = total != null && (totalPages > 1 || !!onPageSizeChange);

  const headerPadY = density === 'compact' ? 'py-1.5' : 'py-3';
  const cellPadY = density === 'compact' ? 'py-1.5' : 'py-3';

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 ${headerPadY} ${
                  col.numeric ? 'text-right font-mono tabular-nums' : ''
                } ${col.className ?? ''}`}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => (
            <TableRow
              key={index}
              className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : 'hover:bg-muted/50'}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={`px-4 ${cellPadY} ${
                    col.numeric ? 'text-right font-mono tabular-nums' : ''
                  } ${col.className ?? ''}`}
                >
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showPagination && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total!)} of {total}
            </p>
            {onPageSizeChange && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Rows:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => onPageSizeChange(Number(v))}
                >
                  <SelectTrigger
                    className="h-7 w-[70px] text-xs"
                    aria-label="Rows per page"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((opt) => (
                      <SelectItem key={opt} value={String(opt)} className="text-xs">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1 || totalPages <= 1}
              onClick={() => onPageChange?.(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages || totalPages <= 1}
              onClick={() => onPageChange?.(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
