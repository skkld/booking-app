import { _supabase } from './auth.js';

let currentShift = null;
let currentProject = null;
let companyRules = null;
let unionRules = null;

const formatDateTimeLocal = (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
};

async function loadTimeSheet() {
    const urlParams = new URLSearchParams(window.location.search);
    const shiftId = urlParams.get('shift_id');
    
    if (!shiftId) {
        document.body.innerHTML = '<h1>No Shift ID provided.</h1>';
        return;
    }

    const { data: shift, error } = await _supabase
        .from('shifts')
        .select(`*, projects(*), assignments(*, employees(*))`)
        .eq('id', shiftId)
        .single();
    
    if (error || !shift) return document.body.innerHTML = '<h1>Could not load shift data.</h1>';
    currentShift = shift;
    currentProject = shift.projects;

    const [cRes, uRes] = await Promise.all([
        _supabase.from('payroll_rules').select('*').eq('id', 1).single(),
        _supabase.from('union_payroll_rules').select('*').eq('id', 1).single()
    ]);
    companyRules = cRes.data;
    unionRules = uRes.data;
    
    document.getElementById('project-name').textContent = shift.projects.name;
    document.getElementById('shift-name-role').textContent = `${shift.name} - ${shift.role}`;
    const cancelButton = document.getElementById('cancel-btn');
    if (cancelButton) cancelButton.href = `/project-details.html?id=${shift.projects.id}`;

    const tableBody = document.getElementById('crew-time-entry-list');
    tableBody.innerHTML = '';

    if (!shift.assignments || shift.assignments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No crew assigned to this shift.</td></tr>';
        return;
    }

    const { data: existingEntries } = await _supabase.from('timecard_entries').select('*').eq('shift_id', shiftId);

    shift.assignments.forEach(assignment => {
        const row = document.createElement('tr');
        row.dataset.employeeId = assignment.employees.id;
        
        const existing = existingEntries ? existingEntries.find(e => e.employee_id === assignment.employees.id) : null;
        const startValue = existing ? formatDateTimeLocal(new Date(existing.clock_in)) : "";
        const endValue = existing && existing.clock_out ? formatDateTimeLocal(new Date(existing.clock_out)) : "";
        const reimbValue = existing ? (existing.reimbursement_amount || "") : "";

        row.innerHTML = `
            <td><strong>${assignment.employees.full_name}</strong></td>
            <td>
                <div class="time-input-group">
                    <input type="datetime-local" class="clock-in-input" value="${startValue}">
                    <button type="button" class="btn btn-sm btn-clock-in set-now-btn" data-target="in">Clock In</button>
                </div>
            </td>
            <td>
                <div class="time-input-group">
                    <input type="datetime-local" class="clock-out-input" value="${endValue}">
                    <button type="button" class="btn btn-sm btn-clock-out set-now-btn" data-target="out">Clock Out</button>
                </div>
            </td>
            <td><input type="number" class="reimb-input" step="0.01" placeholder="0.00" value="${reimbValue}" style="width: 80px;"></td>
            <td class="breakdown-cell" style="font-size: 0.85rem; color: var(--text-muted);">-</td>
        `;
        tableBody.appendChild(row);

        const startInput = row.querySelector('.clock-in-input');
        const endInput = row.querySelector('.clock-out-input');
        const breakdownCell = row.querySelector('.breakdown-cell');
        
        row.querySelector('.set-now-btn[data-target="in"]').addEventListener('click', () => {
            startInput.value = formatDateTimeLocal(new Date());
            startInput.dispatchEvent(new Event('input'));
        });

        row.querySelector('.set-now-btn[data-target="out"]').addEventListener('click', () => {
            endInput.value = formatDateTimeLocal(new Date());
            endInput.dispatchEvent(new Event('input'));
        });

        const updateCalc = () => {
            if (startInput.value && endInput.value) {
                const breakdown = calculateBreakdown(startInput.value, endInput.value);
                breakdownCell.innerHTML = breakdown;
            } else {
                breakdownCell.textContent = "-";
            }
        };
        startInput.addEventListener('input', updateCalc);
        endInput.addEventListener('input', updateCalc);

        if (startValue && endValue) updateCalc();
    });
}

