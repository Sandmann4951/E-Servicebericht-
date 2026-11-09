import { describe, expect, it } from 'vitest';
import { parseServiceOrderText, shouldAttemptOcrFallback } from '../../lib/utils/serviceOrderImport';

// Die exakten Zeilen, die pdfjs-dist (siehe src/lib/import/serviceOrderPdf.ts)
// aus einem echten ELSA-Serviceauftrag-PDF extrahiert - Text auf derselben
// visuellen Zeile wird dabei OHNE jedes Trennzeichen aneinandergereiht (siehe
// Kommentar in serviceOrderImport.ts), inkl. der Zeilen-Verschmelzung der
// Kopf-Info-Box mit dem linken Adress-Block auf Seite 1.
const SAMPLE_RAW = [
  'ELSA cnc service GmbH - Ammerthalstraße 12 - 85551 Kirchheim bei München',
  'FrauDok-nr.: 264216',
  'Sabine HanslbauerDatum: 30.09.2026',
  'Tassilostraße 2aKundennr.: 12850',
  'Projektnr.: 264235',
  '85609 Aschheim',
  'IBAN: DE44 7025 0150 0040 2968 40',
  'SWIFT-BIC BYLADEM1KMS',
  'UID-Nr. DE162463240',
  'ServiceauftragKopie',
  'elektro',
  'Auftrag: Kabelkanal Markiese, Steckdose Terrasse',
  'Einsatzort:',
  'Hinweis zum Installationsort:',
  'Sonstige Infos:',
  'Projektnummer: 264235',
  'Sachbearbeiter:',
  'Projektleiter:',
  '-KUNDENDATEN -',
  'Frau',
  'Sabine Hanslbauer',
  'Tassilostraße 2a',
  '85609 Aschheim',
  'Ansprechpartner vor Ort: Sabine Hanslbauer',
  'Telefon: 01748425400',
  'E-Mail: sabine-hanslbauer@web.de',
  'Pos.MengeEin.Text',
  '1Kabelkanal Markiese 1.OG',
  '1.0104mLeitungsführungskanal LF 15x15 vw',
  '1.0204mSchlauchleitung H05VV-F 3G1,5',
  'Seite 1 von 2',
  'Pos.MengeEin.Text',
  '1.0301StckWinkel LF-Kanal',
  '2Markiese EG Terrasse',
  '2.0104mLeitungsführungskanal PVC LF 15x15 gsw',
  '3Steckdose EG Terrasse',
  '3.01020mNYY-J 3x2,5',
  '3.0201StckGießharz-Muffe',
  '4Bewegungsmelder',
  '4.0101StckBusch-J. Wächter aws 6800-34-102C',
  '4.0201StckBusch-J. Univ.Relais-Einsatz UP 230V 2300W/VA 6401 U-102',
  '4.0301StckBusch-J. Abdeckrahmen 1fach aws 2101-34',
  '4.0401StckBusch-J. Wechseltaster-Einsatz 1pol. 2020 US-206',
  '5Arbeitsaufwand',
  '4.0208Std.Leitender Monteur',
  'Obermonteur für Energie- und Gebäudetechnik',
  '4.0308Std.Auszubildender',
  'Energie- und Gebäudetechnik',
  '4.0401StückAn- und Abreisepauschale Zone 1',
  'Beinhaltet: Reisezeit und Reisekilometer',
  '4.0501StückRüstzeit-/Materialbeschaffung, Bearbeitungspauschale',
  'ELSA cnc service GmbH • Ammerthalstraße 12 • 85551 Kirchheim bei MünchenKreissparkasse München Starnberg Ebersberg',
  'GF Bernhard Sander • HRB 104822 München • UID-Nr. DE162463240IBAN: DE44 7025 0150 0040 2968 40',
  'Tel.: +49 89 9033812 • www.elsa-service.de • Mail: info@elsa-service.deSWIFT-BIC BYLADEM1KMS',
  'Seite 2 von 2'
].join('\n');

