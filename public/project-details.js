import { _supabase } from './auth.js';

const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let currentProject = null;
let allEmployees = [];
let allPositions = [];

// --- 1. Load Everything ---
async function loadProjectDetails() {
    if (!projectId) {
        alert("No project ID provided.");
        window.location.href = '/projects.html';
        return;
    }

    // A. Fetch Project
    const { data: project, error } = await _supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (error || !project) {
        console.error('Error fetching project:', error);
        document.body.innerHTML = '<h1>Project not found</h1>';
        return;
    }

    currentProject = project;
    renderHeaderInfo();
    loadShifts();
    loadPositions();
}

function renderHeaderInfo() {
    document.getElementById('project-name').textContent = currentProject.name;
    document.getElementById('p-client').textContent = currentProject.client_name || '-';
    document.getElementById('p-location').textContent = currentProject.venue_address || '-';
    document.getElementById('p-notes').textContent = currentProject.project_notes || '-';
    document.getElementById('p-status').textContent = (currentProject.status || 'Active').toUpperCase();
    document.getElementById('p-union').textContent = currentProject.is_union_project ? 'Yes' : 'No';
    
    const start = currentProject.start_date ? new Date(currentProject.start_date).toLocaleDateString() : 'TBD';
    const end = currentProject.end_date ? new Date(currentProject.end_date).toLocaleDateString() : '';
    document.getElementById('p-dates').textContent = end ? `${start} - ${end}` : start;
}

async function loadPositions() {
    const { data } = await _supabase.from('positions').select('*').order('name');
    if (data) {
        allPositions = data;
        const datalist = document.getElementById('roles-list');
        datalist.innerHTML = '';
        data.forEach(pos => {
            const option = document.createElement('option');
            option.value = pos.name;
            datalist.appendChild(option);
        });
    }
}

// --- 4. Load Shifts & Assignments (With Contact Info) ---
async function loadShifts() {
    const container = document.getElementById('shifts-container');
    container.innerHTML = '<p>Loading shifts...</p>';

    // Fetch shifts + assignments + employee details (phone/email)
    const { data: shifts, error } = await _supabase
        .from('shifts')
        .select(`
            *,
            assignments (
                id,
                status,
                employees (
                    id, 
                    full_name,
                    email,
                    phone
                )
            )
        `)
        .eq('project_id', projectId)
        .order('start_time', { ascending: true });

    if (error) {
        console.error("Supabase Error:", error);
        container.innerHTML = `<p>Error loading shifts: ${error.message}</p>`;
        return;
    }

    container.innerHTML = '';
    if (!shifts || shifts.length === 0) {
        container.innerHTML = '<p>No shifts created yet.</p>';
        return;
    }

    shifts.forEach(shift => {
        container.appendChild(createShiftCard(shift));
    });
}

