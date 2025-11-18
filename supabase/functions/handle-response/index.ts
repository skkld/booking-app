import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const status = url.searchParams.get('status');

    if (!token || !status) throw new Error("Token and status are required.");
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // **THE FIX IS HERE: Use `supabaseClient` instead of `_supabase`**
    const { data: updatedRequest, error } = await supabaseClient
        .from('availability_requests')
        .update({ status: status })
        .eq('response_token', token)
        .select('*, shifts(*, projects(*))')
        .single();

    if (error || !updatedRequest) {
      throw new Error("Could not update your status. The link may have expired or is invalid.");
    }

    const shift = updatedRequest.shifts;
    const project = shift.projects;
    const isAvailable = updatedRequest.status === 'available';

    const confirmationHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Response Recorded</title>
          <style>
              :root { --primary-color: #4F46E5; --bg-light: #F9FAFB; --text-dark: #111827; --success: #10B981; --danger: #EF4444; }
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background-color: var(--bg-light); color: var(--text-dark); text-align: center; padding-top: 50px; }
              .container { max-width: 600px; margin: auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              h1 { color: ${isAvailable ? 'var(--success)' : 'var(--danger)'}; font-size: 2.5rem; }
              p { color: #6B7280; }
              strong { color: var(--text-dark); }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>${isAvailable ? '✔ You are Available!' : '✖ You are Unavailable'}</h1>
              <p>Your response for the project <strong>${project.name}</strong> has been recorded.</p>
              <p><strong>Shift:</strong> ${shift.name} - ${shift.role}</p>
              <p>You can now close this window.</p>
          </div>
      </body>
      </html>
    `;

    return new Response(confirmationHtml, {
      // **FIX: Explicitly set the character encoding to UTF-8**
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (err) {
    return new Response(`<p>Error: ${err.message}</p>`, {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});