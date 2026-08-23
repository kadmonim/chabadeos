<script lang="ts">
  import { Plus, X, GripVertical, Heart, Target, Flag, Megaphone, Calendar, TrendingUp, CheckSquare } from 'lucide-svelte';

  type Section = 'vision' | 'traction' | 'swot';

  let {
    initialVision = {},
    initialTraction = {},
    initialSwot = {},
    readOnly = false,
  } = $props<{
    initialVision?: any;
    initialTraction?: any;
    initialSwot?: any;
    readOnly?: boolean;
  }>();

  let tab = $state<'vision' | 'traction'>('vision');

  // Deep clones so Svelte tracks edits.
  // JSON round-trip avoids structuredClone's DataCloneError on Svelte proxies.
  const clone = (v: any) => (v ? JSON.parse(JSON.stringify(v)) : {});
  let vision = $state(clone(initialVision));
  let traction = $state(clone(initialTraction));
  let swot = $state(clone(initialSwot));

  // Ensure default shape.
  vision.core_values ??= [];
  vision.core_focus ??= { purpose: '', niche: '' };
  vision.ten_year_target ??= [];
  vision.marketing ??= { target_market: '', uniques: [], proven_process: '', system_promise: '' };
  vision.marketing.uniques ??= [];
  vision.three_year ??= { future_date: '', revenue: { budget: '', profit: '' }, measurables: [], looks_like: [] };
  vision.three_year.revenue ??= { budget: '', profit: '' };
  vision.three_year.measurables ??= [];
  vision.three_year.looks_like ??= [];

  traction.one_year ??= { future_date: '', revenue: { budget: '', profit: '' }, measurables: [], goals: [] };
  traction.one_year.revenue ??= { budget: '', profit: '' };
  traction.one_year.measurables ??= [];
  traction.one_year.goals ??= [];
  traction.ninety_day ??= { future_date: '', revenue: { budget: '', profit: '' }, measurables: [] };
  traction.ninety_day.revenue ??= { budget: '', profit: '' };
  traction.ninety_day.measurables ??= [];

  swot.strengths ??= [];
  swot.weaknesses ??= [];
  swot.opportunities ??= [];
  swot.threats ??= [];

  type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  let saveState = $state<SaveState>('idle');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let savedTimer: ReturnType<typeof setTimeout> | null = null;
  let dirtySections = new Set<Section>();

  function scheduleSave(section: Section) {
    if (readOnly) return;
    dirtySections.add(section);
    saveState = 'dirty';
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, 800);
  }

  async function flush() {
    if (dirtySections.size === 0) return;
    const toSave = Array.from(dirtySections);
    dirtySections.clear();
    saveState = 'saving';
    try {
      for (const s of toSave) {
        const data = s === 'vision' ? vision : s === 'traction' ? traction : swot;
        const res = await fetch('/api/vto', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ section: s, data }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      saveState = 'saved';
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        if (saveState === 'saved') saveState = 'idle';
      }, 1500);
    } catch {
      saveState = 'error';
    }
  }

  // Format a raw budget/profit value as USD.
  // Accepts numbers, numeric strings ("2500000"), and shorthand strings ("2.5 mil" → display as-is).
  function fmtMoney(raw: unknown): string {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'number') return '$' + Math.round(raw).toLocaleString('en-US');
    const s = String(raw).trim();
    // Accept strings like "2500000" or "$2,500,000" or "2,500,000"
    const cleaned = s.replace(/[$,\s]/g, '');
    const n = Number(cleaned);
    if (!Number.isNaN(n) && cleaned !== '') return '$' + Math.round(n).toLocaleString('en-US');
    // Fallback — probably shorthand like "2.5 mil"; prefix with $ if not already.
    return s.startsWith('$') ? s : '$' + s;
  }

  // --- list helpers
  function addString(arr: string[], section: Section) {
    arr.push('');
    scheduleSave(section);
  }
  function addPair(arr: { name: string; description: string }[], section: Section) {
    arr.push({ name: '', description: '' });
    scheduleSave(section);
  }
  function removeAt(arr: any[], i: number, section: Section) {
    arr.splice(i, 1);
    scheduleSave(section);
  }

  const statusLabel = $derived.by(() => {
    switch (saveState) {
      case 'dirty':  return 'לא נשמר…';
      case 'saving': return 'שומר…';
      case 'saved':  return 'נשמר';
      case 'error':  return 'שגיאה בשמירה';
      default:       return '';
    }
  });
  const statusColor = $derived.by(() => {
    switch (saveState) {
      case 'dirty':  return 'text-amber-600';
      case 'saving': return 'text-stone-400';
      case 'saved':  return 'text-emerald-600';
      case 'error':  return 'text-rose-600';
      default:       return 'text-transparent';
    }
  });
