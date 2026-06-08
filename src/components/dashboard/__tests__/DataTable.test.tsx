/**
 * FP-030 — DataTable foundation tests.
 *
 * Covers:
 *   - pageSize default is the shared DEFAULT_PAGE_SIZE (25).
 *   - density="compact" applies the tighter `py-1.5` padding to
 *     header + data cells.
 *   - numeric columns get `text-right font-mono tabular-nums` on
 *     both header + cell.
 *   - The optional page-size selector renders only when
 *     onPageSizeChange is supplied, and changing it invokes the
 *     callback (backward-compatible for non-longshort consumers
 *     that don't pass the prop — like admin InvitationsTable).
 *
 * No `any` (Gate-4 lint): all column generics are explicitly typed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { DEFAULT_PAGE_SIZE } from '@/lib/table-constants';

interface Row {
  id: number;
  label: string;
  amount: number;
}

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    label: `Row ${i + 1}`,
    amount: (i + 1) * 100,
  }));
}

const columns: DataTableColumn<Row>[] = [
  { key: 'label', header: 'Label', cell: (r) => r.label },
  { key: 'amount', header: 'Amount', numeric: true, cell: (r) => r.amount },
];

describe('DataTable (FP-030)', () => {
  it('defaults pageSize to DEFAULT_PAGE_SIZE (25) when prop is omitted', () => {
    const rows = makeRows(3);
    render(<DataTable columns={columns} data={rows} total={60} page={1} onPageChange={() => {}} />);
    // 60 / 25 = 3 pages → footer renders "1–25 of 60"
    expect(screen.getByText(/1–25 of 60/)).toBeInTheDocument();
    expect(DEFAULT_PAGE_SIZE).toBe(25);
  });

  it('applies compact density padding to header + cell', () => {
    const rows = makeRows(2);
    const { container } = render(
      <DataTable columns={columns} data={rows} density="compact" />,
    );
    // Headers use py-1.5 in compact mode.
    const headers = container.querySelectorAll('thead th');
    expect(headers.length).toBe(2);
    headers.forEach((th) => expect(th.className).toContain('py-1.5'));
    // Data cells use py-1.5 in compact mode.
    const cells = container.querySelectorAll('tbody td');
    expect(cells.length).toBe(4);
    cells.forEach((td) => expect(td.className).toContain('py-1.5'));
  });

  it('keeps comfortable density (py-3) by default for non-longshort consumers', () => {
    const rows = makeRows(1);
    const { container } = render(<DataTable columns={columns} data={rows} />);
    const cells = container.querySelectorAll('tbody td');
    cells.forEach((td) => expect(td.className).toContain('py-3'));
    cells.forEach((td) => expect(td.className).not.toContain('py-1.5'));
  });

  it('marks numeric columns with font-mono + tabular-nums + text-right on header and cell', () => {
    const rows = makeRows(1);
    const { container } = render(<DataTable columns={columns} data={rows} />);
    const headers = container.querySelectorAll('thead th');
    // index 1 is the "Amount" (numeric) column
    expect(headers[1].className).toContain('font-mono');
    expect(headers[1].className).toContain('tabular-nums');
    expect(headers[1].className).toContain('text-right');
    const cells = container.querySelectorAll('tbody td');
    expect(cells[1].className).toContain('font-mono');
    expect(cells[1].className).toContain('tabular-nums');
    expect(cells[1].className).toContain('text-right');
    // Non-numeric column stays normal.
    expect(headers[0].className).not.toContain('font-mono');
    expect(cells[0].className).not.toContain('font-mono');
  });

  it('does NOT render the page-size selector when onPageSizeChange is omitted (backward-compat)', () => {
    const rows = makeRows(25);
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={60}
        page={1}
        pageSize={25}
        onPageChange={() => {}}
      />,
    );
    expect(screen.queryByRole('combobox', { name: /Rows per page/i })).not.toBeInTheDocument();
  });

  it('renders the page-size selector when onPageSizeChange is supplied and forwards changes', () => {
    const rows = makeRows(25);
    const onPageSizeChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={60}
        page={1}
        pageSize={25}
        onPageChange={() => {}}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: /Rows per page/i });
    expect(trigger).toBeInTheDocument();
    // Open the select; option "50" should appear.
    fireEvent.click(trigger);
    const option = screen.getByRole('option', { name: '50' });
    fireEvent.click(option);
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('renders pagination footer even on a single page when the size selector is enabled', () => {
    const rows = makeRows(5);
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={5}
        page={1}
        pageSize={25}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );
    // Single page = prev/next disabled, but size selector still present.
    expect(screen.getByRole('combobox', { name: /Rows per page/i })).toBeInTheDocument();
    const prev = screen.getByRole('button', { name: /Previous page/i });
    const next = screen.getByRole('button', { name: /Next page/i });
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
    // 1–5 of 5
    const footer = prev.closest('div')?.parentElement;
    expect(footer && within(footer).getByText(/1–5 of 5/)).toBeTruthy();
  });
});