describe('parseServiceOrderText', () => {
  it('erkennt Projektnummer, Dokumentnummer, Kunde, Ansprechpartner, Telefon und Kurzbeschreibung', () => {
    const result = parseServiceOrderText(SAMPLE_RAW);
    expect(result.projectNumber).toBe('264235');
    expect(result.documentNumber).toBe('264216');
    expect(result.customer).toBe('Sabine Hanslbauer');
    expect(result.contactPerson).toBe('Sabine Hanslbauer');
    expect(result.contactPhone).toBe('01748425400');
    expect(result.projectDescription).toBe('Kabelkanal Markiese, Steckdose Terrasse');
  });

  it('erkennt alle Material-Positionen über beide Seiten hinweg mit Menge/Einheit/Bezeichnung', () => {
    const result = parseServiceOrderText(SAMPLE_RAW);
    expect(result.materials).toEqual([
      { description: 'Leitungsführungskanal LF 15x15 vw', quantity: 4, unit: 'm' },
      { description: 'Schlauchleitung H05VV-F 3G1,5', quantity: 4, unit: 'm' },
      { description: 'Winkel LF-Kanal', quantity: 1, unit: 'Stk' },
      { description: 'Leitungsführungskanal PVC LF 15x15 gsw', quantity: 4, unit: 'm' },
      { description: 'NYY-J 3x2,5', quantity: 20, unit: 'm' },
      { description: 'Gießharz-Muffe', quantity: 1, unit: 'Stk' },
      { description: 'Busch-J. Wächter aws 6800-34-102C', quantity: 1, unit: 'Stk' },
      { description: 'Busch-J. Univ.Relais-Einsatz UP 230V 2300W/VA 6401 U-102', quantity: 1, unit: 'Stk' },
      { description: 'Busch-J. Abdeckrahmen 1fach aws 2101-34', quantity: 1, unit: 'Stk' },
      { description: 'Busch-J. Wechseltaster-Einsatz 1pol. 2020 US-206', quantity: 1, unit: 'Stk' }
    ]);
  });

  it('nimmt "Arbeitsaufwand"-Positionen NICHT als Material, sondern als Hinweistext (inkl. Fortsetzungszeilen)', () => {
    const result = parseServiceOrderText(SAMPLE_RAW);
    expect(result.materials.some((m) => /Monteur|Auszubildender|Abreisepauschale|Rüstzeit/.test(m.description))).toBe(
      false
    );
    expect(result.laborLines).toEqual([
      '8 Std Leitender Monteur Obermonteur für Energie- und Gebäudetechnik',
      '8 Std Auszubildender Energie- und Gebäudetechnik',
      '1 Stk An- und Abreisepauschale Zone 1 Beinhaltet: Reisezeit und Reisekilometer',
      '1 Stk Rüstzeit-/Materialbeschaffung, Bearbeitungspauschale'
    ]);
  });

  it('summiert die geplanten Mannstunden aus den "Std"-Arbeitsaufwand-Positionen (Pauschalen/Stückzahlen zählen nicht mit)', () => {
    const result = parseServiceOrderText(SAMPLE_RAW);
    expect(result.plannedLaborHours).toBe(16);
  });

  it('ignoriert wiederkehrende Brief-/Fußzeilen (Bankverbindung, Handelsregister) und Seitenzahlen', () => {
    const result = parseServiceOrderText(SAMPLE_RAW);
    const allText = [...result.materials.map((m) => m.description), ...result.laborLines].join(' ');
    expect(allText).not.toMatch(/Kreissparkasse|SWIFT-BIC|IBAN:|HRB|Seite \d/);
  });

  it('liefert leere Listen und undefined-Felder, wenn gar nichts erkennbar ist', () => {
    const result = parseServiceOrderText('nur irgendein Text ohne Struktur');
    expect(result.materials).toEqual([]);
    expect(result.laborLines).toEqual([]);
    expect(result.plannedLaborHours).toBeUndefined();
    expect(result.projectNumber).toBeUndefined();
    expect(result.customer).toBeUndefined();
  });

  it('trimmt den rohen Text, liefert ihn aber unverändert in `raw`', () => {
    const result = parseServiceOrderText(`  ${SAMPLE_RAW}  `);
    expect(result.raw).toBe(SAMPLE_RAW);
  });

  // Reale, bildlastigere Export-Variante des Serviceauftrags (Beispiel
  // "Klenzestraße"): ein Großteil des dynamischen Inhalts (Kundendaten,
  // Ansprechpartner, Artikeltabelle UND die sonst genutzte volle
  // "Projektnummer: X"-Zeile) liegt dort als rasterisiertes Bild statt
  // echtem Text vor - pdfjs' Textextraktion liefert dafür nichts. Nur die
  // statische Kopf-Info-Box bleibt echter Text, mit der ABGEKÜRZTEN Form
  // "Projektnr.:" statt "Projektnummer:".
  const SAMPLE_RAW_IMAGE_HEAVY = ['Dok-nr.: 266051', 'Datum: 21.09.2026', 'Kundennr.: 60103', 'Projektnr.: 266139', '85748 Garching', 'Serviceauftrag', 'Klenzestraße 34, UG1 (Stellplatz P_52)', 'Pos.MengeEin.Text'].join('\n');

  it('erkennt die Projektnummer über die abgekürzte Form "Projektnr.:" (Fallback), wenn die volle "Projektnummer:"-Zeile fehlt (bildlastigere Export-Variante)', () => {
    const result = parseServiceOrderText(SAMPLE_RAW_IMAGE_HEAVY);
    expect(result.projectNumber).toBe('266139');
  });

  it('bevorzugt bei Vorhandensein beider Formen die volle Schreibweise "Projektnummer:"', () => {
    const raw = ['Projektnr.: 999999', 'Projektnummer: 264235'].join('\n');
    const result = parseServiceOrderText(raw);
    expect(result.projectNumber).toBe('264235');
  });

  describe('Tabellenzeilen mit echten Leerzeichen (OCR-Fallback-Format statt der leerzeichenlosen pdfjs-Verschmelzung)', () => {
    // Dieselbe Positionstabelle wie in SAMPLE_RAW, aber mit echten
    // Leerzeichen statt der pdfjs-typischen Verschmelzung - so, wie
    // extractPdfTextViaOcr() (serviceOrderPdf.ts) den Text tatsächlich
    // liefert (Tesseract erkennt die im Dokument gedruckten Wortabstände).
    const SAMPLE_RAW_OCR_SPACED = [
      'Pos. Menge Ein. Text',
      '1 Kabelkanal Markiese 1.OG',
      '1.010 4 m Leitungsführungskanal LF 15x15 vw',
      '1.020 4 m Schlauchleitung H05VV-F 3G1,5',
      '1.030 1 Stck Winkel LF-Kanal'
    ].join('\n');

    it('erkennt Material-Positionen auch mit echten Leerzeichen zwischen Position/Menge/Einheit/Text', () => {
      const result = parseServiceOrderText(SAMPLE_RAW_OCR_SPACED);
      expect(result.materials).toEqual([
        { description: 'Leitungsführungskanal LF 15x15 vw', quantity: 4, unit: 'm' },
        { description: 'Schlauchleitung H05VV-F 3G1,5', quantity: 4, unit: 'm' },
        { description: 'Winkel LF-Kanal', quantity: 1, unit: 'Stk' }
      ]);
    });
  });

  // Echter Serviceauftrag (Dok-Nr. 266070, vom Nutzer hochgeladen) - neuere
  // Vorlagen-Variante MIT zusätzlicher "Art.-Nr."-Spalte UND mit dem
  // Abschnittstitel "Lohn" statt "Arbeitsaufwand" für den Zeit-/Pauschal-
  // Teil. Ursprünglicher Bug: "Lohn" wurde nicht als solcher erkannt,
  // dadurch landeten Arbeitsstunden-Positionen fälschlich in der
  // Materialliste. Per echter pdfjs-Extraktion erzeugt (nicht von Hand
  // getippt), inkl. Seitenumbruch mitten in einer Positionsbeschreibung
  // ("...je" auf Seite 2, Fortsetzung "Wallbox" auf Seite 3).
  const SAMPLE_RAW_LOHN = [
    'ELSA cnc service GmbH - Ammerthalstr. 12 - 85551 Kirchheim b. München',
    'Dok-nr.: 266070',
    'Datum: 06.11.2026',
    'Kundennr.: 60118',
    'Firma',
    'Projektnr.: 266164',
    'DP World Logistics Germany B.V.&Co.KG',
    'Mörser Str. 67',
    '38442 Wolfsburg',
    'IBAN: DE44 7025 0150 0040 2968 40',
    'SWIFT-BIC BYLADEM1KMS',
    'UID-Nr. DE162463240',
    'ServiceauftragOriginal',
    'e-solution',
    'Auftrag:',
    'Einsatzort:',
    'Hinweis zum Installationsort:',
    'Sonstige Infos:',
    'Bemerkungen:',
    'Erweiterung Ladeinfrastruktur, Lilienthalstraße 6, Freising',
    'Projektnummer: 266164',
    'Sachbearbeiter:',
    'Projektleiter:',
    '-KUNDENDATEN -',
    'Firma',
    'DP World Logistics Germany B.V.&Co.KG',
    'Mörser Str. 67',
    '38442 Wolfsburg',
    'Ansprechpartner vor Ort: Rene Materna',
    'Telefon: 089 32672888',
    'E-Mail: ap-cc-invoice@dpworld.com',
    'Pos.MengeEin.TextArt.-Nr.',
    'Seite 1 von 3',
    'Pos.MengeEin.TextArt.-Nr.',
    '1Material',
    '1.0102StückEasee Charge Up5213396',
    '(22 kW, Steckdose Typ 2, RFID/APP,',
    'integrierter Energiezähler,',
    'WLAN/SIM+/Bluetooth, OCPP 1.6, FI',
    'Typ A, DC-Schutz)',
    '1.02020mDiverse NYY-J 5x6 RE Eca S0200425',
    'Starkstromkabel NYY-J 5x6 RE Eca',
    '1.0301StückSpelsberg Automatenkasten 400V0625282',
    '6/16qmm 2x7p. AK 09',
    '1.0401StückHager Phasenschiene0606736',
    '4p,16qmm,12mod,Gabel KDN451D',
    '1.0501StückHager Endkapp f.Phasenschiene 4-0606744',
    'polig KZN024',
    '1.0602StückABB Stotz Sicherungsautomat0641406',
    'B,6kA,16A,3P S203-B16',
    '1.08015StückFränkische Aluminium-Abstandschelle0520084',
    'VDE 0605, 4456 ASG-E 25',
    '1.0904StückFränkische Kunststoff-Endtülle grau0520091',
    'E-Ku-E 25',
    '1.1009mFränkische Aluminiumrohr, schwer0520125',
    'VDE 0605, 4456 ALU Steck ES 25',
    '1.1103StückFränkische Aluminium-Steckmuffe0520070',
    'AMS-E 25',
    '1.12015mFränkische Kunststoff-Wellrohr0500657',
    'schwer 25,0x18,4mm FFKuS-ES-F-',
    'UV25 sw',
    '1.1301StückEasee-Stele mit Dach und',
    'Kabelhaken für 2 Wallboxen',
    '1.1401StückBeton-Fertigfundament',
    '1.1501PauMontagezubehör',
    '2Lohn',
    '2.01010Std.Leitender Monteur1',
    'Obermonteur für Energie- und',
    'Gebäudetechnik',
    '2.02010Std.Elektro Fachhelfer3',
    'Energie- und Gebäudetechnik',
    '2.0302Std.Projektleitung1',
    '2.0402StückPauschale für die Inbetriebnahme und Zertifizierung je5013366',
    'Seite 2 von 3',
    'Pos.MengeEin.TextArt.-Nr.',
    'Wallbox',
    '2.0501StückRüstzeit-/Materialbeschaffung, Bearbeitungspauschale14',
    '2.0603StückAn- und Abreisepauschale Zone 25013371',
    'Beinhaltet: Reisezeit und Reisekilometer',
    'ELSA cnc service GmbH • Ammerthalstr. 12 • 85551 Kirchheim b. MünchenKreissparkasse München Starnberg Ebersberg',
    'GF Bernhard Sander • HRB 104822 München • UID-Nr. DE162463240IBAN: DE44 7025 0150 0040 2968 40',
    'Tel.: +49 89 9033812 • www.elsa-service.de • Mail: info@elsa-service.deSWIFT-BIC BYLADEM1KMS',
    'Seite 3 von 3'
  ].join('\n');

  describe('Abschnittstitel "Lohn" (neuere Vorlagen-Variante mit Art.-Nr.-Spalte, echtes Beispiel Dok-Nr. 266070)', () => {
    it('erkennt Projektnummer, Kunde, Ansprechpartner, Telefon und Kurzbeschreibung (über "Bemerkungen:"-Fallback, da "Auftrag:" hier leer ist)', () => {
      const result = parseServiceOrderText(SAMPLE_RAW_LOHN);
      expect(result.projectNumber).toBe('266164');
      expect(result.documentNumber).toBe('266070');
      expect(result.customer).toBe('DP World Logistics Germany B.V.&Co.KG');
      expect(result.contactPerson).toBe('Rene Materna');
      expect(result.contactPhone).toBe('089 32672888');
      expect(result.projectDescription).toBe('Erweiterung Ladeinfrastruktur, Lilienthalstraße 6, Freising');
    });

    it('ordnet alle 14 Material-Positionen korrekt zu (keine Lohn-Positionen darunter)', () => {
      const result = parseServiceOrderText(SAMPLE_RAW_LOHN);
      expect(result.materials).toHaveLength(14);
      expect(result.materials.map((m) => m.unit)).toEqual([
        'Stk',
        'm',
        'Stk',
        'Stk',
        'Stk',
        'Stk',
        'Stk',
        'Stk',
        'm',
        'Stk',
        'm',
        'Stk',
        'Stk',
        'Pau'
      ]);
      expect(result.materials.at(-1)).toEqual({ description: 'Montagezubehör', quantity: 1, unit: 'Pau' });
    });

    it('erkennt den Abschnitt "Lohn" als Zeit-/Pauschal-Abschnitt (NICHT als Material) und summiert die Mannstunden', () => {
      const result = parseServiceOrderText(SAMPLE_RAW_LOHN);
      expect(result.materials.some((m) => /Monteur|Fachhelfer|Projektleitung|Abreisepauschale|Rüstzeit/.test(m.description))).toBe(
        false
      );
      expect(result.laborLines).toHaveLength(6);
      expect(result.plannedLaborHours).toBe(22);
    });

    it('verliert die Fortsetzung einer Positionsbeschreibung NICHT, wenn sie über einen Seitenumbruch hinweg weitergeht ("...je" -> "Wallbox")', () => {
      const result = parseServiceOrderText(SAMPLE_RAW_LOHN);
      expect(result.laborLines.some((line) => line.includes('Zertifizierung je5013366 Wallbox'))).toBe(true);
    });
  });

  describe('shouldAttemptOcrFallback', () => {
    it('ist true, wenn der extrahierte Text sehr kurz ist und weder Kunde noch Material erkannt wurden (bildlastigere PDF-Variante)', () => {
      const parsed = parseServiceOrderText(SAMPLE_RAW_IMAGE_HEAVY);
      expect(shouldAttemptOcrFallback(SAMPLE_RAW_IMAGE_HEAVY, parsed)).toBe(true);
    });

    it('ist false für die normale, ausführliche Beispieldatei (genug Text, Kunde und Material erkannt)', () => {
      const parsed = parseServiceOrderText(SAMPLE_RAW);
      expect(shouldAttemptOcrFallback(SAMPLE_RAW, parsed)).toBe(false);
    });

    it('ist false, wenn der Text zwar kurz ist, aber trotzdem schon ein Kunde oder Material erkannt wurde (kein Rescue-Fall nötig)', () => {
      const shortButReadable = ['-KUNDENDATEN -', 'Frau', 'Max Mustermann'].join('\n');
      const parsed = parseServiceOrderText(shortButReadable);
      expect(parsed.customer).toBe('Max Mustermann');
      expect(shouldAttemptOcrFallback(shortButReadable, parsed)).toBe(false);
    });

    it('ist false für einen hinreichend langen Text, selbst ohne erkannten Kunden/Material', () => {
      const longButUnrecognizable = 'x'.repeat(600);
      const parsed = parseServiceOrderText(longButUnrecognizable);
      expect(shouldAttemptOcrFallback(longButUnrecognizable, parsed)).toBe(false);
    });
  });
});
