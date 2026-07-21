// Client-side PDF text extraction. pdf.js is loaded from a CDN at runtime
// (webpackIgnore so Next never bundles the ~1MB lib) — this keeps the app
// dependency-free while mirroring the iOS PDFKit embedded-text path.
//
// Scanned / image-only PDFs (no embedded text) return a short/empty string;
// the caller then shows the "try Paste or Forward" fallback. There is no
// browser OCR, matching the honest degradation the iOS app falls back to.

// @4 → jsDelivr resolves to the latest v4 build (CORS-enabled).
const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs"
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs"

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function extractPdfText(file: File): Promise<string> {
  // Non-literal specifier + webpackIgnore → a real runtime import of the CDN
  // module, not a build-time bundle resolution.
  const pdfjs: any = await import(/* webpackIgnore: true */ PDFJS_URL)
  if (pdfjs?.GlobalWorkerOptions) {
    // If the cross-origin worker can't spin up, pdf.js falls back to a
    // main-thread "fake worker" — slower but fine for confirmation PDFs.
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
  }

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  let text = ""
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text +=
      content.items.map((it: any) => (typeof it?.str === "string" ? it.str : "")).join(" ") +
      "\n"
    // A reservation confirmation is small; cap so a huge PDF can't hang us.
    if (text.length > 20000) break
  }
  return text.trim()
}
/* eslint-enable @typescript-eslint/no-explicit-any */
