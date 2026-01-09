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

    // B. Fetch Shifts
    loadShifts();

    // C. Fetch Positions
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
    const { data, error } = await _supabase.from('positions').select('*').order('name');
    if (!error && data) {
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

async function loadShifts() {
    const container = document.getElementById('shifts-container');
    container.innerHTML = '<p>Loading shifts...</p>';

    // This is the query causing the 400 error if relations don't exist
    const { data: shifts, error } = await _supabase
        .from('shifts')
        .select(`
            *,
            assignments (
                id,
                status,
                employees (id, full_name)
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
    div.innerHTML = `
        <div class="shift-header">
            <div>
                <h4>${shift.name} <span style="font-weight:normal; font-size:0.9em; color:#666;">(${shift.role})</span></h4>
                <div class="shift-time">${dateStr} | ${timeStr}</div>
            </div>
            <div class="shift-meta">
                ${filled} / ${total} Filled
            </div>
        </div>
        <div class="assignments-list">
            ${shift.assignments ? shift.assignments.map(a => `
                <div class="assignment-chip">
                    <span>${a.employees ? a.employees.full_name : 'Unknown'}</span>
                    <button class="remove-assignment-btn" onclick="removeAssignment('${a.id}')">&times;</button>
                </div>
            `).join('') : ''}
            ${filled < total ? `<button class="add-assign-btn" onclick="openAssignModal('${shift.id}')">+ Assign</button>` : ''}
        </div>
        <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px;">
            <a href="/timesheet-entry.html?shift_id=${shift.id}" class="btn btn-sm btn-secondary">Enter Times</a>
        </div>
    `;
    return div;
}

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

window.openAssignModal = async (shiftId) => {
    targetShiftId = shiftId;
    assignModal.style.display = 'flex';
    employeeSearch.value = '';
    if (allEmployees.length === 0) {
        const { data } = await _supabase.from('employees').select('id, full_name').eq('status', 'active');
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
    const filtered = allEmployees.filter(emp => emp.full_name.toLowerCase().includes(term));
    renderEmployeeList(filtered);
});

function renderEmployeeList(employees) {
    employeeList.innerHTML = '';
    employees.forEach(emp => {
        const li = document.createElement('li');
        li.textContent = emp.full_name;
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