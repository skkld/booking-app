import { _supabase } from './auth.js';

const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');
let currentProject = null;
let allEmployees = [];
let availabilityMap = {}; 
let allPositions = [];

async function loadProjectDetails() {
    if (!projectId) return window.location.href = '/projects.html';
    const { data: project } = await _supabase.from('projects').select('*').eq('id', projectId).single();
    if (!project) return document.body.innerHTML = '<h1>Project not found</h1>';
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
    document.getElementById('p-contact').textContent = currentProject.on_site_contact || '-';
    document.getElementById('p-parking').textContent = currentProject.parking_instructions || '-';

    const start = currentProject.start_date ? new Date(currentProject.start_date).toLocaleDateString() : 'TBD';
    const end = currentProject.end_date ? new Date(currentProject.end_date).toLocaleDateString() : '';
    document.getElementById('p-dates').textContent = end ? `${start} - ${end}` : start;

    const mapContainer = document.getElementById('google-map-embed');
    const addressText = document.getElementById('map-address-text');
    if (currentProject.venue_address) {
        addressText.textContent = currentProject.venue_address;
        const encodedAddr = encodeURIComponent(currentProject.venue_address);
        mapContainer.innerHTML = `<iframe width="100%" height="100%" frameborder="0" style="border:0" loading="lazy" allowfullscreen src="https://www.google.com/maps?q=${encodedAddr}&output=embed"></iframe>`;
    } else {
        addressText.textContent = "No address provided.";
        mapContainer.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#999;">No location data</div>`;
    }
}

async function loadPositions() {
    const { data } = await _supabase.from('positions').select('*').order('name');
    if (data) {
        allPositions = data;
        const datalist = document.getElementById('roles-list');
        datalist.innerHTML = '';
        data.forEach(pos => {
            const op = document.createElement('option');
            op.value = pos.name;
            datalist.appendChild(op);
        });
    }
}

async function loadShifts() {
    const container = document.getElementById('shifts-container');
    container.innerHTML = '<p>Loading shifts...</p>';
    const { data: shifts, error } = await _supabase.from('shifts')
        .select(`*, assignments(id, status, employees(id, full_name, email, phone))`)
        .eq('project_id', projectId).order('start_time', { ascending: true });

    if (error) { console.error(error); container.innerHTML = '<p>Error loading shifts.</p>'; return; }
    container.innerHTML = '';
    if (!shifts || shifts.length === 0) return container.innerHTML = '<p>No shifts created yet.</p>';
    shifts.forEach(shift => container.appendChild(createShiftCard(shift)));
}

function createShiftCard(shift) {
    const start = new Date(shift.start_time);
    const end = new Date(shift.end_time);
    const filled = shift.assignments ? shift.assignments.length : 0;
    const total = shift.quantity_needed;
    const statusClass = filled >= total ? 'status-green' : (filled > 0 ? 'status-yellow' : '');

    const div = document.createElement('div');
    div.className = `shift-card ${statusClass}`;
    
    // Store shift data in DOM for easy edit access
    div.dataset.shiftJson = JSON.stringify(shift);

    const dressCodeDisplay = shift.dress_code ? `<div style="font-size:0.85em; color:#aaa; margin-top:4px;"><strong>Dress:</strong> ${shift.dress_code}</div>` : '';

    let html = `
        <div class="shift-header">
            <div>
                <h4>
                    ${shift.name} <span style="font-weight:normal; font-size:0.9em; color:#aaa;">(${shift.role})</span>
                    <button class="btn-edit-icon" onclick="openEditShiftModal(this)" title="Edit Shift">&#9998;</button>
                </h4>
                ${dressCodeDisplay}
                <div class="shift-time">${start.toLocaleDateString()} | ${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
            </div>
            <div class="shift-meta">${filled} / ${total} Filled</div>
        </div>`;

    if (shift.assignments && shift.assignments.length > 0) {
        html += `<div class="crew-list-header"><div>Crew Member</div><div>Contact</div><div style="text-align:right">Action</div></div>`;
    }

    html += `<div class="assignments-list">`;
    if (shift.assignments) {
        shift.assignments.forEach(a => {
            const emp = a.employees || {};
            const contact = [emp.email, emp.phone].filter(Boolean).join('<br>');
            html += `<div class="crew-list-item">
                <div style="font-weight:500;">${emp.full_name || 'Unknown'}</div>
                <div class="crew-contact">${contact || '-'}</div>
                <div style="text-align:right;"><button class="btn-icon" onclick="removeAssignment('${a.id}')">×</button></div>
            </div>`;
        });
    }
    
    if (filled < total) html += `<button class="btn add-assign-btn" onclick="openAssignModal('${shift.id}')">+ Assign Crew to Open Slot</button>`;
    html += `</div>
        <div style="margin-top: 10px; border-top: 1px solid #444; padding-top: 5px; text-align:right;">
            <a href="/timesheet-entry.html?shift_id=${shift.id}" class="btn btn-sm btn-secondary">Enter Times</a>
        </div>`;
    
    div.innerHTML = html;
    return div;
}

