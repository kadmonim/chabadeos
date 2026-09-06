<script lang="ts">
  let {
    id,
    status,
    endpoint,
    doneValue = 'done',
    openValue = 'open',
  } = $props<{
    id: string;
    status: string;
    endpoint: string;
    doneValue?: string;
    openValue?: string;
  }>();

  let override = $state<string | null>(null);
  let pending = $state(false);
  const current = $derived(override ?? status);

  async function toggle() {
    pending = true;
    const next = current === doneValue ? openValue : doneValue;
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: next }),
    });
    if (res.ok) override = next;
    pending = false;
  }
</script>

<button
  onclick={toggle}
  disabled={pending}
  class="w-5 h-5 rounded border-2 grid place-items-center transition shrink-0"
  class:border-stone-300={current !== doneValue}
  class:hover:border-stone-400={current !== doneValue}
  class:bg-emerald-500={current === doneValue}
  class:border-emerald-500={current === doneValue}
  aria-label={current === doneValue ? 'סימון כפתוח' : 'סימון כבוצע'}
>
  {#if current === doneValue}
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
      <path d="M5 12l5 5L20 7" />
    </svg>
  {/if}
</button>
