<script lang="ts">
  import { Settings, ListChecks, Contact, Newspaper, BookOpen, Users, Plane, Link2, Network, Wallet } from 'lucide-svelte';

  let { canSeeExpenses = false } = $props<{ canSeeExpenses?: boolean }>();
  let open = $state(false);
  let ref: HTMLDivElement;

  function toggle() { open = !open; }
  function close() { open = false; }

  function onDocClick(e: MouseEvent) {
    if (!ref) return;
    if (!ref.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }

  $effect(() => {
    if (open) {
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDocClick);
        document.removeEventListener('keydown', onKey);
      };
    }
  });

  const allItems = [
    { href: '/chart',          label: 'Org Chart',             icon: Network,     always: true },
    { href: '/my-tasks',       label: 'My Tasks',              icon: ListChecks,  always: true },
    { href: '/expenses',       label: 'Expenses',              icon: Wallet,      always: false },
    { href: '/directory',      label: 'Directory',             icon: Contact,     always: true },
    { href: '/posts',          label: 'Posts',                 icon: Newspaper,   always: true },
    { href: '/processes',      label: 'Processes',             icon: BookOpen,    always: true },
    { href: '/teams',          label: 'Teams & People',        icon: Users,       always: true },
    { href: '/links',          label: 'Links',                 icon: Link2,       always: true },
    { href: '/trips',          label: 'Add a Trip',            icon: Plane,       always: true },
  ];
  const items = $derived(allItems.filter((i) => i.always || (i.href === '/expenses' && canSeeExpenses)));
</script>

<div bind:this={ref} class="relative">
  <button
    type="button"
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={open}
    class="p-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition"
    title="More"
  >
    <Settings size={18} />
  </button>
  {#if open}
    <div
      role="menu"
      class="absolute right-0 top-full mt-1 min-w-[12rem] bg-white border border-stone-200 rounded-xl shadow-lg p-1 z-40"
    >
      {#each items as item}
        <a
          href={item.href}
          role="menuitem"
          onclick={close}
          class="flex items-center gap-2.5 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded-lg"
        >
          <item.icon size={15} class="text-stone-400" />
          {item.label}
        </a>
      {/each}
    </div>
  {/if}
</div>
