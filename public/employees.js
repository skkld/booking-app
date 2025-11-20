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
    
    let checkboxesHtml = '';
    let editCheckboxesHtml = '';
    let filterOptionsHtml = '<option value="">Any Position</option>';
    
    allPositions.forEach(pos => {
        const defaultRateHint = pos.default_rate ? `($${pos.default_rate})` : '';
        
        // HTML for Add Modal
        checkboxesHtml += `
            <div class="position-row">
                <div class="position-label">
                    <input type="checkbox" name="positions" value="${pos.id}" id="pos-${pos.id}" class="pos-checkbox">
                    <label for="pos-${pos.id}">${pos.name} <small style="color:var(--text-muted)">${defaultRateHint}</small></label>
                </div>
                <input type="number" class="position-rate-input" data-pos-id="${pos.id}" placeholder="Rate" step="0.01">
            </div>`;
            
        // HTML for Edit Modal
        editCheckboxesHtml += `
            <div class="position-row">
                <div class="position-label">
                    <input type="checkbox" name="edit_positions" value="${pos.id}" id="edit-pos-${pos.id}" class="pos-checkbox">
                    <label for="edit-pos-${pos.id}">${pos.name} <small style="color:var(--text-muted)">${defaultRateHint}</small></label>
                </div>
                <input type="number" class="position-rate-input" id="edit-rate-${pos.id}" placeholder="Rate" step="0.01">
            </div>`;
            
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
    tableBody.innerHTML = `<tr><td colspan="7">Loading employees...</td></tr>`;

    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    const thAutobook = document.getElementById('th-autobook');
    const thNotes = document.getElementById('th-notes');
    const addBtn = document.getElementById('add-employee-btn');
    
    if (thAutobook) thAutobook.style.display = isPrivileged ? '' : 'none';
    if (thNotes) thNotes.style.display = isPrivileged ? '' : 'none';
    if (addBtn) addBtn.style.display = isPrivileged ? 'block' : 'none';

    const posId = document.getElementById('filter-position').value;
    const tag = document.getElementById('filter-tags').value;
    const isUnion = document.getElementById('filter-union').checked;

    // We need the employee_positions to display the specific rates, but for the main table view,
    // we will just list the position names to keep it clean.
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
        tableBody.innerHTML = `<tr><td colspan="7">Error loading employees.</td></tr>`;
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
        const rateCell = isPrivileged ? `<td>${employee.rate ? '$'+Number(employee.rate).toFixed(2) : '(Var)'}</td>` : `<td>-</td>`;

        const canEdit = isPrivileged || (currentUserId && employee.user_id === currentUserId);
        const canDelete = isPrivileged;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${employee.full_name}</strong>${flagsHtml}</td>
            <td>${posNames}</td>
            ${rateCell}
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
    
    addEditButtonListeners();
    if (isPrivileged) addDeleteButtonListeners();
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
            tags: tags, rate: formData.get('rate') || null // Base Rate
        };
        
        const { data: newEmployee, error: empError } = await _supabase.from('employees').insert(employeeData).select().single();
        if (empError) return alert(`Failed to save: ${empError.message}`);
        
        // **UPDATED: Collect Checked Positions AND their Specific Rates**
        const positionLinks = [];
        form.querySelectorAll('input[name="positions"]:checked').forEach(checkbox => {
            const posId = checkbox.value;
            // Find the sibling input with class 'position-rate-input' inside the same row
            const row = checkbox.closest('.position-row');
            const rateInput = row.querySelector('.position-rate-input');
            const specificRate = rateInput.value ? parseFloat(rateInput.value) : null;
            
            positionLinks.push({ 
                employee_id: newEmployee.id, 
                position_id: posId,
                hourly_rate: specificRate
            });
        });

        if (positionLinks.length > 0) {
            await _supabase.from('employee_positions').insert(positionLinks);
        }
        alert('Employee added!');
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
    // **UPDATED: Fetch positions WITH the override rate**
    const { data: employee, error } = await _supabase
        .from('employees')
        .select('*, employee_positions(position_id, hourly_rate)')
        .eq('id', employeeId)
        .single();
        
    if (error) return alert('Could not fetch data.');
    
    const form = document.getElementById('edit-employee-form');
    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    form.elements.employee_id.value = employee.id;
    form.elements.full_name.value = employee.full_name;
    form.elements.email.value = employee.email;
    form.elements.phone.value = employee.phone;
    
    if (form.elements.rate) {
        form.elements.rate.value = employee.rate;
        form.elements.rate.closest('.form-group').style.display = isPrivileged ? 'flex' : 'none';
    }
    
    const tagsSection = document.getElementById('edit-modal-tags-section'); // Assuming IDs from previous fix exist
    // If these IDs are missing in HTML, these lines might fail silently or need checks.
    // We assume the HTML from previous steps is used.
    
    if (isPrivileged) {
        form.elements.notes.value = employee.notes;
        form.elements.tags.value = employee.tags ? employee.tags.join(', ') : '';
        form.elements.is_autobook.checked = employee.is_autobook;
        form.elements.is_last_option.checked = employee.is_last_option;
        form.elements.is_union_electrician.checked = employee.is_union_electrician;
    } 

    // Reset UI
    form.querySelectorAll('input[name="edit_positions"]').forEach(cb => cb.checked = false);
    form.querySelectorAll('.position-rate-input').forEach(input => input.value = '');

    // **UPDATED: Populate Checkboxes AND Rates**
    if (employee.employee_positions) {
        employee.employee_positions.forEach(link => {
            const checkbox = form.querySelector(`input[name="edit_positions"][value="${link.position_id}"]`);
            if (checkbox) {
                checkbox.checked = true;
                // Find the sibling rate input
                const row = checkbox.closest('.position-row');
                const rateInput = row.querySelector('.position-rate-input');
                if (rateInput && link.hourly_rate) {
                    rateInput.value = link.hourly_rate;
                }
            }
        });
    }
    
    document.getElementById('edit-employee-modal').style.display = 'flex';
}

