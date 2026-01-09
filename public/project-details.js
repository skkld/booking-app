import { _supabase } from './auth.js';

const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');
let currentProject = null;
let allEmployees = [];
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

    // Map Render
    const mapContainer = document.getElementById('google-map-embed');
    const addressText = document.getElementById('map-address-text');
    
    if (currentProject.venue_address) {
        addressText.textContent = currentProject.venue_address;
        const encodedAddr = encodeURIComponent(currentProject.venue_address);
        mapContainer.innerHTML = `
            <iframe 
                width="100%" 
                height="100%" 
                frameborder="0" 
                style="border:0" 
                loading="lazy" 
                allowfullscreen 
                referrerpolicy="no-referrer-when-downgrade"
                src="https://www.google.com/maps?q=${encodedAddr}&output=embed">
            </iframe>
        `;
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
    
    const dressCodeDisplay = shift.dress_code ? `<div style="font-size:0.85em; color:#555; margin-top:4px;"><strong>Dress:</strong> ${shift.dress_code}</div>` : '';

    let html = `
        <div class="shift-header">
            <div>
                <h4>${shift.name} <span style="font-weight:normal; font-size:0.9em; color:#666;">(${shift.role})</span></h4>
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
    
    if (filled < total) html += `<button class="btn btn-sm add-assign-btn" onclick="openAssignModal('${shift.id}')">+ Assign Crew to Open Slot</button>`;
    html += `</div>
        <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px; text-align:right;">
            <a href="/timesheet-entry.html?shift_id=${shift.id}" class="btn btn-sm btn-secondary">Enter Times</a>
        </div>`;
    
    div.innerHTML = html;
    return div;
}

// --- DYNAMIC SHIFT MODAL LOGIC ---
const addShiftModal = document.getElementById('add-shift-modal');
const addShiftForm = document.getElementById('add-shift-form');
const rolesContainer = document.getElementById('shift-roles-container');

// Function to add a new role row
function addRoleRow() {
    const div = document.createElement('div');
    div.className = 'shift-role-row';
    div.innerHTML = `
        <div>
            <label>Role</label>
            <input type="text" class="form-control role-input" list="roles-list" placeholder="e.g. Audio A1" required>
        </div>
        <div>
            <label>Dress Code</label>
            <input type="text" class="form-control dress-input" placeholder="e.g. Show Blacks">
        </div>
        <div>
            <label>Qty</label>
            <input type="number" class="form-control qty-input" value="1" min="1" required>
        </div>
        <button type="button" class="remove-row-btn" title="Remove Row">×</button>
    `;
    
    // Remove handler
    div.querySelector('.remove-row-btn').onclick = () => div.remove();
    rolesContainer.appendChild(div);
}

document.getElementById('add-role-row-btn').onclick = addRoleRow;

document.getElementById('add-shift-btn').onclick = () => {
    // Pre-fill Start/End dates
    if (currentProject.start_date) {
        const iso = new Date(currentProject.start_date).toISOString().slice(0, 16);
        document.getElementById('shift-start').value = iso;
        document.getElementById('shift-end').value = iso;
    }
    // Clear and add one default row
    rolesContainer.innerHTML = '';
    addRoleRow();
    addShiftModal.style.display = 'flex';
};
document.getElementById('close-shift-modal').onclick = () => addShiftModal.style.display = 'none';

addShiftForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const startTime = document.getElementById('shift-start').value;
    const endTime = document.getElementById('shift-end').value;
    
    // Collect all rows
    const rows = document.querySelectorAll('.shift-role-row');
    const shiftsToInsert = [];

    // Helper to check/create roles
    for (const row of rows) {
        const roleName = row.querySelector('.role-input').value.trim();
        const dressCode = row.querySelector('.dress-input').value.trim();
        const qty = row.querySelector('.qty-input').value;

        // Check if role exists
        const existing = allPositions.find(p => p.name.toLowerCase() === roleName.toLowerCase());
        if (!existing) {
            const confirmCreate = confirm(`Role "${roleName}" is new. Create it globally?`);
            if (!confirmCreate) return; // Stop submission
            await _supabase.from('positions').insert([{ name: roleName }]);
        }
        
        shiftsToInsert.push({
            project_id: projectId,
            name: 'Shift', // Generic name, or you could add a Name input back if you want distinct names per row
            role: roleName,
            dress_code: dressCode,
            start_time: startTime,
            end_time: endTime,
            quantity_needed: qty
        });
    }

    // Refresh positions in case we added new ones
    await loadPositions();

    const { error } = await _supabase.from('shifts').insert(shiftsToInsert);
    
    if (error) {
        alert('Error creating shifts: ' + error.message);
    } else {
        addShiftModal.style.display = 'none';
        addShiftForm.reset();
        loadShifts();
    }
});

// --- ASSIGN LOGIC ---
const assignModal = document.getElementById('assign-modal');
const empList = document.getElementById('employee-list');
let targetShiftId = null;
window.openAssignModal = async (sid) => {
    targetShiftId = sid; assignModal.style.display = 'flex'; document.getElementById('employee-search').value='';
    if (allEmployees.length === 0) { const { data } = await _supabase.from('employees').select('id, full_name, email, phone').eq('status', 'active'); allEmployees = data || []; }
    renderEmp(allEmployees);
};
document.getElementById('close-assign-modal').onclick = () => assignModal.style.display = 'none';
document.getElementById('employee-search').addEventListener('input', (e) => {
    renderEmp(allEmployees.filter(emp => emp.full_name.toLowerCase().includes(e.target.value.toLowerCase())));
});
function renderEmp(list) {
    empList.innerHTML = '';
    list.forEach(emp => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${emp.full_name}</strong><br><span style="font-size:0.8em; color:#666">${emp.email||''}</span>`;
        li.onclick = async () => {
            const { error } = await _supabase.from('assignments').insert([{ shift_id: targetShiftId, employee_id: emp.id }]);
            if (error) alert(error.message); else { assignModal.style.display = 'none'; loadShifts(); }
        };
        empList.appendChild(li);
    });
}
window.removeAssignment = async (id) => { if(confirm('Remove crew?')) { await _supabase.from('assignments').delete().eq('id', id); loadShifts(); }};

loadProjectDetails();