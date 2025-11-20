import { _supabase, getUserRole } from './auth.js';

let allEmployees = [];
let currentProjectId = null;
let allShifts = [];
let projectVenueAddress = '';
let map;
let geocoder;

const formatDateTimeLocal = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
};

// --- Google Maps Logic ---
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
        const { data, error } = await _supabase.functions.invoke('get-maps-key');
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

    if (!project) {
        console.error("CRITICAL ERROR: Failed to load project.");
        document.getElementById('project-name').textContent = 'Error: Project not found.';
        return;
    }

    projectVenueAddress = project.venue_address || '';
    if (!window.google && projectVenueAddress) loadMapScript('initMap');
    else if (projectVenueAddress) geocodeAddress(projectVenueAddress);

    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    if (!isPrivileged) {
        const editProjBtn = document.querySelector('.project-header .btn-secondary');
        const checkAvailBtn = document.getElementById('check-availability-btn');
        if (editProjBtn) editProjBtn.style.display = 'none';
        if (checkAvailBtn) checkAvailBtn.style.display = 'none';
        const addShiftForm = document.getElementById('add-shift-form');
        if (addShiftForm) {
            const card = addShiftForm.closest('.card');
            if (card) card.style.display = 'none';
        }
    } else {
        const locInput = document.getElementById('shift_location');
        if (locInput && !locInput.value) locInput.value = projectVenueAddress;
        addShiftFormListener(projectId);
    }

    const shiftIds = allShifts.map(s => s.id);
    const { data: assignments } = await _supabase.from('assignments').select('*, employees(*)').in('shift_id', shiftIds);

    displayProjectHeader(project);
    displayShifts(allShifts, assignments || []);
    handlePageLoadActions();
    
    if (isPrivileged) {
        addCheckAvailabilityListener();
        setupEditModalListeners();
    }
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
    
    if (project.venue_address && geocoder) {
        geocodeAddress(project.venue_address);
    }
}

