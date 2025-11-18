import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { targetUserId, adminEmail, adminPassword } = await req.json();
    
    console.log(`Attempting to delete user: ${targetUserId}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Verify Admin Password
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword
    });

    if (signInError) {
      throw new Error("Admin password verification failed.");
    }

    // 2. Find the Employee Profile ID
    // We need the integer ID (e.g., 15) to delete from related tables, not just the UUID.
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('user_id', targetUserId)
      .single();

    if (employee) {
        console.log(`Found employee profile ID: ${employee.id}. Cleaning up related data...`);

        // 3. Delete "Grandchild" Data (Data linked to the employee ID)
        // We use Promise.all to do this in parallel for speed
        await Promise.all([
            supabaseAdmin.from('availability_requests').delete().eq('employee_id', employee.id),
            supabaseAdmin.from('timecard_entries').delete().eq('employee_id', employee.id),
            supabaseAdmin.from('assignments').delete().eq('employee_id', employee.id),
            supabaseAdmin.from('employee_positions').delete().eq('employee_id', employee.id)
        ]);

        // 4. Delete the "Child" Data (The Employee Profile)
        const { error: deleteProfileError } = await supabaseAdmin
            .from('employees')
            .delete()
            .eq('id', employee.id);
        
        if (deleteProfileError) throw new Error(`Failed to delete profile: ${deleteProfileError.message}`);
    }

    // 5. Delete the "Parent" Data (The Auth User)
    // Now that all links are gone, this will succeed.
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    
    if (deleteAuthError) {
      throw deleteAuthError;
    }

    console.log("User and all related data deleted successfully.");

    return new Response(JSON.stringify({ message: "User deleted successfully" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error("Delete failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})