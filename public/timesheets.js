import { _supabase } from './auth.js';

let allAssignments = [];
let allEntries = [];
let allProjects = [];
let viewMode = 'active'; // 'active' = working/new, 'history' = submitted/approved

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
    
    if (projSelect) {
        const currentVal = projSelect.value;
        projSelect.innerHTML = '<option value="">All Projects</option>';
        allProjects.forEach(p => {
            projSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
        projSelect.value = currentVal;
    }

    renderTable();
}

async function renderTable() {
    const tbody = document.getElementById('timesheet-list');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';

    const projectId = document.getElementById('filter-project').value;
    const dateFilter = document.getElementById('filter-date').value;

    // 2. Fetch Assignments (The Schedule)
    let query = _supabase.from('assignments')
        .select(`
            id, employee_id, shift_id,
            employees(full_name),
            shifts(id, name, role, start_time, end_time, project_id, projects(name))
        `)
        .order('id', { ascending: true }); // Basic ordering

    // Apply Project Filter to the query if selected
    // Note: Filtering on nested relations in Supabase can be tricky, 
    // so we'll fetch all and filter in JS for reliability here, or simpler query if table size is small.
    
    const { data: assignments, error } = await query;
    
    if (error) { 
        console.error("Error fetching assignments:", error); 
        tbody.innerHTML = '<tr><td colspan="9">Error loading data. Check console.</td></tr>'; 
        return; 
    }

    // 3. Fetch Timecards (The Actuals)
    const { data: entries } = await _supabase.from('timecard_entries').select('*');
    allEntries = entries || [];

    tbody.innerHTML = '';
    let count = 0;

    // 4. Process and Render
    assignments.forEach(asg => {
        // Filter invalid/orphan data
        if (!asg.shifts || !asg.shifts.projects) return;

        // JS Filter: Project
        if (projectId && asg.shifts.project_id != projectId) return;

        // JS Filter: Date
        const shiftDateVal = new Date(asg.shifts.start_time).toISOString().split('T')[0];
        if (dateFilter && shiftDateVal !== dateFilter) return;

        // Match Entry
        const entry = allEntries.find(e => e.shift_id === asg.shifts.id && e.employee_id === asg.employee_id);
        const status = entry ? entry.status : 'new';
        
        // VIEW MODE LOGIC
        // Active: New (Empty), Draft (Saved but not sent), Clocked In (Working)
        // History: Pending (Sent for approval), Approved, Rejected
        const isActiveView = (status === 'new' || status === 'draft' || status === 'clocked_in');
        
        if (viewMode === 'active' && !isActiveView) return;
        if (viewMode === 'history' && isActiveView) return;

        count++;
        
        // Prepare Values
        let inVal = entry && entry.clock_in ? formatTimeValue(entry.clock_in) : formatTimeValue(asg.shifts.start_time);
        let outVal = entry && entry.clock_out ? formatTimeValue(entry.clock_out) : formatTimeValue(asg.shifts.end_time);
        let breakVal = entry ? (entry.break_duration_minutes || 0) : 0;
        let reimbVal = entry ? (entry.reimbursement_amount || 0) : 0;
        
        // Status Label
        let statusLabel = `<span class="status-draft">New</span>`;
        if (status === 'draft') statusLabel = `<span class="status-saved">Draft</span>`;
        if (status === 'clocked_in') statusLabel = `<span style="color: var(--primary-color); font-weight:bold">Clocked In</span>`;
        if (status === 'pending') statusLabel = `<span style="color: var(--status-yellow-text);">Pending</span>`;
        if (status === 'approved') statusLabel = `<span class="status-completed">Approved</span>`;

        const dateDisplay = new Date(asg.shifts.start_time).toLocaleDateString();

        if (viewMode === 'history') {
             // READ ONLY ROW
             const displayIn = entry ? new Date(entry.clock_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';
             const displayOut = entry && entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';
             
             const row = document.createElement('tr');
             row.innerHTML = `
                <td>${dateDisplay}</td>
                <td>${asg.shifts.projects.name}</td>
                <td><strong>${asg.employees.full_name}</strong><br><span style="font-size:0.8em">${asg.shifts.role}</span></td>
                <td>${displayIn}</td>
                <td>${displayOut}</td>
                <td>${breakVal}m</td>
                <td>$${reimbVal}</td>
                <td>${statusLabel}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="alert('Already submitted. Go to Timecards page to manage.')">Locked</button></td>
             `;
             tbody.appendChild(row);
        } else {
            // EDITABLE ROW
            const row = document.createElement('tr');
            row.dataset.shiftId = asg.shifts.id;
            row.dataset.empId = asg.employee_id;
            row.dataset.entryId = entry ? entry.id : '';

            row.innerHTML = `
                <td>${dateDisplay}</td>
                <td>${asg.shifts.projects.name}</td>
                <td><strong>${asg.employees.full_name}</strong><br><span style="font-size:0.8em">${asg.shifts.role}</span></td>
                <td><input type="datetime-local" class="ts-input inp-in" value="${inVal}"></td>
                <td><input type="datetime-local" class="ts-input inp-out" value="${outVal}"></td>
                <td><input type="number" class="ts-input inp-break" value="${breakVal}" style="width:60px"></td>
                <td><input type="number" class="ts-input inp-reimb" value="${reimbVal}" style="width:80px"></td>
                <td class="status-cell">${statusLabel}</td>
                <td style="display:flex; gap:5px;">
                    <button class="btn btn-secondary btn-save-row">Save</button>
                    <button class="btn btn-primary btn-complete-row">Submit</button>
                </td>
            `;
            tbody.appendChild(row);
            
            row.querySelector('.btn-save-row').addEventListener('click', () => saveRow(row, 'draft'));
            row.querySelector('.btn-complete-row').addEventListener('click', () => saveRow(row, 'pending'));
        }
    });

    if (count === 0) {
        tbody.innerHTML = `<tr><td colspan="9">No records found for this view. <br><small>(Try switching to "View Completed History" or creating new shifts)</small></td></tr>`;
    }
}

async function saveRow(row, newStatus) {
    const shiftId = row.dataset.shiftId;
    const empId = row.dataset.empId;
    const entryId = row.dataset.entryId;
    
    const clockIn = row.querySelector('.inp-in').value;
    const clockOut = row.querySelector('.inp-out').value;
    const breakDur = parseFloat(row.querySelector('.inp-break').value) || 0;
    const reimb = parseFloat(row.querySelector('.inp-reimb').value) || 0;

    if (!clockIn || !clockOut) return alert("Time In and Out are required.");

    // Basic Payroll Calc (Recalculated on approval anyway)
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
    // UPSERT LOGIC
    if (entryId && entryId !== 'undefined') {
        ({ error } = await _supabase.from('timecard_entries').update(payload).eq('id', entryId));
    } else {
        // Double check database just in case ID wasn't in DOM
        const { data: existing } = await _supabase.from('timecard_entries').select('id').eq('shift_id', shiftId).eq('employee_id', empId).single();
        if (existing) {
            ({ error } = await _supabase.from('timecard_entries').update(payload).eq('id', existing.id));
        } else {
            const { data, error: insertError } = await _supabase.from('timecard_entries').insert([payload]).select();
            if (data) row.dataset.entryId = data[0].id;
            error = insertError;
        }
    }

    if (error) {
        alert(error.message);
    } else {
        if (newStatus === 'pending') {
            row.remove(); // Remove from "Active" list as it is now "History" (Pending)
            // Check if table empty
            if (document.getElementById('timesheet-list').children.length === 0) {
                renderTable();
            }
        } else {
            row.querySelector('.status-cell').innerHTML = '<span class="status-saved">Saved</span>';
        }
    }
}

async function saveAll() {
    const rows = document.querySelectorAll('#timesheet-list tr');
    let savedCount = 0;
    for (const row of rows) {
        if (row.querySelector('.btn-save-row')) {
            await saveRow(row, 'draft');
            savedCount++;
        }
    }
    if(savedCount > 0) alert("All rows saved as Drafts.");
}

document.getElementById('apply-filters').addEventListener('click', renderTable);
document.getElementById('save-all-btn').addEventListener('click', saveAll);

document.getElementById('toggle-view-btn').addEventListener('click', (e) => {
    viewMode = viewMode === 'active' ? 'history' : 'active';
    e.target.textContent = viewMode === 'active' ? 'View Completed History' : 'View Active Entry';
    const saveAllBtn = document.getElementById('save-all-btn');
    if(saveAllBtn) saveAllBtn.style.display = viewMode === 'active' ? 'inline-block' : 'none';
    renderTable();
});

loadData();