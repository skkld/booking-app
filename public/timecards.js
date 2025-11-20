const supabaseUrl = 'https://dblgrrusqxkdwgzyagtg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibGdycnVzcXhrZHdnenlhZ3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NDYzNTcsImV4cCI6MjA3NzAyMjM1N30.Au4AyxrxE0HzLqYWfMcUePMesbZTrfoIFF3Cp0RloWI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let companyRules = null;
let unionRules = null;
let allProjects = null;

// --- PAYROLL CALCULATION ---
function calculatePayroll(clockInStr, clockOutStr, rules, isSunday, rate) {
    const clockIn = new Date(clockInStr);
    const clockOut = new Date(clockOutStr);
    let regular = 0, overtime = 0, night = 0;
    const totalHours = (clockOut - clockIn) / 3600000;

    let breakDurationMinutes = 0;
    if (totalHours > rules.auto_break_threshold) { breakDurationMinutes = rules.auto_break_duration; }
    const netTotalHours = totalHours - (breakDurationMinutes / 60);

    if (rules.calculate_sundays_as_ot && isSunday) { overtime = netTotalHours; } 
    else if (netTotalHours > rules.daily_overtime_threshold) {
        regular = rules.daily_overtime_threshold;
        overtime = netTotalHours - rules.daily_overtime_threshold;
    } else { regular = netTotalHours; }

    // Cost Calculation
    // Assuming 1.5x for OT and 1.0x for Regular
    const totalPay = (regular * rate) + (overtime * rate * 1.5);

    return { 
        regular: regular.toFixed(2), 
        overtime: overtime.toFixed(2), 
        totalHours: netTotalHours.toFixed(2),
        totalPay: totalPay.toFixed(2)
    };
}

// --- MAIN DISPLAY ---
async function loadTimecards() {
    if (!companyRules) { const { data } = await _supabase.from('payroll_rules').select('*').eq('id', 1).single(); companyRules = data; }
    if (!unionRules) { const { data } = await _supabase.from('union_payroll_rules').select('*').eq('id', 1).single(); unionRules = data; }
    if (!allProjects) { const { data } = await _supabase.from('projects').select('id, is_union_project'); allProjects = data; }

    const tableBody = document.getElementById('timecard-list-table');
    const { data: entries, error } = await _supabase
        .from('timecard_entries')
        .select(`*, employees(full_name, rate), shifts(*, projects(name, id))`) // FETCH RATE
        .eq('status', 'pending')
        .order('clock_in', { ascending: false });

    if (error) { tableBody.innerHTML = `<tr><td colspan="9">Error loading timecards.</td></tr>`; return; }
    
    document.getElementById('pending-count').textContent = entries.length;
    if (entries.length === 0) { tableBody.innerHTML = `<tr><td colspan="9">No pending timecards.</td></tr>`; return; }

    tableBody.innerHTML = '';
    entries.forEach(entry => {
        if (!entry.shifts || !entry.shifts.projects || !entry.employees) return;
        const project = allProjects.find(p => p.id === entry.shifts.projects.id);
        const rules = project?.is_union_project ? unionRules : companyRules;
        const isSunday = new Date(entry.clock_in).getDay() === 0;
        
        // Use employee rate or default to 0 if not set
        const rate = entry.employees.rate || 0;
        const payroll = calculatePayroll(entry.clock_in, entry.clock_out, rules, isSunday, rate);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${entry.employees.full_name}</strong></td>
            <td>${entry.shifts.projects.name} / ${entry.shifts.name}</td>
            <td>${new Date(entry.clock_in).toLocaleTimeString([], {timeStyle:'short'})} - ${new Date(entry.clock_out).toLocaleTimeString([], {timeStyle:'short'})}</td>
            <td>${payroll.regular}</td>
            <td>${payroll.overtime}</td>
            <td>${rate > 0 ? '$'+payroll.totalPay : '-'}</td> <td><strong>${payroll.totalHours}</strong></td>
            <td><span style="color: var(--warning);">Pending</span></td>
            <td>
                <button class="btn btn-primary btn-approve" data-id="${entry.id}" data-total-pay="${payroll.totalPay}">Approve</button>
                <button class="btn btn-danger btn-reject" data-id="${entry.id}">Reject</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    document.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', handleApprove));
    document.querySelectorAll('.btn-reject').forEach(btn => btn.addEventListener('click', showRejectionModal));
}

// --- APPROVAL HANDLER ---
async function handleApprove(event) {
    const id = event.target.dataset.id;
    const totalPay = event.target.dataset.totalPay;
    const { error } = await _supabase.from('timecard_entries').update({ status: 'approved', total_pay: totalPay }).eq('id', id);
    if (error) alert(`Failed: ${error.message}`); else { alert(`Approved. Cost: $${totalPay}`); loadTimecards(); }
}

// ... (Rest of the file for Rejection and Manual Entry remains the same)
// Ensure all other functions (showRejectionModal, showManualEntryModal, etc.) are included
function showRejectionModal(event) { document.getElementById('reject-entry-id').value = event.target.dataset.id; document.getElementById('rejection-modal').style.display = 'flex'; }
function handleRejectionSubmit(event) { event.preventDefault(); const id = document.getElementById('reject-entry-id').value; const notes = document.getElementById('reject-notes').value; if (!notes) return alert("Reason required."); updateTimecardStatus(id, 'rejected', notes); }
async function updateTimecardStatus(id, status, notes = null) { const updateData = { status: status }; if (notes) updateData.manager_notes = notes; const { error } = await _supabase.from('timecard_entries').update(updateData).eq('id', id); if (error) alert(error.message); else { alert(`Timecard ${status}.`); document.getElementById('rejection-modal').style.display = 'none'; document.getElementById('rejection-form').reset(); loadTimecards(); } }
// (Manual Entry Logic - copy from previous correct version or assume present)
// ...

// Initialize
document.getElementById('reject-modal-close').onclick = () => { document.getElementById('rejection-modal').style.display = 'none'; };
document.getElementById('rejection-form').addEventListener('submit', handleRejectionSubmit);
loadTimecards();