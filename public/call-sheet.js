import { _supabase } from './auth.js';

async function loadCallSheet() {
    const urlParams = new URLSearchParams(window.location.search);
    const shiftId = urlParams.get('shift_id');

    await loadDisplayPreferences(_supabase);
    if (!shiftId) {
        document.body.innerHTML = '<h1>Error: No Shift ID provided.</h1>';
        return;
    }
import { formatProjectTime, loadDisplayPreferences } from './utils.js';
    // This query is now simpler: it doesn't need to fetch employee_positions.
    const { data: shift, error } = await _supabase
        .from('shifts')
        .select(`
            name, role, start_time, end_time,
            projects (*),
            assignments (*, employees(*))
        `)
        .eq('id', shiftId)
        .single();

    if (error || !shift) {
        console.error("Error fetching call sheet data:", error);
        document.body.innerHTML = '<h1>Error: Could not load call sheet data. See console.</h1>';
        return;
    }

    const project = shift.projects;
    const assignments = shift.assignments;

    // Populate project and shift info (remains the same)
    document.getElementById('project-name').textContent = project.name;
    document.getElementById('shift-name-role').textContent = `${shift.name} - ${shift.role}`;
    const startTime = new Date(shift.start_time).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
    const endTime = new Date(shift.end_time).toLocaleTimeString([], { timeStyle: 'short' });
    document.getElementById('shift-time').textContent = `${startTime} to ${endTime}`;
    document.getElementById('venue-address').textContent = project.venue_address || 'N/A';
    document.getElementById('on-site-contact').textContent = project.on_site_contact || 'N/A';
    document.getElementById('dress-code').textContent = project.dress_code || 'N/A';
    document.getElementById('parking-instructions').textContent = project.parking_instructions || 'N/A';
    document.getElementById('project-notes').textContent = project.project_notes || 'N/A';

    // Populate crew list
    const crewTableBody = document.getElementById('crew-list-table');
    crewTableBody.innerHTML = '';

    if (assignments.length === 0) {
        crewTableBody.innerHTML = '<tr><td colspan="4">No crew assigned to this shift.</td></tr>';
        return;
    }

    assignments.forEach(assignment => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${assignment.employees.full_name}</td>
            <td>${shift.role}</td> <td>${assignment.employees.phone || 'N/A'}</td>
            <td>${assignment.notes || ''}</td>
        `;
        crewTableBody.appendChild(row);
    });
}

loadCallSheet();