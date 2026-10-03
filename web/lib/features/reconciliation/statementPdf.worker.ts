import { jsPDF } from "jspdf";

type PdfRequest = { type: "page"; image: ArrayBuffer; landscape: boolean; borders: [number, number, number, number][] } | { type: "finish" };
let pdf: jsPDF | undefined;

// Keep image compression and PDF serialization off the UI thread.
self.onmessage = (event: MessageEvent<PdfRequest>) => {
  try {
    const request = event.data;
    if (request.type === "page") {
      if (!pdf) pdf = new jsPDF({ orientation: request.landscape ? "landscape" : "portrait", unit: "pt", format: "a4", compress: true });
      else pdf.addPage();
      pdf.addImage(new Uint8Array(request.image), "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      // Draw borders as vectors, not pixels: consistent black 0.6 pt rules at
      // every zoom level, including the total and merged beneficiary cells.
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.6);
      pdf.setLineCap("butt");
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      for (const [x1, y1, x2, y2] of request.borders) {
        pdf.line(x1 * width, y1 * height, x2 * width, y2 * height);
      }
      self.postMessage({ ok: true });
    } else {
      if (!pdf) throw new Error("No PDF pages were rendered.");
      const buffer = pdf.output("arraybuffer");
      self.postMessage({ buffer }, { transfer: [buffer] });
      pdf = undefined;
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Could not generate PDF." });
  }
};