function calculateBreakdown(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (end <= start) return '<span style="color: var(--status-red-text);">Invalid Time</span>';

    const rules = currentProject.is_union_project ? unionRules : companyRules;
    if (!rules) return "Rules Error";

    const grossHours = (end - start) / 3600000;
    let breakDed = 0;
    if (rules.auto_break_threshold && grossHours > rules.auto_break_threshold) {
        breakDed = (rules.auto_break_duration || 0) / 60;
    }
    const netHours = Math.max(0, grossHours - breakDed);
    
    let reg = 0, ot = 0;
    const isSunday = start.getDay() === 0;
    
    if (rules.calculate_sundays_as_ot && isSunday) {
        ot = netHours;
    } else if (netHours > rules.daily_overtime_threshold) {
        reg = rules.daily_overtime_threshold;
        ot = netHours - rules.daily_overtime_threshold;
    } else {
        reg = netHours;
    }

    let display = `<span style="color: var(--text-main); font-weight:bold;">${netHours.toFixed(2)} hrs</span>`;
    if (ot > 0) display += `<br><span style="color: var(--status-yellow-text); font-size: 0.8rem;">${reg.toFixed(2)} Reg / ${ot.toFixed(2)} OT</span>`;
    else display += `<br><span style="color: var(--status-green-text); font-size: 0.8rem;">Straight Time</span>`;
    
    if (breakDed > 0) display += `<br><span style="color: var(--text-muted); font-size: 0.7rem;">(Includes ${rules.auto_break_duration}m break)</span>`;

    return display;
}

document.getElementById('fill-all-btn').addEventListener('click', () => {
    if (!currentShift) return;
    const scheduledStart = formatDateTimeLocal(new Date(currentShift.start_time));
    const scheduledEnd = formatDateTimeLocal(new Date(currentShift.end_time));
    document.querySelectorAll('.clock-in-input').forEach(input => { if (!input.value) { input.value = scheduledStart; input.dispatchEvent(new Event('input')); } });
    document.querySelectorAll('.clock-out-input').forEach(input => { if (!input.value) { input.value = scheduledEnd; input.dispatchEvent(new Event('input')); } });
});

document.getElementById('time-entry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentShift) return;

    const timecardEntries = [];
    const rows = document.querySelectorAll('#crew-time-entry-list tr');
    const rules = currentProject.is_union_project ? unionRules : companyRules;

    for (const row of rows) {
        const employeeId = row.dataset.employeeId;
        const clockIn = row.querySelector('.clock-in-input').value;
        const clockOut = row.querySelector('.clock-out-input').value;
        const reimbAmount = parseFloat(row.querySelector('.reimb-input').value) || 0;

        if (employeeId && clockIn && clockOut) {
            const start = new Date(clockIn);
            const end = new Date(clockOut);
            const grossHours = (end - start) / 3600000;
            let breakDed = 0;
            if (grossHours > rules.auto_break_threshold) { breakDed = rules.auto_break_duration; }
            const netHours = grossHours - (breakDed / 60);

            timecardEntries.push({
                shift_id: currentShift.id, employee_id: employeeId,
                clock_in: start.toISOString(), clock_out: end.toISOString(),
                total_hours: netHours.toFixed(2), break_duration_minutes: breakDed,
                reimbursement_amount: reimbAmount, status: 'pending'
            });
        }
    }

    if (timecardEntries.length === 0) return alert('No valid time entries to save.');
    
    try {
        const employeeIds = timecardEntries.map(e => e.employee_id);
        const { error: deleteError } = await _supabase.from('timecard_entries').delete().eq('shift_id', currentShift.id).in('employee_id', employeeIds);
        if (deleteError) throw deleteError;
        const { error: insertError } = await _supabase.from('timecard_entries').insert(timecardEntries);
        if (insertError) throw insertError;

        alert('All time entries saved successfully!');
        window.location.href = `/project-details.html?id=${currentShift.projects.id}`;
    } catch (error) { console.error("Error saving:", error); alert(`Error: ${error.message}`); }
});

loadTimeSheet();