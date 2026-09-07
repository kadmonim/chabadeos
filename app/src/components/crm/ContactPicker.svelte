<script lang="ts">
  // Contact quick-picker for forms: a hidden input carries the chosen id,
  // a debounced search dropdown lets the user find them. Server-only modules
  // must never be imported here; only pure types/constants from '~/lib/crm/types'.
  import { Search, X } from 'lucide-svelte';
  import { STAGE_LABELS, STAGE_STYLES, type ContactSummary } from '~/lib/crm/types';

  let {
    name,
    placeholder = 'חיפוש איש קשר…',
    exclude = '',
    initialId = '',
    initialLabel = '',
  } = $props<{ name: string; placeholder?: string; exclude?: string; initialId?: string; initialLabel?: string }>();

  let value = $state(initialId);
  let chosenLabel = $state(initialLabel);
  let q = $state('');
  let results = $state<ContactSummary[]>([]);
  let open = $state(false);
  let loading = $state(false);
  let box: HTMLDivElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reqId = 0;

  function scheduleSearch(v: string) {
    clearTimeout(timer);
    if (!v.trim()) { results = []; open = false; return; }
    timer = setTimeout(() => runSearch(v), 150);
  }

  async function runSearch(v: string) {
    const id = ++reqId;
    loading = true;
    try {
      const res = await fetch(`/api/crm/search?q=${encodeURIComponent(v)}`);
      if (id !== reqId) return;
      let data: ContactSummary[] = res.ok ? await res.json() : [];
      if (exclude) data = data.filter((r) => r.id !== exclude);
      results = data;
      open = true;
    } catch {
      if (id === reqId) results = [];
    } finally {
      if (id === reqId) loading = false;
    }
  }

  function onInput(e: Event) {
    q = (e.target as HTMLInputElement).value;
    scheduleSearch(q);
  }

  function choose(r: ContactSummary) {
    value = r.id;
    chosenLabel = `${r.first_name} ${r.last_name}`;
    q = '';
    results = [];
    open = false;
  }

  function clear() {
    value = '';
    chosenLabel = '';
  }

  function onWindowClick(e: MouseEvent) {
    if (box && !box.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="relative w-full" bind:this={box}>
  <input type="hidden" {name} value={value} />
  {#if value && chosenLabel}
    <div class="flex items-center gap-2 border border-stone-300 rounded-lg px-3 py-2 bg-stone-50">
      <span class="flex-1 min-w-0 truncate text-sm text-stone-900">{chosenLabel}</span>
      <button type="button" class="btn-icon !w-6 !h-6" onclick={clear} title="ניקוי">
        <X size={14} />
      </button>
    </div>
  {:else}
    <div class="relative">
      <Search size={15} class="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
      <input
        type="search"
        class="input ps-8"
        {placeholder}
        value={q}
        oninput={onInput}
        onfocus={() => { if (results.length) open = true; }}
        aria-label={placeholder}
      />
    </div>
    {#if open && (results.length > 0 || loading)}
      <div class="menu absolute top-full mt-1 start-0 w-full z-30 max-h-72 overflow-y-auto">
        {#if loading && results.length === 0}
          <div class="px-3 py-2 text-xs text-stone-400">מחפש…</div>
        {/if}
        {#each results as r (r.id)}
          <button type="button" class="menu-item" onclick={() => choose(r)}>
            <span class="flex-1 min-w-0 text-start">
              <span class="block truncate font-medium text-stone-900">{r.first_name} {r.last_name}</span>
              <span class="block truncate text-xs text-stone-500">{r.phone_display ?? ''}</span>
            </span>
            <span class={`pill shrink-0 ${STAGE_STYLES[r.stage]}`}>{STAGE_LABELS[r.stage]}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>
