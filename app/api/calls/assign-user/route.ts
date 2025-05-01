import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Define the expected request body structure
interface AssignUserRequestBody {
  callSid: string;
}

export async function POST(request: Request) {
  console.log('[/api/calls/assign-user] Received request');
  const cookieStore = cookies();
  
  // Correctly initialize Supabase client using createRouteHandlerClient
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    // 1. Get Authenticated User
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[/api/calls/assign-user] Session error:', sessionError.message);
      return NextResponse.json({ error: 'Failed to get session' }, { status: 500 });
    }

    if (!session?.user?.id) {
      console.warn('[/api/calls/assign-user] No authenticated user found');
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log('[/api/calls/assign-user] Authenticated User ID:', userId);

    // 2. Parse Request Body
    let body: AssignUserRequestBody;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn('[/api/calls/assign-user] Invalid JSON body:', parseError);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { callSid } = body;

    if (!callSid) {
      console.warn('[/api/calls/assign-user] Missing callSid in request body');
      return NextResponse.json({ error: 'Missing callSid parameter' }, { status: 400 });
    }

    console.log(`[/api/calls/assign-user] Attempting to assign user ${userId} to call SID ${callSid}`);

    // 3. Update Call Record
    const { data, error: updateError } = await supabase
      .from('calls')
      .update({ to_user_id: userId, updated_at: new Date().toISOString() })
      .eq('call_sid', callSid)
      .select('id') // Select something to confirm update happened
      .maybeSingle(); // Use maybeSingle in case the callSid doesn't exist (e.g., race condition)

    if (updateError) {
      console.error(`[/api/calls/assign-user] Error updating call record for SID ${callSid}:`, updateError.message);
      // Check for specific errors, like RLS violation or not found?
      return NextResponse.json({ error: 'Failed to update call record', details: updateError.message }, { status: 500 });
    }

    if (!data) {
       console.warn(`[/api/calls/assign-user] Call record not found for SID ${callSid}. Might have been deleted or SID incorrect.`);
      // Still return success as the goal is assignment, maybe log this specifically
       return NextResponse.json({ message: 'Assignment requested, but call record not found.' }, { status: 200 });
    }

    console.log(`[/api/calls/assign-user] Successfully assigned user ${userId} to call record ${data.id} (SID: ${callSid})`);
    return NextResponse.json({ message: 'User assigned successfully' }, { status: 200 });

  } catch (error) {
    // Type guard or assertion if accessing specific properties
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/calls/assign-user] Unexpected error:', message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 