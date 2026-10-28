import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildReportDocx, suggestedFileName } from '../../lib/export/docxExport';
import type { FullReport } from '../../lib/export/getFullReport';
import type { MaterialItem, Photo, ServiceReport, TimeEntry } from '../../lib/db/types';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Vitest laeuft ohne Dev-Server in einer Node-Umgebung, wo `fetch()` die von
// Vite verarbeitete, relative Asset-URL der Vorlage nicht aufloesen kann -
// die Datei wird hier stattdessen direkt von der Festplatte gelesen und per
// optionalem Parameter eingespeist (siehe docxExport.ts), damit echte
// Render-Logik statt eines Mocks getestet wird.
const templatePath = fileURLToPath(
  new URL('../../assets/templates/servicebericht-vorlage.docx', import.meta.url)
);
let templateBytes: ArrayBuffer;

beforeAll(() => {
  const buffer = readFileSync(templatePath);
  templateBytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
});

function fakeReport(overrides: Partial<ServiceReport> = {}): ServiceReport {
  return {
    id: 'report-1',
    projectNumber: '2026-001',
    projectDescription: 'Zählerschrank-Sanierung EG',
    customer: 'Musterfirma GmbH',
    contactPerson: 'Frau Beispiel',
    technicianName: 'Daniel Sander',
    status: 'open',
    notes: 'Zählerschrank geprüft.\nKunde vor Ort informiert.',
    timeEntryCount: 1,
    totalDurationMinutes: 120,
    materialItemCount: 1,
    photoCount: 1,
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
    ...overrides
  };
}

function fakeTimeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'time-1',
    reportId: 'report-1',
    date: '2026-08-10',
    startTime: '08:00',
    endTime: '10:00',
    durationMinutes: 120,
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
    ...overrides
  };
}

function fakeMaterialItem(overrides: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id: 'material-1',
    reportId: 'report-1',
    description: 'Kabel NYM-J 3x1,5mm²',
    quantity: 20,
    unit: 'm',
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
    ...overrides
  };
}

function fakePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'photo-1',
    reportId: 'report-1',
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
    thumbnailBlob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
    mimeType: 'image/jpeg',
    width: 800,
    height: 600,
    sizeBytes: 4,
    takenAt: '2026-08-10T09:00:00.000Z',
    ...overrides
  };
}

function fakeFullReport(overrides: Partial<FullReport> = {}): FullReport {
  return {
    report: fakeReport(),
    timeEntries: [fakeTimeEntry()],
    materialItems: [fakeMaterialItem()],
    photos: [fakePhoto()],
    ...overrides
  };
}

/** Entpackt das erzeugte Blob und liefert word/document.xml als Text - Grundlage fuer alle inhaltlichen Pruefungen unten. */
async function documentXmlOf(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('word/document.xml fehlt im erzeugten docx');
  return file.async('text');
}

async function build(data: FullReport): Promise<Blob> {
  return buildReportDocx(data, templateBytes);
}

