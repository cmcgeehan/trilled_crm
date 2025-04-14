import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function updateUserTwilioPhone(userId: string, twilioPhone: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ twilio_phone: twilioPhone })
      .eq('id', userId)
      .select();

    if (error) {
      console.error('Error updating user:', error);
      return;
    }

    console.log('Updated user:', data);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Get the user ID from command line arguments
const userId = process.argv[2];
const twilioPhone = process.argv[3];

if (!userId || !twilioPhone) {
  console.error('Usage: ts-node update-user-twilio-phone.ts <userId> <twilioPhone>');
  process.exit(1);
}

updateUserTwilioPhone(userId, twilioPhone); 