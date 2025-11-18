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

    // 1. Create the Admin Client (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Verify the Admin's Password
    // We try to sign in just to check if the password is valid.
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword
    });

    if (signInError) {
      console.error("Sign in error:", signInError);
      throw new Error("Admin password verification failed. Please try again.");
    }

    // 3. Delete the User from Authentication
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    
    if (deleteAuthError) {
      console.error("Auth delete error:", deleteAuthError);
      throw deleteAuthError;
    }

    // 4. Delete the Employee Profile (Database)
    const { error: deleteProfileError } = await supabaseAdmin
      .from('employees')
      .delete()
      .eq('user_id', targetUserId);

    if (deleteProfileError) {
       console.error("Profile delete error:", deleteProfileError);
       // We don't throw here because the Auth user is already gone, which is the important part.
    }

    return new Response(JSON.stringify({ message: "User deleted successfully" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})