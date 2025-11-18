const supabaseUrl = 'https://dblgrrusqxkdwgzyagtg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibGdycnVzcXhrZHdnenlhZ3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NDYzNTcsImV4cCI6MjA3NzAyMjM1N30.Au4AyxrxE0HzLqYWfMcUePMesbZTrfoIFF3Cp0RloWI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentShift = null;

// Helper to format date for datetime-local
const formatDateTimeLocal = (date) => {
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
};

async function loadTimeSheet() {
    const urlParams = new URLSearchParams(window.location.search);
    const shiftId = urlParams.get('shift_id');
    if (!shiftId) return document.body.innerHTML = '<h1>No Shift ID provided.</h1>';

    const { data: shift, error } = await _supabase
        .from('shifts')
        .select(`*, projects(*), assignments(*, employees(*))`)
        .eq('id', shiftId)
        .single();
    
    if (error || !shift) return document.body.innerHTML = '<h1>Could not load shift data.</h1>';
    
    currentShift = shift;
    
    // Populate headers
    document.getElementById('project-name').textContent = shift.projects.name;
    document.getElementById('shift-name-role').textContent = `${shift.name} - ${shift.role}`;

    // **NEW: Set the href for the Cancel button**
    const cancelButton = document.getElementById('cancel-btn');
    if (cancelButton) {
        cancelButton.href = `/project-details.html?id=${shift.projects.id}`;
    }

    // Populate table
    const tableBody = document.getElementById('crew-time-entry-list');
    tableBody.innerHTML = '';

    if (shift.assignments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3">No crew assigned to this shift.</td></tr>';
        return;
    }

    shift.assignments.forEach(assignment => {
        const row = document.createElement('tr');
        row.dataset.employeeId = assignment.employees.id;
        row.innerHTML = `
            <td><strong>${assignment.employees.full_name}</strong></td>
            <td><input type="datetime-local" class="clock-in-input"></td>
            <td><input type="datetime-local" class="clock-out-input"></td>
        `;
        tableBody.appendChild(row);
    });
}

// "Fill All" button functionality
document.getElementById('fill-all-btn').addEventListener('click', () => {
    if (!currentShift) return;
    
    const scheduledStart = formatDateTimeLocal(new Date(currentShift.start_time));
    const scheduledEnd = formatDateTimeLocal(new Date(currentShift.end_time));

    document.querySelectorAll('.clock-in-input').forEach(input => input.value = scheduledStart);
    document.querySelectorAll('.clock-out-input').forEach(input => input.value = scheduledEnd);
});

// Form submission functionality
document.getElementById('time-entry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentShift) return;

    const timecardEntries = [];
    const rows = document.querySelectorAll('#crew-time-entry-list tr');

    for (const row of rows) {
        const employeeId = row.dataset.employeeId;
        const clockIn = row.querySelector('.clock-in-input').value;
        const clockOut = row.querySelector('.clock-out-input').value;

        if (employeeId && clockIn && clockOut) {
            const totalHours = ((new Date(clockOut) - new Date(clockIn)) / 3600000).toFixed(2);
            timecardEntries.push({
                shift_id: currentShift.id,
                employee_id: employeeId,
                clock_in: new Date(clockIn).toISOString(),
                clock_out: new Date(clockOut).toISOString(),
                total_hours: totalHours,
                status: 'pending'
            });
        }
    }

    if (timecardEntries.length === 0) {
        return alert('No time entries to save.');
    }

    const { error } = await _supabase.from('timecard_entries').insert(timecardEntries);

    if (error) {
        alert(`Error saving time entries: ${error.message}`);
    } else {
        alert('All time entries saved successfully!');
        window.location.href = `/project-details.html?id=${currentShift.projects.id}`;
    }
});

loadTimeSheet();