import { PDFParse } from 'pdf-parse';

/** Below this many non-whitespace characters the PDF is treated as scanned and sent to the vision model. */
export const MIN_TEXT_CHARS = 80;

export async function extractPdfText(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

export function hasUsableText(text: string): boolean {
  return text.replace(/\s/g, '').length >= MIN_TEXT_CHARS;
}
