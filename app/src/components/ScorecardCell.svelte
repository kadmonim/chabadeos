<script lang="ts">
  let {
    measurableId,
    date,
    initial,
    initialNote = null,
    frequency,
    valueType = 'number',
    goal = null,
    threshold = 'minimum',
  } = $props<{
    measurableId: string;
    date: string;
    initial: number | null;
    initialNote?: string | null;
    frequency: 'weekly' | 'monthly';
    valueType?: string;
    goal?: number | null;
    threshold?: string;
  }>();

  let value = $state<number | null>(initial);
  let note = $state<string | null>(initialNote);
  let editing = $state(false);
  let draftValue = $state('');
  let draftNote = $state('');
  let pending = $state(false);
  let inputEl: HTMLInputElement | null = $state(null);
  let popoverEl: HTMLDivElement | null = $state(null);

  const displayed = $derived.by(() => {
    if (value == null) return '–';
    if (valueType === 'currency') return '$' + Math.round(value).toLocaleString();
    return Math.round(value * 100) / 100 + '';
  });

  const color = $derived.by(() => {
    if (value == null || goal == null) return '';
    const ok = threshold === 'minimum' ? value >= goal : value <= goal;
    return ok ? 'text-emerald-600' : 'text-rose-600';
  });

  const bgColor = $derived.by(() => {
    if (value == null || goal == null) return '';
    const ok = threshold === 'minimum' ? value >= goal : value <= goal;
    return ok ? 'bg-emerald-50' : 'bg-rose-50';
  });

  function startEdit() {
    draftValue = value == null ? '' : String(value);
    draftNote = note ?? '';
    editing = true;
    queueMicrotask(() => inputEl?.focus());
  }

  async function save() {
    if (!editing) return;
    const raw = draftValue.trim();
    const nextValue = raw === '' ? null : Number(raw.replace(/[$,]/g, ''));
    if (nextValue !== null && Number.isNaN(nextValue)) { editing = false; return; }
    const nextNote = draftNote.trim() || null;
    pending = true;
    const res = await fetch('/api/scorecard', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ measurable_id: measurableId, date, value: nextValue, note: nextNote, frequency }),
    });
    if (res.ok) {
      value = nextValue;
      note = nextNote;
    }
    pending = false;
    editing = false;
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      editing = false;
    }
  }

  function onPopoverBlur(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (popoverEl && next && popoverEl.contains(next)) return;
    save();
  }
</script>

<div class="relative {bgColor} rounded">
  <button
    type="button"
    onclick={startEdit}
    title={note ?? undefined}
    class="block w-full text-center text-sm font-medium leading-5 px-1 py-1 border border-transparent rounded cursor-text hover:border-stone-300 {color}"
  >
    {displayed}
  </button>
  {#if note}
    <span
      class="absolute top-0.5 end-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 pointer-events-none"
      aria-label="קיימת הערה"
    ></span>
  {/if}

  {#if editing}
    <div
      bind:this={popoverEl}
      onfocusout={onPopoverBlur}
      class="absolute z-20 left-1/2 top-full mt-1 -translate-x-1/2 w-56 bg-white border border-stone-200 rounded-lg shadow-lg p-2 space-y-2"
    >
      <input
        bind:this={inputEl}
        type="text"
        bind:value={draftValue}
        onkeydown={handleKey}
        disabled={pending}
        placeholder="ערך"
        class="w-full text-sm font-medium leading-5 px-2 py-1.5 bg-white border border-stone-300 rounded focus:outline-none focus:border-violet-400"
      />
      <textarea
        bind:value={draftNote}
        onkeydown={handleKey}
        disabled={pending}
        placeholder="הערה (לא חובה)"
        rows="2"
        class="w-full text-xs leading-snug px-2 py-1.5 bg-white border border-stone-200 rounded focus:outline-none focus:border-violet-400 resize-none"
      ></textarea>
      <div class="flex items-center justify-between text-[10px] text-stone-400">
        <span>Enter לשמירה · Esc לביטול</span>
      </div>
    </div>
  {/if}
</div>
