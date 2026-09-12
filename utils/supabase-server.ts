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

interface GetAuthenticatedUserOptions {
  allowBearerToken?: boolean;
}

export async function getAuthenticatedUser(options?: GetAuthenticatedUserOptions) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: cookieUser },
  } = await supabase.auth.getUser();

  if (cookieUser) {
    return cookieUser;
  }

  if (!options?.allowBearerToken) {
    return null;
  }

  const requestHeaders = await headers();
  const requestOrigin = requestHeaders.get('origin');
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:8000',
  ].filter((value): value is string => Boolean(value));

  if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
    return null;
  }

  const authToken = requestHeaders.get('authorization')?.replace(/^Bearer\s+/i, '') || undefined;

  if (!authToken) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser(authToken);

  return user;
}
