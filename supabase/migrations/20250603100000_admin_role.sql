-- Step 1/2: new enum values must commit alone before use (PostgreSQL 55P04).
alter type public.user_role add value if not exists 'admin';