// --- SHIFT CREATION LOGIC ---
const addShiftModal = document.getElementById('add-shift-modal');
const addShiftForm = document.getElementById('add-shift-form');
const rolesContainer = document.getElementById('shift-roles-container');

function addRoleRow() {
    const div = document.createElement('div');
    div.className = 'shift-role-row';
    div.innerHTML = `
        <div><label>Role</label><input type="text" class="form-control role-input" list="roles-list" placeholder="e.g. Audio A1" required></div>
        <div><label>Qty</label><input type="number" class="form-control qty-input" value="1" min="1" required></div>
        <button type="button" class="remove-row-btn" title="Remove Row">×</button>
    `;
    div.querySelector('.remove-row-btn').onclick = () => div.remove();
    rolesContainer.appendChild(div);
}
document.getElementById('add-role-row-btn').onclick = addRoleRow;
document.getElementById('add-shift-btn').onclick = () => {
    if (currentProject.start_date) {
        const iso = new Date(currentProject.start_date).toISOString().slice(0, 16);
        document.getElementById('shift-start').value = iso;
        document.getElementById('shift-end').value = iso;
    }
    rolesContainer.innerHTML = '';
    addRoleRow();
    addShiftModal.style.display = 'flex';
};
document.getElementById('close-shift-modal').onclick = () => addShiftModal.style.display = 'none';

addShiftForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const shiftName = document.getElementById('shift-name').value;
    const startTime = document.getElementById('shift-start').value;
    const endTime = document.getElementById('shift-end').value;
    const dressCode = document.getElementById('shift-dress').value;
    
    const rows = document.querySelectorAll('.shift-role-row');
    const shiftsToInsert = [];

    for (const row of rows) {
        const roleName = row.querySelector('.role-input').value.trim();
        const qty = row.querySelector('.qty-input').value;
        const existing = allPositions.find(p => p.name.toLowerCase() === roleName.toLowerCase());
        if (!existing) {
            if (!confirm(`Role "${roleName}" is new. Create it globally?`)) return;
            await _supabase.from('positions').insert([{ name: roleName }]);
        }
        shiftsToInsert.push({ project_id: projectId, name: shiftName, start_time: startTime, end_time: endTime, dress_code: dressCode, role: roleName, quantity_needed: qty });
    }
    await loadPositions();
    const { error } = await _supabase.from('shifts').insert(shiftsToInsert);
    if (error) alert(error.message); else { addShiftModal.style.display = 'none'; addShiftForm.reset(); loadShifts(); }
});

// --- EDIT SHIFT LOGIC (NEW) ---
const editModal = document.getElementById('edit-shift-modal');
const editForm = document.getElementById('edit-shift-form');

// Helper to convert ISO string to datetime-local input format
const toLocalIso = (dateStr) => {
    const date = new Date(dateStr);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
};

window.openEditShiftModal = (btn) => {
    // Find parent card and get JSON data
    const card = btn.closest('.shift-card');
    const shift = JSON.parse(card.dataset.shiftJson);
    
    document.getElementById('edit-shift-id').value = shift.id;
    document.getElementById('edit-name').value = shift.name;
    document.getElementById('edit-role').value = shift.role;
    document.getElementById('edit-dress').value = shift.dress_code || '';
    document.getElementById('edit-start').value = toLocalIso(shift.start_time);
    document.getElementById('edit-end').value = toLocalIso(shift.end_time);
    document.getElementById('edit-qty').value = shift.quantity_needed;

    editModal.style.display = 'flex';
};

