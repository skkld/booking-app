import { _supabase } from './auth.js';

let companyRules = null;
let unionRules = null;
let allProjects = [];

// --- PAYROLL CALCULATION ENGINE ---
function calculatePayroll(clockInStr, clockOutStr, rules, isSunday, rate, reimbursement) {
    const clockIn = new Date(clockInStr);
    const clockOut = new Date(clockOutStr);
    let regular = 0, overtime = 0, night = 0;
    const totalHours = (clockOut - clockIn) / 3600000;

    // Apply Auto-Break
    let breakDurationMinutes = 0;
    if (rules && totalHours > rules.auto_break_threshold) { 
        breakDurationMinutes = rules.auto_break_duration; 
    }
    const netHours = Math.max(0, totalHours - (breakDurationMinutes / 60));

    // Apply OT Rules
    if (rules) {
        if (rules.calculate_sundays_as_ot && isSunday) { 
            overtime = netHours; 
        } else if (netHours > rules.daily_overtime_threshold) {
            regular = rules.daily_overtime_threshold;
            overtime = netHours - rules.daily_overtime_threshold;
        } else { 
            regular = netHours; 
        }
    } else {
        regular = netHours; // Fallback
    }

    // CALCULATE TOTAL PAY ($)
    // Ensure inputs are numbers. Default reimbursement to 0 if null.
    const numRate = parseFloat(rate) || 0;
    const numReimb = parseFloat(reimbursement) || 0;
    
    const basePay = (regular * numRate) + (overtime * numRate * 1.5);
    const totalPay = basePay + numReimb;

    return { 
        regular: regular.toFixed(2), 
        overtime: overtime.toFixed(2), 
        totalHours: netHours.toFixed(2),
        totalPay: totalPay.toFixed(2)
    };
}

// --- MAIN DISPLAY FUNCTION ---
async function loadTimecards() {
    // 1. Fetch Rules
    if (!companyRules) { const { data } = await _supabase.from('payroll_rules').select('*').eq('id', 1).single(); companyRules = data; }
    if (!unionRules) { const { data } = await _supabase.from('union_payroll_rules').select('*').eq('id', 1).single(); unionRules = data; }
    if (allProjects.length === 0) { const { data } = await _supabase.from('projects').select('id, is_union_project'); allProjects = data || []; }

    const tableBody = document.getElementById('timecard-list-table');
    // Fetch timecards with employee rates
    const { data: entries, error } = await _supabase
        .from('timecard_entries')
        .select(`*, employees(full_name, rate), shifts(*, projects(name, id))`)
        .eq('status', 'pending')
        .order('clock_in', { ascending: false });

    if (error) { 
        console.error(error); 
        tableBody.innerHTML = `<tr><td colspan="9">Error loading timecards.</td></tr>`; 
        return; 
    }
    
    document.getElementById('pending-count').textContent = entries.length;
    if (entries.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9">No pending timecards.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    entries.forEach(entry => {
        if (!entry.shifts || !entry.shifts.projects) return;
        
        const project = allProjects.find(p => p.id === entry.shifts.projects.id);
        const rules = project?.is_union_project ? unionRules : companyRules;
        const isSunday = new Date(entry.clock_in).getDay() === 0;
        
        const rate = entry.employees?.rate || 0;
        const reimb = entry.reimbursement_amount || 0;

        const payroll = calculatePayroll(entry.clock_in, entry.clock_out, rules, isSunday, rate, reimb);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${entry.employees.full_name}</strong><div style="font-size:0.8em; color:#aaa;">Rate: $${rate}</div></td>
            <td>${entry.shifts.name}</td>
            <td>${new Date(entry.clock_in).toLocaleTimeString([], {timeStyle:'short'})} - ${new Date(entry.clock_out).toLocaleTimeString([], {timeStyle:'short'})}</td>
            <td>${payroll.regular}</td>
            <td>${payroll.overtime}</td>
            <td>$${reimb.toFixed(2)}</td>
            <td style="color: var(--primary-color); font-weight: bold;">$${payroll.totalPay}</td>
            <td><span style="color: var(--status-yellow-text);">Pending</span></td>
            <td>
                <button class="btn btn-primary btn-approve" data-id="${entry.id}" data-total="${payroll.totalPay}">Approve</button>
                <button class="btn btn-danger btn-reject" data-id="${entry.id}">Reject</button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const total = e.target.dataset.total;
            await _supabase.from('timecard_entries').update({ status: 'approved', total_pay: total }).eq('id', id);
            loadTimecards();
        });
    });
    
    document.querySelectorAll('.btn-reject').forEach(btn => btn.addEventListener('click', showRejectionModal));
}

