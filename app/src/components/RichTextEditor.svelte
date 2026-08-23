<script lang="ts">
  import Quill from 'quill';
  import 'quill/dist/quill.snow.css';

  let {
    name,
    initial = '',
    placeholder = 'כתבו משהו...',
    autosaveUrl,
    autosaveId,
    autosaveField = 'description',
  } = $props<{
    name: string;
    initial?: string;
    placeholder?: string;
    autosaveUrl?: string;
    autosaveId?: string;
    autosaveField?: string;
  }>();

  let container: HTMLDivElement;
  let html = $state<string>(initial ?? '');
  type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  let saveState = $state<SaveState>('idle');

  const canAutosave = !!(autosaveUrl && autosaveId);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let savedResetTimer: ReturnType<typeof setTimeout> | null = null;

  async function doSave(currentHtml: string) {
    if (!canAutosave) return;
    saveState = 'saving';
    try {
      const res = await fetch(autosaveUrl!, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: autosaveId, [autosaveField]: currentHtml }),
      });
      if (!res.ok) throw new Error(await res.text());
      saveState = 'saved';
      if (savedResetTimer) clearTimeout(savedResetTimer);
      savedResetTimer = setTimeout(() => {
        if (saveState === 'saved') saveState = 'idle';
      }, 1500);
    } catch {
      saveState = 'error';
    }
  }

  function scheduleSave() {
    if (!canAutosave) return;
    saveState = 'dirty';
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSave(html), 800);
  }

  $effect(() => {
    if (!container) return;
    const editor = new Quill(container, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'blockquote', 'code-block'],
          ['clean'],
        ],
      },
    });

    if (initial) editor.clipboard.dangerouslyPasteHTML(initial);

    editor.on('text-change', (_delta, _old, source) => {
      html = editor.root.innerHTML;
      if (source === 'user') scheduleSave();
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (savedResetTimer) clearTimeout(savedResetTimer);
      container.innerHTML = '';
    };
  });

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
      case 'dirty':  return 'text-amber-500';
      case 'saving': return 'text-stone-400';
      case 'saved':  return 'text-emerald-600';
      case 'error':  return 'text-rose-600';
      default:       return 'text-transparent';
    }
  });
</script>

<div>
  <div bind:this={container} class="bg-white rounded-b-lg"></div>
  <input type="hidden" {name} value={html} />
  {#if canAutosave}
    <div class="mt-1 text-xs text-end tabular-nums {statusColor} transition-colors h-4">
      {statusLabel}
    </div>
  {/if}
</div>

<style>
  :global(.ql-toolbar.ql-snow) {
    border-top-left-radius: 0.5rem;
    border-top-right-radius: 0.5rem;
    border-color: #d6d3d1;
    background: #fafaf9;
  }
  :global(.ql-container.ql-snow) {
    border-bottom-left-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
    border-color: #d6d3d1;
    min-height: 140px;
    font-family: inherit;
    font-size: 0.875rem;
  }
  :global(.ql-editor) {
    min-height: 140px;
  }
</style>
