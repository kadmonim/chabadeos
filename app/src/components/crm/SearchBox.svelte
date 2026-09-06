<script lang="ts">
  // Contact quick-search. Server-only modules (db, contacts.ts) must never be
  // imported here; only pure types/constants from '~/lib/crm/types' are safe.
  import { Search } from 'lucide-svelte';
  import { STAGE_LABELS, STAGE_STYLES, type ContactSummary } from '~/lib/crm/types';

  let { placeholder = 'חיפוש איש קשר…' } = $props<{ placeholder?: string }>();

  let q = $state('');
  let results = $state<ContactSummary[]>([]);
  let open = $state(false);
  let activeIndex = $state(-1);
  let loading = $state(false);
  let box: HTMLDivElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reqId = 0;

  function scheduleSearch(value: string) {
    clearTimeout(timer);
    if (!value.trim()) {
      results = [];
      open = false;
      activeIndex = -1;
      return;
    }
    timer = setTimeout(() => runSearch(value), 150);
  }

  async function runSearch(value: string) {
    const id = ++reqId;
    loading = true;
    try {
      const res = await fetch(`/api/crm/search?q=${encodeURIComponent(value)}`);
      if (id !== reqId) return;
      const data = res.ok ? await res.json() : [];
      results = data;
      open = true;
      activeIndex = -1;
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

  function goto(id: string) {
    location.href = `/crm/contacts/${id}`;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open && results.length) open = true;
      activeIndex = Math.min(activeIndex + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && results[activeIndex]) {
        goto(results[activeIndex].id);
      } else if (q.trim()) {
        location.href = `/crm?q=${encodeURIComponent(q.trim())}`;
      }
    } else if (e.key === 'Escape') {
      open = false;
    }
  }

  function onWindowClick(e: MouseEvent) {
    if (box && !box.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="relative w-full max-w-xs" bind:this={box}>
  <div class="relative">
    <Search size={15} class="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
    <input
      type="search"
      class="input ps-8"
      {placeholder}
      value={q}
      oninput={onInput}
      onkeydown={onKeydown}
      onfocus={() => { if (results.length) open = true; }}
      aria-label="חיפוש אנשי קשר"
    />
  </div>

  {#if open && (results.length > 0 || loading)}
    <div class="menu absolute top-full mt-1 start-0 w-full z-30 max-h-80 overflow-y-auto">
      {#if loading && results.length === 0}
        <div class="px-3 py-2 text-xs text-stone-400">מחפש…</div>
      {/if}
      {#each results as r, i (r.id)}
        <button
          type="button"
          class={`menu-item ${i === activeIndex ? 'bg-stone-50' : ''}`}
          onmouseenter={() => (activeIndex = i)}
          onclick={() => goto(r.id)}
        >
          <span class="flex-1 min-w-0 text-start">
            <span class="block truncate font-medium text-stone-900">{r.first_name} {r.last_name}</span>
            <span class="block truncate text-xs text-stone-500">{r.phone_display ?? ''}</span>
          </span>
          <span class={`pill shrink-0 ${STAGE_STYLES[r.stage]}`}>{STAGE_LABELS[r.stage]}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
