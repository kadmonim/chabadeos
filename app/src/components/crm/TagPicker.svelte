<script lang="ts">
  // Tag editor for a contact's "פרטים" card: shows current tags as pills,
  // a popover with checkboxes for every tag to edit the set. Saves via PATCH
  // /api/crm/tags and reloads so the rest of the page (filters, etc.) stays
  // in sync. Server-only modules must never be imported here.
  import { Tags, Check } from 'lucide-svelte';
  import { TAG_STYLES, type Tag } from '~/lib/crm/types';

  let { contactId, tags, selected } = $props<{
    contactId: string;
    tags: Tag[];
    selected: string[];
  }>();

  let chosen = $state<Set<string>>(new Set(selected));
  let open = $state(false);
  let saving = $state(false);
  let box: HTMLDivElement;

  function toggle(id: string) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    chosen = next;
  }

  async function save() {
    saving = true;
    try {
      const res = await fetch('/api/crm/tags', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, tag_ids: Array.from(chosen) }),
      });
      if (res.ok) {
        location.reload();
      } else {
        saving = false;
      }
    } catch {
      saving = false;
    }
  }

  function onWindowClick(e: MouseEvent) {
    if (open && box && !box.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="relative" bind:this={box}>
  <div class="flex flex-wrap items-center gap-1.5">
    {#each tags.filter((t) => chosen.has(t.id)) as t (t.id)}
      <span class={`pill ${TAG_STYLES[t.color]}`}>{t.name}</span>
    {/each}
    <button type="button" class="btn-icon !w-7 !h-7" onclick={() => (open = !open)} title="עריכת תגיות">
      <Tags size={14} />
    </button>
  </div>

  {#if open}
    <div class="menu absolute top-full mt-1 start-0 z-30 min-w-[12rem] max-h-64 overflow-y-auto">
      {#if tags.length === 0}
        <div class="px-3 py-2 text-xs text-stone-400">אין תגיות מוגדרות</div>
      {/if}
      {#each tags as t (t.id)}
        <button type="button" class="menu-item justify-between" onclick={() => toggle(t.id)}>
          <span class={`pill ${TAG_STYLES[t.color]}`}>{t.name}</span>
          {#if chosen.has(t.id)}
            <Check size={14} class="text-accent" />
          {/if}
        </button>
      {/each}
      <div class="border-t border-stone-100 mt-1 pt-1 px-1">
        <button type="button" class="btn btn-primary btn-sm w-full" disabled={saving} onclick={save}>
          {saving ? 'שומר…' : 'שמירה'}
        </button>
      </div>
    </div>
  {/if}
</div>
