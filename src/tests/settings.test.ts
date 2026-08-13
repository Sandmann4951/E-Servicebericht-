import { beforeEach, describe, expect, it } from 'vitest';
import {
  getBundesland,
  getTechnicianName,
  getWeeklyTargetHours,
  setBundesland,
  setTechnicianName,
  setWeeklyTargetHours
} from '../lib/settings';

// `environment: 'node'` kennt kein natives localStorage - ein minimaler
// In-Memory-Stub reicht aus, um getTechnicianName()/setTechnicianName() zu
// testen (dieselbe API-Form wie das echte localStorage im Browser).
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
});

describe('settings (Techniker-Name)', () => {
  it('liefert einen leeren String, solange nichts gespeichert wurde', () => {
    expect(getTechnicianName()).toBe('');
  });

  it('speichert und liest den Techniker-Namen wieder', () => {
    setTechnicianName('Daniel Sander');
    expect(getTechnicianName()).toBe('Daniel Sander');
  });

  it('trimmt beim Speichern', () => {
    setTechnicianName('  Daniel Sander  ');
    expect(getTechnicianName()).toBe('Daniel Sander');
  });

  it('entfernt den gespeicherten Namen wieder, wenn ein leerer String gesetzt wird', () => {
    setTechnicianName('Daniel Sander');
    setTechnicianName('   ');
    expect(getTechnicianName()).toBe('');
  });

  it('wirft nicht, wenn localStorage nicht verfügbar ist', () => {
    // @ts-expect-error - bewusst kaputt machen, um den try/catch-Fallback zu testen
    delete globalThis.localStorage;
    expect(() => setTechnicianName('Test')).not.toThrow();
    expect(getTechnicianName()).toBe('');
  });
});

describe('settings (Sollstunden pro Woche)', () => {
  it('liefert 40 Std. als Standard, solange nichts gespeichert wurde', () => {
    expect(getWeeklyTargetHours()).toBe(40);
  });

  it('speichert und liest die Sollstunden wieder', () => {
    setWeeklyTargetHours(35);
    expect(getWeeklyTargetHours()).toBe(35);
  });

  it('erlaubt 0 Std. (z.B. für Teilzeit/Pause der Erfassung)', () => {
    setWeeklyTargetHours(0);
    expect(getWeeklyTargetHours()).toBe(0);
  });

  it('fällt bei ungültigem Wert (negativ/NaN) auf den Standard zurück', () => {
    setWeeklyTargetHours(-5);
    expect(getWeeklyTargetHours()).toBe(40);
    setWeeklyTargetHours(NaN);
    expect(getWeeklyTargetHours()).toBe(40);
  });
});

describe('settings (Bundesland)', () => {
  it('liefert undefined, solange nichts gespeichert wurde', () => {
    expect(getBundesland()).toBeUndefined();
  });

  it('speichert und liest das Bundesland wieder', () => {
    setBundesland('BY');
    expect(getBundesland()).toBe('BY');
  });

  it('entfernt die Auswahl wieder, wenn undefined gesetzt wird', () => {
    setBundesland('BY');
    setBundesland(undefined);
    expect(getBundesland()).toBeUndefined();
  });

  it('ignoriert einen ungültigen gespeicherten Wert (z.B. durch manuelle localStorage-Manipulation)', () => {
    localStorage.setItem('e-servicebericht:bundesland', 'XX');
    expect(getBundesland()).toBeUndefined();
  });
});
