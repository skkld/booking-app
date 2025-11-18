import { _supabase } from './auth.js';

// --- GLOBAL CACHE FOR RULES ---
let companyRules = null;
let unionRules = null;
let allProjects = null;

// --- PAYROLL CALCULATION ENGINE ---
function calculatePayroll(clockInStr, clockOutStr, rules, isSunday) {
    const clockIn = new Date(clockInStr);
    const clockOut = new Date(clockOutStr);

    let regular = 0;
    let overtime = 0;
    let night = 0;
    const totalHours = (clockOut - clockIn) / 3600000;

    // Apply auto-break
    let breakDurationMinutes = 0;
    if (totalHours > rules.auto_break_threshold) {
        breakDurationMinutes = rules.auto_break_duration;
    }
    const netTotalHours = totalHours - (breakDurationMinutes / 60);

    // Rule 1: Sunday OT (if applicable)
    if (rules.calculate_sundays_as_ot && isSunday) {
        overtime = netTotalHours;
    } 
    // Rule 2: Daily Overtime
    else if (netTotalHours > rules.daily_overtime_threshold) {
        regular = rules.daily_overtime_threshold;
        overtime = netTotalHours - rules.daily_overtime_threshold;
    } else {
        regular = netTotalHours;
    }

    // Rule 3: Night Premium
    night = calculateNightPremium(clockIn, clockOut, rules);

    return { regular: regular.toFixed(2), overtime: overtime.toFixed(2), night: night.toFixed(2), totalHours: netTotalHours.toFixed(2) };
}

function calculateNightPremium(clockIn, clockOut, rules) {
    const [nightStartHour, nightStartMin] = rules.night_premium_start.split(':').map(Number);
    const [nightEndHour, nightEndMin] = rules.night_premium_end.split(':').map(Number);
    
    const nightStart = new Date(clockIn);
    nightStart.setHours(nightStartHour, nightStartMin, 0, 0);
    const nightEnd = new Date(clockIn);
    nightEnd.setHours(nightEndHour, nightEndMin, 0, 0);

    // This is a simplified calculation
    if (clockIn.getHours() >= nightStart.getHours() || clockIn.getHours() < nightEnd.getHours()) {
        return (clockOut - clockIn) / 3600000;
    }
    return 0;
}

// --- MAIN DISPLAY FUNCTION ---
async function loadTimecards() {
    if (!companyRules) {
        const { data: rules } = await _supabase.from('payroll_rules').select('*').eq('id', 1).single();
        companyRules = rules;
    }
    if (!unionRules) {
        const { data: rules } = await _supabase.from('union_payroll_rules').select('*').eq('id', 1).single();
        unionRules = rules;
    }
    if (!allProjects) {
        const { data: projects } = await _supabase.from('projects').select('id, is_union_project');
        allProjects = projects;
    }

    const tableBody = document.getElementById('timecard-list-table');
    const { data: entries, error } = await _supabase
        .from('timecard_entries')
        .select(`*, employees(full_name), shifts(*, projects(name, id))`)
        .eq('status', 'pending')
        .order('clock_in', { ascending: false });

    if (error) { tableBody.innerHTML = `<tr><td colspan="9">Error loading timecards.</td></tr>`; return; }
    
    document.getElementById('pending-count').textContent = entries.length;
    if (entries.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9">No pending timecards awaiting approval.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    entries.forEach(entry => {
        if (!entry.shifts || !entry.shifts.projects || !entry.employees) return;

        const project = allProjects.find(p => p.id === entry.shifts.projects.id);
        const rules = project?.is_union_project ? unionRules : companyRules;
        const isSunday = new Date(entry.clock_in).getDay() === 0;

        const payroll = calculatePayroll(entry.clock_in, entry.clock_out, rules, isSunday);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${entry.employees.full_name}</strong></td>
            <td>${entry.shifts.projects.name} / ${entry.shifts.name}</td>
            <td>${new Date(entry.clock_in).toLocaleString([], { timeStyle: 'short' })} - ${new Date(entry.clock_out).toLocaleString([], { timeStyle: 'short' })}</td>
            <td>${payroll.regular}</td>
            <td>${payroll.overtime}</td>
            <td>${payroll.night}</td>
            <td><strong>${payroll.totalHours}</strong></td>
            <td><span style="color: var(--warning); font-weight: 600;">Pending</span></td>
            <td>
                <button class="btn btn-primary btn-approve" data-id="${entry.id}" data-reg="${payroll.regular}" data-ot="${payroll.overtime}" data-night="${payroll.night}" style="padding: 0.5rem 1rem;">Approve</button>
                <button class="btn btn-danger btn-reject" data-id="${entry.id}" style="padding: 0.5rem 1rem;">Reject</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    document.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', handleApprove));
    document.querySelectorAll('.btn-reject').forEach(btn => btn.addEventListener('click', showRejectionModal));
}

// --- APPROVAL AND REJECTION HANDLERS ---
async function handleApprove(event) {
    const id = event.target.dataset.id;
    const updateData = {
        status: 'approved',
        regular_hours: parseFloat(event.target.dataset.reg),
        ot_hours: parseFloat(event.target.dataset.ot),
        night_premium_hours: parseFloat(event.target.dataset.night)
    };
    const { error } = await _supabase.from('timecard_entries').update(updateData).eq('id', id);
    if (error) { alert(`Failed to approve timecard: ${error.message}`); } else {
        alert(`Timecard approved successfully.`);
        loadTimecards();
    }
}
function showRejectionModal(event) {
    document.getElementById('reject-entry-id').value = event.target.dataset.id;
    document.getElementById('rejection-modal').style.display = 'flex';
}
function handleRejectionSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('reject-entry-id').value;
    const notes = document.getElementById('reject-notes').value;
    if (!notes) return alert("Please provide a reason for rejection.");
    updateTimecardStatus(id, 'rejected', notes);
}
async function updateTimecardStatus(id, status, notes = null) {
    const updateData = { status: status };
    if (notes) updateData.manager_notes = notes;
    const { error } = await _supabase.from('timecard_entries').update(updateData).eq('id', id);
    if (error) { alert(`Failed to update timecard status: ${error.message}`); } else {
        alert(`Timecard ${status} successfully.`);
        document.getElementById('rejection-modal').style.display = 'none';
        document.getElementById('rejection-form').reset();
        loadTimecards();
    }
}

