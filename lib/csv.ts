/** Neutralize formula prefixes before quoting the complete CSV field. */
export function escapeCsvCell(value: string) {
  const text = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
