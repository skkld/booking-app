import { _supabase } from './auth.js';

let allAssignments = [];
let allEntries = [];
let allProjects = [];
let viewMode = 'active'; // 'active' (drafts/new) or 'history' (pending/approved)

const formatTimeValue = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
};

async function loadData() {
    // 1. Fetch Projects for Filter
    const { data: projects } = await _supabase.from('projects').select('id, name').order('name');
    allProjects = projects || [];
    const projSelect = document.getElementById('filter-project');
    // Keep selected value if reloading
    const currentVal = projSelect.value;
    projSelect.innerHTML = '<option value="">All Projects</option>';
    allProjects.forEach(p => {
        projSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
    projSelect.value = currentVal;

    renderTable();
}

async function renderTable() {
    const tbody = document.getElementById('timesheet-list');
    tbody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';

    // 2. Fetch Assignments & Entries based on filters
    const projectId = document.getElementById('filter-project').value;
    const dateFilter = document.getElementById('filter-date').value;

    // Base query for assignments (The schedule)
    let query = _supabase.from('assignments')
        .select(`
            id, employee_id, shift_id,
            employees(full_name),
            shifts(id, name, role, start_time, end_time, project_id, projects(name))
        `)
        .order('shifts(start_time)');

    if (projectId) query = query.eq('shifts.project_id', projectId);
    
    const { data: assignments, error } = await query;
    if (error) { console.error(error); tbody.innerHTML = '<tr><td colspan="9">Error</td></tr>'; return; }

    // Fetch existing timecards
    const { data: entries } = await _supabase.from('timecard_entries').select('*');
    allEntries = entries || [];

    tbody.innerHTML = '';
    let count = 0;

    // 3. Filter and Render
    assignments.forEach(asg => {
        if (!asg.shifts) return; // Skip orphans

        // Date Filter Logic
        const shiftDate = new Date(asg.shifts.start_time).toISOString().split('T')[0];
        if (dateFilter && shiftDate !== dateFilter) return;

        // Find existing entry
        const entry = allEntries.find(e => e.shift_id === asg.shifts.id && e.employee_id === asg.employee_id);

        // VIEW MODE LOGIC
        // Active Mode: Show items with NO entry, or items with 'draft' status
        // History Mode: Show items with 'pending', 'approved', 'rejected'
        const status = entry ? entry.status : 'new';
        
        if (viewMode === 'active') {
            if (status !== 'new' && status !== 'draft') return;
        } else {
            if (status === 'new' || status === 'draft') return;
        }

        count++;
        
        // Pre-fill values
        let inVal = entry ? formatTimeValue(entry.clock_in) : formatTimeValue(asg.shifts.start_time);
        let outVal = entry ? formatTimeValue(entry.clock_out) : formatTimeValue(asg.shifts.end_time);
        let breakVal = entry ? entry.break_duration_minutes : 0;
        let reimbVal = entry ? entry.reimbursement_amount : 0;
        let statusLabel = status === 'new' ? '<span class="status-draft">New</span>' : `<span class="status-saved">${status}</span>`;
        
        if (viewMode === 'history') {
             statusLabel = `<span class="status-completed">${status}</span>`;
             // Read-only view for history
             inVal = entry ? new Date(entry.clock_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';
             outVal = entry ? new Date(entry.clock_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';
             
             const row = document.createElement('tr');
             row.innerHTML = `
                <td>${new Date(asg.shifts.start_time).toLocaleDateString()}</td>
                <td>${asg.shifts.projects.name}</td>
                <td><strong>${asg.employees.full_name}</strong><br><span style="font-size:0.8em">${asg.shifts.role}</span></td>
                <td>${inVal}</td>
                <td>${outVal}</td>
                <td>${breakVal}m</td>
                <td>$${reimbVal}</td>
                <td>${statusLabel}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="alert('Edit via Timecards page')">View</button></td>
             `;
             tbody.appendChild(row);
        } else {
            // Editable Input view for Active
            const row = document.createElement('tr');
            row.dataset.shiftId = asg.shifts.id;
            row.dataset.empId = asg.employee_id;
            row.dataset.entryId = entry ? entry.id : '';

            row.innerHTML = `
                <td>${new Date(asg.shifts.start_time).toLocaleDateString()}</td>
                <td>${asg.shifts.projects.name}</td>
                <td><strong>${asg.employees.full_name}</strong><br><span style="font-size:0.8em">${asg.shifts.role}</span></td>
                <td><input type="datetime-local" class="ts-input inp-in" value="${inVal}"></td>
                <td><input type="datetime-local" class="ts-input inp-out" value="${outVal}"></td>
                <td><input type="number" class="ts-input inp-break" value="${breakVal}" style="width:60px"></td>
                <td><input type="number" class="ts-input inp-reimb" value="${reimbVal}" style="width:80px"></td>
                <td class="status-cell">${statusLabel}</td>
                <td style="display:flex; gap:5px;">
                    <button class="btn btn-secondary btn-save-row">Save</button>
                    <button class="btn btn-primary btn-complete-row">Complete</button>
                </td>
            `;
            tbody.appendChild(row);
            
            // Attach listeners to this row's buttons
            row.querySelector('.btn-save-row').addEventListener('click', () => saveRow(row, 'draft'));
            row.querySelector('.btn-complete-row').addEventListener('click', () => saveRow(row, 'pending'));
        }
    });

    if (count === 0) tbody.innerHTML = '<tr><td colspan="9">No records found for this view.</td></tr>';
}

async function saveRow(row, newStatus) {
    const shiftId = row.dataset.shiftId;
    const empId = row.dataset.empId;
    const entryId = row.dataset.entryId;
    
    const clockIn = row.querySelector('.inp-in').value;
    const clockOut = row.querySelector('.inp-out').value;
    const breakDur = row.querySelector('.inp-break').value;
    const reimb = row.querySelector('.inp-reimb').value;

    if (!clockIn || !clockOut) return alert("Time In and Out are required.");

    // Basic Payroll Calc logic (Simplified for save)
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    const totalHrs = ((end - start) / 3600000) - (breakDur/60);
    
    const payload = {
        shift_id: shiftId,
        employee_id: empId,
        clock_in: new Date(clockIn).toISOString(),
        clock_out: new Date(clockOut).toISOString(),
        break_duration_minutes: breakDur,
        reimbursement_amount: reimb,
        total_hours: totalHrs.toFixed(2),
        status: newStatus
    };

    let error;
    if (entryId) {
        ({ error } = await _supabase.from('timecard_entries').update(payload).eq('id', entryId));
    } else {
        const { data, error: insertError } = await _supabase.from('timecard_entries').insert([payload]).select();
        if (data) row.dataset.entryId = data[0].id; // Save new ID to row
        error = insertError;
    }

    if (error) {
        alert(error.message);
    } else {
        if (newStatus === 'pending') {
            row.remove(); // Remove from list if completed
        } else {
            row.querySelector('.status-cell').innerHTML = '<span class="status-saved">Saved</span>';
        }
    }
}

async function saveAll() {
    const rows = document.querySelectorAll('#timesheet-list tr');
    for (const row of rows) {
        if (row.querySelector('.btn-save-row')) {
            await saveRow(row, 'draft');
        }
    }
    alert("All visible rows saved as Drafts.");
}

// Listeners
document.getElementById('apply-filters').addEventListener('click', renderTable);
document.getElementById('save-all-btn').addEventListener('click', saveAll);

document.getElementById('toggle-view-btn').addEventListener('click', (e) => {
    viewMode = viewMode === 'active' ? 'history' : 'active';
    e.target.textContent = viewMode === 'active' ? 'View Completed History' : 'View Active Entry';
    document.getElementById('save-all-btn').style.display = viewMode === 'active' ? 'inline-block' : 'none';
    renderTable();
});

loadData();