// --- MANUAL TIME ENTRY LOGIC ---
let allShifts = [], allAssignments = [], allEmployees = [];
async function showManualEntryModal() {
    const [projectsRes, shiftsRes, assignmentsRes, employeesRes] = await Promise.all([
        _supabase.from('projects').select('id, name, is_union_project'),
        _supabase.from('shifts').select('id, name, role, project_id'),
        _supabase.from('assignments').select('shift_id, employee_id'),
        _supabase.from('employees').select('id, full_name')
    ]);
    allProjects = projectsRes.data || [];
    allShifts = shiftsRes.data || [];
    allAssignments = assignmentsRes.data || [];
    allEmployees = employeesRes.data || [];
    const projectSelect = document.getElementById('project-select');
    projectSelect.innerHTML = '<option value="">Select a Project</option>';
    allProjects.forEach(p => { projectSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`; });
    document.getElementById('shift-select').innerHTML = '<option value="">Select a Project First</option>';
    document.getElementById('employee-select').innerHTML = '<option value="">Select a Shift First</option>';
    document.getElementById('manual-entry-modal').style.display = 'flex';
}
function populateShifts(projectId) {
    const shiftSelect = document.getElementById('shift-select');
    shiftSelect.innerHTML = '<option value="">Select a Shift</option>';
    const shiftsForProject = allShifts.filter(s => s.project_id == projectId);
    shiftsForProject.forEach(s => { shiftSelect.innerHTML += `<option value="${s.id}">${s.name} - ${s.role}</option>`; });
}
function populateEmployees(shiftId) {
    const employeeSelect = document.getElementById('employee-select');
    employeeSelect.innerHTML = '<option value="">Select an Employee</option>';
    const assignedEmployeeIds = allAssignments.filter(a => a.shift_id == shiftId).map(a => a.employee_id);
    const assignedEmployees = allEmployees.filter(e => assignedEmployeeIds.includes(e.id));
    assignedEmployees.forEach(e => { employeeSelect.innerHTML += `<option value="${e.id}">${e.full_name}</option>`; });
}
async function handleManualEntrySubmit(event) {
    event.preventDefault();
    const form = event.target;
    const shiftId = form.elements['shift-select'].value;
    const employeeId = form.elements['employee-select'].value;
    
    const shift = allShifts.find(s => s.id == shiftId);
    const project = allProjects.find(p => p.id == shift.project_id);
    const rules = project?.is_union_project ? unionRules : companyRules;
    
    const clockIn = form.elements['clock-in'].value;
    const clockOut = form.elements['clock-out'].value;
    const isSunday = new Date(clockIn).getDay() === 0;

    const payroll = calculatePayroll(clockIn, clockOut, rules, isSunday);

    const newEntry = {
        shift_id: shiftId,
        employee_id: employeeId,
        clock_in: new Date(clockIn).toISOString(),
        clock_out: new Date(clockOut).toISOString(),
        status: 'pending',
        total_hours: payroll.totalHours,
        break_duration_minutes: (totalHours - payroll.totalHours) * 60
    };
    const { error } = await _supabase.from('timecard_entries').insert([newEntry]);
    if (error) {
        alert(`Failed to submit timecard: ${error.message}`);
    } else {
        alert('Timecard submitted for approval!');
        document.getElementById('manual-entry-modal').style.display = 'none';
        form.reset();
        loadTimecards();
    }
}

// --- INITIALIZE ALL LISTENERS ---
document.getElementById('reject-modal-close').onclick = () => { document.getElementById('rejection-modal').style.display = 'none'; };
document.getElementById('rejection-form').addEventListener('submit', handleRejectionSubmit);
document.getElementById('manual-entry-btn').addEventListener('click', showManualEntryModal);
document.getElementById('manual-entry-close').onclick = () => { document.getElementById('manual-entry-modal').style.display = 'none'; };
document.getElementById('manual-entry-form').addEventListener('submit', handleManualEntrySubmit);
document.getElementById('project-select').addEventListener('change', (e) => populateShifts(e.target.value));
document.getElementById('shift-select').addEventListener('change', (e) => populateEmployees(e.target.value));

loadTimecards();