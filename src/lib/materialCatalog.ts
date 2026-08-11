/**
 * Standard-Materialstamm für gängige Elektroinstallations-Positionen.
 * Dient als Autovervollständigungs-Vorschlag im Material-Formular (siehe
 * MaterialSection.svelte) - bewusst als einfaches, leicht erweiterbares
 * Array gehalten statt als eigene Kategorisierungs-UI.
 */
export interface CatalogEntry {
  description: string;
  unit: string;
}

export const STANDARD_MATERIALS: CatalogEntry[] = [
  // Kabel & Leitungen
  { description: 'NYM-J 3x1,5mm²', unit: 'm' },
  { description: 'NYM-J 3x2,5mm²', unit: 'm' },
  { description: 'NYM-J 5x1,5mm²', unit: 'm' },
  { description: 'NYM-J 5x2,5mm²', unit: 'm' },
  { description: 'NYM-J 4x16mm²', unit: 'm' },
  { description: 'H07V-K 1,5mm² (Ader)', unit: 'm' },
  { description: 'H07V-K 2,5mm² (Ader)', unit: 'm' },
  { description: 'Installationsrohr (Leerrohr) M20', unit: 'm' },
  { description: 'Kabelkanal 40x60mm', unit: 'm' },
  // Schalter & Steckdosen
  { description: 'UP-Gerätedose', unit: 'Stk' },
  { description: 'Schuko-Steckdose UP', unit: 'Stk' },
  { description: 'Schuko-Doppelsteckdose UP', unit: 'Stk' },
  { description: 'Steckdose mit FI-Schutz', unit: 'Stk' },
  { description: 'Lichtschalter (Ausschalter) UP', unit: 'Stk' },
  { description: 'Serienschalter UP', unit: 'Stk' },
  { description: 'Wechselschalter UP', unit: 'Stk' },
  { description: 'Kreuzschalter UP', unit: 'Stk' },
  { description: 'Dimmer UP', unit: 'Stk' },
  { description: 'Bewegungsmelder UP', unit: 'Stk' },
  // Sicherungstechnik / Verteiler
  { description: 'Leitungsschutzschalter (LS) B16', unit: 'Stk' },
  { description: 'Leitungsschutzschalter (LS) B10', unit: 'Stk' },
  { description: 'Leitungsschutzschalter (LS) C16', unit: 'Stk' },
  { description: 'FI-Schutzschalter (RCD) 25A/30mA', unit: 'Stk' },
  { description: 'FI-Schutzschalter (RCD) 40A/30mA', unit: 'Stk' },
  { description: 'FI/LS-Kombischalter (RCBO)', unit: 'Stk' },
  { description: 'Unterverteiler (leer)', unit: 'Stk' },
  { description: 'Reihenklemme / Verbindungsklemme', unit: 'Stk' },
  // Beleuchtung & Sonstiges
  { description: 'LED-Panel', unit: 'Stk' },
  { description: 'LED-Einbaustrahler', unit: 'Stk' },
  { description: 'Rauchmelder', unit: 'Stk' },
  { description: 'Netzwerkdose RJ45 CAT6', unit: 'Stk' },
  { description: 'Wallbox 11kW', unit: 'Stk' },
  { description: 'Verbindungs-/Abzweigdose', unit: 'Stk' }
];