</script>

<div data-readonly={readOnly ? 'true' : 'false'}>
<!-- ================== TABS ================== -->
<div class="flex items-center justify-between mb-6 border-b border-stone-200">
  <div class="flex gap-1">
    <button
      type="button"
      onclick={() => (tab = 'vision')}
      class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition {tab === 'vision' ? 'border-violet-600 text-violet-700' : 'border-transparent text-stone-500 hover:text-stone-800'}"
    >
      חזון
    </button>
    <button
      type="button"
      onclick={() => (tab = 'traction')}
      class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition {tab === 'traction' ? 'border-violet-600 text-violet-700' : 'border-transparent text-stone-500 hover:text-stone-800'}"
    >
      ביצוע
    </button>
  </div>
  <div class="text-xs tabular-nums {statusColor} transition-colors">{statusLabel}</div>
</div>

<!-- ================== VISION ================== -->
{#if tab === 'vision'}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- Core Values -->
    <section class="bg-white border border-stone-200 rounded-2xl p-5">
      <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 mb-4">
        <Heart size={16} class="text-rose-500" /> ערכי יסוד
      </h2>
      <div class="space-y-3">
        {#each vision.core_values as cv, i (i)}
          <div class="group relative border-s-4 border-rose-200 ps-3">
            <input
              type="text"
              bind:value={cv.name}
              oninput={() => scheduleSave('vision')}
              placeholder="שם הערך..."
              class="w-full font-semibold text-stone-900 bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
            />
            <textarea
              bind:value={cv.description}
              oninput={() => scheduleSave('vision')}
              placeholder="תיאור..."
              rows="2"
              class="w-full text-sm text-stone-600 bg-transparent border-0 p-0 resize-none focus:outline-none focus:ring-0 mt-0.5"
            ></textarea>
            <button
              type="button"
              onclick={() => removeAt(vision.core_values, i, 'vision')}
              class="absolute top-0 end-0 opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-rose-600"
              title="הסרה"
            >
              <X size={14} />
            </button>
          </div>
        {/each}
      </div>
      <button
        type="button"
        onclick={() => addPair(vision.core_values, 'vision')}
        class="mt-4 text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
      >
        <Plus size={13} /> הוספת ערך
      </button>
    </section>

    <!-- 3 Year Goal -->
    <section class="bg-white border border-stone-200 rounded-2xl p-5">
      <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 mb-4">
        <TrendingUp size={16} class="text-violet-500" /> מטרת 3 שנים
      </h2>
      <div class="space-y-3">
        <div class="grid grid-cols-[100px_1fr] items-center gap-3">
          <label class="text-xs font-medium text-stone-500 uppercase">תאריך עתידי</label>
          <input
            type="date"
            bind:value={vision.three_year.future_date}
            oninput={() => scheduleSave('vision')}
            class="text-sm bg-transparent border-b border-stone-200 focus:border-violet-400 focus:outline-none py-1"
          />
        </div>
        <div class="grid grid-cols-[100px_1fr] items-center gap-3">
          <label class="text-xs font-medium text-stone-500 uppercase">תקציב</label>
          {#if readOnly}
            <div class="text-sm font-medium text-stone-800 py-1">{fmtMoney(vision.three_year.revenue.budget)}</div>
          {:else}
            <input
              type="text"
              bind:value={vision.three_year.revenue.budget}
              oninput={() => scheduleSave('vision')}
              placeholder="$"
              class="text-sm bg-transparent border-b border-stone-200 focus:border-violet-400 focus:outline-none py-1"
            />
          {/if}
        </div>
        <div class="grid grid-cols-[100px_1fr] items-center gap-3">
          <label class="text-xs font-medium text-stone-500 uppercase">רווח</label>
          {#if readOnly}
            <div class="text-sm font-medium text-stone-800 py-1">{fmtMoney(vision.three_year.revenue.profit)}</div>
          {:else}
            <input
              type="text"
              bind:value={vision.three_year.revenue.profit}
              oninput={() => scheduleSave('vision')}
              class="text-sm bg-transparent border-b border-stone-200 focus:border-violet-400 focus:outline-none py-1"
            />
          {/if}
        </div>
      </div>
      <h3 class="text-xs font-semibold text-stone-500 uppercase mt-5 mb-2">מדדים</h3>
      <div class="space-y-1">
        {#each vision.three_year.measurables as m, i (i)}
          <div class="group grid grid-cols-[1fr_100px_auto] items-center gap-2">
            <input
              type="text"
              bind:value={m.name}
              oninput={() => scheduleSave('vision')}
              placeholder="שם"
              class="text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
            />
            <input
              type="text"
              bind:value={m.value}
              oninput={() => scheduleSave('vision')}
              placeholder="ערך"
              class="text-sm text-end font-medium bg-transparent border-b border-stone-200 focus:border-violet-400 focus:outline-none py-1"
            />
            <button
              type="button"
              onclick={() => removeAt(vision.three_year.measurables, i, 'vision')}
              class="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-rose-600"
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
      <button
        type="button"
        onclick={() => vision.three_year.measurables.push({ name: '', value: '' }) && scheduleSave('vision')}
        class="mt-2 text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
      >
        <Plus size={13} /> הוספת מדד
      </button>

      <h3 class="text-xs font-semibold text-stone-500 uppercase mt-5 mb-2">איך זה נראה?</h3>
      <div class="space-y-1">
        {#each vision.three_year.looks_like as _, i (i)}
          <div class="group flex items-start gap-2">
            <CheckSquare size={14} class="mt-1 text-stone-300 shrink-0" />
            <input
              type="text"
              bind:value={vision.three_year.looks_like[i]}
              oninput={() => scheduleSave('vision')}
              class="flex-1 text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onclick={() => removeAt(vision.three_year.looks_like, i, 'vision')}
              class="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-rose-600"
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
      <button
        type="button"
        onclick={() => addString(vision.three_year.looks_like, 'vision')}
        class="mt-2 text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
      >
        <Plus size={13} /> הוספת פריט
      </button>
    </section>

    <!-- Core Focus -->
    <section class="bg-white border border-stone-200 rounded-2xl p-5">
      <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 mb-4">
        <Target size={16} class="text-violet-500" /> מיקוד
      </h2>
      <div class="space-y-4">
        <div>
          <label class="text-xs font-semibold text-stone-500 uppercase">מטרה</label>
          <textarea
            bind:value={vision.core_focus.purpose}
            oninput={() => scheduleSave('vision')}
            rows="3"
            class="mt-1 w-full text-sm text-stone-800 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
          ></textarea>
        </div>
        <div>
          <label class="text-xs font-semibold text-stone-500 uppercase">נישה</label>
          <textarea
            bind:value={vision.core_focus.niche}
            oninput={() => scheduleSave('vision')}
            rows="2"
            class="mt-1 w-full text-sm text-stone-800 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
          ></textarea>
        </div>
      </div>
    </section>

    <!-- 10 Year Target -->
    <section class="bg-white border border-stone-200 rounded-2xl p-5">
      <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 mb-4">
        <Flag size={16} class="text-amber-500" /> מטרת 10 שנים
      </h2>
      <div class="space-y-1">
        {#each vision.ten_year_target as _, i (i)}
          <div class="group flex items-start gap-2">
            <span class="text-stone-300 mt-1">•</span>
            <input
              type="text"
              bind:value={vision.ten_year_target[i]}
              oninput={() => scheduleSave('vision')}
              class="flex-1 text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onclick={() => removeAt(vision.ten_year_target, i, 'vision')}
              class="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-rose-600"
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
      <button
        type="button"
        onclick={() => addString(vision.ten_year_target, 'vision')}
        class="mt-3 text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
      >
        <Plus size={13} /> הוספת מטרה
      </button>
    </section>

    <!-- Marketing Strategy (spans both columns) -->
    <section class="bg-white border border-stone-200 rounded-2xl p-5 lg:col-span-2">
      <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 mb-4">
        <Megaphone size={16} class="text-sky-500" /> אסטרטגיית שיווק
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label class="text-xs font-semibold text-stone-500 uppercase">שוק מטרה</label>
          <textarea
            bind:value={vision.marketing.target_market}
            oninput={() => scheduleSave('vision')}
            rows="2"
            class="mt-1 w-full text-sm text-stone-800 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
          ></textarea>
        </div>
        <div>
          <label class="text-xs font-semibold text-stone-500 uppercase">תהליך מוכח</label>
          <textarea
            bind:value={vision.marketing.proven_process}
            oninput={() => scheduleSave('vision')}
            rows="2"
            class="mt-1 w-full text-sm text-stone-800 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
          ></textarea>
        </div>
        <div class="md:col-span-2">
          <label class="text-xs font-semibold text-stone-500 uppercase">שלושה יתרונות ייחודיים</label>
          <div class="space-y-2 mt-1">
            {#each vision.marketing.uniques as u, i (i)}
              <div class="group border-s-4 border-sky-200 ps-3">
                <input
                  type="text"
                  bind:value={u.name}
                  oninput={() => scheduleSave('vision')}
                  placeholder="שם היתרון..."
                  class="w-full font-semibold text-stone-900 bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
                />
                <input
                  type="text"
                  bind:value={u.description}
                  oninput={() => scheduleSave('vision')}
                  placeholder="תיאור..."
                  class="w-full text-sm text-stone-600 bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
                />
                <button
                  type="button"
                  onclick={() => removeAt(vision.marketing.uniques, i, 'vision')}
                  class="opacity-0 group-hover:opacity-100 absolute ms-2 p-0.5 text-stone-400 hover:text-rose-600"
                >
                  <X size={12} />
                </button>
              </div>
            {/each}
          </div>
          <button
            type="button"
            onclick={() => addPair(vision.marketing.uniques, 'vision')}
            class="mt-2 text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
          >
            <Plus size={13} /> הוספת יתרון
          </button>
        </div>
        <div class="md:col-span-2">
          <label class="text-xs font-semibold text-stone-500 uppercase">הבטחת המערכת</label>
          <textarea
            bind:value={vision.marketing.system_promise}
            oninput={() => scheduleSave('vision')}
            rows="2"
            class="mt-1 w-full text-sm text-stone-800 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
          ></textarea>
        </div>
      </div>
    </section>
  </div>
{/if}

<!-- ================== TRACTION ================== -->
{#if tab === 'traction'}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- 1 Year Plan -->
    <section class="bg-white border border-stone-200 rounded-2xl p-5">
      <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 mb-4">
        <Calendar size={16} class="text-emerald-500" /> תוכנית שנתית
      </h2>
      <div class="grid grid-cols-[100px_1fr] items-center gap-3">
        <label class="text-xs font-medium text-stone-500 uppercase">תאריך עתידי</label>
        <input type="date" bind:value={traction.one_year.future_date} oninput={() => scheduleSave('traction')}
          class="text-sm bg-transparent border-b border-stone-200 focus:border-emerald-400 focus:outline-none py-1" />
        <label class="text-xs font-medium text-stone-500 uppercase">תקציב</label>
        {#if readOnly}
          <div class="text-sm font-medium text-stone-800 py-1">{fmtMoney(traction.one_year.revenue.budget)}</div>
        {:else}
          <input type="text" bind:value={traction.one_year.revenue.budget} oninput={() => scheduleSave('traction')}
            class="text-sm bg-transparent border-b border-stone-200 focus:border-emerald-400 focus:outline-none py-1" />
        {/if}
        <label class="text-xs font-medium text-stone-500 uppercase">רווח</label>
        {#if readOnly}
          <div class="text-sm font-medium text-stone-800 py-1">{fmtMoney(traction.one_year.revenue.profit)}</div>
        {:else}
          <input type="text" bind:value={traction.one_year.revenue.profit} oninput={() => scheduleSave('traction')}
            class="text-sm bg-transparent border-b border-stone-200 focus:border-emerald-400 focus:outline-none py-1" />
        {/if}
      </div>
      <h3 class="text-xs font-semibold text-stone-500 uppercase mt-5 mb-2">מדדים</h3>
      <div class="space-y-1">
        {#each traction.one_year.measurables as m, i (i)}
          <div class="group grid grid-cols-[1fr_100px_auto] items-center gap-2">
            <input type="text" bind:value={m.name} oninput={() => scheduleSave('traction')} placeholder="שם"
              class="text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0" />
            <input type="text" bind:value={m.value} oninput={() => scheduleSave('traction')} placeholder="ערך"
              class="text-sm text-end font-medium bg-transparent border-b border-stone-200 focus:border-emerald-400 focus:outline-none py-1" />
            <button type="button" onclick={() => removeAt(traction.one_year.measurables, i, 'traction')}
              class="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-rose-600">
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
      <button type="button"
        onclick={() => traction.one_year.measurables.push({ name: '', value: '' }) && scheduleSave('traction')}
        class="mt-2 text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
        <Plus size={13} /> הוספת מדד
      </button>

      <h3 class="text-xs font-semibold text-stone-500 uppercase mt-5 mb-2">מטרות לשנה</h3>
      <div class="space-y-1">
        {#each traction.one_year.goals as _, i (i)}
          <div class="group flex items-start gap-2">
            <span class="text-stone-300 mt-1">•</span>
            <input type="text" bind:value={traction.one_year.goals[i]} oninput={() => scheduleSave('traction')}
              class="flex-1 text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0" />
            <button type="button" onclick={() => removeAt(traction.one_year.goals, i, 'traction')}
              class="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-rose-600">
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
      <button type="button" onclick={() => addString(traction.one_year.goals, 'traction')}
        class="mt-2 text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
        <Plus size={13} /> הוספת מטרה
      </button>
    </section>

    <!-- 90 Day Plan -->
    <section class="bg-white border border-stone-200 rounded-2xl p-5">
      <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 mb-4">
        <Calendar size={16} class="text-sky-500" /> תוכנית 90 יום
      </h2>
      <div class="grid grid-cols-[100px_1fr] items-center gap-3">
        <label class="text-xs font-medium text-stone-500 uppercase">תאריך עתידי</label>
        <input type="date" bind:value={traction.ninety_day.future_date} oninput={() => scheduleSave('traction')}
          class="text-sm bg-transparent border-b border-stone-200 focus:border-sky-400 focus:outline-none py-1" />
        <label class="text-xs font-medium text-stone-500 uppercase">תקציב</label>
        {#if readOnly}
          <div class="text-sm font-medium text-stone-800 py-1">{fmtMoney(traction.ninety_day.revenue.budget)}</div>
        {:else}
          <input type="text" bind:value={traction.ninety_day.revenue.budget} oninput={() => scheduleSave('traction')}
            class="text-sm bg-transparent border-b border-stone-200 focus:border-sky-400 focus:outline-none py-1" />
        {/if}
        <label class="text-xs font-medium text-stone-500 uppercase">רווח</label>
        {#if readOnly}
          <div class="text-sm font-medium text-stone-800 py-1">{fmtMoney(traction.ninety_day.revenue.profit)}</div>
        {:else}
          <input type="text" bind:value={traction.ninety_day.revenue.profit} oninput={() => scheduleSave('traction')}
            class="text-sm bg-transparent border-b border-stone-200 focus:border-sky-400 focus:outline-none py-1" />
        {/if}
      </div>
      <h3 class="text-xs font-semibold text-stone-500 uppercase mt-5 mb-2">מדדים</h3>
      <div class="space-y-1">
        {#each traction.ninety_day.measurables as m, i (i)}
          <div class="group grid grid-cols-[1fr_100px_auto] items-center gap-2">
            <input type="text" bind:value={m.name} oninput={() => scheduleSave('traction')} placeholder="שם"
              class="text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0" />
            <input type="text" bind:value={m.value} oninput={() => scheduleSave('traction')} placeholder="ערך"
              class="text-sm text-end font-medium bg-transparent border-b border-stone-200 focus:border-sky-400 focus:outline-none py-1" />
            <button type="button" onclick={() => removeAt(traction.ninety_day.measurables, i, 'traction')}
              class="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-rose-600">
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
      <button type="button"
        onclick={() => traction.ninety_day.measurables.push({ name: '', value: '' }) && scheduleSave('traction')}
        class="mt-2 text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
        <Plus size={13} /> הוספת מדד
      </button>
    </section>
  </div>
{/if}

</div>

<style>
  /* Read-only mode: disable every input and hide every add/remove button
     without touching individual elements. */
  div[data-readonly='true'] :global(input),
  div[data-readonly='true'] :global(textarea) {
    pointer-events: none;
  }
  div[data-readonly='true'] :global(input),
  div[data-readonly='true'] :global(textarea) {
    border-bottom-color: transparent !important;
  }
  div[data-readonly='true'] :global(button) {
    display: none !important;
  }
  /* Keep the tab buttons visible */
  div[data-readonly='true'] :global(.flex.gap-1 > button) {
    display: inline-flex !important;
  }
</style>
