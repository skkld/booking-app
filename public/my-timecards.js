import { _supabase } from './auth.js';

async function loadMyShifts() {
    const tableBody = document.getElementById('shifts-list-container');
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    const { data: employee } = await _supabase.from('employees').select('id').eq('user_id', user.id).single();
    if (!employee) return;
    
    const { data: assignments } = await _supabase.from('assignments').select('shift_id, shifts(*, projects(name))').eq('employee_id', employee.id);
    const { data: entries } = await _supabase.from('timecard_entries').select('*').eq('employee_id', employee.id);

    tableBody.innerHTML = '';
    if (!assignments || assignments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No upcoming shifts.</td></tr>';
        return;
    }

    assignments.forEach(({ shifts }) => {
        if (!shifts) return;
        
        const row = document.createElement('tr');
        const shiftTime = new Date(shifts.start_time).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
        const entry = entries.find(e => e.shift_id === shifts.id);
        
        let status = 'Pending';
        let reimbInput = `<input type="number" class="reimb-input" placeholder="0.00" style="width: 80px;" disabled>`;
        let action = `<button class="btn btn-primary btn-clock-in" data-shift-id="${shifts.id}">Clock In</button>`;

        if (entry) {
            if (entry.status === 'clocked_in') {
                status = '<span style="color: var(--primary-color); font-weight: 600;">Clocked In</span>';
                // Active input for expense
                reimbInput = `<input type="number" class="reimb-input" id="reimb-${entry.id}" placeholder="0.00" style="width: 80px;">`;
                action = `<button class="btn btn-danger btn-clock-out" data-entry-id="${entry.id}">Clock Out</button>`;
            } else {
                status = 'Submitted';
                action = 'Complete';
                // Read-only display for expense
                reimbInput = `$${entry.reimbursement_amount || 0}`;
            }
        }
        
        row.innerHTML = `
            <td><strong>${shifts.projects.name}</strong> / ${shifts.name}</td>
            <td>${shiftTime}</td>
            <td>${status}</td>
            <td>${reimbInput}</td>
            <td>${action}</td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll('.btn-clock-in').forEach(btn => btn.addEventListener('click', handleClockIn));
    document.querySelectorAll('.btn-clock-out').forEach(btn => btn.addEventListener('click', handleClockOut));
}

async function handleClockIn(event) {
    const shiftId = event.target.dataset.shiftId;
    const { data: { user } } = await _supabase.auth.getUser();
    const { data: employee } = await _supabase.from('employees').select('id').eq('user_id', user.id).single();
    
    const { error } = await _supabase.from('timecard_entries').insert({
        shift_id: shiftId,
        employee_id: employee.id,
        clock_in: new Date().toISOString(),
        status: 'clocked_in'
    });
    if (error) alert(error.message); else loadMyShifts();
}

async function handleClockOut(event) {
    const entryId = event.target.dataset.entryId;
    // Get the value from the input box
    const reimbInput = document.getElementById(`reimb-${entryId}`);
    const reimbursement = reimbInput ? (parseFloat(reimbInput.value) || 0) : 0;
    
    const { data: entry } = await _supabase.from('timecard_entries').select('clock_in').eq('id', entryId).single();
    const totalHours = ((new Date() - new Date(entry.clock_in)) / 3600000).toFixed(2);
    
    const { error } = await _supabase.from('timecard_entries').update({
        clock_out: new Date().toISOString(),
        status: 'pending',
        total_hours: totalHours,
        reimbursement_amount: reimbursement // Save the expense
    }).eq('id', entryId);
    
    if (error) alert(error.message); else loadMyShifts();
}

loadMyShifts();