// **UPDATED: Group Shifts by Date**
function displayShifts(shifts, allAssignments) {
    const container = document.getElementById('shifts-list-container');
    container.innerHTML = '';
    if (shifts.length === 0) { container.innerHTML = '<tr><td colspan="5">No shifts created.</td></tr>'; return; }
    
    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    // 1. Group by Date
    const shiftsByDate = {};
    shifts.forEach(shift => {
        const dateKey = new Date(shift.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        if (!shiftsByDate[dateKey]) shiftsByDate[dateKey] = [];
        shiftsByDate[dateKey].push(shift);
    });

    // 2. Render Date Groups
    for (const [date, daysShifts] of Object.entries(shiftsByDate)) {
        // Add Header Row
       const headerRow = `
            <tr class="date-header-row" style="background-color: #1e1e1e;">
                <td colspan="5" style="font-weight: 700; color: #ffffff; padding-top: 1rem;">${date}</td>
            </tr>
        `;
        container.insertAdjacentHTML('beforeend', headerRow);

        // Add Shift Rows
        daysShifts.forEach(shift => {
            const assignmentsForShift = allAssignments.filter(a => a.shift_id === shift.id);
            const totalSlots = shift.people_needed;
            const startTime = new Date(shift.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const endTime = new Date(shift.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
                    let actionsHtml = `<a href="/call-sheet.html?shift_id=${shift.id}" target="_blank" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Call Sheet</a>`;
                    if (isPrivileged) {
                        actionsHtml = `
                            <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                                <button class="btn btn-secondary btn-assign" data-shift-id="${shift.id}" data-shift-role="${shift.role}" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Assign</button>
                                <a href="/timesheet-entry.html?shift_id=${shift.id}" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Enter Times</a>
                                ${actionsHtml}
                                <button class="btn btn-secondary edit-shift-btn" data-shift-id="${shift.id}" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Edit</button>
                                <button class="btn btn-danger delete-shift-btn" data-shift-id="${shift.id}" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Del</button>
                            </div>
                        `;
                    }
                    rowsHtml += `<tr><td rowspan="${totalSlots}"><strong>${shift.name}</strong><div class="shift-location">${location}</div></td><td rowspan="${totalSlots}">${shift.role}</td><td rowspan="${totalSlots}">${startTime} - ${endTime}</td>${assignedCrewHtml}<td rowspan="${totalSlots}">${actionsHtml}</td></tr>`;
                } else {
                    rowsHtml += `<tr>${assignedCrewHtml}</tr>`;
                }
            }
            container.insertAdjacentHTML('beforeend', rowsHtml);
        });
    }

    if (isPrivileged) {
        addAssignButtonListeners();
        addDeleteButtonListeners();
        addEditButtonListeners();
    }
}

// --- Form Listeners ---

function addShiftFormListener(projectId) {
    const form = document.getElementById('add-shift-form');
    if (!form) return;
    const locationInput = document.getElementById('shift_location');
    if (locationInput) locationInput.value = projectVenueAddress;

    let roleEntryCount = 0;
    function addRoleField() {
        roleEntryCount++;
        const container = document.getElementById('roles-container');
        const div = document.createElement('div');
        div.className = 'role-entry';
        div.innerHTML = `<div class="form-group"><input type="text" class="role-name-input" placeholder="Role" required></div><div class="form-group"><input type="number" class="role-qty-input" placeholder="#" required></div><button type="button" class="btn btn-danger remove-role-btn">&times;</button>`;
        div.querySelector('.remove-role-btn').addEventListener('click', () => div.remove());
        container.appendChild(div);
    }
    
    const addRoleBtn = document.getElementById('add-role-btn');
    const newAddRoleBtn = addRoleBtn.cloneNode(true);
    addRoleBtn.parentNode.replaceChild(newAddRoleBtn, addRoleBtn);
    newAddRoleBtn.addEventListener('click', () => container.appendChild(createRoleField()));
    
    // Ensure container is clear then add one
    document.getElementById('roles-container').innerHTML = '';
    addRoleField();

    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const shiftName = newForm.elements.shift_name.value;
        const startTime = new Date(newForm.elements.start_time.value).toISOString();
        const endTime = new Date(newForm.elements.end_time.value).toISOString();
        const location = newForm.elements.shift_location.value;
        const newShifts = [];
        newForm.querySelectorAll('.role-entry').forEach(entry => {
            newShifts.push({ project_id: projectId, name: shiftName, role: entry.querySelector('.role-name-input').value, people_needed: parseInt(entry.querySelector('.role-qty-input').value), start_time: startTime, end_time: endTime, location_address: location });
        });
        const { error } = await _supabase.from('shifts').insert(newShifts);
        if (error) alert(error.message); else { 
            alert('Shifts added successfully!'); 
            newForm.reset(); 
            document.getElementById('roles-container').innerHTML = '';
            addRoleFieldToMainForm();
            if(locationInput) locationInput.value = projectVenueAddress;
            loadProjectDetails(); 
        }
    });
}
// Helper to reset the main form
function addRoleFieldToMainForm() {
    const container = document.getElementById('roles-container');
    const div = document.createElement('div');
    div.className = 'role-entry';
    div.innerHTML = `<div class="form-group"><input type="text" class="role-name-input" placeholder="Role" required></div><div class="form-group"><input type="number" class="role-qty-input" placeholder="#" required></div><button type="button" class="btn btn-danger remove-role-btn">&times;</button>`;
    div.querySelector('.remove-role-btn').addEventListener('click', () => div.remove());
    container.appendChild(div);
}

