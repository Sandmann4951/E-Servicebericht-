import { describe, expect, it } from 'vitest';
import { parseServiceOrderText } from '../../lib/utils/serviceOrderImport';
import { linesFromTextContent } from '../../lib/import/serviceOrderPdf';

// Echter Serviceauftrag Dok-Nr. 266056 (5 Seiten), per pdfjs extrahiert: ein
// in den Auftrag übernommenes Angebot mit dreistelligen Positionen ohne Punkt
// ("010", "150"), Gruppen ohne Einheit und den eigentlichen Positionen in der
// Text-Spalte ("1,0 Stk Energiezähler liefern"). Vorher wurde daraus kein
// einziges Material übernommen.
const SAMPLE_RAW_ANGEBOT = [
  "ELSA cnc service GmbH - Ammerthalstr. 12 - 85551 Kirchheim b. München",
  "Dok-nr.: 266056",
  "Datum: 05.10.2026",
  "Kundennr.: 60248",
  "WEG Lissi-Kaeser-Str. 20-22",
  "Projektnr.: 266049",
  "vertreten durch die",
  "Immobilien Management GmbH",
  "Von-der-Tann-Straße 7",
  "80539 MünchenIBAN: DE44 7025 0150 0040 2968 40",
  "SWIFT-BIC BYLADEM1KMS",
  "UID-Nr. DE162463240",
  "ServiceauftragOriginal",
  "e-solution",
  "Auftrag: Basisinstallation Ladeinfrastruk und Montage von 10 Stück Wallboxen",
  "Einsatzort: WEG Lissi-Kaeser-Str. 20-22, 80797 München",
  "Hinweis zum Installationsort:Firma H+H Facility Management GmbH - Handy 0179-106 008 5",
  "Fr. Hamer",
  "Sonstige Infos:",
  "Bemerkungen:",
  "Projektnummer: 266049",
  "Sachbearbeiter:",
  "Projektleiter:",
  "-KUNDENDATEN -",
  "WEG Lissi-Kaeser-Str. 20-22",
  "vertreten durch die",
  "Immobilien Management GmbH",
  "Von-der-Tann-Straße 7",
  "80539 München",
  "Ansprechpartner vor Ort: Fr. Hamer",
  "Telefon:0179-106 008 5 Fr. Hamer",
  "E-Mail: al@leonhardarchitekten.de",
  "Seite 1 von 5",
  "Pos.MengeEin.TextArt.-Nr.",
  "Angebot 266066",
  "0101Lastmanagement",
  "1,0StkEnergiezähler liefern",
  "und installieren",
  "3,0StkStromwandler liefern",
  "und in Messpunktverteiler installieren",
  "1StkWandlerklemmblock",
  "liefern und in Gehäuse montieren und",
  "anschließen",
  "1StkGehäuse für",
  "Wandlerklemmblock liefern und",
  "installieren",
  "1,0StkHutschienen-Switch",
  "liefern installieren und verdrahten",
  "1,0StkSicherungsautomat",
  "B,6kA,16A,3P liefern, installieren und",
  "verdrahten (Spannungsversorgung",
  "Strompfad Zähler, Annahme: Abgriff",
  "aus UV Allgemeinstrom in der Nähe)",
  "1,0StkKleinmaterial",
  "10mNYM-J 5x1,5 liefern,",
  "verlegen und an UV-Emob",
  "anschließen",
  "10mNetzwerkleitung (§14",
  "EnWg) liefern, verlegen und an",
  "Zählerschrank und UV-E-Mob",
  "anschließen",
  "2StkRJ-45 Stecker liefern und",
  "anschließen",
  "0301Verteilung E-Mob",
  "1,0StkFeldverteiler komplett",
  "inkl. Verdrahtungsmaterial für 16x",
  "FI/LS liefern und installieren",
  "16,0StkFI/LS-Schalter 3+N",
  "Typ A liefern, installieren und",
  "verdrahten",
  "0401Netzwerk",
  "1,0StkNetzwerkschrank",
  "Wandgehäuse 19 Zoll 3HE vertikal +",
  "Seite 2 von 5",
  "Pos.MengeEin.TextArt.-Nr.",
  "5HE horizontal liefern und installieren",
  "1,0Stk24-Port Ethernet",
  "Switch liefern und installieren",
  "1,0StkDSL-Router liefern",
  "und installieren",
  "1,0StkSteckdosen AP",
  "liefern, installieren und anschließen",
  "32,0StkRJ45 Stecker liefern",
  "und anschließen",
  "150,0mNetzwerkkabel liefern",
  "und in vorh. Verlegesystem verlegen",
  "0501Verlegesystem",
  "40mStandard-Kabelrinne",
  "Gr. ca. 200x60 mm mit Hängestiel",
  "HDUF 300 mm Ausleger 200 mm",
  "Befestigungsabstand 1,5 m ohne",
  "Formstücke liefern und installieren",
  "160,0mKunststoffpanzerrohr",
  "M32 liefern und auf Schellen",
  "montieren",
  "0601Kabel und Leitungen",
  "100,0mNYM-J 5x10² liefern",
  "und auf vorhandenem Verlegeweg",
  "von Wohnungszähler zu Verteilung E-",
  "Mob installieren",
  "16,0StkNYM-J 5x10² Leitung",
  "Verteilung E-Mob anschließen",
  "16,0Stk5x10² Leitung an",
  "Klemmstein Zählerschrank",
  "anschließen",
  "520,0mNHXMH-J 5x4 Dca S",
  "Mantelltg halogenfr. liefern und auf",
  "vorhandenem Verlegeweg installieren",
  "16,0Stk5x42 Leitung in",
  "Verteilung E-Mob anschließen",
  "16,0Stk5x4² Leitung an",
  "Wallbox bzw. Abox anschließen",
  "0701Stemm und Bohrarbeiten",
  "Seite 3 von 5",
  "Pos.MengeEin.TextArt.-Nr.",
  "1,0StkMindestpauschale",
  "Kernbohrfirma",
  "0801Brandschutz",
  "3,0StkBrandschott wieder",
  "fachgerecht verschließen",
  "0901Projektmanagement",
  "1,0StkVor-Ort-Begehung",
  "1,0StkKommunikation EVU",
  "=> Antragstellung der",
  "Ladeinfrastruktur",
  "1,0StkDokumentation",
  "1,0StkProjektplanung",
  "1,0StkBauleitung",
  "1,0StkInbetriebnahme",
  "1001Sonstige Arbeiten",
  "16,0StkDGUV-Prüfung der",
  "Zuleitungen inkl. Dokumentation",
  "1StkKonstruktion aus",
  "Profilschienen und Winkeln für",
  "Montage Verteilung E-Mob liefern und",
  "installieren",
  "10,0StkAbzweigdose (Für",
  "Stellplätze ohne Wallbox) liefern und",
  "installieren",
  "1101Reise",
  "10 StkAnreisepauschale inkl.",
  "Fahrzeit Monteur",
  "Angebot 266067",
  "1501Stückgo-e Charger PRO Wallbox",
  "(11 kW, 6m Typ 2 Kabel, RFID/APP,",
  "MID, LAN/WLAN/SIM+/Bluetooth,",
  "OCPP 1.6/Modbus TCP)",
  "Seite 4 von 5",
  "Pos.MengeEin.TextArt.-Nr.",
  "2402Std.Installationsarbeiten",
  "∂Herstellung der elektrischen und",
  "netzwerktechnischen Anschlüsse",
  "an Verteiler & Wallbox",
  "∂Montage und Anschluss der",
  "Wallbox",
  "2501PauWallbox Inbetriebnahme und",
  "Zertifizierung",
  "∂Vorkonfiguration der Ladestation",
  "∂Inbetriebnahme vor Ort",
  "∂Integration in bestehende",
  "Ladeinfrastrukturen",
  "∂Prüfung und Berichtserstellung",
  "gemäß EN 61851-1 und IEC",
  "62955",
  "∂Koordinierung/Antragstellung",
  "Netzbetreiber",
  "ELSA cnc service GmbH • Ammerthalstr. 12 • 85551 Kirchheim b. MünchenKreissparkasse München Starnberg Ebersberg",
  "GF Bernhard Sander • HRB 104822 München • UID-Nr. DE162463240IBAN: DE44 7025 0150 0040 2968 40",
  "Tel.: +49 89 9033812 • www.elsa-service.de • Mail: info@elsa-service.deSWIFT-BIC BYLADEM1KMS",
  "Seite 5 von 5"
].join('\n');

