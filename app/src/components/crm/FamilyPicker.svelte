<script lang="ts">
  // Family (household) picker: a hidden input carries the chosen id, search
  // hits /api/crm/households?q=. Server-only modules must never be imported here.
  import { Search, X } from 'lucide-svelte';
  import type { HouseholdSummary } from '~/lib/crm/types';

  let {
    name,
    placeholder = 'חיפוש משפחה…',
    initialId = '',
    initialLabel = '',
  } = $props<{ name: string; placeholder?: string; initialId?: string; initialLabel?: string }>();

  let value = $state(initialId);
  let chosenLabel = $state(initialLabel);
  let hiddenInput: HTMLInputElement;

  // A plain server-rendered <select> next to this island can't react to
  // Svelte state directly; broadcast a DOM event on the hidden input whenever
  // the chosen family changes so ContactForm's inline script can toggle the
  // household_role field.
  $effect(() => {
    value;
    hiddenInput?.dispatchEvent(new CustomEvent('family-picker-change', { bubbles: true, detail: { value } }));
  });
  let q = $state('');
  let results = $state<HouseholdSummary[]>([]);
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
      const res = await fetch(`/api/crm/households?q=${encodeURIComponent(v)}`);
      if (id !== reqId) return;
      const data: HouseholdSummary[] = res.ok ? await res.json() : [];
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

  function choose(r: HouseholdSummary) {
    value = r.id;
    chosenLabel = r.name;
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

  // Exported so a parent's inline script can detect whether a family is chosen.
  export function hasValue() {
    return !!value;
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="relative w-full" bind:this={box}>
  <input type="hidden" {name} value={value} data-family-picker-input bind:this={hiddenInput} />
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
              <span class="block truncate font-medium text-stone-900">{r.name}</span>
              <span class="block truncate text-xs text-stone-500">{r.city ?? ''} · {r.member_count} נפשות</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>
