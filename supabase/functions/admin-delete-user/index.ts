import { createClient } from 'https://esm.sh/@supabase/supabase-js@2' // <-- This line is fixed
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { targetUserId, adminEmail, adminPassword } = await req.json();
    
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
    if (signInError) throw new Error("Admin authentication failed. Password was incorrect.");

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) throw deleteAuthError;

    await supabaseAdmin.from('employees').delete().eq('user_id', targetUserId);

    return new Response(JSON.stringify({ message: "User deleted successfully" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})