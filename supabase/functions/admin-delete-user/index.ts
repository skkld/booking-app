import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { targetUserId, adminEmail, adminPassword } = await req.json();
    
    console.log(`Attempting to delete user: ${targetUserId}`);

    // 1. Create the Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Verify the Admin's Identity
    // We attempt to sign in with the provided credentials to prove they are an admin.
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword
    });

    if (signInError) {
      console.error("Admin password verification failed:", signInError.message);
      throw new Error("Admin password verification failed. Please check your password.");
    }

    console.log("Admin verified. Proceeding with deletion...");

    // 3. Delete the User from the Auth System (The Login)
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    
    if (deleteAuthError) {
      console.error("Failed to delete auth user:", deleteAuthError.message);
      throw deleteAuthError;
    }

    // 4. Delete the User from the Employees Table (The Profile)
    // Note: This might happen automatically if you set up "Cascade Delete" in SQL, 
    // but doing it manually here ensures it's gone.
    const { error: deleteProfileError } = await supabaseAdmin
      .from('employees')
      .delete()
      .eq('user_id', targetUserId);

    if (deleteProfileError) {
       console.error("Failed to delete employee profile:", deleteProfileError.message);
       // We don't throw here because the login is already gone, which is the most important part.
    }

    console.log("User deleted successfully.");

    return new Response(JSON.stringify({ message: "User deleted successfully" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error("Function Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})