import { getUserRole, _supabase } from './auth.js';

let allPositions = [];
let currentUserId = null;

// Get current user ID on load
_supabase.auth.getUser().then(({ data }) => {
    if (data?.user) currentUserId = data.user.id;
});

const parseTags = (tagString) => {
    if (!tagString) return [];
    return tagString.split(',').map(tag => tag.trim()).filter(tag => tag);
};

async function loadPositions() {
    const { data: positions, error } = await _supabase.from('positions').select('*').order('name');
    if (error) return console.error('Error fetching positions:', error);
    allPositions = positions;
    
    const addContainer = document.getElementById('positions-checkbox-container');
    const editContainer = document.getElementById('edit-positions-checkbox-container');
    const filterSelect = document.getElementById('filter-position');
    
    let checkboxesHtml = '', editCheckboxesHtml = '', filterOptionsHtml = '<option value="">Any Position</option>';
    
    allPositions.forEach(pos => {
        checkboxesHtml += `<div class="form-group-checkbox"><input type="checkbox" name="positions" value="${pos.id}" id="pos-${pos.id}"><label for="pos-${pos.id}">${pos.name}</label></div>`;
        editCheckboxesHtml += `<div class="form-group-checkbox"><input type="checkbox" name="edit_positions" value="${pos.id}" id="edit-pos-${pos.id}"><label for="edit-pos-${pos.id}">${pos.name}</label></div>`;
        filterOptionsHtml += `<option value="${pos.id}">${pos.name}</option>`;
    });
    
    if (addContainer) addContainer.innerHTML = checkboxesHtml;
    if (editContainer) editContainer.innerHTML = editCheckboxesHtml;
    if (filterSelect) filterSelect.innerHTML = filterOptionsHtml;
}

async function quickAddPosition(inputId) {
    const input = document.getElementById(inputId);
    const name = input.value.trim();
    if (!name) return alert("Please enter a position name.");
    const { error } = await _supabase.from('positions').insert([{ name: name }]);
    if (error) { alert(`Error adding position: ${error.message}`); } else { input.value = ''; loadPositions(); }
}

const qaAdd = document.getElementById('quick-add-pos-btn-add');
if(qaAdd) qaAdd.addEventListener('click', () => quickAddPosition('quick-pos-name-add'));
const qaEdit = document.getElementById('quick-add-pos-btn-edit');
if(qaEdit) qaEdit.addEventListener('click', () => quickAddPosition('quick-pos-name-edit'));

