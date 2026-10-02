import { jsPDF } from "jspdf";

type PdfRequest = { type: "page"; image: ArrayBuffer; landscape: boolean } | { type: "finish" };
let pdf: jsPDF | undefined;

// Keep image compression and PDF serialization off the UI thread.
self.onmessage = (event: MessageEvent<PdfRequest>) => {
  try {
    const request = event.data;
    if (request.type === "page") {
      if (!pdf) pdf = new jsPDF({ orientation: request.landscape ? "landscape" : "portrait", unit: "pt", format: "a4", compress: true });
      else pdf.addPage();
      pdf.addImage(new Uint8Array(request.image), "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
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