function setupEditModalListeners() {
    const editModal = document.getElementById('edit-shift-modal');
    const editModalClose = document.getElementById('edit-modal-close');
    const editForm = document.getElementById('edit-shift-form');
    const addRoleBtn = document.getElementById('edit-add-role-btn');

    if (editModalClose) {
        const newClose = editModalClose.cloneNode(true);
        editModalClose.parentNode.replaceChild(newClose, editModalClose);
        newClose.onclick = () => editModal.style.display = 'none';
    }
    
    if (addRoleBtn) {
        const newBtn = addRoleBtn.cloneNode(true);
        addRoleBtn.parentNode.replaceChild(newBtn, addRoleBtn);
        newBtn.addEventListener('click', () => {
             const container = document.getElementById('edit-roles-container');
             const div = document.createElement('div');
             div.className = 'role-entry new-role-entry';
             div.innerHTML = `<div class="form-group"><input type="text" class="role-name-input" placeholder="New Role" required></div><div class="form-group"><input type="number" class="role-qty-input" placeholder="#" required></div><button type="button" class="btn btn-danger remove-role-btn">&times;</button>`;
             div.querySelector('.remove-role-btn').addEventListener('click', () => div.remove());
             container.appendChild(div);
        });
    }

    if (editForm) {
        const newForm = editForm.cloneNode(true);
        editForm.parentNode.replaceChild(newForm, editForm);
        newForm.addEventListener('submit', handleEditShiftSubmit);
    }
}

function addEditButtonListeners() {
    document.querySelectorAll('.edit-shift-btn').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.shiftId)));
}

function openEditModal(shiftId) {
    const shift = allShifts.find(s => s.id == shiftId);
    if (!shift) return alert('Could not find shift data.');
    
    document.getElementById('edit-shift-id').value = shift.id;
    document.getElementById('edit_shift_name').value = shift.name;
    document.getElementById('edit_location_address').value = shift.location_address || projectVenueAddress;
    document.getElementById('edit_start_time').value = formatDateTimeLocal(shift.start_time);
    document.getElementById('edit_end_time').value = formatDateTimeLocal(shift.end_time);
    
    const container = document.getElementById('edit-roles-container');
    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'role-entry existing-role-entry';
    div.innerHTML = `<div class="form-group"><input type="text" id="edit_role" class="role-name-input" value="${shift.role}" required></div><div class="form-group"><input type="number" id="edit_people_needed" class="role-qty-input" value="${shift.people_needed}" required></div><div style="width: 34px;"></div>`;
    container.appendChild(div);
    
    document.getElementById('edit-shift-modal').style.display = 'flex';
}

async function handleEditShiftSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const shiftId = form.elements['edit-shift-id'].value;
    const updatedShift = {
        name: form.elements.edit_shift_name.value,
        role: form.querySelector('.existing-role-entry .role-name-input').value,
        start_time: new Date(form.elements.edit_start_time.value).toISOString(),
        end_time: new Date(form.elements.edit_end_time.value).toISOString(),
        people_needed: parseInt(form.querySelector('.existing-role-entry .role-qty-input').value),
        location_address: form.elements.edit_location_address.value
    };
    const { error } = await _supabase.from('shifts').update(updatedShift).eq('id', shiftId);
    if (error) return alert(`Error updating: ${error.message}`);

    const newRoleEntries = form.querySelectorAll('.new-role-entry');
    const newShifts = [];
    newRoleEntries.forEach(entry => {
        newShifts.push({
            project_id: currentProjectId, name: updatedShift.name,
            role: entry.querySelector('.role-name-input').value,
            people_needed: parseInt(entry.querySelector('.role-qty-input').value),
            start_time: updatedShift.start_time, end_time: updatedShift.end_time, location_address: updatedShift.location_address
        });
    });

    if (newShifts.length > 0) await _supabase.from('shifts').insert(newShifts);
    alert('Updated!');
    document.getElementById('edit-shift-modal').style.display = 'none';
    loadProjectDetails();
}