function createShiftCard(shift) {
    const start = new Date(shift.start_time);
    const end = new Date(shift.end_time);
    const dateStr = start.toLocaleDateString();
    const timeStr = `${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;

    const filled = shift.assignments ? shift.assignments.length : 0;
    const total = shift.quantity_needed;
    const statusClass = filled >= total ? 'status-green' : (filled > 0 ? 'status-yellow' : '');

    const div = document.createElement('div');
    div.className = `shift-card ${statusClass}`;
    
    // Header Section
    let html = `
        <div class="shift-header">
            <div>
                <h4>${shift.name} <span style="font-weight:normal; font-size:0.9em; color:#666;">(${shift.role})</span></h4>
                <div class="shift-time">${dateStr} | ${timeStr}</div>
            </div>
            <div class="shift-meta">
                ${filled} / ${total} Filled
            </div>
        </div>
    `;

    // Crew List Section (Table Header)
    if (shift.assignments && shift.assignments.length > 0) {
        html += `
            <div class="crew-list-header">
                <div>Crew Member</div>
                <div>Contact</div>
                <div style="text-align:right">Action</div>
            </div>
        `;
    }

    // Crew List Items
    html += `<div class="assignments-list">`;
    if (shift.assignments) {
        shift.assignments.forEach(a => {
            const emp = a.employees || {};
            const contactInfo = [emp.email, emp.phone].filter(Boolean).join('<br>');
            
            html += `
                <div class="crew-list-item">
                    <div style="font-weight:500;">${emp.full_name || 'Unknown'}</div>
                    <div class="crew-contact">${contactInfo || '-'}</div>
                    <div style="text-align:right;">
                        <button class="btn-icon" title="Remove" onclick="removeAssignment('${a.id}')">&times;</button>
                    </div>
                </div>
            `;
        });
    }

    // "Assign" Button (Infill)
    if (filled < total) {
        html += `<button class="btn btn-sm add-assign-btn" onclick="openAssignModal('${shift.id}')">+ Assign Crew to Open Slot</button>`;
    }

    html += `</div>`; // Close assignments-list

    // Footer Links
    html += `
        <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px; text-align:right;">
            <a href="/timesheet-entry.html?shift_id=${shift.id}" class="btn btn-sm btn-secondary">Enter Times</a>
        </div>
    `;

    div.innerHTML = html;
    return div;
}

// --- Modals Logic ---
const addShiftModal = document.getElementById('add-shift-modal');
const addShiftBtn = document.getElementById('add-shift-btn');
const closeShiftBtn = document.getElementById('close-shift-modal');
const addShiftForm = document.getElementById('add-shift-form');

addShiftBtn.onclick = () => {
    if (currentProject.start_date) {
        const isoStart = new Date(currentProject.start_date).toISOString().slice(0, 16);
        document.getElementById('shift-start').value = isoStart;
        document.getElementById('shift-end').value = isoStart;
    }
    addShiftModal.style.display = 'flex';
};
closeShiftBtn.onclick = () => addShiftModal.style.display = 'none';

addShiftForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('shift-name').value;
    const roleInput = document.getElementById('shift-role').value;
    const start = document.getElementById('shift-start').value;
    const end = document.getElementById('shift-end').value;
    const qty = document.getElementById('shift-qty').value;

    const existingRole = allPositions.find(p => p.name.toLowerCase() === roleInput.trim().toLowerCase());
    if (!existingRole) {
        const confirmCreate = confirm(`Role "${roleInput}" does not exist. Create it?`);
        if (!confirmCreate) return;
        await _supabase.from('positions').insert([{ name: roleInput.trim() }]);
        await loadPositions();
    }

    const { error } = await _supabase.from('shifts').insert([{
        project_id: projectId,
        name: name,
        role: roleInput.trim(),
        start_time: start,
        end_time: end,
        quantity_needed: qty
    }]);

    if (error) alert('Error creating shift: ' + error.message);
    else {
        addShiftModal.style.display = 'none';
        addShiftForm.reset();
        loadShifts();
    }
});

const assignModal = document.getElementById('assign-modal');
const closeAssignBtn = document.getElementById('close-assign-modal');
const employeeSearch = document.getElementById('employee-search');
const employeeList = document.getElementById('employee-list');
let targetShiftId = null;

// Global Window Functions for HTML Access
window.openAssignModal = async (shiftId) => {
    targetShiftId = shiftId;
    assignModal.style.display = 'flex';
    employeeSearch.value = '';
    
    // Fetch employees with contact info if not already loaded
    if (allEmployees.length === 0) {
        const { data } = await _supabase
            .from('employees')
            .select('id, full_name, email, phone')
            .eq('status', 'active');
        allEmployees = data || [];
    }
    renderEmployeeList(allEmployees);
};

window.removeAssignment = async (assignId) => {
    if(!confirm('Remove this crew member?')) return;
    await _supabase.from('assignments').delete().eq('id', assignId);
    loadShifts();
};

closeAssignBtn.onclick = () => assignModal.style.display = 'none';

employeeSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allEmployees.filter(emp => 
        emp.full_name.toLowerCase().includes(term) || 
        (emp.email && emp.email.toLowerCase().includes(term))
    );
    renderEmployeeList(filtered);
});

function renderEmployeeList(employees) {
    employeeList.innerHTML = '';
    employees.forEach(emp => {
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${emp.full_name}</strong>
            <br><span style="font-size:0.8em; color:#666;">${emp.email || ''}</span>
        `;
        li.onclick = () => assignEmployee(emp.id);
        employeeList.appendChild(li);
    });
}

async function assignEmployee(employeeId) {
    const { error } = await _supabase.from('assignments').insert([{
        shift_id: targetShiftId,
        employee_id: employeeId,
        status: 'confirmed'
    }]);

    if (error) {
        if (error.code === '23505') alert('Employee already assigned.');
        else alert('Error: ' + error.message);
    } else {
        assignModal.style.display = 'none';
        loadShifts();
    }
}

loadProjectDetails();