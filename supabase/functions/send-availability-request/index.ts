import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Define the CORS headers that will be used in every response
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // This is the new part that handles the browser's preflight request.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { projectId } = await req.json();
    if (!projectId) throw new Error("Project ID is required.");

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    // ... (The rest of your function's logic remains exactly the same)
    const { data: project, error: projectError } = await supabaseClient.from('projects').select('*').eq('id', projectId).single();
    const { data: shifts, error: shiftsError } = await supabaseClient.from('shifts').select('*').eq('project_id', projectId);
    const { data: employees, error: employeesError } = await supabaseClient.from('employees').select('*');
    if (projectError || shiftsError || employeesError) throw new Error("Failed to fetch data.");
    const availabilityRequests = [];
    for (const shift of shifts) { for (const employee of employees) { if (!employee.email) continue; availabilityRequests.push({ shift_id: shift.id, employee_id: employee.id }); } }
    const { data: savedRequests, error: insertError } = await supabaseClient.from('availability_requests').insert(availabilityRequests).select();
    if (insertError) throw new Error(`Could not save requests: ${insertError.message}`);
    for (const request of savedRequests) {
      const shift = shifts.find(s => s.id === request.shift_id);
      const employee = employees.find(e => e.id === request.employee_id);
      const responseUrlBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1/handle-response`;
      const yesLink = `${responseUrlBase}?token=${request.response_token}&status=available`;
      const noLink = `${responseUrlBase}?token=${request.response_token}&status=unavailable`;
     // Format the date and time professionally
      const startTime = new Date(shift.start_time);
      const endTime = new Date(shift.end_time);

      const formattedDate = startTime.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
      const formattedStartTime = startTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const formattedEndTime = endTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });

      // Construct the detailed email body
      const emailHtml = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <h2>Availability Request: ${project.name}</h2>
            <p>Hi ${employee.full_name},</p>
            <p>Please confirm if you are available for the following shift:</p>
            <hr style="border: 0; border-top: 1px solid #eee;">
            
            <p><strong>Shift Name:</strong> ${shift.name}</p>
            <p><strong>Role:</strong> ${shift.role}</p>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time Range:</strong> ${formattedStartTime} to ${formattedEndTime}</p>
            
            <h3 style="margin-top: 25px;">Event Details</h3>
            <p><strong>Location:</strong> ${project.venue_address || 'N/A'}</p>
            <p><strong>On-site Contact:</strong> ${project.on_site_contact || 'N/A'}</p>
            <p><strong>Dress Code:</strong> ${project.dress_code || 'N/A'}</p>
            <p><strong>Parking:</strong> ${project.parking_instructions || 'N/A'}</p>
            <p><strong>Notes:</strong> ${project.project_notes || 'N/A'}</p>
            
            <hr style="border: 0; border-top: 1px solid #eee;">
            <p style="margin-top: 20px; text-align: center;">
                <a href="${yesLink}" style="display: inline-block; padding: 12px 20px; background-color: #10B981; color: white; text-decoration: none; border-radius: 5px; margin-right: 15px; font-weight: bold;">✔ YES, I am Available</a>
                <a href="${noLink}" style="display: inline-block; padding: 12px 20px; background-color: #EF4444; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">✖ NO, I am Unavailable</a>
            </p>
        </div>
      `;
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: employee.email }] }],
          from: { email: "logistics@skkld.com", name: "SKKLD.COM" },
          subject: `Availability for ${project.name}`,
          content: [{ type: 'text/html', value: emailHtml }],
        }),
      });
    }

    return new Response(JSON.stringify({ message: `Requests sent.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});