async function loadFilteredEmployees() {
    const tableBody = document.getElementById('employee-list-table');
    tableBody.innerHTML = `<tr><td colspan="6">Loading employees...</td></tr>`;

    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    // Hide/Show Admin Elements
    const thAutobook = document.getElementById('th-autobook');
    const thNotes = document.getElementById('th-notes');
    const addBtn = document.getElementById('add-employee-btn');
    
    if (thAutobook) thAutobook.style.display = isPrivileged ? '' : 'none';
    if (thNotes) thNotes.style.display = isPrivileged ? '' : 'none';
    if (addBtn) addBtn.style.display = isPrivileged ? 'block' : 'none';

    const posId = document.getElementById('filter-position').value;
    const tag = document.getElementById('filter-tags').value;
    const isUnion = document.getElementById('filter-union').checked;

    let query = _supabase
        .from('employees')
        .select(`*, employee_positions!left(positions!employee_positions_position_id_fkey(name))`)
        .order('full_name', { ascending: true });

    if (posId) query = _supabase.from('employees').select(`*, employee_positions!inner(positions!employee_positions_position_id_fkey(name))`).eq('employee_positions.position_id', posId).order('full_name', { ascending: true });
    if (tag) query = query.ilike('tags', `%${tag}%`);
    if (isUnion) query = query.eq('is_union_electrician', true);

    const { data: employees, error } = await query;

    if (error || !employees) {
        console.error('Error fetching employees:', error);
        tableBody.innerHTML = `<tr><td colspan="6">Error loading employees.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    employees.forEach(employee => {
        const posNames = employee.employee_positions.map(ep => ep.positions.name).join(', ') || 'N/A';
        let flagsHtml = '<div class="employee-flags">';
        if (isPrivileged && employee.is_last_option) flagsHtml += `<span class="flag-last-option">Last Option</span>`;
        if (employee.is_union_electrician) flagsHtml += `<span class="flag-union">Union</span>`;
        flagsHtml += '</div>';

        const autoBookCell = isPrivileged ? `<td>${employee.is_autobook ? 'Yes' : 'No'}</td>` : '';
        const notesCell = isPrivileged ? `<td>${employee.notes || ''}</td>` : '';
        
        // Determine if this row belongs to the logged-in user
        const isMe = currentUserId && employee.user_id === currentUserId;
        const canEdit = isPrivileged || isMe;
        const canDelete = isPrivileged;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${employee.full_name}</strong>${flagsHtml}</td>
            <td>${posNames}</td>
            <td><div class="contact-info"><span>${employee.email || 'N/A'}</span><span>${employee.phone || 'N/A'}</span></div></td>
            ${autoBookCell}
            ${notesCell}
            <td>
                ${canEdit ? `<button class="btn btn-secondary edit-btn" data-employee-id="${employee.id}" style="padding: 0.5rem 1rem;">Edit</button>` : ''}
                ${canDelete ? `<button class="btn btn-danger delete-btn" data-employee-id="${employee.id}">Delete</button>` : ''}
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    addDeleteButtonListeners();
    addEditButtonListeners();
}

function addEmployeeFormListener() {
    const form = document.getElementById('add-employee-form');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const tags = parseTags(formData.get('tags'));
        const employeeData = {
            full_name: formData.get('full_name'), email: formData.get('email'), phone: formData.get('phone'),
            notes: formData.get('notes'), is_autobook: formData.get('is_autobook') === 'on',
            is_last_option: formData.get('is_last_option') === 'on', is_union_electrician: formData.get('is_union_electrician') === 'on',
            tags: tags
        };
        const { data: newEmployee, error: empError } = await _supabase.from('employees').insert(employeeData).select().single();
        if (empError) return alert(`Failed to save employee: ${empError.message}`);
        const selectedPositionIds = Array.from(form.querySelectorAll('input[name="positions"]:checked')).map(cb => cb.value);
        if (selectedPositionIds.length > 0) {
            const positionLinks = selectedPositionIds.map(posId => ({ employee_id: newEmployee.id, position_id: posId }));
            await _supabase.from('employee_positions').insert(positionLinks);
        }
        alert('Employee added successfully!');
        form.reset(); document.getElementById('add-employee-modal').style.display = 'none'; loadFilteredEmployees();
    });
}

function addDeleteButtonListeners() {
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', () => handleDeleteEmployee(button.dataset.employeeId));
    });
}
async function handleDeleteEmployee(employeeId) {
    if(!confirm("Are you sure? This will also remove them from all shifts.")) return;
    await _supabase.from('employee_positions').delete().eq('employee_id', employeeId);
    await _supabase.from('assignments').delete().eq('employee_id', employeeId);
    await _supabase.from('timecard_entries').delete().eq('employee_id', employeeId);
    await _supabase.from('availability_requests').delete().eq('employee_id', employeeId);
    const { error } = await _supabase.from('employees').delete().eq('id', employeeId);
    if (error) alert(error.message); else { alert('Deleted.'); loadFilteredEmployees(); }
}

function addEditButtonListeners() {
    document.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', () => openEditModal(button.dataset.employeeId));
    });
}
async function openEditModal(employeeId) {
    const { data: employee, error } = await _supabase.from('employees').select('*, employee_positions(position_id)').eq('id', employeeId).single();
    if (error) return alert('Could not fetch employee data.');
    
    const form = document.getElementById('edit-employee-form');
    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    // Populate basic fields
    form.elements.employee_id.value = employee.id;
    form.elements.full_name.value = employee.full_name;
    form.elements.email.value = employee.email;
    form.elements.phone.value = employee.phone;
    
    // Populate sensitive fields only if allowed
    // We simply hide/show the container divs based on role
    document.getElementById('edit-modal-tags-section').style.display = isPrivileged ? 'block' : 'none';
    document.getElementById('edit-modal-flags-section').style.display = isPrivileged ? 'block' : 'none';
    document.getElementById('edit-modal-notes-section').style.display = isPrivileged ? 'block' : 'none';

    if (isPrivileged) {
        form.elements.notes.value = employee.notes;
        form.elements.tags.value = employee.tags ? employee.tags.join(', ') : '';
        form.elements.is_autobook.checked = employee.is_autobook;
        form.elements.is_last_option.checked = employee.is_last_option;
        form.elements.is_union_electrician.checked = employee.is_union_electrician;
    }

    form.querySelectorAll('input[name="edit_positions"]').forEach(cb => cb.checked = false);
    const currentPositionIds = employee.employee_positions.map(ep => ep.position_id);
    currentPositionIds.forEach(posId => {
        const checkbox = form.querySelector(`input[name="edit_positions"][value="${posId}"]`);
        if (checkbox) checkbox.checked = true;
    });
    document.getElementById('edit-employee-modal').style.display = 'flex';
}

async function handleEditFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const employeeId = formData.get('employee_id');
    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    // Base data everyone can edit
    const employeeData = {
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
    };

    // Privileged data only updated if user is admin/manager
    if (isPrivileged) {
        employeeData.notes = formData.get('notes');
        employeeData.tags = parseTags(formData.get('tags'));
        employeeData.is_autobook = formData.get('is_autobook') === 'on';
        employeeData.is_last_option = formData.get('is_last_option') === 'on';
        employeeData.is_union_electrician = formData.get('is_union_electrician') === 'on';
    }

    const { error: empError } = await _supabase.from('employees').update(employeeData).eq('id', employeeId);
    if (empError) return alert(`Error: ${empError.message}`);

    const { error: deletePosError } = await _supabase.from('employee_positions').delete().eq('employee_id', employeeId);
    if (deletePosError) return alert(`Error: ${deletePosError.message}`);
    
    const selectedPositionIds = Array.from(form.querySelectorAll('input[name="edit_positions"]:checked')).map(cb => cb.value);
    if (selectedPositionIds.length > 0) {
        const positionLinks = selectedPositionIds.map(posId => ({ employee_id: employeeId, position_id: posId }));
        await _supabase.from('employee_positions').insert(positionLinks);
    }
    
    alert('Updated successfully!');
    document.getElementById('edit-employee-modal').style.display = 'none';
    loadFilteredEmployees();
}

loadPositions();
loadFilteredEmployees();
addEmployeeFormListener();
document.getElementById('edit-modal-close-btn').onclick = () => { document.getElementById('edit-employee-modal').style.display = 'none'; };
document.getElementById('edit-modal-cancel-btn').onclick = () => { document.getElementById('edit-employee-modal').style.display = 'none'; };
document.getElementById('edit-employee-form').addEventListener('submit', handleEditFormSubmit);
const addBtn = document.getElementById('add-employee-btn');
if(addBtn) addBtn.addEventListener('click', () => { document.getElementById('add-employee-modal').style.display = 'flex'; });
document.getElementById('add-modal-close-btn').onclick = () => { document.getElementById('add-employee-modal').style.display = 'none'; };
document.getElementById('add-modal-cancel-btn').onclick = () => { document.getElementById('add-employee-modal').style.display = 'none'; };
document.getElementById('filter-btn').addEventListener('click', loadFilteredEmployees);
document.getElementById('reset-btn').addEventListener('click', () => {
    document.getElementById('filter-position').value = '';
    document.getElementById('filter-tags').value = '';
    document.getElementById('filter-union').checked = false;
    loadFilteredEmployees();
});