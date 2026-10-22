import "server-only";
import ExcelJS from "exceljs";

const NAVY = "FF23305A";

export function newBook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tejas Work Tracker";
  wb.created = new Date();
  return wb;
}

/** A sheet with a title row, a navy header row, frozen panes and column widths. */
export function addTable(wb: ExcelJS.Workbook, name: string, title: string, columns: { header: string; width: number; numFmt?: string }[], rows: (string | number | Date | null)[][]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: NAVY } };
  const header = ws.getRow(3);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", wrapText: true };
    ws.getColumn(i + 1).width = c.width;
    if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
  });
  header.height = 22;
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: "frozen", ySplit: 3 }];
  if (rows.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: columns.length } };
  return ws;
}

export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
