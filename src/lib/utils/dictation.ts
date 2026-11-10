/**
 * Hängt einen diktierten Textbaustein an einen bestehenden Feldinhalt an:
 * mit Leerzeichen getrennt (außer am Zeilenanfang) und am Satzanfang groß
 * geschrieben - die Spracherkennung liefert Bausteine meist klein und ohne
 * führendes Leerzeichen.
 */
export function appendDictatedText(existing: string, dictated: string): string {
  const text = dictated.trim();
  if (!text) return existing;
  const base = existing.replace(/[ \t]+$/, '');
  const startsSentence = base === '' || /[.!?:\n]$/.test(base);
  const piece = startsSentence ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  if (base === '' || base.endsWith('\n')) return base + piece;
  return `${base} ${piece}`;
}