// ... (Include showRejectionModal, showManualEntryModal, etc. below as standard)
function showRejectionModal(event) {
    document.getElementById('reject-entry-id').value = event.target.dataset.id;
    document.getElementById('rejection-modal').style.display = 'flex';
}
document.getElementById('rejection-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('reject-entry-id').value;
    const notes = document.getElementById('reject-notes').value;
    if (!notes) return alert("Reason required.");
    await _supabase.from('timecard_entries').update({ status: 'rejected', manager_notes: notes }).eq('id', id);
    document.getElementById('rejection-modal').style.display = 'none';
    document.getElementById('rejection-form').reset();
    loadTimecards();
});
document.getElementById('reject-modal-close').onclick = () => { document.getElementById('rejection-modal').style.display = 'none'; };

// Manual Entry
async function showManualEntryModal() {
    const [projectsRes, shiftsRes, assignmentsRes, employeesRes] = await Promise.all([
        _supabase.from('projects').select('id, name, is_union_project').order('name'),
        _supabase.from('shifts').select('id, name, role, project_id'),
        _supabase.from('assignments').select('shift_id, employee_id'),
        _supabase.from('employees').select('id, full_name, rate')
    ]);
    // ... (Assign results to globals) ...
    const allProjectsLocal = projectsRes.data || [];
    const allShiftsLocal = shiftsRes.data || [];
    const allAssignmentsLocal = assignmentsRes.data || [];
    const allEmployeesLocal = employeesRes.data || [];
    
    // Store in globals for helper functions
    allProjects = allProjectsLocal;
    allShifts = allShiftsLocal;
    allAssignments = allAssignmentsLocal;
    allEmployees = allEmployeesLocal;

    const projectSelect = document.getElementById('project-select');
    projectSelect.innerHTML = '<option value="">Select a Project</option>';
    allProjectsLocal.forEach(p => { projectSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`; });
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
    const reimbAmount = parseFloat(document.getElementById('manual-reimb').value) || 0;
    
    const shift = allShifts.find(s => s.id == shiftId);
    const project = allProjects.find(p => p.id == shift.project_id);
    const employee = allEmployees.find(e => e.id == employeeId);
    const rules = project?.is_union_project ? unionRules : companyRules;
    
    const clockIn = form.elements['clock-in'].value;
    const clockOut = form.elements['clock-out'].value;
    const isSunday = new Date(clockIn).getDay() === 0;
    
    const payroll = calculatePayroll(clockIn, clockOut, rules, isSunday, employee.rate || 0, reimbAmount);

    const newEntry = {
        shift_id: shiftId, employee_id: employeeId,
        clock_in: new Date(clockIn).toISOString(), clock_out: new Date(clockOut).toISOString(),
        status: 'pending',
        total_hours: payroll.totalHours, total_pay: payroll.totalPay, reimbursement_amount: reimbAmount
    };
    const { error } = await _supabase.from('timecard_entries').insert([newEntry]);
    if(error) alert(error.message); else { document.getElementById('manual-entry-modal').style.display = 'none'; form.reset(); loadTimecards(); }
}

document.getElementById('manual-entry-btn').addEventListener('click', showManualEntryModal);
document.getElementById('manual-entry-close').onclick = () => { document.getElementById('manual-entry-modal').style.display = 'none'; };
document.getElementById('manual-entry-form').addEventListener('submit', handleManualEntrySubmit);
document.getElementById('project-select').addEventListener('change', (e) => populateShifts(e.target.value));
document.getElementById('shift-select').addEventListener('change', (e) => populateEmployees(e.target.value));

loadTimecards();