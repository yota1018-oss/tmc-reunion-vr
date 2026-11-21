-- TMC同窓会VR: 合言葉チェック + チャット履歴
-- テーブルはRLSで直接アクセス不可。合言葉を知っている人だけが関数経由で読み書きできる。

create table if not exists public.app_secret (
  id int primary key default 1 check (id = 1),
  pass_hash text not null
);
alter table public.app_secret enable row level security;

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sender_id text not null,
  name text not null,
  category text not null,
  body text not null
);
alter table public.chat_messages enable row level security;
create index if not exists chat_messages_created_at_idx on public.chat_messages (created_at desc);

-- 仮の合言葉: tmc2027 （変更方法は README 参照）
insert into public.app_secret (id, pass_hash)
values (1, encode(sha256(convert_to('tmc2027', 'UTF8')), 'hex'))
on conflict (id) do nothing;

create or replace function public.tmc_check(p_pass text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_secret
    where pass_hash = encode(sha256(convert_to(coalesce(p_pass, ''), 'UTF8')), 'hex')
  );
$$;

create or replace function public.tmc_post(
  p_pass text, p_sender_id text, p_name text, p_category text, p_body text
)
returns public.chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.chat_messages;
begin
  if not public.tmc_check(p_pass) then
    raise exception 'invalid passphrase' using errcode = '28000';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 or length(p_body) > 300
     or length(coalesce(p_name, '')) = 0 or length(p_name) > 40
     or length(coalesce(p_category, '')) > 40
     or length(coalesce(p_sender_id, '')) = 0 or length(p_sender_id) > 64 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  insert into public.chat_messages (sender_id, name, category, body)
  values (p_sender_id, p_name, p_category, trim(p_body))
  returning * into r;
  return r;
end;
$$;

create or replace function public.tmc_history(p_pass text, p_limit int default 50)
returns setof public.chat_messages
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tmc_check(p_pass) then
    raise exception 'invalid passphrase' using errcode = '28000';
  end if;
  return query
    select * from (
      select * from public.chat_messages
      order by created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) t order by created_at asc;
end;
$$;

revoke all on function public.tmc_check(text) from public;
revoke all on function public.tmc_post(text, text, text, text, text) from public;
revoke all on function public.tmc_history(text, int) from public;
grant execute on function public.tmc_check(text) to anon, authenticated;
grant execute on function public.tmc_post(text, text, text, text, text) to anon, authenticated;
grant execute on function public.tmc_history(text, int) to anon, authenticated;
