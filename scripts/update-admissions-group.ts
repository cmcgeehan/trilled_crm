import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function updateAdmissionsGroup() {
  try {
    const { data, error } = await supabase
      .from('user_groups')
      .update({ twilio_number: '+18335737276' })
      .eq('name', 'admissions')
      .select();

    if (error) {
      console.error('Error updating admissions group:', error);
      return;
    }

    console.log('Updated admissions group:', data);
  } catch (error) {
    console.error('Error:', error);
  }
}

updateAdmissionsGroup(); 