import JSZip from "jszip";
import * as XLSX from "xlsx-js-style";

const elements = (node: Document | Element, tag: string) =>
  Array.from(node.getElementsByTagNameNS("*", tag));
const child = (node: Element | undefined, tag: string) =>
  node && Array.from(node.children).find((item) => item.localName === tag);
const attrNumber = (node: Element | undefined, name: string, fallback: number) =>
  Number(node?.getAttribute(name) ?? fallback);
const xml = (value: string) => new DOMParser().parseFromString(value, "application/xml");
const color = (node: Element | undefined, fallback: string) => {
  const rgb = node?.getAttribute("rgb");
  return rgb ? `#${rgb.slice(-6)}` : fallback;
};

/** Browser-only renderer for the single-sheet SOA template (A:H).
 * Read OOXML directly: sheet parsers alone discard drawing and font information.
 * This is a template renderer, not a general-purpose Excel print engine.
 */
export async function createStatementPdf(output: { blob: Blob; fileName: string }) {
  const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  await yieldToBrowser();
  const buffer = await output.blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const readXml = async (path: string) => {
    const file = zip.file(path);
    if (!file) throw new Error(`Missing SOA template component: ${path}`);
    return xml(await file.async("string"));
  };
  const [sheetXml, stylesXml] = await Promise.all([
    readXml("xl/worksheets/sheet1.xml"), readXml("xl/styles.xml"),
  ]);
  const workbook = XLSX.read(buffer, { cellNF: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const merges = [...(sheet["!merges"] ?? [])];
  // The sender address in the SOA template spans B6:C6 by text overflow,
  // unlike the explicitly merged recipient address. Render it as one cell
  // too, so the inherited C6 border does not cross the address.
  if (sheet.B6?.v && !sheet.C6?.v && !merges.some((m) => m.s.r <= 5 && m.e.r >= 5 && m.s.c <= 2 && m.e.c >= 1)) {
    merges.push({ s: { r: 5, c: 1 }, e: { r: 5, c: 2 } });
  }
  const fonts = elements(stylesXml, "font");
  const fills = elements(stylesXml, "fill");
  const borders = elements(stylesXml, "border");
  const styles = Array.from(elements(stylesXml, "cellXfs")[0].children);
  const cellNodes = new Map(elements(sheetXml, "c").map((cell) => [cell.getAttribute("r"), cell]));
  const rows = new Map(elements(sheetXml, "row").map((row) => [attrNumber(row, "r", 1) - 1, row]));
  const lastRow = Math.max(...rows.keys());
  const defaultHeight = attrNumber(elements(sheetXml, "sheetFormatPr")[0], "defaultRowHeight", 15) * 4 / 3;
  const heights = Array.from({ length: lastRow + 1 }, (_, r) => rows.get(r)?.getAttribute("hidden") === "1"
    ? 0 : attrNumber(rows.get(r), "ht", defaultHeight * 3 / 4) * 4 / 3);
  const widths = Array.from({ length: 8 }, (_, c) => {
    const column = elements(sheetXml, "col").find((node) => attrNumber(node, "min", 1) <= c + 1 && attrNumber(node, "max", 1) >= c + 1);
    return attrNumber(column, "width", 8.43) * 7 + 5;
  });
  const xPositions = [0];
  widths.forEach((width) => xPositions.push(xPositions.at(-1)! + width));
  const setup = elements(sheetXml, "pageSetup")[0];
  const landscape = setup?.getAttribute("orientation") === "landscape";
  const pageWidth = landscape ? 1122.52 : 793.7;
  const pageHeight = landscape ? 793.7 : 1122.52;
  const margins = elements(sheetXml, "pageMargins")[0];
  const left = attrNumber(margins, "left", 0.4) * 96;
  const right = attrNumber(margins, "right", 0.4) * 96;
  const top = attrNumber(margins, "top", 0.6) * 96;
  const bottom = attrNumber(margins, "bottom", 0.6) * 96;
  const scale = Math.min(attrNumber(setup, "scale", 100) / 100, (pageWidth - left - right) / xPositions[8]);
  const pageCapacity = (pageHeight - top - bottom) / scale;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(pageWidth * 2);
  canvas.height = Math.ceil(pageHeight * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize PDF rendering.");

  await document.fonts.ready;

  function styleAt(r: number, c: number) {
    const node = cellNodes.get(XLSX.utils.encode_cell({ r, c }));
    const style = styles[attrNumber(node, "s", 0)];
    const font = fonts[attrNumber(style, "fontId", 0)];
    const size = attrNumber(child(font, "sz"), "val", 11) * 4 / 3;
    const family = child(font, "name")?.getAttribute("val") ?? "Times New Roman";
    const fontCss = `${child(font, "i") ? "italic " : ""}${child(font, "b") ? "bold " : ""}${size}px "${family.replace(/["\\]/g, "")}", "Noto Serif CJK SC", serif`;
    const alignment = child(style, "alignment");
    const richRuns = elements(node ?? sheetXml.createElement("empty"), "r").map((run) => {
      const properties = child(run, "rPr");
      const bold = child(properties, "b");
      const italic = child(properties, "i");
      const runSize = attrNumber(child(properties, "sz"), "val", size * 3 / 4) * 4 / 3;
      const runFamily = child(properties, "rFont")?.getAttribute("val") ?? family;
      return {
        text: child(run, "t")?.textContent ?? "",
        fontCss: `${italic && italic.getAttribute("val") !== "0" ? "italic " : ""}${bold && bold.getAttribute("val") !== "0" ? "bold " : ""}${runSize}px "${runFamily.replace(/["\\]/g, "")}", "Noto Serif CJK SC", serif`,
        color: color(child(properties, "color"), "#000000"),
      };
    });
    return { style, font, size, fontCss, alignment, richRuns };
  }
  function textAt(r: number, c: number) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? XLSX.utils.format_cell(cell) : "";
  }
  function wrap(text: string, width: number) {
    const result: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = "";
      // Keep words together, but allow CJK and very long IDs to break.
      const tokens = paragraph.match(/[\u2e80-\u9fff]|[^\s\u2e80-\u9fff]+\s*|\s+/gu) ?? [""];
      for (const token of tokens) {
        if (line && ctx!.measureText(line + token).width > width) {
          result.push(line.trimEnd());
          line = "";
        }
        for (const character of token) {
          if (line && ctx!.measureText(line + character).width > width) {
            result.push(line.trimEnd());
            line = "";
          }
          line += character;
        }
      }
      result.push(line.trimEnd());
    }
    return result;
  }
  function cellLayout(r: number, c: number) {
    const merge = merges.find((m) => m.s.r <= r && m.e.r >= r && m.s.c <= c && m.e.c >= c);
    if (merge && (merge.s.r !== r || merge.s.c !== c)) return null;
    const style = styleAt(r, c);
    ctx!.font = style.fontCss;
    let end = Math.min(merge?.e.c ?? c, 7);
    const text = textAt(r, c);
    const wrapped = style.alignment?.getAttribute("wrapText") === "1";
    // Preserve Excel's overflow for unmerged labels and the No/Date fields.
    if (!merge && !wrapped && sheet[XLSX.utils.encode_cell({ r, c })]?.t !== "n") {
      while (end < 7 && !textAt(r, end + 1) && !merges.some((m) => m.s.r <= r && m.e.r >= r && m.s.c <= end + 1 && m.e.c >= end + 1)) end++;
    }
    const width = xPositions[end + 1] - xPositions[c];
    return { ...style, width, lines: wrapped && r !== 11 ? wrap(text, width - 8) : text.split(/\r?\n/), merge };
  }
  // Increase only wrapped rows when the source's estimated height is too small.
  for (let r = 0; r <= lastRow; r++) {
    if (r % 20 === 0) await yieldToBrowser();
    if (!heights[r]) continue;
    for (let c = 0; c < 8; c++) {
      const layout = cellLayout(r, c);
      if (layout && (!layout.merge || layout.merge.e.r === r)) {
        heights[r] = Math.max(heights[r], layout.lines.length * layout.size * 1.15 + 6);
      }
    }
  }

  // The SOA contains an embedded logo. Resolve its relationship and anchor,
  // rather than fetching a different image or guessing its position.
  const pictures: { image: HTMLImageElement; x: number; y: number; width: number; height: number }[] = [];
  const drawingPath = "xl/drawings/drawing1.xml";
  if (zip.file(drawingPath)) {
    const [drawing, relationships] = await Promise.all([readXml(drawingPath), readXml("xl/drawings/_rels/drawing1.xml.rels")]);
    for (const anchor of [...elements(drawing, "twoCellAnchor"), ...elements(drawing, "oneCellAnchor")]) {
      const blip = elements(anchor, "blip")[0];
      const id = blip?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
      const relationship = elements(relationships, "Relationship").find((node) => node.getAttribute("Id") === id);
      if (!relationship || relationship.getAttribute("TargetMode") === "External") continue;
      const path = new URL(relationship.getAttribute("Target")!, "https://workbook.invalid/xl/drawings/drawing1.xml").pathname.slice(1);
      const file = zip.file(path);
      if (!file) throw new Error("Could not load the SOA logo.");
      const mime = path.endsWith(".png") ? "image/png" : "image/jpeg";
      const image = new Image();
      image.src = `data:${mime};base64,${await file.async("base64")}`;
      await image.decode();
      const from = child(anchor, "from")!;
      const number = (tag: string) => Number(child(from, tag)?.textContent ?? 0);
      const extent = elements(anchor, "ext").find((node) => node.hasAttribute("cx"));
      pictures.push({ image, x: xPositions[number("col")] + number("colOff") / 9525,
        y: heights.slice(0, number("row")).reduce((a, b) => a + b, 0) + number("rowOff") / 9525,
        width: attrNumber(extent, "cx", image.width * 9525) / 9525,
        height: attrNumber(extent, "cy", image.height * 9525) / 9525 });
    }
  }

  const pages: { row: number; y: number; height: number; offset: number }[][] = [[]];
  let y = 0;
  const newPage = (repeatHeader: boolean) => {
    pages.push([]);
    y = 0;
    if (repeatHeader) { pages.at(-1)!.push({ row: 11, y: 0, height: heights[11], offset: 0 }); y = heights[11]; }
  };
  const totalRow = Array.from({ length: lastRow + 1 }, (_, r) => r).find((r) => textAt(r, 0).startsWith("TOTAL")) ?? lastRow;
  for (let r = 0; r <= lastRow; r++) {
    if (r % 20 === 0) await yieldToBrowser();
    if (!heights[r]) continue;
    // Keep the bank and signature block together when it fits on a page.
    const remaining = heights.slice(r).reduce((a, b) => a + b, 0);
    if (r === totalRow && remaining <= pageCapacity && y + remaining > pageCapacity) newPage(true);
    let offset = 0;
    if (y + heights[r] > pageCapacity && heights[r] <= pageCapacity - (r > 11 && r <= totalRow ? heights[11] : 0)) newPage(r > 11 && r <= totalRow);
    while (offset < heights[r]) {
      // Split exceptionally tall rows on line boundaries instead of truncating.
      const capacity = pageCapacity - y;
      const line = styleAt(r, 4).size * 1.15;
      const remainingHeight = heights[r] - offset;
      // Do not round a row that already fits: rounding used to carry a tiny
      // empty fragment onto the next page, just below the repeated header.
      const height = remainingHeight <= capacity
        ? remainingHeight
        : Math.floor(capacity / line) * line;
      if (height <= 0) { newPage(r > 11 && r <= totalRow); continue; }
      pages.at(-1)!.push({ row: r, y, height, offset });
      y += height;
      offset += height;
      if (offset < heights[r]) newPage(r > 11 && r <= totalRow);
    }
  }
  const worker = new Worker(new URL("./statementPdf.worker.ts", import.meta.url), { type: "module" });
  const requestWorker = (message: object, transfer: Transferable[] = []) => new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ error?: string; buffer?: ArrayBuffer }>) => {
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.buffer);
    };
    worker.onerror = () => reject(new Error("Could not load the PDF generator. Please reload and try again."));
    worker.postMessage(message, transfer);
  });
  // Center No/Date beside the logo, rather than the top of the sheet.
  const logo = pictures[0];
  const metadataOffset = logo ? Math.max(0, logo.y + (logo.height - heights[0] - heights[1]) / 2) : 0;
  try {
    for (const [pageIndex, page] of pages.entries()) {
      await yieldToBrowser();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(2 * scale, 0, 0, 2 * scale, left * 2, top * 2);
      ctx.textBaseline = "top";
      // Collect each border once. The worker draws uniform vector lines after
      // the page image, avoiding raster antialiasing and adjacent fills erasing edges.
      const pageBorders = new Map<string, [number, number, number, number]>();
      // Paint fills first, including merged-cell edges.
      for (const [itemIndex, item] of page.entries()) {
        if (itemIndex % 20 === 0) await yieldToBrowser();
        for (let c = 0; c < 8; c++) {
          const { style } = styleAt(item.row, c);
          const fill = child(fills[attrNumber(style, "fillId", 0)], "patternFill");
          if (fill?.getAttribute("patternType") === "solid") {
            ctx.fillStyle = color(child(fill, "fgColor"), "white");
            ctx.fillRect(xPositions[c], item.y, widths[c], item.height);
          }
          const border = borders[attrNumber(style, "borderId", 0)];
          const merge = merges.find((m) => m.s.r <= item.row && m.e.r >= item.row && m.s.c <= c && m.e.c >= c);
          const edges = { left: [0, 0, 0, item.height], right: [widths[c], 0, widths[c], item.height], top: [0, 0, widths[c], 0], bottom: [0, item.height, widths[c], item.height] };
          for (const [side, points] of Object.entries(edges)) {
            // Only the perimeter belongs to a merged cell; source styles can
            // still contain borders on the individual cells inside that merge.
            if (merge && (
              (side === "left" && c > merge.s.c) ||
              (side === "right" && c < merge.e.c) ||
              (side === "top" && item.row > merge.s.r) ||
              (side === "bottom" && item.row < merge.e.r)
            )) continue;
            const edge = child(border, side);
            if (!edge?.getAttribute("style")) continue;
            // Normalized page coordinates keep the overlay aligned with the image
            // regardless of portrait/landscape or the template's print scale.
            const segment: [number, number, number, number] = [
              (left + (xPositions[c] + points[0]) * scale) / pageWidth,
              (top + (item.y + points[1]) * scale) / pageHeight,
              (left + (xPositions[c] + points[2]) * scale) / pageWidth,
              (top + (item.y + points[3]) * scale) / pageHeight,
            ];
            pageBorders.set(segment.map((value) => value.toFixed(8)).join(":"), segment);
          }
        }
      }
      for (const [itemIndex, item] of page.entries()) {
        if (itemIndex % 20 === 0) await yieldToBrowser();
        for (let c = 0; c < 8; c++) {
          const layout = cellLayout(item.row, c);
          if (!layout) continue;
          ctx.save();
          if (pageIndex === 0 && item.row < 2 && c >= 5) ctx.translate(0, metadataOffset);
          ctx.beginPath(); ctx.rect(xPositions[c] + 1, item.y, layout.width - 2, item.height); ctx.clip();
          ctx.font = layout.fontCss;
          ctx.fillStyle = color(child(layout.font, "color"), "#000000");
          const lineHeight = layout.size * 1.15;
          const align = layout.alignment?.getAttribute("horizontal") ?? (sheet[XLSX.utils.encode_cell({ r: item.row, c })]?.t === "n" ? "right" : "left");
          const vertical = layout.alignment?.getAttribute("vertical") ?? "bottom";
          const textHeight = layout.lines.length * lineHeight;
          const inset = vertical === "center" ? Math.max(3, (heights[item.row] - textHeight) / 2) : vertical === "top" ? 3 : Math.max(3, heights[item.row] - textHeight - 3);
          let textOffset = 0;
          const fullText = layout.richRuns.map((run) => run.text).join("");
          layout.lines.forEach((line, index) => {
            if (!layout.richRuns.length) {
              const measured = Math.min(ctx.measureText(line).width, layout.width - 8);
              const x = xPositions[c] + (align === "center" ? (layout.width - measured) / 2 : align === "right" ? layout.width - measured - 4 : 4);
              ctx.fillText(line, x, item.y - item.offset + inset + index * lineHeight, layout.width - 8);
              return;
            }
            const start = Math.max(textOffset, fullText.indexOf(line, textOffset));
            const end = start + line.length;
            textOffset = end;
            let offset = 0;
            const segments = layout.richRuns.map((run) => {
              const text = run.text.slice(Math.max(0, start - offset), Math.max(0, Math.min(run.text.length, end - offset)));
              offset += run.text.length;
              ctx.font = run.fontCss;
              return { ...run, text, width: ctx.measureText(text).width };
            });
            const width = segments.reduce((sum, run) => sum + run.width, 0);
            const fit = Math.min(1, (layout.width - 8) / Math.max(1, width));
            const x = xPositions[c] + (align === "center" ? (layout.width - width * fit) / 2 : align === "right" ? layout.width - width * fit - 4 : 4);
            ctx.save();
            ctx.translate(x, item.y - item.offset + inset + index * lineHeight);
            ctx.scale(fit, 1);
            let runX = 0;
            segments.forEach((run) => {
              ctx.font = run.fontCss;
              ctx.fillStyle = run.color;
              ctx.fillText(run.text, runX, 0);
              runX += run.width;
            });
            ctx.restore();
          });
          ctx.restore();
        }
      }
      if (pageIndex === 0) for (const picture of pictures) ctx.drawImage(picture.image, picture.x, picture.y, picture.width, picture.height);
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode PDF page.")), "image/png");
      });
      const image = await imageBlob.arrayBuffer();
      await requestWorker({ type: "page", image, landscape, borders: [...pageBorders.values()] }, [image]);
    }
    const buffer = await requestWorker({ type: "finish" });
    if (!buffer) throw new Error("Could not finalize the PDF.");
    return { blob: new Blob([buffer], { type: "application/pdf" }), fileName: output.fileName.replace(/\.xlsx$/i, ".pdf") };
  } finally {
    worker.terminate();
  }
}
