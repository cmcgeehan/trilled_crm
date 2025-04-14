import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No session found');
      return;
    }

    console.log('Current user:', {
      id: session.user.id,
      email: session.user.email
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

getCurrentUser(); 