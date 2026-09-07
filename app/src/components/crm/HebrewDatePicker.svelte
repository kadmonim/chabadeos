<script lang="ts">
  // Dual Gregorian/Hebrew date entry. The Gregorian <input type="date"> carries
  // the actual form value (name=`name`, ISO yyyy-mm-dd) so a plain form POST
  // works with no JS; the Hebrew day/month/year selects are a second way to
  // set the same value, kept in sync in both directions.
  import { gregToHebrew, hebrewToGreg, hebrewMonths, daysInHebrewMonth, formatHebrew, hebrewYearNow } from '~/lib/crm/hebrew-date';

  let { name, value = '', label = '', required = false } = $props<{
    name: string;
    value?: string;
    label?: string;
    required?: boolean;
  }>();

  let iso = $state(value ?? '');
  let afterSunset = $state(false);
  let hDay = $state(1);
  let hMonth = $state(7); // Tishrei
  let hYear = $state(hebrewYearNow());
  let error = $state('');

  function syncFromIso(v: string, sunset: boolean) {
    if (!v) return;
    try {
      const parts = gregToHebrew(v, sunset);
      hDay = parts.day;
      hMonth = parts.month;
      hYear = parts.year;
      error = '';
    } catch {
      // Leave the Hebrew fields as-is on an unparseable date.
    }
  }

  // Initial sync from a prefilled value.
  syncFromIso(iso, afterSunset);

  function onGregChange(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    iso = v;
    syncFromIso(v, afterSunset);
  }

  function onAfterSunsetChange(e: Event) {
    afterSunset = (e.target as HTMLInputElement).checked;
    syncFromIso(iso, afterSunset);
  }

  function recomputeFromHebrew() {
    const count = daysInHebrewMonth(hMonth, hYear);
    if (hDay > count) hDay = count;
    try {
      iso = hebrewToGreg({ day: hDay, month: hMonth, year: hYear });
      error = '';
    } catch (e) {
      error = (e as Error).message || 'תאריך עברי לא תקין';
    }
  }

  function onDayChange(e: Event) {
    hDay = Number((e.target as HTMLSelectElement).value);
    recomputeFromHebrew();
  }
  function onMonthChange(e: Event) {
    hMonth = Number((e.target as HTMLSelectElement).value);
    recomputeFromHebrew();
  }
  function onYearChange(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v) && v > 0) hYear = v;
    recomputeFromHebrew();
  }

  let months = $derived(hebrewMonths(hYear));
  let daysCount = $derived(daysInHebrewMonth(hMonth, hYear));
  let days = $derived(Array.from({ length: daysCount }, (_, i) => i + 1));

  let preview = $derived.by(() => {
    try {
      return formatHebrew({ day: hDay, month: hMonth, year: hYear });
    } catch {
      return '';
    }
  });

  let gregPreview = $derived.by(() => {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return '';
    return `${m[3]}.${m[2]}.${m[1]}`;
  });
</script>

<div class="space-y-2">
  {#if label}
    <label class="field-label" for={`${name}-greg`}>{label}</label>
  {/if}
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div>
      <input
        id={`${name}-greg`}
        type="date"
        {name}
        value={iso}
        {required}
        class="input"
        onchange={onGregChange}
      />
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <select class="input flex-1 min-w-[4.5rem]" aria-label="יום עברי" value={hDay} onchange={onDayChange}>
        {#each days as d (d)}
          <option value={d}>{d}</option>
        {/each}
      </select>
      <select class="input flex-[2] min-w-[6rem]" aria-label="חודש עברי" value={hMonth} onchange={onMonthChange}>
        {#each months as m (m.value)}
          <option value={m.value}>{m.label}</option>
        {/each}
      </select>
      <input
        type="number"
        class="input flex-1 min-w-[5rem]"
        aria-label="שנה עברית"
        value={hYear}
        onchange={onYearChange}
      />
    </div>
  </div>

  <div class="flex items-center justify-between gap-3 flex-wrap">
    <label class="flex items-center gap-1.5 text-xs text-stone-500">
      <input type="checkbox" checked={afterSunset} onchange={onAfterSunsetChange} />
      אחרי השקיעה
    </label>
    <div class="text-xs text-stone-500">
      {#if error}
        <span class="text-rose-600">{error}</span>
      {:else}
        {preview}{#if gregPreview} · {gregPreview}{/if}
      {/if}
    </div>
  </div>
</div>
