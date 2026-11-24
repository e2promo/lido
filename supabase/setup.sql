-- Выполните в Supabase → SQL Editor → New query → Run
-- Таблицы для хранения снимков SQLite и блокировок между вызовами Vercel-функции.

create table if not exists public.lido_snapshots (
  key text primary key,
  value text not null
);

create table if not exists public.lido_locks (
  key text primary key,
  value text not null,
  expires_at bigint not null
);

-- Сервисный ключ обходит RLS; отключаем политики, чтобы избежать лишних ошибок.
alter table public.lido_snapshots disable row level security;
alter table public.lido_locks disable row level security;