document.getElementById('close-edit-modal').onclick = () => editModal.style.display = 'none';

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-shift-id').value;
    const updates = {
        name: document.getElementById('edit-name').value,
        role: document.getElementById('edit-role').value,
        dress_code: document.getElementById('edit-dress').value,
        start_time: document.getElementById('edit-start').value,
        end_time: document.getElementById('edit-end').value,
        quantity_needed: document.getElementById('edit-qty').value
    };

    const { error } = await _supabase.from('shifts').update(updates).eq('id', id);
    if (error) alert('Error updating shift: ' + error.message);
    else { editModal.style.display = 'none'; loadShifts(); }
});

document.getElementById('delete-shift-btn').onclick = async () => {
    const id = document.getElementById('edit-shift-id').value;
    if(!confirm("Are you sure you want to delete this shift? All assignments will be removed.")) return;
    
    const { error } = await _supabase.from('shifts').delete().eq('id', id);
    if (error) alert('Error deleting shift: ' + error.message);
    else { editModal.style.display = 'none'; loadShifts(); }
};

// --- ASSIGN LOGIC ---
const assignModal = document.getElementById('assign-modal');
const empList = document.getElementById('employee-list');

document.getElementById('request-avail-btn').onclick = async () => {
    if(!confirm("Send availability request to ALL active employees for this project?")) return;
    const { data: emps } = await _supabase.from('employees').select('id').eq('status', 'active');
    if(!emps) return;
    const inserts = emps.map(e => ({ project_id: projectId, employee_id: e.id, status: 'pending' }));
    const { error } = await _supabase.from('project_availability').upsert(inserts, { onConflict: 'project_id, employee_id' });
    if(error) alert('Error sending requests: ' + error.message); else alert('Availability requests sent (simulated).');
};

window.openAssignModal = async (sid) => {
    targetShiftId = sid; 
    assignModal.style.display = 'flex'; 
    document.getElementById('employee-search').value='';
    document.getElementById('show-all-crew').checked = false; 

    const [empRes, availRes] = await Promise.all([
        _supabase.from('employees').select('id, full_name, email').eq('status', 'active'),
        _supabase.from('project_availability').select('employee_id, status').eq('project_id', projectId)
    ]);
    allEmployees = empRes.data || [];
    availabilityMap = {};
    if(availRes.data) availRes.data.forEach(a => availabilityMap[a.employee_id] = a.status);
    renderEmp();
};

document.getElementById('close-assign-modal').onclick = () => assignModal.style.display = 'none';
document.getElementById('employee-search').addEventListener('input', () => renderEmp());
document.getElementById('show-all-crew').addEventListener('change', () => renderEmp());

function renderEmp() {
    const term = document.getElementById('employee-search').value.toLowerCase();
    const showAll = document.getElementById('show-all-crew').checked;
    empList.innerHTML = '';
    
    const sorted = [...allEmployees].sort((a, b) => {
        const statA = availabilityMap[a.id] || 'none';
        const statB = availabilityMap[b.id] || 'none';
        if(statA === 'available' && statB !== 'available') return -1;
        if(statA !== 'available' && statB === 'available') return 1;
        return a.full_name.localeCompare(b.full_name);
    });

    sorted.forEach(emp => {
        if (!emp.full_name.toLowerCase().includes(term)) return;
        const status = availabilityMap[emp.id] || 'none';
        if (!showAll && status !== 'available') return;

        const li = document.createElement('li');
        let badgeClass = 'badge-none'; let badgeText = 'No Reply';
        if(status === 'available') { badgeClass = 'badge-available'; badgeText = 'Available'; }
        else if(status === 'pending') { badgeClass = 'badge-pending'; badgeText = 'Pending'; }
        else if(status === 'unavailable') { badgeClass = 'badge-none'; badgeText = 'Unavailable'; }

        li.innerHTML = `<div><strong>${emp.full_name}</strong><br><span style="font-size:0.8em; color:#666">${emp.email||''}</span></div><span class="status-badge ${badgeClass}">${badgeText}</span>`;
        li.onclick = async () => {
            const { error } = await _supabase.from('assignments').insert([{ shift_id: targetShiftId, employee_id: emp.id }]);
            if (error) { if(error.code === '23505') alert('Already assigned'); else alert(error.message); } 
            else { assignModal.style.display = 'none'; loadShifts(); }
        };
        empList.appendChild(li);
    });
    if(empList.children.length === 0) empList.innerHTML = '<li style="color:#777; cursor:default;">No crew found matching criteria.</li>';
}

window.removeAssignment = async (id) => { if(confirm('Remove crew?')) { await _supabase.from('assignments').delete().eq('id', id); loadShifts(); }};

loadProjectDetails();