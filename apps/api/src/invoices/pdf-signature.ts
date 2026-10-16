const PDF_MAGIC = Buffer.from('%PDF-');

/** Checks the file's leading bytes; the client-supplied MIME type and extension are not trusted. */
export function isPdf(data: Buffer): boolean {
  return data.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}
