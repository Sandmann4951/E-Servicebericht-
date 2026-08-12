import { beforeEach, describe, expect, it } from 'vitest';
import { getTechnicianName, setTechnicianName } from '../lib/settings';

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
