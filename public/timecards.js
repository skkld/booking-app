import { _supabase } from './auth.js';

let companyRules = null;
let unionRules = null;
let allProjects = null;

function calculatePayroll(clockInStr, clockOutStr, rules, isSunday, rate, reimbursement) {
    const clockIn = new Date(clockInStr);
    const clockOut = new Date(clockOutStr);
    let regular = 0, overtime = 0;
    const totalHours = (clockOut - clockIn) / 3600000;

    let breakDed = 0;
    if (totalHours > rules.auto_break_threshold) { breakDed = rules.auto_break_duration / 60; }
    const netHours = totalHours - breakDed;

    if (rules.calculate_sundays_as_ot && isSunday) { 
        overtime = netHours; 
    } else if (netHours > rules.daily_overtime_threshold) {
        regular = rules.daily_overtime_threshold;
        overtime = netHours - rules.daily_overtime_threshold;
    } else { 
        regular = netHours; 
    }

    // CALCULATE PAY
    const hourlyPay = (regular * rate) + (overtime * rate * 1.5);
    const totalPay = hourlyPay + (reimbursement || 0);

    return { 
        regular: regular.toFixed(2), 
        overtime: overtime.toFixed(2), 
        totalHours: netHours.toFixed(2),
        totalPay: totalPay.toFixed(2)
    };
}

async function loadTimecards() {
    if (!companyRules) { const { data } = await _supabase.from('payroll_rules').select('*').eq('id', 1).single(); companyRules = data; }
    if (!unionRules) { const { data } = await _supabase.from('union_payroll_rules').select('*').eq('id', 1).single(); unionRules = data; }
    if (!allProjects) { const { data } = await _supabase.from('projects').select('id, is_union_project'); allProjects = data; }

    const tableBody = document.getElementById('timecard-list-table');
    // **FIX: Ensure we select 'rate' from employees**
    const { data: entries, error } = await _supabase
        .from('timecard_entries')
        .select(`*, employees(full_name, rate), shifts(*, projects(name, id))`)
        .eq('status', 'pending')
        .order('clock_in', { ascending: false });

    if (error) return console.error(error);
    
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
        
        // Get rate (default to 0 if missing) and reimbursement
        const rate = entry.employees?.rate || 0;
        const reimb = entry.reimbursement_amount || 0;

        const payroll = calculatePayroll(entry.clock_in, entry.clock_out, rules, isSunday, rate, reimb);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${entry.employees.full_name}</strong><div style="font-size:0.8em; color:#aaa;">Rate: $${rate}</div></td>
            <td>${entry.shifts.name}</td>
            <td>${payroll.totalHours} hrs</td>
            <td>${payroll.regular}</td>
            <td>${payroll.overtime}</td>
            <td>$${reimb.toFixed(2)}</td>
            <td style="color: var(--primary-color); font-weight: bold;">$${payroll.totalPay}</td>
            <td><button class="btn btn-primary btn-approve" data-id="${entry.id}" data-total="${payroll.totalPay}">Approve</button></td>
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
}

// --- Manual Entry Logic (Updated) ---
// ... (include your existing manual entry functions here: showManualEntryModal, etc) ...
// Key Change: In handleManualEntrySubmit, retrieve the new field:
// const reimbursement = document.getElementById('manual-reimb').value;
// And add it to the insert object: reimbursement_amount: reimbursement

loadTimecards();