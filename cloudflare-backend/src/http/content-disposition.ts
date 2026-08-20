export function headerSafeFilename(filename: string): string {
  return Array.from(filename)
    .filter((char) => {
      const codePoint = char.codePointAt(0);
      return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join("")
    .replace(/"/gu, "'");
}

export function attachmentContentDisposition(filename: string): string {
  return `attachment; filename="${headerSafeFilename(filename)}"`;
}
