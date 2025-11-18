import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// **FIX: Add the CORS headers**
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // **FIX: Handle the preflight OPTIONS request**
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) throw new Error('API key not found.');

    return new Response(JSON.stringify({ apiKey: apiKey }), {
      // **FIX: Include CORS headers in the response**
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})