describe('buildReportDocx', () => {
  it('erzeugt einen nicht-leeren Blob mit docx-Mimetype', async () => {
    const blob = await build(fakeFullReport());
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe(DOCX_MIME_TYPE);
  });

  it('traegt die Kopfdaten in die dafuer vorgesehenen Felder der ELSA-Vorlage ein', async () => {
    const blob = await build(
      fakeFullReport({
        report: fakeReport({
          projectNumber: '2026-TEST-777',
          customer: 'Testkunde GmbH',
          technicianName: 'Erika Musterfrau',
          contactPerson: 'Herr Ansprechpartner',
          projectDescription: 'Testprojekt Beschreibung',
          performedWork: 'Testbeschreibung der Arbeiten'
        })
      })
    );
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('2026-TEST-777');
    expect(xml).toContain('Testkunde GmbH');
    // Berichtersteller, Techniker (Unterschriftenzeile) und die Techniker-Spalte
    // der Zeiten-Tabelle (ein Tag mit Zeiteintrag) - derselbe Name an allen drei Stellen.
    expect(xml.match(/Erika Musterfrau/g)?.length).toBe(3);
    expect(xml).toContain('Herr Ansprechpartner');
    expect(xml).toContain('Testprojekt Beschreibung');
    expect(xml).toContain('Testbeschreibung der Arbeiten');
  });

  it('traegt das Export-Datum (heutiges Datum, nicht report.createdAt) mit dem festen Firmenstandort in das Ort/Datum-Fußzeilenfeld ein', async () => {
    const blob = await build(fakeFullReport({ report: fakeReport({ createdAt: '2020-01-01T00:00:00.000Z' }) }));
    const xml = await documentXmlOf(blob);
    const today = new Date();
    const expectedDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    expect(xml).toContain(`Kirchheim bei München, ${expectedDate}`);
  });

  it('befuellt "Durchgefuehrte Arbeiten" ausschliesslich aus performedWork, nicht aus notes', async () => {
    const blob = await build(
      fakeFullReport({ report: fakeReport({ performedWork: 'Sicherung ersetzt', notes: 'Kunde war unzufrieden mit Wartezeit' }) })
    );
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('Sicherung ersetzt');
    // "Kunde war unzufrieden..." landet NICHT bei "Durchgeführte Arbeiten",
    // sondern (separat geprüft unten) im versteckten "Interner Bericht"-Feld.
    const performedWorkRun = xml.match(/<w:r><w:rPr>[^]*?<\/w:rPr><w:t xml:space="preserve">Sicherung ersetzt<\/w:t><\/w:r>/)?.[0];
    expect(performedWorkRun, 'erwartet einen Run für performedWork').toBeDefined();
    expect(performedWorkRun).not.toContain('Kunde war unzufrieden mit Wartezeit');
  });

  it('trägt notes sichtbar (kein w:vanish mehr) in das "Interner Bericht/Bemerkungen/Ersatzteilnummern:"-Feld ein, übrige Formatierung bleibt erhalten', async () => {
    const blob = await build(fakeFullReport({ report: fakeReport({ notes: 'Kunde war unzufrieden mit Wartezeit' }) }));
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('Kunde war unzufrieden mit Wartezeit');
    expect(xml).toContain('Interner Bericht/Bemerkungen/Ersatzteilnummern:');

    // Bewusst in einem eng begrenzten Fenster direkt VOR dem jeweiligen Text
    // geprüft (nicht per unbegrenzt-"lazy" Regex über das gesamte Dokument -
    // das würde bei einem Dokument mit mehreren <w:rPr>-Blöcken potenziell
    // einen völlig anderen, viel früheren Run samt allem dazwischen treffen).
    const valueIdx = xml.indexOf('Kunde war unzufrieden mit Wartezeit');
    const valueWindow = xml.slice(Math.max(0, valueIdx - 300), valueIdx);
    expect(valueWindow).toContain('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
    expect(valueWindow).toContain('<w:sz w:val="16"/>');
    expect(valueWindow).toContain('<w:szCs w:val="16"/>');
    // Auf Nutzerwunsch nicht mehr versteckt - w:vanish wurde aus dem Label
    // UND dem Wertfeld entfernt (siehe docxExport.ts-Dateikommentar).
    expect(valueWindow).not.toContain('<w:vanish/>');

    const labelIdx = xml.indexOf('Interner Bericht/Bemerkungen/Ersatzteilnummern:');
    const labelWindow = xml.slice(Math.max(0, labelIdx - 300), labelIdx);
    expect(labelWindow).not.toContain('<w:vanish/>');
  });

  it('funktioniert ohne Notizen (verstecktes Feld bleibt leer, kein Fehler)', async () => {
    const blob = await build(fakeFullReport({ report: fakeReport({ notes: undefined }) }));
    expect(blob.size).toBeGreaterThan(0);
  });

  it('traegt Ansprechpartner-Name und Telefonnummer in die zwei getrennten Felder der Vorlage ein', async () => {
    const blob = await build(
      fakeFullReport({ report: fakeReport({ contactPerson: 'Sabine Hanslbauer', contactPhone: '0174 8425400' }) })
    );
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('Sabine Hanslbauer');
    expect(xml).toContain('0174 8425400');
    // Die Telefonnummer darf NICHT (mehr) in den Namen gemischt sein.
    expect(xml).not.toContain('Sabine Hanslbauer (Tel.');
  });

  it('erkennt bei Altberichten ohne contactPhone das frühere Merge-Format "Name (Tel. ...)" in contactPerson und trennt es für den Export wieder auf', async () => {
    const blob = await build(
      fakeFullReport({
        report: fakeReport({ contactPerson: 'Sabine Hanslbauer (Tel. 01748425400)', contactPhone: undefined })
      })
    );
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('Sabine Hanslbauer');
    expect(xml).toContain('01748425400');
    expect(xml).not.toContain('Sabine Hanslbauer (Tel.');
  });

  it('funktioniert ohne Ansprechpartner-Telefonnummer (Feld bleibt leer, kein Fehler)', async () => {
    const blob = await build(fakeFullReport({ report: fakeReport({ contactPerson: 'Sabine Hanslbauer', contactPhone: undefined }) }));
    expect(blob.size).toBeGreaterThan(0);
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('Sabine Hanslbauer');
  });

  it('funktioniert ohne Zeiten/Material/Fotos (leerer Bericht) und laesst die Material-Vorlagenzeile komplett entfallen', async () => {
    const blob = await build(
      fakeFullReport({ timeEntries: [], materialItems: [], photos: [], report: fakeReport({ notes: undefined }) })
    );
    expect(blob.size).toBeGreaterThan(0);
    const xml = await documentXmlOf(blob);
    // Platzhalter-Lueckenfueller-Zeichen der (jetzt leeren) Material-Beispielzeile duerfen nicht mehr auftauchen.
    expect(xml).not.toContain('Kabel NYM-J');
  });

  it('dupliziert die Material-Zeile pro Position mit korrekter Artikelnummer/Bezeichnung/Menge', async () => {
    const blob = await build(
      fakeFullReport({
        materialItems: [
          fakeMaterialItem({ id: 'm1', articleNumber: 'ART-100', description: 'Kabel NYM-J 3x1,5', quantity: 10, unit: 'm' }),
          fakeMaterialItem({ id: 'm2', articleNumber: 'ART-200', description: 'Steckdose aws', quantity: 2, unit: 'Stk' }),
          fakeMaterialItem({ id: 'm3', description: 'Ohne Artikelnummer', quantity: 1, unit: 'Stk' })
        ]
      })
    );
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('ART-100');
    expect(xml).toContain('Kabel NYM-J 3x1,5');
    expect(xml).toContain('10 m');
    expect(xml).toContain('ART-200');
    expect(xml).toContain('Steckdose aws');
    expect(xml).toContain('2 Stk');
    expect(xml).toContain('Ohne Artikelnummer');
    expect(xml).toContain('1 Stk');
  });

  it('befüllt die "Lager (L) / Bestellung (B)"-Spalte pro Position korrekt (L, B, leer bei nicht gewählt)', async () => {
    const blob = await build(
      fakeFullReport({
        materialItems: [
          fakeMaterialItem({ id: 'm1', description: 'XSicherungX', quantity: 1, unit: 'Stk', source: 'lager' }),
          fakeMaterialItem({ id: 'm2', description: 'XZaehlerschrankX', quantity: 1, unit: 'Stk', source: 'bestellung' }),
          fakeMaterialItem({ id: 'm3', description: 'XOhneAuswahlX', quantity: 1, unit: 'Stk', source: undefined })
        ]
      })
    );
    const xml = await documentXmlOf(blob);
    // Jede Materialzeile beginnt mit der "Lager (L)/Bestellung (B)"-Spalte
    // (siehe Dateikommentar in docxExport.ts: {source}{#materials} im
    // selben Run) und endet mit der Beschreibung - die L/B-Markierung muss
    // deshalb VOR der jeweils zugehörigen Beschreibung stehen, aber erst
    // NACH der Beschreibung der vorherigen Zeile (sonst wäre sie der
    // falschen Position zugeordnet).
    const lRun = '<w:t xml:space="preserve">L</w:t>';
    const bRun = '<w:t xml:space="preserve">B</w:t>';
    const lIdx = xml.indexOf(lRun);
    const bIdx = xml.indexOf(bRun);
    const sicherungIdx = xml.indexOf('XSicherungX');
    const zaehlerschrankIdx = xml.indexOf('XZaehlerschrankX');
    const ohneAuswahlIdx = xml.indexOf('XOhneAuswahlX');

    expect(lIdx).toBeGreaterThan(-1);
    expect(lIdx).toBeLessThan(sicherungIdx);
    expect(bIdx).toBeGreaterThan(sicherungIdx);
    expect(bIdx).toBeLessThan(zaehlerschrankIdx);
    // Nach der zweiten Beschreibung darf kein weiteres L/B mehr auftauchen
    // (dritte Position hat bewusst keine Auswahl getroffen).
    expect(xml.slice(zaehlerschrankIdx, ohneAuswahlIdx)).not.toContain(lRun);
    expect(xml.slice(zaehlerschrankIdx, ohneAuswahlIdx)).not.toContain(bRun);
  });

  it('funktioniert ohne Kurzbeschreibung/Ansprechpartner', async () => {
    const blob = await build(
      fakeFullReport({ report: fakeReport({ projectDescription: undefined, contactPerson: undefined }) })
    );
    expect(blob.size).toBeGreaterThan(0);
  });

  it('bettet bis zu 10 Fotos mit Zeitstempel-Beschreibung in die Dokumentations-Tabelle ein (eigene Relationship + Mediendatei je Foto)', async () => {
    const blob = await build(
      fakeFullReport({
        photos: [
          fakePhoto({ id: 'p1', takenAt: '2026-08-10T09:15:00.000Z' }),
          fakePhoto({ id: 'p2', takenAt: '2026-08-10T10:30:00.000Z', width: undefined, height: undefined })
        ]
      })
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith('word/media/photo'));
    expect(mediaFiles).toHaveLength(2);

    const relsXml = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(relsXml).toContain('rIdPhoto0');
    expect(relsXml).toContain('rIdPhoto1');

    const xml = await zip.file('word/document.xml')!.async('text');
    expect(xml).toContain('r:embed="rIdPhoto0"');
    expect(xml).toContain('r:embed="rIdPhoto1"');
    // Fuer die restlichen 8 (unbefuellten) Dokumentations-Zeilen bleibt das
    // Platzhalterbild der Vorlage unveraendert bestehen.
    expect(xml.match(/r:embed="rId22"/g)?.length).toBe(8);
  });

  it('zeigt in der "Beschreibung"-Spalte die eigene Foto-Notiz statt des Zeitstempels', async () => {
    const blob = await build(
      fakeFullReport({
        // Ohne Zeiteinträge, damit das Datum nicht über die Zeiten-Tabelle ins Dokument kommt.
        timeEntries: [],
        photos: [fakePhoto({ id: 'p1', takenAt: '2026-08-10T09:15:00.000Z', note: 'Sicherung vor dem Austausch' })]
      })
    );
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('Sicherung vor dem Austausch');
    expect(xml).not.toContain('10.08.2026');
  });

  it('lässt die "Beschreibung"-Spalte ohne eigene Foto-Notiz bewusst leer (kein Zeitstempel-Fallback)', async () => {
    const blob = await build(
      fakeFullReport({ timeEntries: [], photos: [fakePhoto({ id: 'p1', takenAt: '2026-08-10T09:15:00.000Z', note: undefined })] })
    );
    const xml = await documentXmlOf(blob);
    expect(xml).not.toContain('10.08.2026');
  });

  describe('weitere ELSA-Vorlagenfelder (Objektadresse, E-Mail, Bestellnummer, Mehrungen, Mängel, Angebot, Status-Auswahlen)', () => {
    it('befüllt Objektadresse/Einsatzort, E-Mail und Bestellnummer/AB', async () => {
      const blob = await build(
        fakeFullReport({
          report: fakeReport({
            objectAddress: 'Musterstraße 1, 80331 München',
            contactEmail: 'ansprechpartner@musterfirma.de',
            orderNumber: '4500123456'
          })
        })
      );
      const xml = await documentXmlOf(blob);
      expect(xml).toContain('Musterstraße 1, 80331 München');
      expect(xml).toContain('ansprechpartner@musterfirma.de');
      expect(xml).toContain('4500123456');
    });

    it('befüllt Mehrungen und Festgestellte Mängel unabhängig von notes/performedWork', async () => {
      const blob = await build(
        fakeFullReport({
          report: fakeReport({
            additionalWorkNotes: 'Zusätzliche Dose erforderlich',
            deficiencies: 'Schutzleiter nicht angeschlossen'
          })
        })
      );
      const xml = await documentXmlOf(blob);
      expect(xml).toContain('Zusätzliche Dose erforderlich');
      expect(xml).toContain('Schutzleiter nicht angeschlossen');
    });

    it('"Angebot benötigt für:" bleibt leer, solange quoteNeeded unbeantwortet ist (kein "Nein" ohne explizite Antwort)', async () => {
      const blob = await build(
        fakeFullReport({ report: fakeReport({ quoteNeeded: undefined, quoteNeededFor: undefined, followUpVisitNeeded: undefined }) })
      );
      const xml = await documentXmlOf(blob);
      expect(xml).not.toContain('<w:t xml:space="preserve">Nein</w:t>');
    });

    it('"Angebot benötigt für:" trägt bei quoteNeeded=true den Freitext ein', async () => {
      const blob = await build(
        fakeFullReport({ report: fakeReport({ quoteNeeded: true, quoteNeededFor: 'Erweiterung Zählerschrank' }) })
      );
      const xml = await documentXmlOf(blob);
      expect(xml).toContain('Erweiterung Zählerschrank');
    });

    it('"Angebot benötigt für:" trägt bei quoteNeeded=false "Nein" statt des Freitexts ein', async () => {
      const blob = await build(
        fakeFullReport({ report: fakeReport({ quoteNeeded: false, quoteNeededFor: 'sollte ignoriert werden' }) })
      );
      const xml = await documentXmlOf(blob);
      expect(xml).not.toContain('sollte ignoriert werden');
      const run = xml.match(/<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"\/><w:sz w:val="16"\/><w:szCs w:val="16"\/><\/w:rPr><w:t xml:space="preserve">Nein<\/w:t><\/w:r>/);
      expect(run, 'erwartet einen "Nein"-Run im Angebot-Feld').toBeDefined();
    });

    it('befüllt Anlagenstatus/Auftrag exakt mit den Vorlagen-eigenen Dropdown-Werten', async () => {
      const blob = await build(
        fakeFullReport({ report: fakeReport({ plantStatus: 'bedingt Einsatzbereit', orderType: 'Reparatur & Inspektion' }) })
      );
      const xml = await documentXmlOf(blob);
      expect(xml).toContain('bedingt Einsatzbereit');
      expect(xml).toContain('Reparatur &amp; Inspektion');
    });

    it('schreibt Sicherheitseinrichtungen als "i.O."/"n.i.O." statt Ja/Nein', async () => {
      const okBlob = await build(fakeFullReport({ report: fakeReport({ securityEquipmentOk: true }) }));
      const okXml = await documentXmlOf(okBlob);
      expect(okXml).toContain('i.O.');

      const notOkBlob = await build(fakeFullReport({ report: fakeReport({ securityEquipmentOk: false }) }));
      const notOkXml = await documentXmlOf(notOkBlob);
      expect(notOkXml).toContain('n.i.O.');
    });

    it('befüllt Übernachtung(en) als freien Text', async () => {
      const blob = await build(fakeFullReport({ report: fakeReport({ overnightStays: '2' }) }));
      const xml = await documentXmlOf(blob);
      expect(xml).toContain('<w:t xml:space="preserve">2</w:t>');
    });

    it('schreibt Folgeeinsatz als "Ja"/"Nein"', async () => {
      const jaBlob = await build(fakeFullReport({ report: fakeReport({ followUpVisitNeeded: true }) }));
      const jaXml = await documentXmlOf(jaBlob);
      expect(jaXml).toContain('<w:t xml:space="preserve">Ja</w:t>');

      const neinBlob = await build(fakeFullReport({ report: fakeReport({ followUpVisitNeeded: false }) }));
      const neinXml = await documentXmlOf(neinBlob);
      expect(neinXml).toContain('<w:t xml:space="preserve">Nein</w:t>');
    });

    it('funktioniert ohne jedes der neuen Felder (alle bleiben leer, kein Fehler)', async () => {
      const blob = await build(fakeFullReport());
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  it('begrenzt eingebettete Fotos auf die 10 Zeilen der Vorlage, ohne zu werfen', async () => {
    const manyPhotos = Array.from({ length: 12 }, (_, i) => fakePhoto({ id: `p${i}`, takenAt: `2026-08-10T0${i % 9}:00:00.000Z` }));
    const blob = await build(fakeFullReport({ photos: manyPhotos }));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith('word/media/photo'));
    expect(mediaFiles).toHaveLength(10);
    const xml = await zip.file('word/document.xml')!.async('text');
    expect(xml.match(/r:embed="rId22"/g)).toBeNull();
  });

  it('traegt bei einer Kunden-Unterschrift nur den gedruckten Namen ein (kein Unterschriftsbild, da die Vorlage dafuer keinen Platz vorsieht)', async () => {
    const blob = await build(
      fakeFullReport({
        report: fakeReport({
          signatureBlob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
          signedByName: 'Herr Kunde Unterschrift',
          signedAt: '2026-08-11T12:00:00.000Z'
        })
      })
    );
    const xml = await documentXmlOf(blob);
    expect(xml).toContain('Herr Kunde Unterschrift');
  });

  it('funktioniert ohne Unterschrift (leeres Namensfeld, kein Fehler)', async () => {
    const blob = await build(fakeFullReport({ report: fakeReport({ signatureBlob: undefined, signedByName: undefined }) }));
    expect(blob.size).toBeGreaterThan(0);
  });

  describe('Schriftformatierung der eingetragenen Werte (Regressionstest für den doppelt verschachtelten <w:rPr>-Bug)', () => {
    it('enthält nirgends mehr ein doppelt verschachteltes <w:rPr><w:rPr> (Ursache des Formatierungsfehlers)', async () => {
      const blob = await build(fakeFullReport());
      const xml = await documentXmlOf(blob);
      expect(xml).not.toContain('<w:rPr><w:rPr>');
      expect(xml).not.toContain('</w:rPr></w:rPr>');
    });

    it('übernimmt für Projektnummer exakt die ursprüngliche Formatierung (Arial, fett, 16pt)', async () => {
      const blob = await build(fakeFullReport({ report: fakeReport({ projectNumber: '2026-TEST-777' }) }));
      const xml = await documentXmlOf(blob);
      const run = xml.match(/<w:r><w:rPr>[^]*?<\/w:rPr><w:t xml:space="preserve">2026-TEST-777<\/w:t><\/w:r>/)?.[0];
      expect(run, 'erwartet eine <w:rPr> unmittelbar vor dem Textlauf').toBeDefined();
      expect(run).toContain('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
      expect(run).toContain('<w:b/>');
      expect(run).toContain('<w:sz w:val="32"/>');
    });

    it('übernimmt für Kundenname/Ansprechpartner/Techniker/Beschreibung/Durchgeführte-Arbeiten die ursprüngliche Formatierung (Arial, 8pt)', async () => {
      const blob = await build(
        fakeFullReport({
          report: fakeReport({
            customer: 'XTestkundeX',
            contactPerson: 'XAnsprechpartnerX',
            technicianName: 'XTechnikerX',
            projectDescription: 'XBeschreibungX',
            performedWork: 'XArbeitenX'
          })
        })
      );
      const xml = await documentXmlOf(blob);
      for (const value of ['XTestkundeX', 'XAnsprechpartnerX', 'XTechnikerX', 'XBeschreibungX', 'XArbeitenX']) {
        const run = xml.match(new RegExp(`<w:r><w:rPr>[^]*?</w:rPr><w:t xml:space="preserve">${value}</w:t></w:r>`))?.[0];
        expect(run, `erwartet eine <w:rPr> unmittelbar vor "${value}"`).toBeDefined();
        expect(run).toContain('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
        expect(run).toContain('<w:sz w:val="16"/>');
        expect(run).toContain('<w:szCs w:val="16"/>');
      }
    });

    it('übernimmt für die Foto-Beschreibungen die ursprüngliche Formatierung (Arial, 10pt)', async () => {
      const blob = await build(fakeFullReport({ photos: [fakePhoto({ note: 'XFotoBeschreibungX' })] }));
      const xml = await documentXmlOf(blob);
      const run = xml.match(/<w:r><w:rPr>[^]*?<\/w:rPr><w:t xml:space="preserve">XFotoBeschreibungX<\/w:t><\/w:r>/)?.[0];
      expect(run, 'erwartet eine <w:rPr> unmittelbar vor der Foto-Beschreibung').toBeDefined();
      expect(run).toContain('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
      expect(run).toContain('<w:sz w:val="20"/>');
      expect(run).toContain('<w:szCs w:val="20"/>');
    });

    it('übernimmt für die Kunden-Unterschrift die ursprüngliche Formatierung (Arial, fett, unterstrichen)', async () => {
      const blob = await build(fakeFullReport({ report: fakeReport({ signedByName: 'XUnterschriftX' }) }));
      const xml = await documentXmlOf(blob);
      const run = xml.match(/<w:r><w:rPr>[^]*?<\/w:rPr><w:t xml:space="preserve">XUnterschriftX<\/w:t><\/w:r>/)?.[0];
      expect(run, 'erwartet eine <w:rPr> unmittelbar vor der Unterschrift').toBeDefined();
      expect(run).toContain('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
      expect(run).toContain('<w:b/>');
      expect(run).toContain('<w:u w:val="single"/>');
    });
  });

  describe('"Zeiten"-Tabelle (Word-Tabelle statt eingebettetem Excel)', () => {
    /** Texte aller Zellen der Zeiten-Tabelle, Zeile für Zeile. */
    async function timesheetTableRows(blob: Blob): Promise<string[][]> {
      const xml = await documentXmlOf(blob);
      const tables = xml.match(/<w:tbl>[^]*?<\/w:tbl>/g) ?? [];
      const table = tables.find((candidate) => candidate.includes('>Arbeitszeit<'));
      if (!table) throw new Error('Zeiten-Tabelle nicht gefunden');
      return (table.match(/<w:tr>[^]*?<\/w:tr>/g) ?? []).map((rowXml) =>
        (rowXml.match(/<w:tc>[^]*?<\/w:tc>/g) ?? []).map((cellXml) =>
          [...cellXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
        )
      );
    }

    it('enthält kein eingebettetes Excel-Objekt mehr', async () => {
      const blob = await build(fakeFullReport());
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      expect(zip.file('word/embeddings/Microsoft_Excel_97-2003_Worksheet.xls')).toBeNull();
      expect(await documentXmlOf(blob)).not.toContain('<w:object');
    });

    // 19.10.: 1 Std. Hinfahrt + 8,5 Std. Arbeit + 1 Std. Rückfahrt = 10,5 Std. -> 2,5 Ü-Std.
    it('trägt eine Zeile pro Tag mit Fahrzeit, Km, von/bis, Stunden, Ü-Std. und Pause ein, darunter die Gesamt-Zeile', async () => {
      const blob = await build(
        fakeFullReport({
          report: fakeReport({ technicianName: 'Daniel Sander' }),
          timeEntries: [
            fakeTimeEntry({ id: 'a', date: '2026-10-19', startTime: '07:00', endTime: '08:00', durationMinutes: 60, isTravel: true, kilometers: 42 }),
            fakeTimeEntry({ id: 'b', date: '2026-10-19', startTime: '08:00', endTime: '12:00', durationMinutes: 240 }),
            fakeTimeEntry({ id: 'c', date: '2026-10-19', startTime: '12:30', endTime: '17:00', durationMinutes: 270 }),
            fakeTimeEntry({ id: 'd', date: '2026-10-19', startTime: '17:00', endTime: '18:00', durationMinutes: 60, isTravel: true, kilometers: 40 }),
            fakeTimeEntry({ id: 'e', date: '2026-10-20', startTime: '08:00', endTime: '12:00', durationMinutes: 240 })
          ],
          breaks: [fakeTimeEntry({ id: 'p', reportId: undefined, date: '2026-10-19', startTime: '12:00', endTime: '12:30', durationMinutes: 30, isBreak: true })]
        })
      );
      const rows = await timesheetTableRows(blob);
      // 2 Kopfzeilen, 2 Tage, Gesamt
      expect(rows).toHaveLength(5);
      expect(rows[2]).toEqual(['19.10.2026', 'Daniel Sander', '1,00', '42', '08:00', '17:00', '8,50', '2,50', '0,50', '1,00', '40']);
      expect(rows[3]).toEqual(['20.10.2026', 'Daniel Sander', '', '', '08:00', '12:00', '4,00', '', '', '', '']);
      expect(rows[4]).toEqual(['Gesamt:', '1,00', '42', '', '', '12,50', '2,50', '', '1,00', '40']);
    });

    it('zeigt ohne Zeiteinträge nur Kopf- und Gesamt-Zeile', async () => {
      const rows = await timesheetTableRows(await build(fakeFullReport({ timeEntries: [] })));
      expect(rows).toHaveLength(3);
      expect(rows[2][0]).toBe('Gesamt:');
    });
  });
});

describe('suggestedFileName', () => {
  it('baut einen dateinamensicheren Namen aus der Projektnummer', () => {
    expect(suggestedFileName(fakeReport({ projectNumber: '2026/014 2' }))).toBe('Servicebericht-2026_014_2.docx');
  });

  it('fällt auf einen Platzhalter zurück, wenn die Projektnummer leer ist', () => {
    expect(suggestedFileName(fakeReport({ projectNumber: '  ' }))).toBe('Servicebericht-ohne-Projektnummer.docx');
  });
});
