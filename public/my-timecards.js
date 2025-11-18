import { _supabase } from './auth.js';

// --- GLOBAL CACHE FOR RULES ---
let companyRules = null;
let unionRules = null;

// Helper to format date
const formatDateTimeLocal = (date) => { /* ... (same as before) ... */ };

// --- NEW: Function to load all payroll rules ---
async function loadPayrollRules() {
    const { data: cRules, error: cError } = await _supabase.from('payroll_rules').select('*').eq('id', 1).single();
    if (cError) console.error("Could not load company rules:", cError);
    else companyRules = cRules;

    const { data: uRules, error: uError } = await _supabase.from('union_payroll_rules').select('*').eq('id', 1).single();
    if (uError) console.error("Could not load union rules:", uError);
    else unionRules = uRules;
}

// Main function to load the logged-in user's shifts
async function loadMyShifts() {
    const tableBody = document.getElementById('shifts-list-container');
    
    // 1. Get user and employee profile
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) { /* ... (error handling) ... */ }
    const { data: employee, error: empError } = await _supabase.from('employees').select('id').eq('user_id', user.id).single();
    if (empError || !employee) { /* ... (error handling) ... */ }
    const employeeId = employee.id;

    // 3. Fetch all assigned shifts (and their project's union status)
    const { data: assignments, error: asgnError } = await _supabase
        .from('assignments')
        .select('shift_id, shifts(*, projects(name, is_union_project))') // Get project's union status
        .eq('employee_id', employeeId);
        
    if (asgnError) { /* ... (error handling) ... */ }
        
    // 4. Fetch their existing timecard entries
    const { data: entries } = await _supabase.from('timecard_entries').select('*').eq('employee_id', employeeId);

    tableBody.innerHTML = '';
    if (!assignments || assignments.length === 0) { /* ... (error handling) ... */ }

    // 5. Display each shift with the correct button
    assignments.forEach(({ shifts }) => {
        if (!shifts || !shifts.projects) return; // Skip if shift or project was deleted
        
        const row = document.createElement('tr');
        const shiftTime = new Date(shifts.start_time).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });

        const entry = entries.find(e => e.shift_id === shifts.id);
        let status = 'Pending';
        // **Pass project info to clock-in button**
        let action = `<button class="btn btn-primary btn-clock-in" data-shift-id="${shifts.id}" data-is-union="${shifts.projects.is_union_project}" style="padding: 0.5rem 1rem;">Clock In</button>`;

        if (entry) {
            if (entry.status === 'pending') { /* ... */ }
            else if (entry.status === 'approved') { /* ... */ }
            else if (entry.status === 'rejected') { /* ... */ }
            else if (entry.status === 'clocked_in') {
                status = '<span style="color: var(--primary-color); font-weight: 600;">Clocked In</span>';
                // **Pass project info and entry id to clock-out button**
                action = `<button class="btn btn-danger btn-clock-out" data-entry-id="${entry.id}" data-is-union="${shifts.projects.is_union_project}" style="padding: 0.5rem 1rem;">Clock Out</button>`;
            }
        }
        
        row.innerHTML = `
            <td><strong>${shifts.projects.name}</strong> / ${shifts.name} (${shifts.role})</td>
            <td>${shiftTime}</td>
            <td>${status}</td>
            <td>${action}</td>
        `;
        tableBody.appendChild(row);
    });

    // Add listeners
    document.querySelectorAll('.btn-clock-in').forEach(btn => btn.addEventListener('click', handleClockIn));
    document.querySelectorAll('.btn-clock-out').forEach(btn => btn.addEventListener('click', handleClockOut));
}

// --- CLOCK IN / CLOCK OUT FUNCTIONS (UPGRADED) ---

async function handleClockIn(event) {
    // This function is largely the same, but we've pre-fetched rules
    const shiftId = event.target.dataset.shiftId;
    const { data: { user } } = await _supabase.auth.getUser();
    const { data: employee } = await _supabase.from('employees').select('id').eq('user_id', user.id).single();
    
    const newEntry = {
        shift_id: shiftId,
        employee_id: employee.id,
        clock_in: new Date().toISOString(),
        status: 'clocked_in',
        break_duration_minutes: 0 // Default break
    };

    const { error } = await _supabase.from('timecard_entries').insert(newEntry);
    if (error) alert(`Error clocking in: ${error.message}`);
    else loadMyShifts();
}

async function handleClockOut(event) {
    const entryId = event.target.dataset.entryId;
    const isUnion = event.target.dataset.isUnion === 'true';
    const clockOutTime = new Date();
    
    // 1. Get the clock-in time
    const { data: entry, error: fetchError } = await _supabase.from('timecard_entries').select('clock_in').eq('id', entryId).single();
    if (fetchError) return alert('Error fetching timecard.');

    // 2. Determine which rules to use
    const rules = isUnion ? unionRules : companyRules;
    if (!rules) return alert("Error: Payroll rules not loaded.");

    // 3. Calculate gross duration and break
    const clockInTime = new Date(entry.clock_in);
    const grossTotalHours = (clockOutTime - clockInTime) / 3600000;
    let breakDurationMinutes = 0;

    // **NEW: Apply auto-break logic**
    if (grossTotalHours > rules.auto_break_threshold) {
        breakDurationMinutes = rules.auto_break_duration;
    }

    // 4. Calculate final net hours
    const netTotalHours = (grossTotalHours - (breakDurationMinutes / 60)).toFixed(2);
    
    const update = {
        clock_out: clockOutTime.toISOString(),
        status: 'pending',
        total_hours: netTotalHours, // Save the final, break-deducted hours
        break_duration_minutes: breakDurationMinutes
    };
    
    const { error } = await _supabase.from('timecard_entries').update(update).eq('id', entryId);
    if (error) {
        alert(`Error clocking out: ${error.message}`);
    } else {
        alert(`Clocked out. A ${breakDurationMinutes} min break was applied. Timecard submitted for approval.`);
        loadMyShifts();
    }
}

// Initial Load
loadPayrollRules().then(loadMyShifts);