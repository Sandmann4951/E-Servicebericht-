<script lang="ts">
  /**
   * Abschluss-Assistent: fragt vor Export/Abschluss/Unterschrift genau die
   * noch fehlenden Pflichtfelder direkt ab (statt nur per Meldung auf die
   * Übersicht zu verweisen) und zeigt typische Lücken als Hinweise
   * (utils/finalizeChecks.ts). Hinweise blockieren nicht, Pflichtfelder schon.
   */
  import type { PlantStatus } from '../db/types';
  import type { RequiredFieldKey } from '../utils/reportFinalization';
  import type { FinalizeAction, FinalizeWarning, ReportTab } from '../utils/finalizeChecks';
  import Icon from './Icon.svelte';

  let {
    action,
    requiredKeys,
    warnings,
    plantStatusOptions,
    plantStatus = $bindable(),
    securityEquipmentOk = $bindable(),
    followUpVisitNeeded = $bindable(),
    onFieldChange,
    onConfirm,
    onCancel,
    onJump
  }: {
    action: FinalizeAction;
    /** Die beim Öffnen fehlenden Pflichtfelder - bleiben sichtbar, auch nachdem sie beantwortet wurden. */
    requiredKeys: RequiredFieldKey[];
    warnings: FinalizeWarning[];
    plantStatusOptions: PlantStatus[];
    plantStatus: PlantStatus | undefined;
    securityEquipmentOk: boolean | undefined;
    followUpVisitNeeded: boolean | undefined;
    onFieldChange: () => void;
    onConfirm: () => void;
    onCancel: () => void;
    onJump: (tab: ReportTab) => void;
  } = $props();

  const TITLES: Record<FinalizeAction, string> = {
    export: 'Vor dem Export',
    finalize: 'Bericht abschließen',
    sign: 'Vor der Unterschrift'
  };
  const CONFIRM_LABELS: Record<FinalizeAction, string> = {
    export: 'Exportieren',
    finalize: 'Final abschließen',
    sign: 'Weiter'
  };

  const values = $derived({ plantStatus, securityEquipmentOk, followUpVisitNeeded });
  const stillMissing = $derived(requiredKeys.filter((key) => values[key] === undefined).length);

  function setSecurity(value: boolean): void {
    securityEquipmentOk = value;
    onFieldChange();
  }

  function setFollowUp(value: boolean): void {
    followUpVisitNeeded = value;
    onFieldChange();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
  <div class="dialog">
    <h2 id="assistant-title">{TITLES[action]}</h2>

    {#if requiredKeys.length > 0}
      <section>
        <h3>Noch offen <span class="badge">Pflicht</span></h3>
        {#if requiredKeys.includes('plantStatus')}
          <label>
            Anlagenstatus
            <select bind:value={plantStatus} onchange={onFieldChange}>
              <option value={undefined}>Bitte wählen…</option>
              {#each plantStatusOptions as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if requiredKeys.includes('securityEquipmentOk')}
          <div class="question">
            <span>Sicherheitseinrichtungen i.O.?</span>
            <div class="choice">
              <button type="button" class:active={securityEquipmentOk === true} onclick={() => setSecurity(true)}>i.O.</button>
              <button type="button" class:active={securityEquipmentOk === false} onclick={() => setSecurity(false)}>n.i.O.</button>
            </div>
          </div>
        {/if}
        {#if requiredKeys.includes('followUpVisitNeeded')}
          <div class="question">
            <span>Muss ein Folgeeinsatz geplant werden?</span>
            <div class="choice">
              <button type="button" class:active={followUpVisitNeeded === true} onclick={() => setFollowUp(true)}>Ja</button>
              <button type="button" class:active={followUpVisitNeeded === false} onclick={() => setFollowUp(false)}>Nein</button>
            </div>
          </div>
        {/if}
      </section>
    {/if}

    {#if warnings.length > 0}
      <section>
        <h3>Hinweise</h3>
        <ul class="warnings">
          {#each warnings as warning (warning.key)}
            <li>
              <span class="warning-icon"><Icon name="alert-triangle" size={15} /></span>
              <span class="warning-text">{warning.text}</span>
              <button type="button" class="jump" onclick={() => onJump(warning.tab)}>Ansehen</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if requiredKeys.length === 0 && warnings.length === 0}
      <p class="all-good"><Icon name="check-circle" size={16} />Alle Angaben sind vollständig.</p>
    {/if}

    {#if action === 'finalize'}
      <p class="lock-note">Der Bericht wird ohne Kunden-Unterschrift abgeschlossen und danach gesperrt, bis die Sperre wieder aufgehoben wird.</p>
    {/if}

    <div class="actions">
      <button type="button" class="ghost" onclick={onCancel}>Abbrechen</button>
      <button type="button" class="primary" onclick={onConfirm} disabled={stillMissing > 0}>
        {CONFIRM_LABELS[action]}
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
  }

  .dialog {
    width: 100%;
    max-width: 420px;
    max-height: 100%;
    overflow-y: auto;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    box-shadow: 0 20px 48px var(--color-shadow);
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  h3 {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .badge {
    font-size: 0.68rem;
    color: var(--color-danger);
    background: var(--color-danger-bg);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
  }

  label,
  .question {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.9rem;
  }

  .choice {
    display: flex;
    gap: var(--space-2);
  }

  .choice button {
    flex: 1;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .choice button.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-contrast);
  }

  .warnings {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .warnings li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.88rem;
  }

  .warning-icon {
    color: var(--color-open);
    display: inline-flex;
    flex-shrink: 0;
  }

  .warning-text {
    flex: 1;
    min-width: 0;
  }

  .jump {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    min-height: auto;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-primary);
  }

  .all-good {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-success);
    font-weight: 600;
  }

  .lock-note {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    font-weight: 600;
  }

  .primary:disabled {
    opacity: 0.5;
  }
</style>
