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

    // 1. Fetch Data
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

    // 2. Map Setup
    projectVenueAddress = project.venue_address || '';
    if (!window.google && projectVenueAddress) loadMapScript('initMap');
    else if (projectVenueAddress) geocodeAddress(projectVenueAddress);

    // 3. Role-Based UI Security
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
    }
    
    // Set up Edit Modal listeners only if they exist (Admin/Manager)
    const editModal = document.getElementById('edit-shift-modal');
    if (editModal && isPrivileged) setupEditModalListeners();
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
    
    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

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
                let actionsHtml = `<a href="/call-sheet.html?shift_id=${shift.id}" target="_blank" class="btn btn-secondary">Call Sheet</a>`;
                if (isPrivileged) {
                    actionsHtml = `
                        <button class="btn btn-secondary btn-assign" data-shift-id="${shift.id}" data-shift-role="${shift.role}">View/Assign</button>
                        <a href="/timesheet-entry.html?shift_id=${shift.id}" class="btn btn-secondary">Enter Times</a>
                        ${actionsHtml}
                        <button class="btn btn-secondary edit-shift-btn" data-shift-id="${shift.id}">Edit</button>
                        <button class="btn btn-danger delete-shift-btn" data-shift-id="${shift.id}">Delete</button>
                    `;
                }

                rowsHtml += `
                    <tr>
                        <td rowspan="${totalSlots}"><strong>${shift.name}</strong><div class="shift-location">${location}</div></td>
                        <td rowspan="${totalSlots}">${shift.role}</td>
                        <td rowspan="${totalSlots}">${startTime} - ${endTime}</td>
                        ${assignedCrewHtml}
                        <td rowspan="${totalSlots}">
                            <div style="display: flex; flex-direction: column; gap: 0.5rem;">${actionsHtml}</div>
                        </td>
                    </tr>
                `;
            } else {
                rowsHtml += `<tr>${assignedCrewHtml}</tr>`;
            }
        }
        container.insertAdjacentHTML('beforeend', rowsHtml);
    }
    
    if (isPrivileged) {
        addAssignButtonListeners();
        addDeleteButtonListeners();
        addEditButtonListeners();
    }
}

// --- Form & Modal Listeners (Admin/Manager Only) ---

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
    if(addRoleBtn) {
         const newBtn = addRoleBtn.cloneNode(true);
         addRoleBtn.parentNode.replaceChild(newBtn, addRoleBtn);
         newBtn.addEventListener('click', addRoleField);
         addRoleField();
    }

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
            newShifts.push({
                project_id: projectId, name: shiftName,
                role: entry.querySelector('.role-name-input').value,
                people_needed: parseInt(entry.querySelector('.role-qty-input').value),
                start_time: startTime, end_time: endTime, location_address: location
            });
        });
        const { error } = await _supabase.from('shifts').insert(newShifts);
        if (error) alert(error.message); else { 
            alert('Shifts added successfully!'); 
            newForm.reset(); 
            document.getElementById('roles-container').innerHTML = '';
            addRoleField();
            if(locationInput) locationInput.value = projectVenueAddress;
            loadProjectDetails(); 
        }
    });
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
    const shiftId = document.getElementById('edit-shift-id').value;
    const shiftName = document.getElementById('edit_shift_name').value;
    const startTime = new Date(document.getElementById('edit_start_time').value).toISOString();
    const endTime = new Date(document.getElementById('edit_end_time').value).toISOString();
    const location = document.getElementById('edit_location_address').value;

    const primaryRoleDiv = form.querySelector('.existing-role-entry');
    const updatedShift = {
        name: shiftName,
        role: primaryRoleDiv.querySelector('.role-name-input