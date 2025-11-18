import { getUserRole } from './auth.js'; // Import the new role function

import { _supabase } from './auth.js';

// --- ROLE-BASED ACCESS ---
function checkAdminAccess() {
    const userRole = getUserRole();
    
    if (userRole === 'admin') {
        // Show all admin-only tabs
        document.querySelector('button[data-tab="users-tab"]').style.display = 'block';
        document.querySelector('button[data-tab="positions-tab"]').style.display = 'block';

        // Set the default view for an Admin
        document.querySelector('button[data-tab="payroll-rules-tab"]').classList.remove('active');
        document.getElementById('payroll-rules-tab').style.display = 'none';
        
        document.querySelector('button[data-tab="positions-tab"]').classList.add('active');
        document.getElementById('positions-tab').style.display = 'block';
    }
}

// --- TAB NAVIGATION ---
document.querySelectorAll('.tab-link').forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.dataset.tab;
        document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        button.classList.add('active');
        const tabContent = document.getElementById(tabId);
        if (tabContent) tabContent.style.display = 'block';
    });
});

// --- POSITIONS & RATES LOGIC ---
async function loadPositions() {
    const tableBody = document.getElementById('positions-list-table');
    const { data: positions, error } = await _supabase.from('positions').select('*').order('name');
    if (error) { tableBody.innerHTML = `<tr><td colspan="3">Error loading positions.</td></tr>`; return console.error(error); }
    if (positions.length === 0) { tableBody.innerHTML = `<tr><td colspan="3">No positions found.</td></tr>`; return; }
    tableBody.innerHTML = '';
    positions.forEach(pos => {
        const rateDisplay = pos.default_rate ? `$${Number(pos.default_rate).toFixed(2)}` : 'N/A';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${pos.name}</td>
            <td><span class="rate-display">${rateDisplay}</span><input type="number" class="rate-input" value="${pos.default_rate || 0}" step="0.01" min="0"></td>
            <td><button class="btn btn-secondary edit-rate-btn" style="padding: 0.5rem 1rem;">Edit</button><button class="btn btn-danger delete-pos-btn" data-pos-id="${pos.id}">Delete</button></td>
        `;
        tableBody.appendChild(row);
    });
    addDeleteButtonListeners();
    addEditButtonListeners();
}
async function handleAddPosition(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const newPosition = { name: formData.get('name'), default_rate: formData.get('default_rate') || null };
    const { error } = await _supabase.from('positions').insert([newPosition]);
    if (error) { alert(`Error adding position: ${error.message}`); } else { form.reset(); loadPositions(); }
}
function addDeleteButtonListeners() {
    document.querySelectorAll('.delete-pos-btn').forEach(button => {
        button.addEventListener('click', () => handleDeletePosition(button.dataset.posId));
    });
}
async function handleDeletePosition(positionId) {
    const confirmed = confirm("Are you sure? This will also remove it from all employees.");
    if (!confirmed) return;
    await _supabase.from('employee_positions').delete().eq('position_id', positionId);
    const { error } = await _supabase.from('positions').delete().eq('id', positionId);
    if (error) { alert(`Error deleting position: ${error.message}`); } else { loadPositions(); }
}
function addEditButtonListeners() {
    document.querySelectorAll('.edit-rate-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            const display = row.querySelector('.rate-display');
            const input = row.querySelector('.rate-input');
            const isEditing = input.classList.contains('visible');
            if (isEditing) {
                handleUpdateRate(row.querySelector('.delete-pos-btn').dataset.posId, input.value);
            } else {
                display.classList.add('hidden'); input.classList.add('visible');
                input.focus(); input.select(); e.target.textContent = 'Save';
            }
        });
    });
    document.querySelectorAll('.rate-input').forEach(input => {
        const row = input.closest('tr');
        const posId = row.querySelector('.delete-pos-btn').dataset.posId;
        input.addEventListener('blur', () => handleUpdateRate(posId, input.value));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    });
}
async function handleUpdateRate(positionId, newRate) {
    const { error } = await _supabase.from('positions').update({ default_rate: newRate }).eq('id', positionId);
    if (error) alert(`Error updating rate: ${error.message}`);
    loadPositions();
}
document.getElementById('add-position-form').addEventListener('submit', handleAddPosition);

// --- EMAIL TEMPLATE LOGIC ---
const templateModal = document.getElementById('template-modal');
const templateForm = document.getElementById('template-form');
async function loadTemplates() {
    const tableBody = document.getElementById('templates-list-table');
    const { data: templates, error } = await _supabase.from('email_templates').select('*');
    if (error) { tableBody.innerHTML = `<tr><td colspan="4">Error loading templates.</td></tr>`; return console.error(error); }
    tableBody.innerHTML = '';
    if (templates.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4">No templates found.</td></tr>`;
        return;
    }
    templates.forEach(template => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${template.template_name}</td>
            <td>${template.subject}</td>
            <td>${template.is_active ? '✔ Yes' : 'No'}</td>
            <td><button class="btn btn-secondary edit-template-btn" data-id="${template.id}" style="padding: 0.5rem 1rem;">Edit</button></td>
        `;
        tableBody.appendChild(row);
    });
    document.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', () => openTemplateModal(btn.dataset.id));
    });
}
async function openTemplateModal(id = null) {
    templateForm.reset();
    document.getElementById('template-id').value = '';
    if (id) {
        document.getElementById('template-modal-title').textContent = 'Edit Template';
        const { data: template } = await _supabase.from('email_templates').select('*').eq('id', id).single();
        if (template) {
            document.getElementById('template-id').value = template.id;
            document.getElementById('template-name').value = template.template_name;
            document.getElementById('template-subject').value = template.subject;
            document.getElementById('template-body').value = template.body;
            document.getElementById('template-active').checked = template.is_active;
        }
    } else {
        document.getElementById('template-modal-title').textContent = 'Add New Template';
    }
    templateModal.style.display = 'flex';
}
async function handleTemplateFormSubmit(event) {
    event.preventDefault();
    const templateId = document.getElementById('template-id').value;
    const templateData = {
        template_name: document.getElementById('template-name').value,
        subject: document.getElementById('template-subject').value,
        body: document.getElementById('template-body').value,
        is_active: document.getElementById('template-active').checked
    };
    let error;
    if (templateId) {
        ({ error } = await _supabase.from('email_templates').update(templateData).eq('id', templateId));
    } else {
        ({ error } = await _supabase.from('email_templates').insert(templateData));
    }
    if (error) { alert(`Error saving template: ${error.message}`); } else {
        alert('Template saved successfully!');
        templateModal.style.display = 'none';
        loadTemplates();
    }
}
document.getElementById('add-template-btn').addEventListener('click', () => openTemplateModal());
document.getElementById('template-modal-close').onclick = () => templateModal.style.display = 'none';
templateForm.addEventListener('submit', handleTemplateFormSubmit);
document.querySelector('button[data-tab="templates-tab"]').addEventListener('click', loadTemplates, { once: true });

// --- PAYROLL RULES LOGIC ---
const payrollForm = document.getElementById('payroll-rules-form');
async function loadPayrollRules() {
    const { data, error } = await _supabase.from('payroll_rules').select('*').eq('id', 1).single();
    if (error) return console.error("Error loading payroll rules:", error);
    if (data) {
        payrollForm.elements.week_start_day.value = data.week_start_day;
        payrollForm.elements.daily_overtime_threshold.value = data.daily_overtime_threshold;
        payrollForm.elements.night_premium_start.value = data.night_premium_start;
        payrollForm.elements.night_premium_end.value = data.night_premium_end;
        payrollForm.elements.auto_break_threshold.value = data.auto_break_threshold;
        payrollForm.elements.auto_break_duration.value = data.auto_break_duration;
    }
}
async function handlePayrollFormSubmit(event) {
    event.preventDefault();
    const formData = new FormData(payrollForm);
    const updatedRules = {
        week_start_day: formData.get('week_start_day'),
        daily_overtime_threshold: formData.get('daily_overtime_threshold'),
        night_premium_start: formData.get('night_premium_start'),
        night_premium_end: formData.get('night_premium_end'),
        auto_break_threshold: formData.get('auto_break_threshold'),
        auto_break_duration: formData.get('auto_break_duration')
    };
    const { error } = await _supabase.from('payroll_rules').update(updatedRules).eq('id', 1);
    if (error) { alert(`Error saving payroll rules: ${error.message}`); } else { alert('Payroll rules saved successfully!'); }
}
payrollForm.addEventListener('submit', handlePayrollFormSubmit);
document.querySelector('button[data-tab="payroll-rules-tab"]').addEventListener('click', loadPayrollRules, { once: true });

// --- UNION RULES LOGIC ---
const unionRulesForm = document.getElementById('union-rules-form');
async function loadUnionRules() {
    const { data, error } = await _supabase.from('union_payroll_rules').select('*').eq('id', 1).single();
    if (error) return console.error("Error loading union rules:", error);
    if (data) {
        unionRulesForm.elements.daily_overtime_threshold.value = data.daily_overtime_threshold;
        unionRulesForm.elements.night_premium_start.value = data.night_premium_start;
        unionRulesForm.elements.night_premium_end.value = data.night_premium_end;
        unionRulesForm.elements.auto_break_threshold.value = data.auto_break_threshold;
        unionRulesForm.elements.auto_break_duration.value = data.auto_break_duration;
        unionRulesForm.elements.calculate_sundays_as_ot.checked = data.calculate_sundays_as_ot;
    }
}
async function handleUnionFormSubmit(event) {
    event.preventDefault();
    const formData = new FormData(unionRulesForm);
    const updatedRules = {
        daily_overtime_threshold: formData.get('daily_overtime_threshold'),
        night_premium_start: formData.get('night_premium_start'),
        night_premium_end: formData.get('night_premium_end'),
        auto_break_threshold: formData.get('auto_break_threshold'),
        auto_break_duration: formData.get('auto_break_duration'),
        calculate_sundays_as_ot: formData.get('calculate_sundays_as_ot') === 'on'
    };
    const { error } = await _supabase.from('union_payroll_rules').update(updatedRules).eq('id', 1);
    if (error) { alert(`Error saving union rules: ${error.message}`); } else { alert('Union rules saved successfully!'); }
}
unionRulesForm.addEventListener('submit', handleUnionFormSubmit);
document.querySelector('button[data-tab="union-rules-tab"]').addEventListener('click', loadUnionRules, { once: true });

// --- USER MANAGEMENT LOGIC ---
const usersTab = document.querySelector('button[data-tab="users-tab"]');
const usersTableBody = document.getElementById('users-list-table');
const inviteUserForm = document.getElementById('invite-user-form');
const changePassModal = document.getElementById('change-password-modal');
const changePassForm = document.getElementById('change-password-form');
const deleteUserModal = document.getElementById('delete-user-modal');
const deleteUserForm = document.getElementById('delete-user-form');

async function loadUsers() {
    const { data: employees, error } = await _supabase.from('employees').select('user_id, full_name, email, role');
    if (error) return console.error(error);
    usersTableBody.innerHTML = '';
    employees.forEach(user => {
        if (!user.user_id) return;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>
                <button class="btn btn-secondary btn-change-pass" data-user-id="${user.user_id}" style="padding: 0.5rem 1rem;">Change Password</button>
                <button class="btn btn-danger btn-delete-user" data-user-id="${user.user_id}" style="margin-left: 0.5rem;">Delete</button>
            </td>
        `;
        usersTableBody.appendChild(row);
    });
    document.querySelectorAll('.btn-change-pass').forEach(btn => {
        btn.addEventListener('click', () => openChangePasswordModal(btn.dataset.userId));
    });
    document.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', () => openDeleteUserModal(btn.dataset.userId));
    });
}
usersTab.addEventListener('click', loadUsers, { once: true });
inviteUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;
    try {
        const { data, error } = await _supabase.functions.invoke('create-user', { body: { email, password, role } });
        if (error) throw error;
        alert('User created successfully!');
        inviteUserForm.reset();
        loadUsers();
    } catch (error) {
        console.error('Error creating user:', error);
        alert(`Failed to create user: ${error.message}`);
    }
});
function openChangePasswordModal(userId) {
    changePassForm.reset();
    document.getElementById('change-password-user-id').value = userId;
    changePassModal.style.display = 'flex';
}
changePassForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('change-password-user-id').value;
    const newPassword = document.getElementById('new-password').value;
    try {
        const { error } = await _supabase.functions.invoke('admin-reset-user-password', { body: { userId, newPassword } });
        if (error) throw error;
        alert('Password updated successfully!');
        changePassModal.style.display = 'none';
    } catch (error) { alert(`Failed: ${error.message}`); }
});
document.getElementById('change-password-close').onclick = () => changePassModal.style.display = 'none';
function openDeleteUserModal(userId) {
    deleteUserForm.reset();
    document.getElementById('delete-user-id').value = userId;
    deleteUserModal.style.display = 'flex';
}
deleteUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetUserId = document.getElementById('delete-user-id').value;
    const adminPassword = document.getElementById('admin-password-confirm').value;
    const { data: { user } } = await _supabase.auth.getUser();
    if (!confirm("Are you ABSOLUTELY sure? This action is permanent.")) return;
    try {
        const { error } = await _supabase.functions.invoke('admin-delete-user', { body: { targetUserId, adminEmail: user.email, adminPassword } });
        if (error) throw error;
        alert('User has been permanently deleted.');
        deleteUserModal.style.display = 'none';
        loadUsers();
    } catch (error) { alert(`Failed: ${error.message}`); }
});
document.getElementById('delete-user-close').onclick = () => deleteUserModal.style.display = 'none';

// --- INITIAL LOAD ---
checkAdminAccess(); // This runs first
// Load the data for the default-visible tab
if (getUserRole() === 'admin') {
    loadPositions();
} else {
    loadPayrollRules();
}