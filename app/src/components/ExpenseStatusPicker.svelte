<script lang="ts">
  import { Check, CircleHelp, X, Circle, ArrowRightLeft } from 'lucide-svelte';

  type MethodOption = { name: string; label: string | null; ownerName: string | null };

  // Single-row mode: id + initial
  // Bulk mode:       ids + initial ('mixed' shows no active button)
  let {
    id,
    ids,
    initial = 'none',
    currentMethod,
    moveTargetInitial,
    methods = [],
    size = 'md',
  } = $props<{
    id?: number;
    ids?: number[];
    initial?: string;
    currentMethod?: string;
    moveTargetInitial?: string | null;
    methods?: MethodOption[];
    size?: 'sm' | 'md';
  }>();

  let status = $state<string>(initial);
  let moveTarget = $state<string | null>(moveTargetInitial ?? null);
  let pending = $state(false);
  let picking = $state(false); // true when choosing the target card

  const options = [
    { value: 'good',      Icon: Check,      label: 'תקין',     active: 'bg-emerald-500 text-white border-emerald-500', idle: 'text-stone-300 hover:text-emerald-500' },
    { value: 'to_review', Icon: CircleHelp, label: 'לבדיקה',   active: 'bg-amber-500 text-white border-amber-500',     idle: 'text-stone-300 hover:text-amber-500'   },
    { value: 'cancelled', Icon: X,          label: 'בוטל',      active: 'bg-rose-500 text-white border-rose-500',       idle: 'text-stone-300 hover:text-rose-500'    },
    { value: 'none',      Icon: Circle,     label: 'ללא',       active: 'bg-stone-200 text-stone-600 border-stone-300', idle: 'text-stone-300 hover:text-stone-500'   },
  ] as const;

  const btnSize = $derived(size === 'sm' ? 'w-5 h-5' : 'w-6 h-6');
  const iconSize = $derived(size === 'sm' ? 11 : 13);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch('/api/expenses', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  function broadcast(next: string, prev: string, moveTargetValue: string | null) {
    window.dispatchEvent(new CustomEvent('expense-status-changed', {
      detail: { id, ids, status: next, prevStatus: prev, moveTarget: moveTargetValue },
    }));
  }

  function buildBody(patchFields: Record<string, unknown>): Record<string, unknown> {
    return Array.isArray(ids) && ids.length > 0
      ? { ids, ...patchFields }
      : { id, ...patchFields };
  }

  async function setStatus(next: string) {
    if (pending) return;
    if (next === 'to_move') {
      picking = true;
      return;
    }
    if (status === next) return;
    pending = true;
    const prev = status;
    const prevTarget = moveTarget;
    status = next;
    moveTarget = null;
    const ok = await patch(buildBody({ status: next }));
    if (!ok) {
      status = prev;
      moveTarget = prevTarget;
    } else {
      broadcast(next, prev, null);
    }
    pending = false;
  }

  async function confirmMoveTarget(target: string) {
    if (!target) return;
    pending = true;
    const prev = status;
    const prevTarget = moveTarget;
    status = 'to_move';
    moveTarget = target;
    const ok = await patch(buildBody({ status: 'to_move', move_to_method: target }));
    if (!ok) {
      status = prev;
      moveTarget = prevTarget;
    } else {
      broadcast('to_move', prev, target);
    }
    pending = false;
    picking = false;
  }

  const targetLabel = $derived.by(() => {
    if (!moveTarget) return '';
    const m = methods.find((x) => x.name === moveTarget);
    if (!m) return moveTarget;
    return m.label || m.name;
  });
</script>

{#if picking}
  <div class="inline-flex items-center gap-1 bg-white border border-sky-300 rounded-full ps-2 pe-1 py-0.5 shadow-sm">
    <span class="text-[10px] text-sky-700 font-medium">העברה אל</span>
    <select
      onchange={(e) => {
        const v = (e.currentTarget as HTMLSelectElement).value;
        if (v) confirmMoveTarget(v);
      }}
      disabled={pending}
      class="text-xs bg-transparent border-0 pe-1 focus:outline-none"
    >
      <option value="">—</option>
      {#each methods as m}
        {#if m.name !== currentMethod}
          <option value={m.name}>{m.label || m.name}{m.ownerName ? ' · ' + m.ownerName : ''}</option>
        {/if}
      {/each}
    </select>
    <button
      type="button"
      onclick={() => (picking = false)}
      aria-label="ביטול"
      class="w-4 h-4 grid place-items-center text-stone-400 hover:text-stone-700"
    >
      <X size={11} />
    </button>
  </div>
{:else}
  <div class="inline-flex items-center gap-0.5" role="group">
    {#each options as opt}
      {@const isActive = status === opt.value}
      <button
        type="button"
        onclick={() => setStatus(opt.value)}
        disabled={pending}
        title={opt.label}
        aria-label={opt.label}
        class="{btnSize} rounded-full grid place-items-center border transition disabled:opacity-60 {isActive ? opt.active : 'border-transparent ' + opt.idle}"
      >
        <opt.Icon size={iconSize} strokeWidth={isActive ? 3 : 2.5} />
      </button>
    {/each}
    {#if methods.length > 0}
      {@const isActive = status === 'to_move'}
      <button
        type="button"
        onclick={() => setStatus('to_move')}
        disabled={pending}
        title={isActive && targetLabel ? `העברה אל ${targetLabel}` : 'סימון: העברה לכרטיס אחר'}
        aria-label="סימון להעברה לכרטיס אחר"
        class="{btnSize} rounded-full grid place-items-center border transition disabled:opacity-60 {isActive ? 'bg-sky-500 text-white border-sky-500' : 'border-transparent text-stone-300 hover:text-sky-500'}"
      >
        <ArrowRightLeft size={iconSize} strokeWidth={isActive ? 3 : 2.5} />
      </button>
    {/if}
    {#if status === 'to_move' && targetLabel}
      <span class="ms-1 text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
        ← {targetLabel}
      </span>
    {/if}
  </div>
{/if}
