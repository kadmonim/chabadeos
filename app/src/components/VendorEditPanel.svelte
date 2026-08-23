<script lang="ts">
  import { X, Trash2 } from 'lucide-svelte';
  import { onMount } from 'svelte';

  type Vendor = {
    vendor_id: number;
    name: string;
    person_employee_id: string | null;
    description: string | null;
    frequency: string | null;
    status: string | null;
    group_name: string | null;
    latest_update: string | null;
    to_do: string | null;
    review_again: string | null;
    tags: string[] | null;
    aliases: string[] | null;
    report_matches: string[] | null;
  };
  type Employee = { id: string; full_name: string };

  let open = $state(false);
  let loading = $state(false);
  let saving = $state(false);
  let vendor = $state<Vendor | null>(null);
  let employees = $state<Employee[]>([]);
  let err = $state<string | null>(null);
  let mode = $state<'edit' | 'new'>('edit');

  function emptyVendor(name: string): Vendor {
    return {
      vendor_id: 0,
      name,
      person_employee_id: null,
      description: null,
      frequency: null,
      status: null,
      group_name: null,
      latest_update: null,
      to_do: null,
      review_again: null,
      tags: [],
      aliases: [],
      report_matches: [name],
    };
  }

  async function loadEdit(id: number) {
    loading = true;
    err = null;
    vendor = null;
    mode = 'edit';
    const res = await fetch(`/api/expenses-vendors?id=${id}`);
    if (res.ok) {
      const json = await res.json();
      vendor = json.vendor;
      employees = json.employees;
    } else {
      err = await res.text() || 'טעינת הספק נכשלה.';
    }
    loading = false;
  }

  async function loadNew(name: string) {
    loading = true;
    err = null;
    vendor = null;
    mode = 'new';
    const res = await fetch('/api/expenses-vendors');
    if (res.ok) {
      const json = await res.json();
      employees = json.employees;
      vendor = emptyVendor(name);
    } else {
      err = await res.text() || 'אתחול הטופס נכשל.';
    }
    loading = false;
  }

  function close() {
    open = false;
    vendor = null;
    err = null;
    mode = 'edit';
  }

  function onOpen(e: Event) {
    const detail = (e as CustomEvent).detail as { vendor_id?: number; name?: string };
    if (detail?.vendor_id) {
      open = true;
      loadEdit(detail.vendor_id);
    } else if (detail?.name) {
      open = true;
      loadNew(detail.name);
    }
  }

  onMount(() => {
    window.addEventListener('open-vendor-edit', onOpen);
    return () => window.removeEventListener('open-vendor-edit', onOpen);
  });

  function arrToLines(arr: string[] | null | undefined): string {
    return (arr ?? []).join('\n');
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!vendor) return;
    saving = true;
    err = null;
    const form = new FormData(e.currentTarget as HTMLFormElement);
    form.set('_action', mode === 'new' ? 'create' : 'update');
    if (mode === 'edit') form.set('vendor_id', String(vendor.vendor_id));
    form.set('ajax', '1');
    const res = await fetch('/api/expenses-vendors', { method: 'POST', body: form });
    if (res.ok) {
      // The duplicate-name case returns 200 with { duplicate, vendor_id };
      // everything else returns 204.
      if (res.status === 200) {
        const json = await res.json().catch(() => null);
        if (json?.duplicate && json?.vendor_id) {
          await loadEdit(json.vendor_id);
          err = 'ספק בשם זה קיים כבר — עורכים אותו במקום.';
          saving = false;
          return;
        }
      }
      close();
      location.reload();
    } else {
      err = await res.text() || 'השמירה נכשלה.';
    }
    saving = false;
  }

  async function del() {
    if (!vendor) return;
    if (!confirm(`למחוק את הספק "${vendor.name}"?`)) return;
    const form = new FormData();
    form.set('_action', 'delete');
    form.set('vendor_id', String(vendor.vendor_id));
    form.set('ajax', '1');
    const res = await fetch('/api/expenses-vendors', { method: 'POST', body: form });
    if (res.ok) {
      close();
      location.reload();
    } else {
      err = await res.text() || 'המחיקה נכשלה.';
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-40" onkeydown={onKey} role="presentation">
    <div class="absolute inset-0 bg-black/30" onclick={close} role="presentation"></div>
    <aside
      class="absolute end-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="עריכת ספק"
    >
      <div class="p-6 space-y-5">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-stone-900">
            {loading ? 'טוען…' : (mode === 'new' ? 'ספק חדש' : `עריכת ${vendor?.name ?? ''}`)}
          </h2>
          <button type="button" onclick={close} class="p-1 text-stone-400 hover:text-stone-700" aria-label="סגירה">
            <X size={20} />
          </button>
        </div>

        {#if err}
          <div class="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>
        {/if}

        {#if loading}
          <div class="text-sm text-stone-400">טוען…</div>
        {:else if vendor}
          <form onsubmit={save} class="space-y-4">
            <div>
              <label class="text-sm font-medium text-stone-700" for="v-name">שם</label>
              <input id="v-name" type="text" name="name" required value={vendor.name}
                class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-medium text-stone-700" for="v-group">קבוצה</label>
                <input id="v-group" type="text" name="group_name" value={vendor.group_name ?? ''}
                  placeholder="למשל: תוכנה, אירוח"
                  class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label class="text-sm font-medium text-stone-700" for="v-person">איש קשר</label>
                <select id="v-person" name="person_employee_id" class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400">
                  <option value="">— ללא —</option>
                  {#each employees as e}
                    <option value={e.id} selected={e.id === vendor.person_employee_id}>{e.full_name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="text-sm font-medium text-stone-700" for="v-freq">תדירות</label>
                <input id="v-freq" type="text" name="frequency" value={vendor.frequency ?? ''}
                  placeholder="חודשי, שנתי, חד-פעמי"
                  class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label class="text-sm font-medium text-stone-700" for="v-status">סטטוס</label>
                <input id="v-status" type="text" name="status" value={vendor.status ?? ''}
                  placeholder="פעיל, בוטל, ..."
                  class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-stone-700" for="v-desc">תיאור</label>
              <textarea id="v-desc" name="description" rows="2"
                class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400"
              >{vendor.description ?? ''}</textarea>
            </div>

            <div>
              <label class="text-sm font-medium text-stone-700" for="v-latest">עדכון אחרון</label>
              <textarea id="v-latest" name="latest_update" rows="2"
                placeholder="מה המצב הנוכחי / השינוי האחרון"
                class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400"
              >{vendor.latest_update ?? ''}</textarea>
            </div>

            <div class="grid grid-cols-[1fr_160px] gap-3">
              <div>
                <label class="text-sm font-medium text-stone-700" for="v-todo">משימה</label>
                <textarea id="v-todo" name="to_do" rows="2"
                  placeholder="מה צריך לקרות הלאה"
                  class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400"
                >{vendor.to_do ?? ''}</textarea>
              </div>
              <div>
                <label class="text-sm font-medium text-stone-700" for="v-review">לבדיקה חוזרת בתאריך</label>
                <input id="v-review" type="date" name="review_again" value={vendor.review_again ?? ''}
                  class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-stone-700" for="v-reports">התאמות בדוחות <span class="text-xs text-stone-400">(שורה אחת לכל ערך)</span></label>
              <textarea id="v-reports" name="report_matches" rows="3"
                class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-purple-400"
              >{arrToLines(vendor.report_matches)}</textarea>
            </div>

            <div>
              <label class="text-sm font-medium text-stone-700" for="v-aliases">כינויים <span class="text-xs text-stone-400">(שורה אחת לכל ערך)</span></label>
              <textarea id="v-aliases" name="aliases" rows="2"
                class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-purple-400"
              >{arrToLines(vendor.aliases)}</textarea>
            </div>

            <div>
              <label class="text-sm font-medium text-stone-700" for="v-tags">תגיות <span class="text-xs text-stone-400">(שורה אחת לכל ערך)</span></label>
              <textarea id="v-tags" name="tags" rows="2"
                class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-purple-400"
              >{arrToLines(vendor.tags)}</textarea>
            </div>

            <button type="submit" disabled={saving}
              class="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60">
              {saving ? 'שומר…' : (mode === 'new' ? 'יצירת ספק' : 'שמירת שינויים')}
            </button>
          </form>

          {#if mode === 'edit'}
            <button
              type="button"
              onclick={del}
              class="w-full border border-rose-300 text-rose-700 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 hover:bg-rose-50"
            >
              <Trash2 size={14} /> מחיקת ספק
            </button>
          {/if}
        {/if}
      </div>
    </aside>
  </div>
{/if}
