import { describe, expect, it } from 'vitest';
import { parseDeliveryNoteText } from '../../lib/utils/deliveryNoteOcr';

describe('parseDeliveryNoteText', () => {
  it('erkennt mehrere Positionen aus einem realistischen Lieferschein (Menge auf eigener Zeile, Menge fehlt bei der letzten Position)', () => {
    const raw = [
      'Lieferschein Nr. 445566',
      'Datum 03.09.2026',
      '',
      '5912361 DEHN DG MP TNS 275 Überspannungsableiter Typ 2 DEHNguard',
      '2 Stk',
      '',
      '7451122 Kabel NYM-J 3x1,5mm² 100m Ring',
      '1 Stk',
      '',
      '8812233 Schutzschalter B16'
    ].join('\n');

    const result = parseDeliveryNoteText(raw);

    expect(result).toEqual([
      { articleNumber: '5912361', description: 'DEHN DG MP TNS 275 Überspannungsableiter Typ 2 DEHNguard', quantity: 2 },
      { articleNumber: '7451122', description: 'Kabel NYM-J 3x1,5mm² 100m Ring', quantity: 1 },
      { articleNumber: '8812233', description: 'Schutzschalter B16', quantity: undefined }
    ]);
  });

  it('erkennt eine direkt an die Beschreibung angehängte Menge in derselben Zeile', () => {
    const result = parseDeliveryNoteText('7451122 Kabel NYM-J 3x1,5mm² 2 Stk');
    expect(result).toEqual([{ articleNumber: '7451122', description: 'Kabel NYM-J 3x1,5mm²', quantity: 2 }]);
  });

  it('erkennt Artikelnummer + Beschreibung auch ohne jede erkennbare Menge', () => {
    const result = parseDeliveryNoteText('99999999 Ware ohne Mengenangabe');
    expect(result).toEqual([{ articleNumber: '99999999', description: 'Ware ohne Mengenangabe', quantity: undefined }]);
  });

  it('verwechselt eine alleinstehende Mengen-Zeile nicht mit der Beschreibung der vorherigen Position', () => {
    const result = parseDeliveryNoteText('5912361\n3 Stk');
    expect(result).toEqual([]);
  });

  it('liefert eine leere Liste, wenn gar nichts erkennbar ist (kein Fehler)', () => {
    expect(parseDeliveryNoteText('nur irgendein text ohne struktur')).toEqual([]);
    expect(parseDeliveryNoteText('')).toEqual([]);
  });

  it('erkennt mehrere Positionen ohne jede Mengenangabe unabhängig voneinander', () => {
    const raw = '11112222 Erste Position\n33334444 Zweite Position';
    const result = parseDeliveryNoteText(raw);
    expect(result).toEqual([
      { articleNumber: '11112222', description: 'Erste Position', quantity: undefined },
      { articleNumber: '33334444', description: 'Zweite Position', quantity: undefined }
    ]);
  });

  /**
   * Echter, per tesseract.js (deutsches Sprachmodell) erkannter Rohtext eines
   * tatsächlich fotografierten Sonepar-Lieferscheins (vom Nutzer als
   * wiederkehrendes, immer gleiches Format vorgegeben) - UNVERÄNDERT
   * übernommen (inkl. OCR-Fehllesungen, verrutschten Spalten, Kopf-/
   * Metadatenzeilen, "Kundenbestellposition"-Rauschzeilen), nicht
   * handgeschönt. Das Dokument enthält tatsächlich 12 Positionen; Position 10
   * (Eltako-Drehstromzähler) hat auf dieser konkreten Aufnahme durch
   * Bildunschärfe/-schräglage keine einzige erkennbare Mengenangabe in der
   * Nähe ihrer Beschreibungszeile - wird deshalb bewusst NICHT erkannt (siehe
   * Klassenkommentar parseSoneparDeliveryNote: lieber eine Position
   * auslassen als eine falsche Menge raten oder eine Position ganz ohne
   * Mengen-Validierung durchlassen). Position 2 hat eine per OCR verfälschte
   * Artikelnummer ("4010094852" statt echt "1010094852", erste Ziffer 1→4
   * fehlgelesen) - ein reiner Bilderkennungsfehler der Vorlage, kein
   * Parser-Bug; bleibt im Fixture bewusst so stehen, die Review-Liste in
   * MaterialSection.svelte lässt das vor der Übernahme korrigieren.
   */
  it('erkennt 11 von 12 echten Positionen aus einem real fotografierten Sonepar-Lieferschein (Pos. 10 ohne erkennbare Menge bleibt bewusst aus)', () => {
    const raw = [
      '0 N GE RE ODER Be',
      'Datum 05.11.2026',
      'Kundennummer 0207147346 ——',
      'Ammerthalstr. 12 —',
      'B555 1 Kirchheim bei München Kundenbetreuerfin) Innendienst ——',
      'Deutschland Telefon ————',
      'E-Mail christian.janker@sonepar.de BD ——',
      'FT ———————',
      'Versa m',
      'ELs ge Pag Versandinformation',
      'service GmbH Anli',
      'lief -',
      'Ammerthalstraße 12 ) u 07:00 bis 17:00 Uhr',
      '85551 Kirchheim Tel. Avisierung',
      'Deutschland Ansprechpartner |',
      'Pos, Artikel-Nr. Bestellinformationen Bestellmenge Liefermenge |',
      'Alte Artikel-Nr. ER En BR',
      'Sonepar Auftrags-Nr.: 3017800059 vom: 04.11.2026',
      'SCID: 76325871 / SAP: 8520473297',
      'Ihre Bestelldaten: 2026-11-02',
      '1035950274 Sander',
      'Kommission: 266034 LIS Hofheimerstr. 2ff',
      'el 00000000 ee re |',
      '1 _ 1010837712 Siemens 7KM2200-2EA30-1JA1 SENTRON Messgerät 7KM PAC2200 1,00 ST 1,00 ST',
      '1106020 Kundenbestellposition: 1',
      '2 4010094852  Celsa TQ18-B 150/1A KI.1 Kabelumbau Stromwandler TQ 18-B 3,00 ST 3,00 ST',
      '5608684 Kundenbestellposition: 2',
      '3 1009743510 Hager VA48CN Kleinverteiler, AP Volta IP30,4x12PLE,DIN4387 1,00 ST 1,00 ST |',
      '0611796 Kundenbestellposition: 3 a',
      '4 1009031401 Hager VA48T Tür, Volta f.APV 4-reihig 1,00 ST 1,00 ST',
      '0611078 Kundenbestellposition: 4',
      '5 1010320178 Hensel DK 3535 G Kabelabzweigkasten 16-35qmm 3phasig 1,00 ST 1,00 ST',
      '0645628 Kundenbestellposiion: 24 5] ——',
      '6 1010111137 _WAGO 2007-8876 Klemmenblock für Stromwandler 1,00 ST 1,00 ST',
      '7801547 ____Kundenbestellpositon: 6 1  _ __——',
      '7 1010877594 Hensel Mi AS 4142 Verteiler 2x3xNH 00 125A 5-pol.Sch.250A 1,00 ST 1,00 ST',
      '5909500 Kundenbestellposition: 7 ne en a nee',
      '8 1009247341 MERSEN NH0006650V100-1 NH-Sicherungseinsatz SG Gr.000 gG100A/500VKM 6,00 ST 6,00 ST',
      '0630377 Kundenbestellposition: 8 er, a',
      'er ‚00 ST',
      '9 1009033842 Hensel Mi PL 2 (VE2) Plombierkappen 2,00ST 2',
      '0621832 Kundenbestellposition: g a om',
      'Be _—_—_ 1,00 ST 1,00 ST',
      '10 1010532061 Eltako DSZ15DE-3x80A Drehstromzähler',
      '6907682 Kundenbestellposition: 10 |||',
      'I ; 2,00 KA1 \\',
      '11 1009457187 D-Link DGS-1024DIE 24-Port Gigabit Switch 24x1000MbitTF 2,00 KA1',
      '4504236 Kundenbestellposition: 11 mn nn',
      '— —  _ a ST 2,00 ST',
      '12 1009496735 Telegärtn. AMJ-Mod 24PP/ub gr 19Z.-Modulträger AHE gr 24AMJ/UMJ Ports 2,00',
      'j 4522463 Kundenbestellposition: 12',
      'E * MMeter KG Kilogramm PK Packung j',
      'E: ; En | Mr Druckdatum: 05.11.26 04:25',
      'ee ung entnehmen zier- und Zahlungs- Sonepar Deutschland / Region Süd GmbH Geschäftsführung... | Johannes Kuschel Dlnaiel kimaneurale ah,',
      '3 E.: ’ 2 Aneeren Node en Br. Zee 60 DERRIDR Augsburg ld Augsburg HRB 14280 0 One Ye %e asert',
      '=: E:: Fax: +49 821 2418 145',
      'ce. Br v. www.sonepar.de k',
      '1,x0 | Au',
      'r ei 4 j'
    ].join('\n');

    const result = parseDeliveryNoteText(raw);

    expect(result).toEqual([
      { articleNumber: '1010837712', description: 'Siemens 7KM2200-2EA30-1JA1 SENTRON Messgerät 7KM PAC2200', quantity: 1 },
      // Artikelnummer hier per OCR verfälscht (echt: 1010094852) - siehe Klassenkommentar oben.
      { articleNumber: '4010094852', description: 'Celsa TQ18-B 150/1A KI.1 Kabelumbau Stromwandler TQ 18-B', quantity: 3 },
      { articleNumber: '1009743510', description: 'Hager VA48CN Kleinverteiler, AP Volta IP30,4x12PLE,DIN4387', quantity: 1 },
      { articleNumber: '1009031401', description: 'Hager VA48T Tür, Volta f.APV 4-reihig', quantity: 1 },
      { articleNumber: '1010320178', description: 'Hensel DK 3535 G Kabelabzweigkasten 16-35qmm 3phasig', quantity: 1 },
      { articleNumber: '1010111137', description: 'WAGO 2007-8876 Klemmenblock für Stromwandler', quantity: 1 },
      { articleNumber: '1010877594', description: 'Hensel Mi AS 4142 Verteiler 2x3xNH 00 125A 5-pol.Sch.250A', quantity: 1 },
      { articleNumber: '1009247341', description: 'MERSEN NH0006650V100-1 NH-Sicherungseinsatz SG Gr.000 gG100A/500VKM', quantity: 6 },
      { articleNumber: '1009033842', description: 'Hensel Mi PL 2 (VE2) Plombierkappen', quantity: 2 },
      // Position 10 (Eltako-Drehstromzähler) fehlt hier bewusst - siehe Klassenkommentar oben.
      { articleNumber: '1009457187', description: 'D-Link DGS-1024DIE 24-Port Gigabit Switch 24x1000MbitTF', quantity: 2 },
      { articleNumber: '1009496735', description: 'Telegärtn. AMJ-Mod 24PP/ub gr 19Z.-Modulträger AHE gr 24AMJ/UMJ Ports', quantity: 2 }
    ]);
  });
});
