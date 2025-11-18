import { _supabase } from './auth.js';

let allEmployees = [];
let currentProjectId = null;
let allShifts = [];
let projectVenueAddress = '';
let map, geocoder;

const formatDateTimeLocal = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
};

// --- Google Maps ---
window.initMap = () => {
    geocoder = new google.maps.Geocoder();
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    const defaultLocation = { lat: 40.7128, lng: -74.0060 };
    map = new google.maps.Map(mapElement, { center: defaultLocation, zoom: 10 });
    if (projectVenueAddress) geocodeAddress(projectVenueAddress);
};
async function loadMapScript(callback) {
    try {
        const { data } = await _supabase.functions.invoke('get-maps-key');
        if (data?.apiKey) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&callback=${callback}`;
            script.async = true;
            document.head.appendChild(script);
        }
    } catch (error) { console.error("Error loading map script:", error); }
}
function geocodeAddress(address) {
    if (!geocoder || !map) return;
    geocoder.geocode({ 'address': address }, (results, status) => {
        if (status === 'OK') {
            map.setCenter(results[0].geometry.location);
            map.setZoom(15);
            new google.maps.Marker({ map: map, position: results[0].geometry.location });
        }
    });
}

// --- Main Load Function ---
async function loadProjectDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');
    if (!projectId) return;
    currentProjectId = projectId;

    const [projectRes, shiftsRes, employeesRes] = await Promise.all([
        _supabase.from('projects').select('*').eq('id', projectId).single(),
        _supabase.from('shifts').select('*').eq('project_id', projectId).order('start_time'),
        _supabase.from('employees').select('*')
    ]);
    
    const project = projectRes.data;
    allShifts = shiftsRes.data || [];
    allEmployees = employeesRes.data || [];

    if (!project) return console.error("Failed to load project.");

    // Set global address and load map
    projectVenueAddress = project.venue_address || '';
    if (!window.google && projectVenueAddress) loadMapScript('initMap');
    else if (projectVenueAddress) geocodeAddress(projectVenueAddress);

    // Pre-fill location in Add form if empty
    const locInput = document.getElementById('shift_location');
    if (locInput && !locInput.value) locInput.value = projectVenueAddress;

    const shiftIds = allShifts.map(s => s.id);
    const { data: assignments } = await _supabase.from('assignments').select('*, employees(*)').in('shift_id', shiftIds);

    displayProjectHeader(project);
    displayShifts(allShifts, assignments || []);
    handlePageLoadActions();
}

function displayProjectHeader(project) {
    document.getElementById('project-name').textContent = project.name;
    document.getElementById('client-name').textContent = project.client_name || 'N/A';
    document.getElementById('venue-address').textContent = project.venue_address || 'N/A';
    document.getElementById('on-site-contact').textContent = project.on_site_contact || 'N/A';
    document.getElementById('dress-code').textContent = project.dress_code || 'N/A';
    document.getElementById('parking-instructions').textContent = project.parking_instructions || 'N/A';
    document.getElementById('project-notes').textContent = project.project_notes || 'N/A';
    const editButton = document.querySelector('.project-header .btn-secondary');
    if (editButton) editButton.href = `/edit-project.html?id=${project.id}`;
}

function displayShifts(shifts, allAssignments) {
    const container = document.getElementById('shifts-list-container');
    container.innerHTML = '';
    if (shifts.length === 0) { container.innerHTML = '<tr><td colspan="5">No shifts created.</td></tr>'; return; }
    
    for (const shift of shifts) {
        const assignmentsForShift = allAssignments.filter(a => a.shift_id === shift.id);
        const totalSlots = shift.people_needed;
        const startTime = new Date(shift.start_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const endTime = new Date(shift.end_time).toLocaleTimeString([], { timeStyle: 'short' });
        const location = shift.location_address || projectVenueAddress || 'N/A';
        let rowsHtml = '';
        for (let i = 0; i < totalSlots; i++) {
            const assignment = assignmentsForShift[i];
            let assignedCrewHtml = `<td><span class="unassigned-slot">Unassigned</span></td>`;
            if (assignment) {
                const noteHtml = assignment.notes ? `<span class="crew-note">(${assignment.notes})</span>` : '';
                assignedCrewHtml = `<td>${assignment.employees.full_name} ${noteHtml}</td>`;
            }
            if (i === 0) {
                rowsHtml += `<tr><td rowspan="${totalSlots}"><strong>${shift.name}</strong><div class="shift-location">${location}</div></td><td rowspan="${totalSlots}">${shift.role}</td><td rowspan="${totalSlots}">${startTime} - ${endTime}</td>${assignedCrewHtml}<td rowspan="${totalSlots}"><div style="display: flex; flex-direction: column; gap: 0.5rem;"><button class="btn btn-secondary btn-assign" data-shift-id="${shift.id}" data-shift-role="${shift.role}">View/Assign</button><a href="/timesheet-entry.html?shift_id=${shift.id}" class="btn btn-secondary">Enter Times</a><a href="/call-sheet.html?shift_id=${shift.id}" target="_blank" class="btn btn-secondary">Call Sheet</a><button class="btn btn-secondary edit-shift-btn" data-shift-id="${shift.id}">Edit</button><button class="btn btn-danger delete-shift-btn" data-shift-id="${shift.id}">Delete</button></div></td></tr>`;
            } else {
                rowsHtml += `<tr>${assignedCrewHtml}</tr>`;
            }
        }
        container.insertAdjacentHTML('beforeend', rowsHtml);
    }
    // Re-attach dynamic button listeners
    document.querySelectorAll('.btn-assign').forEach(b => b.addEventListener('click', () => openAssignmentModal(b.dataset.shiftId, b.dataset.shiftRole)));
    document.querySelectorAll('.edit-shift-btn').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.shiftId)));
    document.querySelectorAll('.delete-shift-btn').forEach(b => b.addEventListener('click', () => handleDeleteShift(b.dataset.shiftId)));
}

// --- FORM: Add New Shift (Dynamic Roles) ---
let addRoleCount = 0;
function addRoleFieldToMainForm() {
    addRoleCount++;
    const container = document.getElementById('roles-container');
    const div = document.createElement('div');
    div.className = 'role-entry';
    div.innerHTML = `<div class="form-group"><input type="text" class="role-name-input" placeholder="Role" required></div><div class="form-group"><input type="number" class="role-qty-input" placeholder="#" required></div><button type="button" class="btn btn-danger remove-role-btn">&times;</button>`;
    div.querySelector('.remove-role-btn').addEventListener('click', () => div.remove());
    container.appendChild(div);
}
document.getElementById('add-role-btn').addEventListener('click', addRoleFieldToMainForm);
addRoleFieldToMainForm(); // Init with one field

document.getElementById('add-shift-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const shiftName = form.elements.shift_name.value;
    const startTime = new Date(form.elements.start_time.value).toISOString();
    const endTime = new Date(form.elements.end_time.value).toISOString();
    const location = form.elements.shift_location.value;
    
    const newShifts = [];
    form.querySelectorAll('.role-entry').forEach(entry => {
        newShifts.push({
            project_id: currentProjectId, name: shiftName,
            role: entry.querySelector('.role-name-input').value,
            people_needed: parseInt(entry.querySelector('.role-qty-input').value),
            start_time: startTime, end_time: endTime, location_address: location
        });
    });
    const { error } = await _supabase.from('shifts').insert(newShifts);
    if (error) alert(error.message); else { 
        alert('Shifts added!'); 
        form.reset(); 
        document.getElementById('roles-container').innerHTML = '';
        addRoleFieldToMainForm();
        loadProjectDetails(); 
    }
});

// --- FORM: Edit Shift Modal (Dynamic Roles) ---
function openEditModal(shiftId) {
    const shift = allShifts.find(s => s.id == shiftId);
    if (!shift) return;
    
    document.getElementById('edit-shift-id').value = shift.id;
    document.getElementById('edit_shift_name').value = shift.name;
    document.getElementById('edit_location_address').value = shift.location_address || projectVenueAddress;
    document.getElementById('edit_start_time').value = formatDateTimeLocal(shift.start_time);
    document.getElementById('edit_end_time').value = formatDateTimeLocal(shift.end_time);
    
    // Populate PRIMARY role
    const container = document.getElementById('edit-roles-container');
    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'role-entry existing-role-entry';
    div.innerHTML = `<div class="form-group"><input type="text" id="edit_role" class="role-name-input" value="${shift.role}" required></div><div class="form-group"><input type="number" id="edit_people_needed" class="role-qty-input" value="${shift.people_needed}" required></div><div style="width: 34px;"></div>`;
    container.appendChild(div);
    
    document.getElementById('edit-shift-modal').style.display = 'flex';
}

document.getElementById('edit-add-role-btn').addEventListener('click', () => {
    const container = document.getElementById('edit-roles-container');
    const div = document.createElement('div');
    div.className = 'role-entry new-role-entry';
    div.innerHTML = `<div class="form-group"><input type="text" class="role-name-input" placeholder="New Role" required></div><div class="form-group"><input type="number" class="role-qty-input" placeholder="#" required></div><button type="button" class="btn btn-danger remove-role-btn">&times;</button>`;
    div.querySelector('.remove-role-btn').addEventListener('click', () => div.remove());
    container.appendChild(div);
});

document.getElementById('edit-shift-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const shiftId = document.getElementById('edit-shift-id').value;
    const shiftName = document.getElementById('edit_shift_name').value;
    const startTime = new Date(document.getElementById('edit_start_time').value).toISOString();
    const endTime = new Date(document.getElementById('edit_end_time').value).toISOString();
    const location = document.getElementById('edit_location_address').value;

    // 1. Update Primary
    const primaryRoleDiv = event.target.querySelector('.existing-role-entry');
    const updatedShift = {
        name: shiftName,
        role: primaryRoleDiv.querySelector('.role-name-input').value,
        people_needed: parseInt(primaryRoleDiv.querySelector('.role-qty-input').value),
        start_time: startTime, end_time: endTime, location_address: location
    };
    const { error } = await _supabase.from('shifts').update(updatedShift).eq('id', shiftId);
    if (error) return alert(error.message);

    // 2. Insert New Roles
    const newShifts = [];
    event.target.querySelectorAll('.new-role-entry').forEach(entry => {
        newShifts.push({
            project_id: currentProjectId, name: shiftName,
            role: entry.querySelector('.role-name-input').value,
            people_needed: parseInt(entry.querySelector('.role-qty-input').value),
            start_time: startTime, end_time: endTime, location_address: location
        });
    });
    if (newShifts.length > 0) await _supabase.from('shifts').insert(newShifts);

    alert('Shift updated!');
    document.getElementById('edit-shift-modal').style.display = 'none';
    loadProjectDetails();
});

document.getElementById('edit-modal-close').onclick = () => document.getElementById('edit-shift-modal').style.display = 'none';

// --- Delete Logic ---
async function handleDeleteShift(shiftId) {
    if(!confirm("Delete this shift?")) return;
    await _supabase.from('assignments').delete().eq('shift_id', shiftId);
    await _supabase.from('timecard_entries').delete().eq('shift_id', shiftId);
    await _supabase.from('shifts').delete().eq('id', shiftId);
    loadProjectDetails();
}

// --- Availability & Assignment Logic ---
document.getElementById('check-availability-btn').addEventListener('click', async () => {
    if(!confirm("Send availability emails?")) return;
    await _supabase.functions.invoke('send-availability-request', { body: { projectId: currentProjectId } });
    alert("Sent!");
});

async function openAssignmentModal(shiftId, shiftRole) {
    const modal = document.getElementById('assignment-modal');
    document.getElementById('modal-title').textContent = `Assign Crew for: ${shiftRole}`;
    modal.style.display = 'flex';
    const addCrewLink = document.getElementById('add-crew-link');
    if (addCrewLink) {
        const currentUrl = new URL(window.location.href);
        const redirectUrl = `${currentUrl.pathname}${currentUrl.search}&openShift=${shiftId}&openShiftRole=${encodeURIComponent(shiftRole)}`;
        addCrewLink.href = `/employees.html?redirect=${encodeURIComponent(redirectUrl)}`;
    }
    const { data: currentAssignments } = await _supabase.from('assignments').select('*').eq('shift_id', shiftId);
    const { data: availabilityRequests } = await _supabase.from('availability_requests').select('*').eq('shift_id', shiftId);
    const assignedEmployeeIds = currentAssignments.map(a => a.employee_id);
    
    const assignedList = document.getElementById('assigned-employees-list');
    const availableList = document.getElementById('available-employees-list');
    const unavailableList = document.getElementById('unavailable-employees-list');
    assignedList.innerHTML = ''; availableList.innerHTML = ''; unavailableList.innerHTML = '';

    const { data: project } = await _supabase.from('projects').select('is_union_project').eq('id', currentProjectId).single();
    let sortedEmployees = [...allEmployees];
    if (project?.is_union_project) {
        sortedEmployees.sort((a, b) => (a.is_union_electrician === b.is_union_electrician) ? 0 : a.is_union_electrician ? -1 : 1);
    }

    sortedEmployees.forEach(employee => {
        const item = document.createElement('li');
        item.className = 'crew-list-item';
        let nameHtml = employee.full_name;
        if (employee.is_union_electrician) nameHtml += ` <span class="flag-union" style="font-size: 0.7rem;">Union</span>`;
        const request = availabilityRequests.find(r => r.employee_id === employee.id);
        const isAssigned = assignedEmployeeIds.includes(employee.id);

        if (isAssigned) {
            const assignment = currentAssignments.find(a => a.employee_id === employee.id);
            item.innerHTML = `<span>${nameHtml}</span><input type="text" class="note-input" placeholder="Note..." value="${assignment.notes || ''}">`;
            item.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') unassignEmployee(employee.id, shiftId, shiftRole); });
            item.querySelector('.note-input').addEventListener('change', (e) => updateAssignmentNote(employee.id, shiftId, e.target.value));
            assignedList.appendChild(item);
        } else if (request?.status === 'unavailable') {
            item.innerHTML = nameHtml + ' (No)';
            item.classList.add('unavailable');
            unavailableList.appendChild(item);
        } else {
            item.innerHTML = nameHtml;
            if (request?.status === 'available') item.innerHTML = '✅ ' + nameHtml;
            item.addEventListener('click', () => assignEmployee(employee.id, shiftId, shiftRole));
            availableList.appendChild(item);
        }
    });
    
    const modalClose = document.getElementById('modal-close-btn');
    modalClose.onclick = () => {
        modal.style.display = 'none';
        const cleanUrl = window.location.pathname + `?id=${new URLSearchParams(window.location.search).get('id')}`;
        window.history.replaceState({}, '', cleanUrl);
    };
}

async function assignEmployee(eId, sId, role) { await _supabase.from('assignments').insert([{ employee_id: eId, shift_id: sId }]); openAssignmentModal(sId, role); loadProjectDetails(); }
async function unassignEmployee(eId, sId, role) { await _supabase.from('assignments').delete().match({ employee_id: eId, shift_id: sId }); openAssignmentModal(sId, role); loadProjectDetails(); }
async function updateAssignmentNote(eId, sId, note) { await _supabase.from('assignments').update({ notes: note }).match({ employee_id: eId, shift_id: sId }); }
function handlePageLoadActions() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openShift')) openAssignmentModal(urlParams.get('openShift'), urlParams.get('openShiftRole'));
}

loadProjectDetails();