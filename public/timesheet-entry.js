import { _supabase } from './auth.js';

let currentShift = null;
let currentProject = null;
let companyRules = null;
let unionRules = null;
let existingEntries = []; // Cache for existing timecards

const formatDateTimeLocal = (date) => {
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
};

async function loadTimeSheet() {
    const urlParams = new URLSearchParams(window.location.search);
    const shiftId = urlParams.get('shift_id');
    if (!shiftId) return document.body.innerHTML = '<h1>No Shift ID provided.</h1>';

    // 1. Fetch Shift & Project
    const { data: shift, error } = await _supabase
        .from('shifts')
        .select(`*, projects(*), assignments(*, employees(*))`)
        .eq('id', shiftId)
        .single();
    
    if (error || !shift) return document.body.innerHTML = '<h1>Could not load shift.</h1>';
    currentShift = shift;
    currentProject = shift.projects;

    // 2. Fetch Rules
    const [cRes, uRes] = await Promise.all([
        _supabase.from('payroll_rules').select('*').eq('id', 1).single(),
        _supabase.from('union_payroll_rules').select('*').eq('id', 1).single()
    ]);
    companyRules = cRes.data;
    unionRules = uRes.data;

    // 3. Fetch EXISTING timecards for this shift
    const { data: timecards } = await _supabase
        .from('timecard_entries')
        .select('*')
        .eq('shift_id', shiftId);
    existingEntries = timecards || [];
    
    // 4. Headers
    document.getElementById('project-name').textContent = shift.projects.name;
    document.getElementById('shift-name-role').textContent = `${shift.name} - ${shift.role}`;
    const cancelButton = document.getElementById('cancel-btn');
    if (cancelButton) cancelButton.href = `/project-details.html?id=${shift.projects.id}`;

    // 5. Populate Table
    const tableBody = document.getElementById('crew-time-entry-list');
    tableBody.innerHTML = '';

    if (shift.assignments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No crew assigned to this shift.</td></tr>';
        return;
    }

    shift.assignments.forEach(assignment => {
        const row = document.createElement('tr');
        row.dataset.employeeId = assignment.employees.id;
        
        // Check if this employee has a timecard already
        const entry = existingEntries.find(e => e.employee_id === assignment.employees.id);
        
        let startVal = "", endVal = "", reimbVal = "0";
        
        if (entry) {
            if (entry.clock_in) startVal = formatDateTimeLocal(new Date(entry.clock_in));
            if (entry.clock_out) endVal = formatDateTimeLocal(new Date(entry.clock_out));
            reimbVal = entry.reimbursement_amount || 0;
        }

        row.innerHTML = `
            <td><strong>${assignment.employees.full_name}</strong></td>
            <td><input type="datetime-local" class="clock-in-input" value="${startVal}"></td>
            <td><input type="datetime-local" class="clock-out-input" value="${endVal}"></td>
            <td><input type="number" class="reimb-input" step="0.01" value="${reimbVal}" style="width: 80px;"></td>
            <td class="breakdown-cell" style="font-size: 0.85rem; color: var(--text-muted);">-</td>
        `;
        tableBody.appendChild(row);

        // Trigger calculation if data exists
        const startInput = row.querySelector('.clock-in-input');
        const endInput = row.querySelector('.clock-out-input');
        const breakdownCell = row.querySelector('.breakdown-cell');

        const updateCalc = () => {
            if (startInput.value && endInput.value) {
                breakdownCell.innerHTML = calculateBreakdown(startInput.value, endInput.value);
            } else {
                breakdownCell.textContent = "-";
            }
        };

        startInput.addEventListener('input', updateCalc);
        endInput.addEventListener('input', updateCalc);
        
        if(entry) updateCalc(); // Run immediately if data pre-filled
    });
}

function calculateBreakdown(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (end <= start) return '<span style="color: var(--status-red-text);">Invalid Time</span>';

    const rules = currentProject.is_union_project ? unionRules : companyRules;
    const grossHours = (end - start) / 3600000;
    let breakDed = 0;

    if (rules && grossHours > rules.auto_break_threshold) { breakDed = rules.auto_break_duration / 60; }
    const netHours = Math.max(0, grossHours - breakDed);
    
    let reg = 0, ot = 0;
    const isSunday = start.getDay() === 0;
    
    if (rules && rules.calculate_sundays_as_ot && isSunday) {
        ot = netHours;
    } else if (rules && netHours > rules.daily_overtime_threshold) {
        reg = rules.daily_overtime_threshold;
        ot = netHours - rules.daily_overtime_threshold;
    } else {
        reg = netHours;
    }

    let display = `<span style="color: var(--text-main); font-weight:bold;">${netHours.toFixed(2)} hrs</span>`;
    if (ot > 0) {
        display += `<br><span style="color: var(--status-yellow-text); font-size: 0.8rem;">${reg.toFixed(2)} Reg / ${ot.toFixed(2)} OT</span>`;
    } else {
        display += `<br><span style="color: var(--status-green-text); font-size: 0.8rem;">Straight Time</span>`;
    }
    if (breakDed > 0) {
        display += `<br><span style="color: var(--text-muted); font-size: 0.7rem;">(Includes Auto-Break)</span>`;
    }
    return display;
}

// Fill All Logic
document.getElementById('fill-all-btn').addEventListener('click', () => {
    if (!currentShift) return;
    const sStart = formatDateTimeLocal(new Date(currentShift.start_time));
    const sEnd = formatDateTimeLocal(new Date(currentShift.end_time));
    document.querySelectorAll('.clock-in-input').forEach(i => { if(!i.value) i.value = sStart; i.dispatchEvent(new Event('input')); });
    document.querySelectorAll('.clock-out-input').forEach(i => { if(!i.value) i.value = sEnd; i.dispatchEvent(new Event('input')); });
});

// Save (Upsert) Logic
document.getElementById('time-entry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentShift) return;
    
    const rows = document.querySelectorAll('#crew-time-entry-list tr');
    const rules = currentProject.is_union_project ? unionRules : companyRules;

    for (const row of rows) {
        const empId = row.dataset.employeeId;
        const cin = row.querySelector('.clock-in-input').value;
        const cout = row.querySelector('.clock-out-input').value;
        const reimb = parseFloat(row.querySelector('.reimb-input').value) || 0;

        if (empId && cin && cout) {
            const start = new Date(cin);
            const end = new Date(cout);
            const gross = (end - start) / 3600000;
            let ded = 0;
            if (rules && gross > rules.auto_break_threshold) ded = rules.auto_break_duration;
            const net = gross - (ded/60);

            // Note: We don't calculate $$ here, that happens on approval page load
            // We check if entry exists to get ID for update
            const existing = existingEntries.find(e => e.employee_id == empId);
            
            const entryData = {
                shift_id: currentShift.id, 
                employee_id: empId,
                clock_in: start.toISOString(), 
                clock_out: end.toISOString(),
                status: 'pending', 
                total_hours: net.toFixed(2), 
                reimbursement_amount: reimb, 
                break_duration_minutes: ded
            };

            if (existing) {
                await _supabase.from('timecard_entries').update(entryData).eq('id', existing.id);
            } else {
                await _supabase.from('timecard_entries').insert([entryData]);
            }
        }
    }
    alert('Saved!');
    window.location.href = `/project-details.html?id=${currentShift.projects.id}`;
});

loadTimeSheet();