describe('Serviceauftrag mit übernommenem Angebot (Dok-Nr. 266056)', () => {
  const result = parseServiceOrderText(SAMPLE_RAW_ANGEBOT);

  it('erkennt Projektnummer und Kunde', () => {
    expect(result.projectNumber).toBe('266049');
    expect(result.customer).toBe('WEG Lissi-Kaeser-Str. 20-22');
  });

  it('übernimmt alle 33 Materialpositionen aus den Gruppen und die eigenständigen Positionen', () => {
    expect(result.materials).toHaveLength(33);
    expect(result.materials[0]).toEqual({ description: 'Energiezähler liefern und installieren', quantity: 1, unit: 'Stk' });
    expect(result.materials[7]).toEqual({ description: 'NYM-J 5x1,5 liefern, verlegen und an UV-Emob anschließen', quantity: 10, unit: 'm' });
    // Über den Seitenumbruch fortgesetzte Beschreibung:
    expect(result.materials[12].description).toBe('Netzwerkschrank Wandgehäuse 19 Zoll 3HE vertikal + 5HE horizontal liefern und installieren');
    // Eigenständige Position 150 nach dem zweiten Angebotsblock:
    expect(result.materials[31]).toMatchObject({ quantity: 1, unit: 'Stk' });
    expect(result.materials[31].description).toMatch(/^go-e Charger PRO Wallbox \(11 kW/);
  });

  it('hängt die Zeile "Angebot 266067" nicht an die vorherige Position an', () => {
    expect(result.materials.some((m) => m.description.includes('Angebot'))).toBe(false);
    expect(result.laborLines.some((l) => l.includes('Angebot'))).toBe(false);
  });

  it('führt Projektmanagement, Reise und Std-Positionen als Zeit/Pauschale statt als Material', () => {
    expect(result.materials.some((m) => /Bauleitung|Anreisepauschale|Installationsarbeiten/.test(m.description))).toBe(false);
    expect(result.laborLines).toHaveLength(8);
    expect(result.laborLines.at(-1)).toMatch(/^2 Std Installationsarbeiten Herstellung der elektrischen/);
    expect(result.plannedLaborHours).toBe(2);
  });
});

describe('linesFromTextContent', () => {
  const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });

  it('verwirft exakt übereinander gedruckte Doppelungen, behält aber gleiche Texte an anderer Stelle', () => {
    const lines = linesFromTextContent([
      item('1,0', 218.16, 613.92),
      item('Stk', 254.16, 613.92),
      item('1,0', 218.16, 613.94),
      item('Stk', 254.16, 613.94),
      item('Stk', 254.16, 582.48)
    ]);
    expect(lines).toEqual(['1,0Stk', 'Stk']);
  });
});
