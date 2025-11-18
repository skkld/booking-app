import { _supabase } from './auth.js';

let allPositions = [];
const parseTags = (tagString) => {
    if (!tagString) return [];
    return tagString.split(',').map(tag => tag.trim()).filter(tag => tag);
};
async function loadPositions() {
    const { data: positions, error } = await _supabase.from('positions').select('*').order('name');
    if (error) { console.error('Error fetching positions:', error); return; }
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
async function loadFilteredEmployees() {
    const tableBody = document.getElementById('employee-list-table');
    tableBody.innerHTML = `<tr><td colspan="6">Loading employees...</td></tr>`;
    const posId = document.getElementById('filter-position').value;
    const tag = document.getElementById('filter-tags').value;
    const isUnion = document.getElementById('filter-union').checked;
    let query = _supabase.from('employees').select(`*, employee_positions!left(positions!employee_positions_position_id_fkey(name))`).order('full_name', { ascending: true });
    if (posId) {
        query = _supabase.from('employees').select(`*, employee_positions!inner(positions!employee_positions_position_id_fkey(name))`).eq('employee_positions.position_id', posId).order('full_name', { ascending: true });
    }
    if (tag) { query = query.ilike('tags', `%${tag}%`); }
    if (isUnion) { query = query.eq('is_union_electrician', true); }
    const { data: employees, error } = await query;
    if (error) {
        console.error('Error fetching employees:', error);
        tableBody.innerHTML = `<tr><td colspan="6">Error loading employees. See console.</td></tr>`;
        return;
    }
    if (employees.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6">No employees found matching your filters.</td></tr>`;
        return;
    }
    tableBody.innerHTML = '';
    employees.forEach(employee => {
        const posNames = employee.employee_positions.map(ep => ep.positions.name).join(', ') || 'N/A';
        let flagsHtml = '<div class="employee-flags">';
        if (employee.is_last_option) flagsHtml += `<span class="flag-last-option">Last Option</span>`;
        if (employee.is_union_electrician) flagsHtml += `<span class="flag-union">Union</span>`;
        flagsHtml += '</div>';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${employee.full_name}</strong>${flagsHtml}</td>
            <td>${posNames}</td>
            <td><div class="contact-info"><span>${employee.email || 'N/A'}</span><span>${employee.phone || 'N/A'}</span></div></td>
            <td>${employee.is_autobook ? 'Yes' : 'No'}</td>
            <td>${employee.notes || ''}</td>
            <td>
                <button class="btn btn-secondary edit-btn" data-employee-id="${employee.id}" style="padding: 0.5rem 1rem;">Edit</button>
                <button class="btn btn-danger delete-btn" data-employee-id="${employee.id}">Delete</button>
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
            const { error: posError } = await _supabase.from('employee_positions').insert(positionLinks);
            if (posError) return alert(`Employee saved, but failed to link positions: ${posError.message}`);
        }
        alert('Employee added successfully!');
        form.reset();
        document.getElementById('add-employee-modal').style.display = 'none';
        loadFilteredEmployees();
    });
}
function addDeleteButtonListeners() {
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', () => handleDeleteEmployee(button.dataset.employeeId));
    });
}
async function handleDeleteEmployee(employeeId) {
    const confirmed = confirm("Are you sure? This will also remove them from all shifts and timecards.");
    if (!confirmed) return;
    await _supabase.from('employee_positions').delete().eq('employee_id', employeeId);
    await _supabase.from('assignments').delete().eq('employee_id', employeeId);
    await _supabase.from('timecard_entries').delete().eq('employee_id', employeeId);
    await _supabase.from('availability_requests').delete().eq('employee_id', employeeId);
    const { error: empError } = await _supabase.from('employees').delete().eq('id', employeeId);
    if (empError) { alert(`Failed to delete employee: ${empError.message}`); } else { alert('Employee deleted successfully.'); loadFilteredEmployees(); }
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
    form.elements.employee_id.value = employee.id;
    form.elements.full_name.value = employee.full_name;
    form.elements.email.value = employee.email;
    form.elements.phone.value = employee.phone;
    form.elements.notes.value = employee.notes;
    form.elements.tags.value = employee.tags ? employee.tags.join(', ') : '';
    form.elements.is_autobook.checked = employee.is_autobook;
    form.elements.is_last_option.checked = employee.is_last_option;
    form.elements.is_union_electrician.checked = employee.is_union_electrician;
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
    const tags = parseTags(formData.get('tags'));
    const employeeData = {
        full_name: formData.get('full_name'), email: formData.get('email'), phone: formData.get('phone'),
        notes: formData.get('notes'), tags: tags,
        is_autobook: formData.get('is_autobook') === 'on',
        is_last_option: formData.get('is_last_option') === 'on', is_union_electrician: formData.get('is_union_electrician') === 'on'
    };
    const { error: empError } = await _supabase.from('employees').update(employeeData).eq('id', employeeId);
    if (empError) return alert(`Error updating employee: ${empError.message}`);
    const { error: deletePosError } = await _supabase.from('employee_positions').delete().eq('employee_id', employeeId);
    if (deletePosError) return alert(`Error clearing old positions: ${deletePosError.message}`);
    const selectedPositionIds = Array.from(form.querySelectorAll('input[name="edit_positions"]:checked')).map(cb => cb.value);
    if (selectedPositionIds.length > 0) {
        const positionLinks = selectedPositionIds.map(posId => ({ employee_id: employeeId, position_id: posId }));
        const { error: insertPosError } = await _supabase.from('employee_positions').insert(positionLinks);
        if (insertPosError) return alert(`Error saving new positions: ${insertPosError.message}`);
    }
    alert('Employee updated successfully!');
    document.getElementById('edit-employee-modal').style.display = 'none';
    loadFilteredEmployees();
}
loadPositions();
loadFilteredEmployees();
addEmployeeFormListener();
document.getElementById('edit-modal-close-btn').onclick = () => { document.getElementById('edit-employee-modal').style.display = 'none'; };
document.getElementById('edit-modal-cancel-btn').onclick = () => { document.getElementById('edit-employee-modal').style.display = 'none'; };
document.getElementById('edit-employee-form').addEventListener('submit', handleEditFormSubmit);
document.getElementById('add-employee-btn').addEventListener('click', () => { document.getElementById('add-employee-modal').style.display = 'flex'; });
document.getElementById('add-modal-close-btn').onclick = () => { document.getElementById('add-employee-modal').style.display = 'none'; };
document.getElementById('add-modal-cancel-btn').onclick = () => { document.getElementById('add-employee-modal').style.display = 'none'; };
document.getElementById('filter-btn').addEventListener('click', loadFilteredEmployees);
document.getElementById('reset-btn').addEventListener('click', () => {
    document.getElementById('filter-position').value = '';
    document.getElementById('filter-tags').value = '';
    document.getElementById('filter-union').checked = false;
    loadFilteredEmployees();
});