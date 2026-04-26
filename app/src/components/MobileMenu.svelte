<script lang="ts">
  import {
    Menu, X, Target, AlertCircle, ListTodo, ChartBar, Focus, Eye,
    ListChecks, Contact, Newspaper, BookOpen, Users, Link2, Network, Wallet, Lightbulb, LogOut,
  } from 'lucide-svelte';

  type Team = { id: string; name: string };
  let {
    teams,
    currentTeamId,
    currentPath,
    userName,
    backPath,
    canSeeExpenses = false,
  } = $props<{
    teams: Team[];
    currentTeamId: string | null;
    currentPath: string;
    userName: string;
    backPath: string;
    canSeeExpenses?: boolean;
  }>();

  let open = $state(false);
  function close() { open = false; }
  function toggle() { open = !open; }

  $effect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = prev;
        document.removeEventListener('keydown', onKey);
      };
    }
  });

  const primary = [
    { href: '/',          label: 'Home',          icon: Target,      match: (p: string) => p === '/' },
    { href: '/vto',       label: 'V/TO',          icon: Eye,         match: (p: string) => p.startsWith('/vto') },
    { href: '/rocks',     label: 'Rocks',         icon: Target,      match: (p: string) => p.startsWith('/rocks') },
    { href: '/issues',    label: 'Issues',        icon: AlertCircle, match: (p: string) => p.startsWith('/issues') },
    { href: '/todos',     label: 'To-Dos',        icon: ListTodo,    match: (p: string) => p.startsWith('/todos') },
    { href: '/scorecard', label: 'Scorecard',     icon: ChartBar,    match: (p: string) => p.startsWith('/scorecard') },
    { href: '/focus',     label: 'Current Focus', icon: Focus,       match: (p: string) => p.startsWith('/focus') },
  ];

  const allSecondary = [
    { href: '/chart',          label: 'Org Chart',             icon: Network,     always: true },
    { href: '/my-tasks',       label: 'My Tasks',              icon: ListChecks,  always: true },
    { href: '/expenses',       label: 'Expenses',              icon: Wallet,      always: false },
    { href: '/directory',      label: 'Directory',             icon: Contact,     always: true },
    { href: '/posts',          label: 'Posts',                 icon: Newspaper,   always: true },
    { href: '/processes',      label: 'Processes',             icon: BookOpen,    always: true },
    { href: '/teams',          label: 'Teams & People',        icon: Users,       always: true },
    { href: '/links',          label: 'Links',                 icon: Link2,       always: true },
    { href: '/feature-ideas',  label: 'Feature Ideas',          icon: Lightbulb,   always: true },
  ];
  const secondary = $derived(allSecondary.filter((i) => i.always || (i.href === '/expenses' && canSeeExpenses)));
</script>

<!-- Hamburger trigger -->
<button
  type="button"
  onclick={toggle}
  aria-label="Open menu"
  class="p-2 rounded-lg text-stone-700 hover:bg-stone-100"
>
  <Menu size={22} />
</button>

{#if open}
  <!-- Drawer -->
  <div class="fixed inset-0 z-40 md:hidden">
    <button
      type="button"
      onclick={close}
      aria-label="Close menu"
      class="absolute inset-0 bg-black/40"
    ></button>

    <aside class="absolute left-0 top-0 bottom-0 w-[85%] max-w-xs bg-white shadow-2xl flex flex-col overflow-y-auto">
      <header class="flex items-center justify-between p-4 border-b border-stone-200">
        <div>
          <div class="font-semibold text-stone-900">Chabad Central</div>
          {#if userName}
            <div class="text-xs text-stone-500 mt-0.5 truncate max-w-[200px]">{userName}</div>
          {/if}
        </div>
        <button
          type="button"
          onclick={close}
          aria-label="Close"
          class="p-1 text-stone-400 hover:text-stone-700"
        >
          <X size={20} />
        </button>
      </header>

      <!-- Team selector -->
      {#if teams.length > 0}
        <form method="POST" action="/api/team" class="p-4 border-b border-stone-200">
          <label class="text-xs font-semibold text-stone-500 uppercase tracking-wide">Team</label>
          <input type="hidden" name="back" value={backPath} />
          <select
            name="team_id"
            onchange={(e: Event) => (e.currentTarget as HTMLSelectElement).form!.submit()}
            class="mt-1 w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm"
          >
            {#each teams as t}
              <option value={t.id} selected={t.id === currentTeamId}>{t.name}</option>
            {/each}
          </select>
        </form>
      {/if}

      <!-- Primary nav -->
      <nav class="flex-1 p-2">
        {#each primary as item}
          <a
            href={item.href}
            onclick={close}
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition"
            class:bg-violet-50={item.match(currentPath)}
            class:text-violet-700={item.match(currentPath)}
            class:text-stone-700={!item.match(currentPath)}
            class:hover:bg-stone-50={!item.match(currentPath)}
          >
            <item.icon size={18} />
            {item.label}
          </a>
        {/each}

        <div class="my-3 h-px bg-stone-200 mx-3"></div>

        {#each secondary as item}
          <a
            href={item.href}
            onclick={close}
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-stone-600 hover:bg-stone-50"
          >
            <item.icon size={18} class="text-stone-400" />
            {item.label}
          </a>
        {/each}
      </nav>

      <!-- Logout -->
      <form method="POST" action="/auth/logout" class="p-2 border-t border-stone-200">
        <button class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-stone-700 hover:bg-stone-50">
          <LogOut size={18} class="text-stone-400" />
          Sign out
        </button>
      </form>
    </aside>
  </div>
{/if}
