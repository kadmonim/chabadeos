<script lang="ts">
  import { MessageSquare, MessageSquarePlus, X, Pencil, Trash2 } from 'lucide-svelte';

  type Note = {
    id: string;
    expense_id: number;
    author_employee_id: string | null;
    author_name: string | null;
    body: string;
    created_at: string;
    updated_at: string;
  };

  type ChargeInfo = { date: string; amount: number | string; vendor?: string };

  let { expenseId, expenseIds, initialCount = 0, currentEmployeeId, title, chargeInfo } = $props<{
    expenseId?: number;
    expenseIds?: number[];
    initialCount?: number;
    currentEmployeeId: string;
    title?: string;
    chargeInfo?: Record<number, ChargeInfo>;
  }>();

  const isGroup = $derived(Array.isArray(expenseIds) && expenseIds.length > 0);

  let count = $state<number>(initialCount);
  let open = $state(false);
  let loading = $state(false);
  let notes = $state<Note[]>([]);
  let loaded = $state(false);
  let draft = $state('');
  let submitting = $state(false);
  let editingId = $state<string | null>(null);
  let editDraft = $state('');

  async function load() {
    loading = true;
    const url = isGroup
      ? `/api/expense-notes?expense_ids=${(expenseIds as number[]).join(',')}`
      : `/api/expense-notes?expense_id=${expenseId}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      notes = json.notes ?? [];
      count = notes.length;
      loaded = true;
    }
    loading = false;
  }

  async function openPanel() {
    open = true;
    if (!loaded) await load();
  }
  function closePanel() {
    open = false;
    editingId = null;
    draft = '';
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || submitting) return;
    submitting = true;
    const res = await fetch('/api/expense-notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expense_id: expenseId, body }),
    });
    if (res.ok) {
      const json = await res.json();
      notes = [...notes, json.note];
      count = notes.length;
      draft = '';
    }
    submitting = false;
  }

  function beginEdit(n: Note) {
    editingId = n.id;
    editDraft = n.body;
  }
  function cancelEdit() {
    editingId = null;
    editDraft = '';
  }
  async function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body) return;
    const res = await fetch('/api/expense-notes', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, body }),
    });
    if (res.ok) {
      notes = notes.map((n) => (n.id === id ? { ...n, body } : n));
      editingId = null;
      editDraft = '';
    }
  }
  async function remove(id: string) {
    if (!confirm('Delete this note?')) return;
    const res = await fetch(`/api/expense-notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      notes = notes.filter((n) => n.id !== id);
      count = notes.length;
    }
  }

  function fmtWhen(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function fmtChargeLabel(eid: number): string | null {
    const info = chargeInfo?.[eid];
    if (!info) return null;
    const d = new Date(info.date);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const amt = '$' + Number(info.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${date} · ${amt}`;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closePanel();
  }
</script>

<button
  type="button"
  onclick={openPanel}
  title={count > 0 ? `${count} note${count === 1 ? '' : 's'}` : 'Add a note'}
  aria-label={count > 0 ? `View ${count} notes` : 'Add a note'}
  class="inline-flex items-center gap-1 px-1.5 h-6 rounded-full border text-xs transition {count > 0 ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100' : 'border-transparent text-stone-300 hover:text-violet-500'}"
>
  {#if count > 0}
    <MessageSquare size={12} strokeWidth={2.5} />
    <span class="tabular-nums font-medium">{count}</span>
  {:else}
    <MessageSquarePlus size={13} strokeWidth={2} />
  {/if}
</button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 grid place-items-center p-4 bg-stone-900/40"
    onclick={closePanel}
    onkeydown={onKey}
    role="presentation"
  >
    <div
      class="bg-white border border-stone-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col text-left"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Notes"
    >
      <div class="flex items-center gap-2 px-5 py-3 border-b border-stone-100">
        <MessageSquare size={16} class="text-stone-400" />
        <h3 class="text-sm font-semibold text-stone-800">
          {title ?? 'Notes'}
          <span class="text-stone-400 font-normal">· {count}</span>
        </h3>
        <button
          type="button"
          onclick={closePanel}
          aria-label="Close"
          class="ml-auto w-7 h-7 grid place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <X size={15} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-3 space-y-3">
        {#if loading && !loaded}
          <div class="text-sm text-stone-400">Loading…</div>
        {:else if notes.length === 0}
          <div class="text-sm text-stone-400">
            {isGroup ? 'No notes on any charge for this vendor yet.' : 'No notes yet. Add the first one below.'}
          </div>
        {:else}
          {#each notes as n (n.id)}
            {@const chargeLabel = isGroup ? fmtChargeLabel(n.expense_id) : null}
            <div class="border border-stone-200 rounded-xl p-3 bg-stone-50/60">
              {#if chargeLabel}
                <div class="text-[11px] font-medium text-violet-700 bg-violet-50 inline-flex items-center rounded-full px-2 py-0.5 mb-1.5">
                  {chargeLabel}
                </div>
              {/if}
              <div class="flex items-center gap-2 text-[11px] text-stone-500 mb-1.5">
                <span class="font-medium text-stone-700">{n.author_name ?? 'Unknown'}</span>
                <span>·</span>
                <span>{fmtWhen(n.created_at)}</span>
                {#if n.updated_at !== n.created_at}
                  <span class="text-stone-400">(edited)</span>
                {/if}
                {#if n.author_employee_id === currentEmployeeId && editingId !== n.id}
                  <div class="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onclick={() => beginEdit(n)}
                      aria-label="Edit"
                      class="w-6 h-6 grid place-items-center rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onclick={() => remove(n.id)}
                      aria-label="Delete"
                      class="w-6 h-6 grid place-items-center rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                {/if}
              </div>
              {#if editingId === n.id}
                <textarea
                  bind:value={editDraft}
                  rows="3"
                  class="w-full text-sm border border-stone-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
                ></textarea>
                <div class="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onclick={() => saveEdit(n.id)}
                    class="text-xs font-medium bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700"
                  >Save</button>
                  <button
                    type="button"
                    onclick={cancelEdit}
                    class="text-xs text-stone-500 hover:text-stone-800"
                  >Cancel</button>
                </div>
              {:else}
                <div class="text-sm text-stone-800 whitespace-pre-wrap">{n.body}</div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      {#if isGroup}
        <div class="border-t border-stone-100 px-5 py-3 text-[11px] text-stone-500">
          To add a new note, open a specific charge in the table below.
        </div>
      {:else}
        <form onsubmit={submit} class="border-t border-stone-100 px-5 py-3">
          <textarea
            bind:value={draft}
            rows="2"
            placeholder="Add a note about this charge…"
            class="w-full text-sm border border-stone-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
          ></textarea>
          <div class="mt-2 flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={!draft.trim() || submitting}
              class="text-xs font-medium bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >{submitting ? 'Saving…' : 'Add note'}</button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}