async function handleEditFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const employeeId = formData.get('employee_id');
    const userRole = getUserRole();
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    const employeeData = {
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
    };

    if (isPrivileged) {
        employeeData.notes = formData.get('notes');
        employeeData.tags = parseTags(formData.get('tags'));
        employeeData.is_autobook = formData.get('is_autobook') === 'on';
        employeeData.is_last_option = formData.get('is_last_option') === 'on';
        employeeData.is_union_electrician = formData.get('is_union_electrician') === 'on';
        employeeData.rate = formData.get('rate') || null;
    }

    const { error: empError } = await _supabase.from('employees').update(employeeData).eq('id', employeeId);
    if (empError) return alert(`Error: ${empError.message}`);

    // **UPDATED: Save Positions AND Rates**
    const { error: deletePosError } = await _supabase.from('employee_positions').delete().eq('employee_id', employeeId);
    if (deletePosError) return alert(`Error: ${deletePosError.message}`);
    
    const positionLinks = [];
    form.querySelectorAll('input[name="edit_positions"]:checked').forEach(checkbox => {
        const posId = checkbox.value;
        const row = checkbox.closest('.position-row');
        const rateInput = row.querySelector('.position-rate-input');
        const specificRate = rateInput.value ? parseFloat(rateInput.value) : null;
        
        positionLinks.push({ 
            employee_id: employeeId, 
            position_id: posId,
            hourly_rate: specificRate 
        });
    });

    if (positionLinks.length > 0) {
        await _supabase.from('employee_positions').insert(positionLinks);
    }
    
    alert('Updated!');
    document.getElementById('edit-employee-modal').style.display = 'none';
    loadFilteredEmployees();
}

// --- Initial Load & Listeners ---
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