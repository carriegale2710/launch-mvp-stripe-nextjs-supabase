import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const requestHeaders = await headers();
  const authToken = requestHeaders.get('authorization')?.replace(/^Bearer\s+/i, '') || undefined;
  const {
    data: { user },
  } = authToken ? await supabase.auth.getUser(authToken) : await supabase.auth.getUser();

  return user;
}
