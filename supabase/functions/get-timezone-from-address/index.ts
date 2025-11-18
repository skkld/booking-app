import { serve } from 'https://deno.land/std@0.168.0/http/server.ts' // <-- This line is fixed

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { address } = await req.json();
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    // 1. Geocode the address to get latitude and longitude
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    
    if (geoData.status !== 'OK') throw new Error('Geocoding failed');
    
    const location = geoData.results[0].geometry.location; // { lat, lng }
    const timestamp = Math.floor(Date.now() / 1000);

    // 2. Use lat/lng to get the timezone
    const tzUrl = `https://maps.googleapis.com/maps/api/timezone/json?location=${location.lat},${location.lng}&timestamp=${timestamp}&key=${apiKey}`;
    const tzRes = await fetch(tzUrl);
    const tzData = await tzRes.json();

    if (tzData.status !== 'OK') throw new Error('Timezone lookup failed');

    return new Response(JSON.stringify({ timezoneId: tzData.timeZoneId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})