function addDeleteButtonListeners() {
    document.querySelectorAll('.delete-shift-btn').forEach(btn => btn.addEventListener('click', () => handleDeleteShift(btn.dataset.shiftId)));
}
async function handleDeleteShift(shiftId) {
    if(!confirm("Delete this shift?")) return;
    await _supabase.from('assignments').delete().eq('shift_id', shiftId);
    await _supabase.from('timecard_entries').delete().eq('shift_id', shiftId);
    const { error } = await _supabase.from('shifts').delete().eq('id', shiftId);
    if (error) alert(`Error deleting shift: ${error.message}`);
    else loadProjectDetails();
}

function handlePageLoadActions() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openShift')) openAssignmentModal(urlParams.get('openShift'), urlParams.get('openShiftRole'));
}

function addCheckAvailabilityListener() { 
    const btn = document.getElementById('check-availability-btn');
    if(btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', async () => {
            if(!confirm("Send availability emails?")) return;
            await _supabase.functions.invoke('send-availability-request', { body: { projectId: currentProjectId } });
            alert("Sent!");
        });
    }
}

function addAssignButtonListeners() { document.querySelectorAll('.btn-assign').forEach(btn => btn.addEventListener('click', () => openAssignmentModal(btn.dataset.shiftId, btn.dataset.shiftRole))); }

// **UPDATED: CORRECT AVAILABILITY LOGIC**
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
            // 1. ASSIGNED
            const assignment = currentAssignments.find(a => a.employee_id === employee.id);
            item.innerHTML = `<span>${nameHtml}</span><input type="text" class="note-input" placeholder="Note..." value="${assignment.notes || ''}">`;
            item.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') unassignEmployee(employee.id, shiftId, shiftRole); });
            item.querySelector('.note-input').addEventListener('change', (e) => updateAssignmentNote(employee.id, shiftId, e.target.value));
            assignedList.appendChild(item);
        } 
        else if (request?.status === 'unavailable') {
            // 2. UNAVAILABLE (Only explicit NOs)
            item.innerHTML = nameHtml + ' (No)';
            item.classList.add('unavailable');
            unavailableList.appendChild(item);
        } 
        else {
            // 3. AVAILABLE (Everyone else: Yes, Pending, or Never Asked)
            if (request?.status === 'available') {
                item.innerHTML = '✅ ' + nameHtml;
            } else if (request?.status === 'sent') {
                item.innerHTML = '⏳ ' + nameHtml;
            } else {
                item.innerHTML = nameHtml;
            }
            
            item.addEventListener('click', () => assignEmployee(employee.id, shiftId, shiftRole));
            availableList.appendChild(item);
        }
    });

    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) {
        const newClose = modalCloseBtn.cloneNode(true);
        modalCloseBtn.parentNode.replaceChild(newClose, modalCloseBtn);
        newClose.onclick = () => {
            modal.style.display = 'none';
            const cleanUrl = window.location.pathname + `?id=${new URLSearchParams(window.location.search).get('id')}`;
            window.history.replaceState({}, '', cleanUrl);
        };
    }
    const modalOverlay = document.getElementById('assignment-modal');
    if (modalOverlay) {
         modalOverlay.onclick = (e) => { if (e.target.classList.contains('modal-overlay')) document.getElementById('modal-close-btn').click(); };
    }
}

async function assignEmployee(eId, sId, role) { await _supabase.from('assignments').insert([{ employee_id: eId, shift_id: sId }]); openAssignmentModal(sId, role); loadProjectDetails(); }
async function unassignEmployee(eId, sId, role) { await _supabase.from('assignments').delete().match({ employee_id: eId, shift_id: sId }); openAssignmentModal(sId, role); loadProjectDetails(); }
async function updateAssignmentNote(eId, sId, note) { await _supabase.from('assignments').update({ notes: note }).match({ employee_id: eId, shift_id: sId }); loadProjectDetails(); }

loadProjectDetails();
// Only set up listeners if they exist (i.e. if admin/manager)
const editModal = document.getElementById('edit-shift-modal');
if (editModal) setupEditModalListeners();