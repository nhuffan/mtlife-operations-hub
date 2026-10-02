import * as XLSX from "xlsx-js-style";
import type { MasterItem } from "@/lib/features/masters/masters";

type BdPersonnelExportRow = {
  "#": number | string;
  Name: string;
  "BD Level"?: string;
  KPI?: string;
  "New Customers": string;
  Points: string;
  Performance?: string;
  Bonus: string;
  "Package Amount": string;
  Status: string;
};

type ExportCellValue = string | number | null | undefined;
type ExportRow = Record<string, ExportCellValue>;

export function exportBdPersonnelToExcel(
  rows: MasterItem[],
  options: {
    title: string;
    selectedMonthLabel: string;
    showMonthlyColumns: boolean;
    bdLevelByBdId: Record<string, string>;
    bdLevels: MasterItem[];
    monthlyKpis: Record<string, number>;
    totals: Record<
      string,
      { points: number; money: number; packageAmount: number | null }
    >;
    trackingTotals: Record<string, { newCustomers: number }>;
  }
) {
  const data: BdPersonnelExportRow[] = rows.map((row, index) => {
    const points = options.totals[row.id]?.points ?? 0;
    const bdLevelId = options.bdLevelByBdId[row.id] ?? "";
    const kpi = bdLevelId ? options.monthlyKpis[bdLevelId] ?? 0 : 0;
    const packageAmount = options.totals[row.id]?.packageAmount;

    const exportRow: BdPersonnelExportRow = {
      "#": String(index + 1),
      Name: row.label,
      "New Customers": (
        options.trackingTotals[row.id]?.newCustomers ?? 0
      ).toLocaleString("en-US"),
      Points: points.toLocaleString("en-US"),
      Bonus: (options.totals[row.id]?.money ?? 0).toLocaleString("en-US"),
      "Package Amount":
        packageAmount != null ? packageAmount.toLocaleString("en-US") : "—",
      Status: row.is_active ? "Active" : "Inactive",
    };

    if (options.showMonthlyColumns) {
      exportRow["BD Level"] =
        options.bdLevels.find((level) => level.id === bdLevelId)?.label ?? "—";
      exportRow.KPI = kpi ? kpi.toLocaleString("en-US") : "—";
      exportRow.Performance = kpi ? `${((points / kpi) * 100).toFixed(1)}%` : "—";
    }

    return exportRow;
  });

  const headers = options.showMonthlyColumns
    ? [
      "#",
      "Name",
      "BD Level",
      "KPI",
      "New Customers",
      "Points",
      "Performance",
      "Bonus",
      "Package Amount",
      "Status",
    ]
    : [
      "#",
      "Name",
      "New Customers",
      "Points",
      "Bonus",
      "Package Amount",
      "Status",
    ];

  const worksheetData = [
    [options.title],
    [`Period: ${options.selectedMonthLabel}`],
    [],
    headers,
    ...data.map((row) => headers.map((header) => row[header as keyof BdPersonnelExportRow] ?? "")),
  ];

  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  const lastColumn = Math.max(headers.length - 1, 0);

  ws["!merges"] = [
    {
      s: { r: 0, c: 0 },
      e: { r: 0, c: lastColumn },
    },
  ];

  const titleCell = ws["A1"];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16 },
      alignment: { horizontal: "left" },
    };
  }

  const subtitleCell = ws["A2"];
  if (subtitleCell) {
    subtitleCell.s = {
      font: { italic: true, sz: 11 },
      alignment: { horizontal: "left" },
    };
  }

  headers.forEach((_, colIndex) => {
    const cellAddress = XLSX.utils.encode_cell({ r: 3, c: colIndex });
    if (ws[cellAddress]) {
      ws[cellAddress].s = {
        font: { bold: true, sz: 13 },
        fill: { fgColor: { rgb: "EDEFF3" } },
      };
    }
  });

  data.forEach((_, rowIndex) => {
    const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 4, c: 0 });
    if (ws[cellAddress]) {
      ws[cellAddress].s = {
        alignment: { horizontal: "left" },
      };
    }
  });

  const typedData: ExportRow[] = data as unknown as ExportRow[];
  ws["!cols"] = headers.map((key) => {
    const maxLength = Math.max(
      key.length,
      options.title.length,
      ...typedData.map((row) => String(row[key] ?? "").length)
    );
    return { wch: Math.min(maxLength + 3, 36) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BD Personnel");

  XLSX.writeFile(
    wb,
    `bd_personnel_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
