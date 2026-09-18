import JSZip from "jszip";
import * as XLSX from "xlsx-js-style";
import type { ReconciliationClient } from "@/lib/features/reconciliation/clients";

export interface ReconciliationRow {
  reconciledAt: string;
  orderId: string;
  productId: string;
  productName: string;
  comboPrice: number;
  serviceFee: number;
  reconciliationAmount: number;
}

export interface ReconciliationData {
  sourceFileName: string;
  sheetName: string;
  merchantName: string;
  statementId: string;
  periodStart: string;
  periodEnd: string;
  monthLabel: string;
  serviceFeeRate: number | null;
  rows: ReconciliationRow[];
  totals: {
    comboPrice: number;
    serviceFee: number;
    reconciliationAmount: number;
  };
}

const REQUIRED_HEADERS = {
  reconciledAt: ["thoi gian doi soat", "对账时间"],
  orderId: ["meituan dianping order number", "美团点评订单号", "ma so combo voucher"],
  productId: ["ma san pham", "产品编号"],
  productName: ["ten san pham", "产品名称"],
  comboPrice: ["gia combo", "套餐价格"],
  reconciliationAmount: ["tien doi soat", "对账金额"],
};

const DATA_START_ROW = 13;
const TEMPLATE_DATA_ROWS = 10;
const TEMPLATE_TOTAL_ROW = 23;
const TEMPLATE_LAST_ROW = 41;
const TEMPLATE_LAST_COLUMN = "H";
const XML_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\u3400-\u9fff%]+/g, " ")
    .trim();
}

function findHeaderIndex(headers: unknown[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeText);
  const normalizedHeaders = headers.map(normalizeText);
  const exact = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));

  if (exact >= 0) return exact;

  return normalizedHeaders.findIndex((header) =>
    normalizedAliases.some((alias) => alias.length > 3 && header.includes(alias))
  );
}

function asText(value: unknown) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    const hour = String(value.getHours()).padStart(2, "0");
    const minute = String(value.getMinutes()).padStart(2, "0");
    const second = String(value.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  return String(value ?? "").trim();
}

function parseMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const negative = /^\s*-/.test(raw) || /^\s*\(/.test(raw);
  const digits = raw.replace(/[^0-9]/g, "");
  const amount = digits ? Number(digits) : Number.NaN;

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid currency value: ${raw}`);
  }

  return negative ? -amount : amount;
}

function parseDateParts(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const dmyMatch = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmyMatch) {
    return {
      year: Number(dmyMatch[3]),
      month: Number(dmyMatch[2]),
      day: Number(dmyMatch[1]),
    };
  }

  return null;
}

function parseFileMetadata(fileName: string, rows: ReconciliationRow[]) {
  const merchantName = fileName.split("_")[0]?.trim() ?? "";
  const statementId = fileName.match(/账单ID[_-]?(\d+)/i)?.[1] ?? "";
  const periodMatch = fileName.match(/结算周期[_-]?(\d{8})-(\d{8})/i);

  let periodStart = "";
  let periodEnd = "";

  if (periodMatch) {
    const formatCompactDate = (value: string) =>
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    periodStart = formatCompactDate(periodMatch[1]);
    periodEnd = formatCompactDate(periodMatch[2]);
  } else {
    const datedRows = rows
      .map((row) => ({ raw: row.reconciledAt, parts: parseDateParts(row.reconciledAt) }))
      .filter((item): item is { raw: string; parts: NonNullable<typeof item.parts> } => Boolean(item.parts))
      .sort((a, b) =>
        `${a.parts.year}-${String(a.parts.month).padStart(2, "0")}-${String(a.parts.day).padStart(2, "0")}`.localeCompare(
          `${b.parts.year}-${String(b.parts.month).padStart(2, "0")}-${String(b.parts.day).padStart(2, "0")}`
        )
      );

    periodStart = datedRows[0]?.raw.slice(0, 10) ?? "";
    periodEnd = datedRows.at(-1)?.raw.slice(0, 10) ?? "";
  }

  const monthParts = parseDateParts(periodStart || rows[0]?.reconciledAt || "");
  const monthLabel = monthParts
    ? `${String(monthParts.month).padStart(2, "0")}-${monthParts.year}`
    : "MM-YYYY";

  return { merchantName, statementId, periodStart, periodEnd, monthLabel };
}

function detectFeeColumn(headers: unknown[]) {
  const normalized = headers.map(normalizeText);
  return normalized.findIndex(
    (header) => header.includes("phi dich vu") || header.includes("服务费") || /\d+(?:[.,]\d+)?%/.test(header)
  );
}

function detectFeeRate(header: unknown, rows: ReconciliationRow[]) {
  const match = String(header ?? "").match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (match) return Number(match[1].replace(",", "."));

  const rowWithRate = rows.find((row) => row.comboPrice > 0 && row.serviceFee >= 0);
  if (!rowWithRate) return null;
  return Number(((rowWithRate.serviceFee / rowWithRate.comboPrice) * 100).toFixed(2));
}

export function parseReconciliationWorkbook(buffer: ArrayBuffer, fileName: string): ReconciliationData {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    raw: true,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) throw new Error("The Excel file does not contain a data sheet.");

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  const headerRowIndex = matrix.findIndex((row) => {
    const headers = Array.isArray(row) ? row : [];
    return (
      findHeaderIndex(headers, REQUIRED_HEADERS.reconciledAt) >= 0 &&
      findHeaderIndex(headers, REQUIRED_HEADERS.reconciliationAmount) >= 0
    );
  });

  if (headerRowIndex < 0) {
    throw new Error("The reconciliation header row could not be found.");
  }

  const headers = matrix[headerRowIndex];
  const indices = {
    reconciledAt: findHeaderIndex(headers, REQUIRED_HEADERS.reconciledAt),
    orderId: findHeaderIndex(headers, REQUIRED_HEADERS.orderId),
    productId: findHeaderIndex(headers, REQUIRED_HEADERS.productId),
    productName: findHeaderIndex(headers, REQUIRED_HEADERS.productName),
    comboPrice: findHeaderIndex(headers, REQUIRED_HEADERS.comboPrice),
    serviceFee: detectFeeColumn(headers),
    reconciliationAmount: findHeaderIndex(headers, REQUIRED_HEADERS.reconciliationAmount),
  };

  const missing = Object.entries(indices)
    .filter(([, index]) => index < 0)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`The file is missing required columns: ${missing.join(", ")}.`);
  }

  const rows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => {
      const firstCell = normalizeText(row[0]);
      if (firstCell.includes("tong cong") || firstCell.includes("total")) return false;
      return Object.values(indices).some((index) => asText(row[index]) !== "");
    })
    .map((row) => ({
      reconciledAt: asText(row[indices.reconciledAt]),
      orderId: asText(row[indices.orderId]),
      productId: asText(row[indices.productId]),
      productName: asText(row[indices.productName]),
      comboPrice: parseMoney(row[indices.comboPrice]),
      serviceFee: parseMoney(row[indices.serviceFee]),
      reconciliationAmount: parseMoney(row[indices.reconciliationAmount]),
    }))
    .filter((row) => row.reconciledAt || row.orderId || row.productId || row.productName);

  if (!rows.length) throw new Error("The file has no reconciliation transactions to export.");

  const metadata = parseFileMetadata(fileName, rows);
  const totals = rows.reduce(
    (sum, row) => ({
      comboPrice: sum.comboPrice + row.comboPrice,
      serviceFee: sum.serviceFee + row.serviceFee,
      reconciliationAmount: sum.reconciliationAmount + row.reconciliationAmount,
    }),
    { comboPrice: 0, serviceFee: 0, reconciliationAmount: 0 }
  );

  return {
    sourceFileName: fileName,
    sheetName,
    ...metadata,
    serviceFeeRate: detectFeeRate(headers[indices.serviceFee], rows),
    rows,
    totals,
  };
}

function directChild(parent: Element, localName: string) {
  return Array.from(parent.children).find((child) => child.localName === localName) ?? null;
}

function setWorkbookFont(stylesDocument: XMLDocument, fontName: string, fontSize: number) {
  const fonts = directChild(stylesDocument.documentElement, "fonts");
  if (!fonts) throw new Error("The template is missing its font definitions.");

  Array.from(fonts.children)
    .filter((child) => child.localName === "font")
    .forEach((font) => {
      let name = directChild(font, "name");
      if (!name) {
        name = createXmlElement(stylesDocument, "name");
        font.insertBefore(name, font.firstChild);
      }
      name.setAttribute("val", fontName);
      let size = directChild(font, "sz");
      if (!size) {
        size = createXmlElement(stylesDocument, "sz");
        font.appendChild(size);
      }
      size.setAttribute("val", String(fontSize));
      directChild(font, "scheme")?.remove();
    });
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The Excel template contains invalid XML.");
  return document;
}

function createXmlElement(document: XMLDocument, name: string) {
  return document.createElementNS(XML_NAMESPACE, name);
}

function cellColumn(reference: string) {
  return reference.match(/^([A-Z]+)/)?.[1] ?? "";
}

function shiftCellReference(reference: string, fromRow: number, amount: number) {
  return reference.replace(/(\$?[A-Z]+\$?)(\d+)/g, (match, column: string, rowText: string) => {
    const row = Number(rowText);
    return row >= fromRow ? `${column}${row + amount}` : match;
  });
}

function ensureCell(document: XMLDocument, row: Element, column: string) {
  const rowNumber = row.getAttribute("r") ?? "";
  const reference = `${column}${rowNumber}`;
  const cells = Array.from(row.children).filter((child) => child.localName === "c");
  const existing = cells.find((cell) => cell.getAttribute("r") === reference);
  if (existing) return existing;

  const cell = createXmlElement(document, "c");
  cell.setAttribute("r", reference);
  const nextCell = cells.find((candidate) => cellColumn(candidate.getAttribute("r") ?? "") > column);
  row.insertBefore(cell, nextCell ?? null);
  return cell;
}

function clearCell(cell: Element) {
  cell.removeAttribute("t");
  Array.from(cell.children).forEach((child) => {
    if (["f", "v", "is"].includes(child.localName)) child.remove();
  });
}

function setInlineString(document: XMLDocument, cell: Element, value: string) {
  clearCell(cell);
  cell.setAttribute("t", "inlineStr");
  const inlineString = createXmlElement(document, "is");
  const text = createXmlElement(document, "t");
  text.textContent = value;
  inlineString.appendChild(text);
  cell.appendChild(inlineString);
}

function setNumber(document: XMLDocument, cell: Element, value: number) {
  clearCell(cell);
  const number = createXmlElement(document, "v");
  number.textContent = String(value);
  cell.appendChild(number);
}

function getRow(sheetDocument: XMLDocument, rowNumber: number) {
  return Array.from(sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "row")).find(
    (row) => Number(row.getAttribute("r")) === rowNumber
  );
}

function replaceBankSectionMerges(sheetDocument: XMLDocument, startRow: number) {
  const mergeCells = sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "mergeCells")[0];
  if (!mergeCells) throw new Error("The template is missing its merged-cell definitions.");

  const bankRows = new Set(Array.from({ length: 7 }, (_, index) => startRow + index));
  Array.from(mergeCells.children)
    .filter((merge) => {
      const reference = merge.getAttribute("ref") ?? "";
      const row = Number(reference.match(/\d+/)?.[0] ?? 0);
      return merge.localName === "mergeCell" && bankRows.has(row) && /^A\d+:B\d+$/.test(reference);
    })
    .forEach((merge) => merge.remove());

  for (let row = startRow; row < startRow + 3; row++) {
    [`A${row}:B${row}`, `C${row}:H${row}`].forEach((reference) => {
      const merge = createXmlElement(sheetDocument, "mergeCell");
      merge.setAttribute("ref", reference);
      mergeCells.appendChild(merge);
    });
  }
  mergeCells.setAttribute("count", String(mergeCells.children.length));
}

function removeTrailingTemplateColumn(sheetDocument: XMLDocument) {
  Array.from(sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "row")).forEach((row) => {
    Array.from(row.children)
      .filter(
        (child) =>
          child.localName === "c" && cellColumn(child.getAttribute("r") ?? "") === "I"
      )
      .forEach((cell) => cell.remove());

    if (row.getAttribute("spans") === "1:9") row.setAttribute("spans", "1:8");
  });

  Array.from(sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "mergeCell")).forEach(
    (merge) => {
      const reference = merge.getAttribute("ref");
      if (reference) merge.setAttribute("ref", reference.replace(/I(\d+)/g, "H$1"));
    }
  );

  const dimension = sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "dimension")[0];
  if (dimension) dimension.setAttribute("ref", `A1:${TEMPLATE_LAST_COLUMN}${TEMPLATE_LAST_ROW}`);
}

function shiftTemplateRows(sheetDocument: XMLDocument, amount: number) {
  if (amount <= 0) return;

  Array.from(sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "row"))
    .filter((row) => Number(row.getAttribute("r")) >= TEMPLATE_TOTAL_ROW)
    .forEach((row) => {
      const nextRow = Number(row.getAttribute("r")) + amount;
      row.setAttribute("r", String(nextRow));
      Array.from(row.children)
        .filter((child) => child.localName === "c")
        .forEach((cell) => {
          const reference = cell.getAttribute("r");
          if (reference) cell.setAttribute("r", shiftCellReference(reference, TEMPLATE_TOTAL_ROW, amount));
        });
    });

  Array.from(sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "mergeCell")).forEach((merge) => {
    const reference = merge.getAttribute("ref");
    if (reference) merge.setAttribute("ref", shiftCellReference(reference, TEMPLATE_TOTAL_ROW, amount));
  });

  Array.from(sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "hyperlink")).forEach((link) => {
    const reference = link.getAttribute("ref");
    if (reference) link.setAttribute("ref", shiftCellReference(reference, TEMPLATE_TOTAL_ROW, amount));
  });

  const dimension = sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "dimension")[0];
  if (dimension) {
    dimension.setAttribute("ref", `A1:${TEMPLATE_LAST_COLUMN}${TEMPLATE_LAST_ROW + amount}`);
  }
}

function extendDataRows(sheetDocument: XMLDocument, extraRows: number) {
  if (extraRows <= 0) return;

  const sheetData = sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "sheetData")[0];
  const templateRow = getRow(sheetDocument, DATA_START_ROW);
  const totalRow = getRow(sheetDocument, TEMPLATE_TOTAL_ROW + extraRows);
  if (!sheetData || !templateRow || !totalRow) throw new Error("The template is missing its required data region.");

  for (let index = 0; index < extraRows; index++) {
    const rowNumber = TEMPLATE_TOTAL_ROW + index;
    const clone = templateRow.cloneNode(true) as Element;
    clone.setAttribute("r", String(rowNumber));
    clone.setAttribute("ht", "20");
    Array.from(clone.children)
      .filter((child) => child.localName === "c")
      .forEach((cell) => {
        const column = cellColumn(cell.getAttribute("r") ?? "");
        cell.setAttribute("r", `${column}${rowNumber}`);
      });
    sheetData.insertBefore(clone, totalRow);
  }
}

function updateDefinedRange(workbookDocument: XMLDocument, totalRow: number) {
  Array.from(workbookDocument.getElementsByTagNameNS(XML_NAMESPACE, "definedName")).forEach((name) => {
    if (name.getAttribute("name") === "_xlnm._FilterDatabase") {
      name.textContent = `'MT LIFE'!$A$${DATA_START_ROW}:$H$${totalRow}`;
    }
  });

  const calcPr = workbookDocument.getElementsByTagNameNS(XML_NAMESPACE, "calcPr")[0];
  if (calcPr) {
    calcPr.setAttribute("calcMode", "auto");
    calcPr.setAttribute("calcOnSave", "1");
    calcPr.setAttribute("fullCalcOnLoad", "1");
    calcPr.setAttribute("forceFullCalc", "1");
  }
}

function createVndStyleFactory(stylesDocument: XMLDocument) {
  const root = stylesDocument.documentElement;
  let numFmts = directChild(root, "numFmts");
  if (!numFmts) {
    numFmts = createXmlElement(stylesDocument, "numFmts");
    numFmts.setAttribute("count", "0");
    root.insertBefore(numFmts, directChild(root, "fonts"));
  }

  const existingIds = Array.from(numFmts.children)
    .filter((child) => child.localName === "numFmt")
    .map((node) => Number(node.getAttribute("numFmtId")))
    .filter(Number.isFinite);
  const numFmtId = Math.max(164, ...existingIds) + 1;
  const numFmt = createXmlElement(stylesDocument, "numFmt");
  numFmt.setAttribute("numFmtId", String(numFmtId));
  numFmt.setAttribute("formatCode", '#,##0 "₫"');
  numFmts.appendChild(numFmt);
  numFmts.setAttribute("count", String(Array.from(numFmts.children).length));

  const cellXfs = directChild(root, "cellXfs");
  if (!cellXfs) throw new Error("The template is missing cell formatting.");

  const styleByBase = new Map<number, number>();
  return (cell: Element) => {
    const baseStyle = Number(cell.getAttribute("s") ?? 0);
    let styleIndex = styleByBase.get(baseStyle);
    if (styleIndex === undefined) {
      const styles = Array.from(cellXfs!.children).filter((child) => child.localName === "xf");
      const base = styles[baseStyle] ?? styles[0];
      if (!base) throw new Error("The template is missing the base cell style.");
      const clone = base.cloneNode(true) as Element;
      clone.setAttribute("numFmtId", String(numFmtId));
      clone.setAttribute("applyNumberFormat", "1");
      cellXfs!.appendChild(clone);
      styleIndex = styles.length;
      styleByBase.set(baseStyle, styleIndex);
      cellXfs!.setAttribute("count", String(styles.length + 1));
    }
    cell.setAttribute("s", String(styleIndex));
  };
}

function createWrapTextStyleFactory(stylesDocument: XMLDocument) {
  const cellXfs = directChild(stylesDocument.documentElement, "cellXfs");
  if (!cellXfs) throw new Error("The template is missing cell formatting.");

  const styleByBase = new Map<number, number>();
  return (cell: Element) => {
    const baseStyle = Number(cell.getAttribute("s") ?? 0);
    let styleIndex = styleByBase.get(baseStyle);
    if (styleIndex === undefined) {
      const styles = Array.from(cellXfs.children).filter((child) => child.localName === "xf");
      const base = styles[baseStyle] ?? styles[0];
      if (!base) throw new Error("The template is missing the product cell style.");

      const clone = base.cloneNode(true) as Element;
      let alignment = directChild(clone, "alignment");
      if (!alignment) {
        alignment = createXmlElement(stylesDocument, "alignment");
        clone.appendChild(alignment);
      }
      alignment.setAttribute("wrapText", "1");
      alignment.setAttribute("vertical", "center");
      clone.setAttribute("applyAlignment", "1");
      cellXfs.appendChild(clone);
      styleIndex = styles.length;
      styleByBase.set(baseStyle, styleIndex);
      cellXfs.setAttribute("count", String(styles.length + 1));
    }
    cell.setAttribute("s", String(styleIndex));
  };
}

function createBorderStyleFactory(stylesDocument: XMLDocument) {
  const root = stylesDocument.documentElement;
  const borders = directChild(root, "borders");
  const cellXfs = directChild(root, "cellXfs");
  if (!borders || !cellXfs) throw new Error("The template is missing border formatting.");

  const borderCount = Array.from(borders.children).filter(
    (child) => child.localName === "border"
  ).length;
  const styleByBaseAndBorder = new Map<string, number>();

  return (cell: Element, borderId: number) => {
    if (borderId < 0 || borderId >= borderCount) {
      throw new Error(`The template is missing border style ${borderId}.`);
    }

    const baseStyle = Number(cell.getAttribute("s") ?? 0);
    const cacheKey = `${baseStyle}:${borderId}`;
    let styleIndex = styleByBaseAndBorder.get(cacheKey);
    if (styleIndex === undefined) {
      const styles = Array.from(cellXfs.children).filter((child) => child.localName === "xf");
      const base = styles[baseStyle] ?? styles[0];
      if (!base) throw new Error("The template is missing the base border style.");

      const clone = base.cloneNode(true) as Element;
      clone.setAttribute("borderId", String(borderId));
      clone.setAttribute("applyBorder", "1");
      cellXfs.appendChild(clone);
      styleIndex = styles.length;
      styleByBaseAndBorder.set(cacheKey, styleIndex);
      cellXfs.setAttribute("count", String(styles.length + 1));
    }
    cell.setAttribute("s", String(styleIndex));
  };
}

function estimateWrappedLineCount(value: string, lineCapacity: number) {
  return value.split(/\r?\n/).reduce((total, line) => {
    const displayUnits = Array.from(line).reduce(
      (units, character) => units + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1),
      0
    );
    return total + Math.max(1, Math.ceil(displayUnits / lineCapacity));
  }, 0);
}

function setWrappedRowHeight(
  row: Element,
  lineCount: number,
  minimumHeight: number,
  maximumHeight: number
) {
  const height = lineCount * 15 + 5;
  row.setAttribute(
    "ht",
    String(Math.min(maximumHeight, Math.max(minimumHeight, height)))
  );
  row.setAttribute("customHeight", "1");
}

function setProductRowHeight(row: Element, productName: string) {
  setWrappedRowHeight(row, estimateWrappedLineCount(productName, 13), 20, 120);
}

function matchCellFont(
  stylesDocument: XMLDocument,
  targetCell: Element,
  sourceCell: Element
) {
  const cellXfs = directChild(stylesDocument.documentElement, "cellXfs");
  if (!cellXfs) throw new Error("The template is missing cell formatting.");

  const styles = Array.from(cellXfs.children).filter((child) => child.localName === "xf");
  const sourceStyle = styles[Number(sourceCell.getAttribute("s") ?? 0)];
  const targetStyle = styles[Number(targetCell.getAttribute("s") ?? 0)];
  if (!sourceStyle || !targetStyle) throw new Error("The template is missing the company name style.");

  const clone = targetStyle.cloneNode(true) as Element;
  clone.setAttribute("fontId", sourceStyle.getAttribute("fontId") ?? "0");
  clone.setAttribute("applyFont", "1");
  cellXfs.appendChild(clone);
  targetCell.setAttribute("s", String(styles.length));
  cellXfs.setAttribute("count", String(styles.length + 1));
}

function alignCell(
  stylesDocument: XMLDocument,
  cell: Element,
  horizontal: "left" | "center" | "right"
) {
  const cellXfs = directChild(stylesDocument.documentElement, "cellXfs");
  if (!cellXfs) throw new Error("The template is missing cell formatting.");

  const styles = Array.from(cellXfs.children).filter((child) => child.localName === "xf");
  const currentStyle = styles[Number(cell.getAttribute("s") ?? 0)];
  if (!currentStyle) throw new Error("The template is missing the alignment style.");

  const clone = currentStyle.cloneNode(true) as Element;
  let alignment = directChild(clone, "alignment");
  if (!alignment) {
    alignment = createXmlElement(stylesDocument, "alignment");
    clone.appendChild(alignment);
  }
  alignment.setAttribute("horizontal", horizontal);
  clone.setAttribute("applyAlignment", "1");
  cellXfs.appendChild(clone);
  cell.setAttribute("s", String(styles.length));
  cellXfs.setAttribute("count", String(styles.length + 1));
}

function setColumnWidth(sheetDocument: XMLDocument, columnNumber: number, width: number) {
  const columns = Array.from(sheetDocument.getElementsByTagNameNS(XML_NAMESPACE, "col"));
  const column = columns.find((item) => {
    const min = Number(item.getAttribute("min"));
    const max = Number(item.getAttribute("max"));
    return min <= columnNumber && columnNumber <= max;
  });
  if (!column) throw new Error(`The template is missing the configuration for column ${columnNumber}.`);

  column.setAttribute("width", String(width));
  column.setAttribute("customWidth", "1");
}

function formatDateRange(start: string, end: string) {
  const toDmy = (value: string) => {
    const parts = parseDateParts(value);
    return parts
      ? `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`
      : value;
  };
  if (!start && !end) return "";
  if (!end || start === end) return toDmy(start || end);
  return `${toDmy(start)} - ${toDmy(end)}`;
}

function sanitizeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").replace(/_+/g, "_");
}

export async function createStatementOfAccount(
  templateBuffer: ArrayBuffer,
  data: ReconciliationData,
  client: ReconciliationClient
) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const sheetFile = zip.file("xl/worksheets/sheet1.xml");
  const workbookFile = zip.file("xl/workbook.xml");
  const stylesFile = zip.file("xl/styles.xml");
  if (!sheetFile || !workbookFile || !stylesFile) {
    throw new Error("The SOA template is missing required elements.");
  }

  const [sheetXml, workbookXml, stylesXml] = await Promise.all([
    sheetFile.async("string"),
    workbookFile.async("string"),
    stylesFile.async("string"),
  ]);
  const sheetDocument = parseXml(sheetXml);
  const workbookDocument = parseXml(workbookXml);
  const stylesDocument = parseXml(stylesXml);
  const extraRows = Math.max(0, data.rows.length - TEMPLATE_DATA_ROWS);
  const totalRowNumber = TEMPLATE_TOTAL_ROW + extraRows;

  removeTrailingTemplateColumn(sheetDocument);
  shiftTemplateRows(sheetDocument, extraRows);
  extendDataRows(sheetDocument, extraRows);
  updateDefinedRange(workbookDocument, totalRowNumber);
  setWorkbookFont(stylesDocument, "Times New Roman", 11);
  // Rich-text runs override the cell font, so normalize those as well.
  const normalizeRichText = (document: XMLDocument) => {
    Array.from(document.getElementsByTagNameNS("*", "rPr")).forEach((properties) => {
      for (const [tag, value] of [["sz", "11"], ["rFont", "Times New Roman"]]) {
        let element = directChild(properties, tag);
        if (!element) {
          element = createXmlElement(document, tag);
          properties.appendChild(element);
        }
        element.setAttribute("val", value);
      }
      directChild(properties, "scheme")?.remove();
    });
  };
  normalizeRichText(sheetDocument);
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  if (sharedStringsFile) {
    const sharedStringsDocument = parseXml(await sharedStringsFile.async("string"));
    normalizeRichText(sharedStringsDocument);
    zip.file("xl/sharedStrings.xml", new XMLSerializer().serializeToString(sharedStringsDocument));
  }
  const applyVndStyle = createVndStyleFactory(stylesDocument);
  const applyWrapTextStyle = createWrapTextStyleFactory(stylesDocument);
  const applyBorderStyle = createBorderStyleFactory(stylesDocument);

  // The template's original money columns are too narrow for values such as
  // "1,480,000 ₫", which Excel renders as ##########.
  setColumnWidth(sheetDocument, 6, 15.5);
  setColumnWidth(sheetDocument, 7, 14.5);
  setColumnWidth(sheetDocument, 8, 15.5);

  const setTextAt = (reference: string, value: string) => {
    const match = reference.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    const row = getRow(sheetDocument, Number(match[2]));
    if (!row) return;
    setInlineString(sheetDocument, ensureCell(sheetDocument, row, match[1]), value);
  };

  setTextAt("F1", "No:");
  setTextAt("F2", "Date:");
  setTextAt("G1", data.statementId);
  setTextAt("G2", formatDateRange(data.periodStart, data.periodEnd));

  // Older exports placed these values in H1/H2. Keep the final column empty so
  // the text stored in G can display across the available space.
  const clearAt = (reference: string) => {
    const match = reference.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    const row = getRow(sheetDocument, Number(match[2]));
    if (!row) return;
    clearCell(ensureCell(sheetDocument, row, match[1]));
  };
  clearAt("H1");
  clearAt("H2");

  const alignLeftAt = (reference: string) => {
    const match = reference.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    const row = getRow(sheetDocument, Number(match[2]));
    if (!row) return;
    alignCell(stylesDocument, ensureCell(sheetDocument, row, match[1]), "left");
  };
  ["F1", "G1", "F2", "G2"].forEach(alignLeftAt);

  const clientFields = [
    [5, client.name],
    [6, client.address],
    [7, client.taxCode],
    [8, client.tel],
    [9, client.email],
  ] as const;
  clientFields.forEach(([rowNumber, value]) => {
    setTextAt(`E${rowNumber}`, value);
    const row = getRow(sheetDocument, rowNumber);
    if (!row) return;
    const cell = ensureCell(sheetDocument, row, "E");
    alignCell(stylesDocument, cell, "left");
    if (rowNumber === 6) {
      applyWrapTextStyle(cell);
      setWrappedRowHeight(row, estimateWrappedLineCount(value, 52), 20, 409);
    }
  });

  const companyRow = getRow(sheetDocument, 5);
  if (companyRow) {
    const fromCell = ensureCell(sheetDocument, companyRow, "B");
    const toCell = ensureCell(sheetDocument, companyRow, "E");
    matchCellFont(stylesDocument, toCell, fromCell);
    alignCell(stylesDocument, toCell, "left");
  }

  const bankStartRow = 25 + extraRows;
  replaceBankSectionMerges(sheetDocument, bankStartRow);
  for (let rowNumber = bankStartRow; rowNumber < bankStartRow + 7; rowNumber++) {
    const row = getRow(sheetDocument, rowNumber);
    if (!row) throw new Error(`The template is missing bank detail row ${rowNumber}.`);
    ["A", "B", "C", "D", "E", "F", "G", "H"].forEach((column) =>
      clearCell(ensureCell(sheetDocument, row, column))
    );
    if (rowNumber >= bankStartRow + 3) {
      row.setAttribute("hidden", "1");
      row.setAttribute("ht", "0");
      row.setAttribute("customHeight", "1");
    } else {
      row.removeAttribute("hidden");
      row.setAttribute("ht", "24");
      row.setAttribute("customHeight", "1");
    }
  }

  const bankFields = [
    ["开户名(Beneficiary Name)：", client.beneficiaryName],
    ["开户银行账号(Beneficiary Account)：", client.account],
    ["开户行(Beneficiary Bank Name)：", client.bankName],
  ] as const;
  bankFields.forEach(([label, value], index) => {
    const rowNumber = bankStartRow + index;
    setTextAt(`A${rowNumber}`, label);
    setTextAt(`C${rowNumber}`, value);
    const row = getRow(sheetDocument, rowNumber);
    if (!row) return;
    const labelCell = ensureCell(sheetDocument, row, "A");
    const valueCell = ensureCell(sheetDocument, row, "C");
    alignCell(stylesDocument, labelCell, "left");
    alignCell(stylesDocument, valueCell, "left");
    applyWrapTextStyle(labelCell);
    applyWrapTextStyle(valueCell);
    // Each bank row contains two merged cells: A:B and C:H. Apply the
    // template's thin borders to every perimeter cell so Excel and print
    // previews retain a complete outline around both merged regions.
    applyBorderStyle(labelCell, 2);
    applyBorderStyle(ensureCell(sheetDocument, row, "B"), 3);
    applyBorderStyle(valueCell, 2);
    ["D", "E", "F", "G"].forEach((column) =>
      applyBorderStyle(ensureCell(sheetDocument, row, column), 10)
    );
    applyBorderStyle(ensureCell(sheetDocument, row, "H"), 3);
    setWrappedRowHeight(
      row,
      Math.max(
        estimateWrappedLineCount(label, 31),
        estimateWrappedLineCount(value, 88)
      ),
      24,
      409
    );
  });

  setTextAt("A10", `STATEMENT OF ACCOUNT FOR ${data.monthLabel} (DISBURSEMENT NOTE)`);
  setTextAt("A11", `${data.monthLabel} 月份对账单`);
  setTextAt(
    "G12",
    data.serviceFeeRate === null
      ? "Phí dịch vụ/服务费"
      : `Phí dịch vụ/服务费 ${data.serviceFeeRate}%`
  );

  const reservedRows = Math.max(TEMPLATE_DATA_ROWS, data.rows.length);
  for (let index = 0; index < reservedRows; index++) {
    const rowNumber = DATA_START_ROW + index;
    const rowElement = getRow(sheetDocument, rowNumber);
    if (!rowElement) throw new Error(`The template is missing data row ${rowNumber}.`);

    const cells = ["A", "B", "C", "D", "E", "F", "G", "H"].map((column) =>
      ensureCell(sheetDocument, rowElement, column)
    );
    const source = data.rows[index];

    if (!source) {
      cells.forEach(clearCell);
      continue;
    }

    setNumber(sheetDocument, cells[0], index + 1);
    setInlineString(sheetDocument, cells[1], source.reconciledAt);
    setInlineString(sheetDocument, cells[2], source.orderId);
    setInlineString(sheetDocument, cells[3], source.productId);
    setInlineString(sheetDocument, cells[4], source.productName);
    applyWrapTextStyle(cells[4]);
    setProductRowHeight(rowElement, source.productName);
    setNumber(sheetDocument, cells[5], source.comboPrice);
    setNumber(sheetDocument, cells[6], source.serviceFee);
    setNumber(sheetDocument, cells[7], source.reconciliationAmount);
    cells.slice(5).forEach(applyVndStyle);
  }

  const totalRow = getRow(sheetDocument, totalRowNumber);
  if (!totalRow) throw new Error("The template is missing the total row.");
  const totalValues = [
    ["F", "comboPrice", data.totals.comboPrice],
    ["G", "serviceFee", data.totals.serviceFee],
    ["H", "reconciliationAmount", data.totals.reconciliationAmount],
  ] as const;
  totalValues.forEach(([column, , value]) => {
    const cell = ensureCell(sheetDocument, totalRow, column);
    // Write the already reconciled totals as numeric values. This avoids relying on
    // the viewer's formula-recalculation engine while keeping the cells numeric.
    setNumber(sheetDocument, cell, value);
    applyVndStyle(cell);
  });

  // Outline the complete total row. A:E is one merged label cell, while
  // F, G, and H remain separate amount cells.
  applyBorderStyle(ensureCell(sheetDocument, totalRow, "A"), 2);
  ["B", "C", "D"].forEach((column) =>
    applyBorderStyle(ensureCell(sheetDocument, totalRow, column), 10)
  );
  applyBorderStyle(ensureCell(sheetDocument, totalRow, "E"), 3);
  ["F", "G", "H"].forEach((column) =>
    applyBorderStyle(ensureCell(sheetDocument, totalRow, column), 1)
  );

  const serializer = new XMLSerializer();
  zip.file("xl/worksheets/sheet1.xml", serializer.serializeToString(sheetDocument));
  zip.file("xl/workbook.xml", serializer.serializeToString(workbookDocument));
  zip.file("xl/styles.xml", serializer.serializeToString(stylesDocument));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: XLSX_MIME,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const suffix = data.statementId ? `_${sanitizeFilePart(data.statementId)}` : "";
  return {
    blob,
    fileName: `SOA_MT_LIFE_${sanitizeFilePart(data.monthLabel)}${suffix}.xlsx`,
  };
}
