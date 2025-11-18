import { _supabase } from './auth.js';

async function loadOpenShifts() {
    const tableBody = document.getElementById('open-shifts-table-body');

    const { data: shifts, error } = await _supabase
        .from('shifts')
        .select(`*, projects(*), assignments(count)`)
        .order('start_time', { ascending: true });

    if (error) {
        console.error("Error fetching shifts:", error);
        tableBody.innerHTML = `<tr><td colspan="6">Error loading shifts. See console.</td></tr>`;
        return;
    }

    // Filter to find shifts that are not fully staffed
    const openShifts = shifts.filter(shift => {
        // **FIX: Check if the shift's project exists before proceeding**
        if (!shift.projects) {
            return false; // Skip this orphan shift
        }
        const assignedCount = shift.assignments[0]?.count || 0;
        return assignedCount < shift.people_needed;
    });

    if (openShifts.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6">There are no open shifts. All positions are filled.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    openShifts.forEach(shift => {
        const assignedCount = shift.assignments[0]?.count || 0;
        const needsCount = shift.people_needed - assignedCount;
        const startTime = new Date(shift.start_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${shift.projects.name}</td>
            <td><strong>${shift.name}</strong></td>
            <td>${shift.role}</td>
            <td>${startTime}</td>
            <td><span style="color: var(--danger); font-weight: 600;">${needsCount}</span></td>
            <td>
                <a href="/project-details.html?id=${shift.projects.id}" class="btn btn-secondary" style="padding: 0.5rem 1rem;">Go to Project</a>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

loadOpenShifts();