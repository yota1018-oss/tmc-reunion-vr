-- テーブルへの直接アクセスを禁止（関数経由のみ）
revoke all on table public.app_secret from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;
