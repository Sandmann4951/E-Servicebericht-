<script lang="ts">
  import { router, parseRoute } from './lib/router.svelte';
  import { requestPersistentStorage } from './lib/db/client';
  import ReportList from './routes/ReportList.svelte';
  import ReportDetail from './routes/ReportDetail.svelte';
  import Leerlaufzeiten from './routes/Leerlaufzeiten.svelte';
  import InstallHintBanner from './lib/components/InstallHintBanner.svelte';
  import UpdateAvailableToast from './lib/components/UpdateAvailableToast.svelte';

  // Best-effort: verhindert, dass iOS die IndexedDB-Fotos unter
  // Speicherdruck automatisch räumt.
  requestPersistentStorage();

  const route = $derived(parseRoute(router.path));
</script>

<InstallHintBanner />

<main>
  {#if route.name === 'detail'}
    {#key route.id}
      <ReportDetail id={route.id} />
    {/key}
  {:else if route.name === 'leerlaufzeiten'}
    <Leerlaufzeiten />
  {:else}
    <ReportList />
  {/if}
</main>

<UpdateAvailableToast />

<style>
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
