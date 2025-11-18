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
    const { email, password, role } = await req.json();
    if (!email || !password || !role) {
      throw new Error("Email, password, and role are required.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Create the secure auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
    });

    if (authError) throw authError;

    // 2. Create the corresponding employee profile
    const { error: profileError } = await supabaseAdmin
      .from('employees')
      .insert({
        user_id: authData.user.id,
        full_name: email,
        email: email,
        role: role,
      });

    if (profileError) throw profileError;

    // 3. Send the Invite Email via SendGrid
    // MAKE SURE THIS URL IS YOUR EXACT VERCEL DOMAIN
    const loginUrl = "https://booking-app-skkld.vercel.app/login.html"; 

    const emailHtml = `
      <div style="font-family: sans-serif; color: #333;">
        <h2>Welcome to the Booking App</h2>
        <p>You have been invited to join the team.</p>
        <p><strong>Your Login Details:</strong></p>
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary Password:</strong> ${password}</li>
        </ul>
        <p>Please log in and change your password as soon as possible.</p>
        <a href="${loginUrl}" 
           style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
           Log In Now
        </a>
      </div>
    `;

    const sendGridRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email }] }],
        from: { email: "skkld@skkld.com", name: "Booking App Admin" }, 
        subject: "You have been invited to the Booking App",
        content: [{ type: 'text/html', value: emailHtml }],
        // **FIX: Disable click tracking to prevent broken links**
        tracking_settings: {
            click_tracking: { enable: false }
        }
      }),
    });

    if (!sendGridRes.ok) {
      console.error("Failed to send email via SendGrid", await sendGridRes.text());
    }

    return new Response(JSON.stringify({ message: "User created and invite sent" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})