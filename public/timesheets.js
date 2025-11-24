import { _supabase } from './auth.js';

async function loadTimesheetsList() {
    const tableBody = document.getElementById('timesheets-list-table');

    // 1. Fetch all shifts for ACTIVE projects
    // We join with timecard_entries to see if data exists
    const { data: shifts, error } = await _supabase
        .from('shifts')
        .select(`
            id, name, role, start_time, end_time,
            projects!inner(id, name, status),
            timecard_entries(count)
        `)
        .eq('projects.status', 'active')
        .order('start_time', { ascending: false });

    if (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="6">Error loading shifts.</td></tr>`;
        return;
    }

    if (shifts.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6">No active shifts found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    shifts.forEach(shift => {
        const date = new Date(shift.start_time).toLocaleDateString();
        const time = new Date(shift.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Check if any entries have been saved (count > 0)
        const entryCount = shift.timecard_entries[0]?.count || 0;
        let statusBadge = '<span style="color: var(--text-muted);">Not Started</span>';
        if (entryCount > 0) {
            statusBadge = `<span style="color: var(--primary-color); font-weight:bold;">${entryCount} Entries Saved</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${shift.projects.name}</strong></td>
            <td>${shift.name} - ${shift.role}</td>
            <td>${date}</td>
            <td>${time}</td>
            <td>${statusBadge}</td>
            <td>
                <a href="/timesheet-entry.html?shift_id=${shift.id}" class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">Enter Times</a>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

loadTimesheetsList();