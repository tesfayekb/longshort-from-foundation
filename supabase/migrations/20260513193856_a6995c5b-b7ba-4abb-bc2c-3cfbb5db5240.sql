INSERT INTO public.profiles (id, display_name, email, email_verified, status)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
       u.email,
       (u.email_confirmed_at IS NOT NULL),
       'active'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;