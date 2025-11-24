import { _supabase } from './auth.js';

async function loadTimesheetsList() {
    const tableBody = document.getElementById('timesheets-list-table');

    // 1. Fetch ALL shifts and their project info
    // We remove the !inner filter to ensure we get data back, then filter in JS
    const { data: shifts, error } = await _supabase
        .from('shifts')
        .select(`
            id, name, role, start_time, end_time,
            projects (id, name, status),
            timecard_entries (count)
        `)
        .order('start_time', { ascending: false });

    if (error) {
        console.error("Error fetching shifts:", error);
        tableBody.innerHTML = `<tr><td colspan="6">Error loading shifts. See console.</td></tr>`;
        return;
    }

    // 2. Filter for Active Projects Only
    // (This prevents shifts from deleted/completed projects from cluttering the list)
    const activeShifts = shifts.filter(shift => shift.projects && shift.projects.status === 'active');

    if (activeShifts.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6">No active shifts found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    activeShifts.forEach(shift => {
        const date = new Date(shift.start_time).toLocaleDateString();
        const time = new Date(shift.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Check if entries exist
        const entryCount = shift.timecard_entries[0]?.count || 0;
        
        let statusBadge = '<span style="color: var(--text-muted);">Not Started</span>';
        if (entryCount > 0) {
            statusBadge = `<span style="color: var(--primary-color); font-weight:bold;">${entryCount} Entries</span>`;
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