import { getUserRole } from './auth.js';

const supabaseUrl = 'https://dblgrrusqxkdwgzyagtg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibGdycnVzcXhrZHdnenlhZ3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NDYzNTcsImV4cCI6MjA3NzAyMjM1N30.Au4AyxrxE0HzLqYWfMcUePMesbZTrfoIFF3Cp0RloWI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// --- 1. ROLE-BASED ACCESS ---
function checkAdminAccess() {
    const userRole = getUserRole();
    
    const adminTabs = [
        'positions-tab', 
        'payroll-rules-tab', 
        'union-rules-tab', 
        'templates-tab'
    ];
    const superAdminTabs = ['users-tab'];

    if (userRole === 'admin' || userRole === 'manager') {
        // Show operational tabs for Admin and Manager
        adminTabs.forEach(tab => {
            document.querySelector(`button[data-tab="${tab}"]`).style.display = 'block';
        });
        
        // Only Admin sees User Management
        if (userRole === 'admin') {
            superAdminTabs.forEach(tab => {
                document.querySelector(`button[data-tab="${tab}"]`).style.display = 'block';
            });
            // Default to Positions for Admin
            document.querySelector('button[data-tab="my-account-tab"]').classList.remove('active');
            document.getElementById('my-account-tab').style.display = 'none';
            
            document.querySelector('button[data-tab="positions-tab"]').classList.add('active');
            document.getElementById('positions-tab').style.display = 'block';
        } else {
            // Default to Positions for Manager too
            document.querySelector('button[data-tab="my-account-tab"]').classList.remove('active');
            document.getElementById('my-account-tab').style.display = 'none';
            
            document.querySelector('button[data-tab="positions-tab"]').classList.add('active');
            document.getElementById('positions-tab').style.display = 'block';
        }
    } else {
        // Crew: Hide everything except My Account
        adminTabs.forEach(tab => {
            document.querySelector(`button[data-tab="${tab}"]`).style.display = 'none';
        });
        superAdminTabs.forEach(tab => {
            document.querySelector(`button[data-tab="${tab}"]`).style.display = 'none';
        });
        
        // Force My Account active
        document.querySelector('button[data-tab="my-account-tab"]').click();
    }
}

// --- 2. TAB NAVIGATION ---
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

// --- 3. MY ACCOUNT LOGIC ---
document.getElementById('my-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('my-new-password').value;
    const { error } = await _supabase.auth.updateUser({ password: newPassword });
    if (error) alert(`Error: ${error.message}`);
    else { 
        alert('Password updated successfully!');
        document.getElementById('my-new-password').value = '';
    }
});

// --- 4. POSITIONS & RATES LOGIC ---
async function loadPositions() {
    const tableBody = document.getElementById('positions-list-table');
    if (!tableBody) return;
    const { data: positions, error } = await _supabase.from('positions').select('*').order('name');
    if (error) { console.error(error); return; }
    tableBody.innerHTML = '';
    positions.forEach(pos => {
        const rateDisplay = pos.default_rate ? `$${Number(pos.default_rate).toFixed(2)}` : 'N/A';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${pos.name}</td>
            <td><span class="rate-display">${rateDisplay}</span><input type="number" class="rate-input" value="${pos.default_rate || 0}" step="0.01" min="0" style="display:none; width: 80px;"></td>
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
    if (error) alert(`Error: ${error.message}`);
    else { form.reset(); loadPositions(); }
}

function addDeleteButtonListeners() {
    document.querySelectorAll('.delete-pos-btn').forEach(button => {
        button.addEventListener('click', async () => {
            if(!confirm("Delete this position?")) return;
            await _supabase.from('employee_positions').delete().eq('position_id', button.dataset.posId);
            const { error } = await _supabase.from('positions').delete().eq('id', button.dataset.posId);
            if (error) alert(error.message); else loadPositions();
        });
    });
}

function addEditButtonListeners() {
    document.querySelectorAll('.edit-rate-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            const display = row.querySelector('.rate-display');
            const input = row.querySelector('.rate-input');
            const isEditing = input.style.display === 'inline-block';

            if (isEditing) {
                handleUpdateRate(row.querySelector('.delete-pos-btn').dataset.posId, input.value);
            } else {
                display.style.display = 'none';
                input.style.display = 'inline-block';
                input.focus();
                e.target.textContent = 'Save';
            }
        });
    });
}

async function handleUpdateRate(positionId, newRate) {
    const { error } = await _supabase.from('positions').update({ default_rate: newRate }).eq('id', positionId);
    if (error) alert(`Error: ${error.message}`);
    loadPositions();
}

document.getElementById('add-position-form').addEventListener('submit', handleAddPosition);


// --- 5. PAYROLL RULES LOGIC ---
const payrollForm = document.getElementById('payroll-rules-form');
async function loadPayrollRules() {
    const { data } = await _supabase.from('payroll_rules').select('*').eq('id', 1).single();
    if(data && payrollForm) {
        if (payrollForm.elements.week_start_day) payrollForm.elements.week_start_day.value = data.week_start_day;
        if (payrollForm.elements.daily_overtime_threshold) payrollForm.elements.daily_overtime_threshold.value = data.daily_overtime_threshold;
        if (payrollForm.elements.night_premium_start) payrollForm.elements.night_premium_start.value = data.night_premium_start;
        if (payrollForm.elements.night_premium_end) payrollForm.elements.night_premium_end.value = data.night_premium_end;
        if (payrollForm.elements.auto_break_threshold) payrollForm.elements.auto_break_threshold.value = data.auto_break_threshold;
        if (payrollForm.elements.auto_break_duration) payrollForm.elements.auto_break_duration.value = data.auto_break_duration;
    }
}
if (payrollForm) {
    payrollForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(payrollForm);
        const updates = {
            week_start_day: fd.get('week_start_day'),
            daily_overtime_threshold: fd.get('daily_overtime_threshold'),
            night_premium_start: fd.get('night_premium_start'),
            night_premium_end: fd.get('night_premium_end'),
            auto_break_threshold: fd.get('auto_break_threshold'),
            auto_break_duration: fd.get('auto_break_duration')
        };
        const { error } = await _supabase.from('payroll_rules').update(updates).eq('id', 1);
        if(error) alert(error.message); else alert("Payroll rules saved.");
    });
}

// --- 6. UNION RULES LOGIC ---
const unionForm = document.getElementById('union-rules-form');
async function loadUnionRules() {
    const { data } = await _supabase.from('union_payroll_rules').select('*').eq('id', 1).single();
    if(data && unionForm) {
        if (unionForm.elements.daily_overtime_threshold) unionForm.elements.daily_overtime_threshold.value = data.daily_overtime_threshold;
        if (unionForm.elements.night_premium_start) unionForm.elements.night_premium_start.value = data.night_premium_start;
        if (unionForm.elements.night_premium_end) unionForm.elements.night_premium_end.value = data.night_premium_end;
        if (unionForm.elements.auto_break_threshold) unionForm.elements.auto_break_threshold.value = data.auto_break_threshold;
        if (unionForm.elements.auto_break_duration) unionForm.elements.auto_break_duration.value = data.auto_break_duration;
        if (unionForm.elements.calculate_sundays_as_ot) unionForm.elements.calculate_sundays_as_ot.checked = data.calculate_sundays_as_ot;
    }
}
if (unionForm) {
    unionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(unionForm);
        const updates = {
            daily_overtime_threshold: fd.get('daily_overtime_threshold'),
            night_premium_start: fd.get('night_premium_start'),
            night_premium_end: fd.get('night_premium_end'),
            auto_break_threshold: fd.get('auto_break_threshold'),
            auto_break_duration: fd.get('auto_break_duration'),
            calculate_sundays_as_ot: fd.get('calculate_sundays_as_ot') === 'on'
        };
        const { error } = await _supabase.from('union_payroll_rules').update(updates).eq('id', 1);
        if(error) alert(error.message); else alert("Union rules saved.");
    });
}

// --- 7. EMAIL TEMPLATE LOGIC ---
const templateModal = document.getElementById('template-modal');
const templateForm = document.getElementById('template-form');

async function loadTemplates() {
    const tableBody = document.getElementById('templates-list-table');
    if (!tableBody) return;
    const { data: templates, error } = await _supabase.from('email_templates').select('*');
    if (error) { console.error(error); return; }
    tableBody.innerHTML = '';
    if (!templates || templates.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4">No templates found.</td></tr>`;
        return;
    }
    templates.forEach(template => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${template.template_name}</td><td>${template.subject}</td><td>${template.is_active ? '✔' : ''}</td><td><button class="btn btn-secondary edit-template-btn" data-id="${template.id}">Edit</button></td>`;
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

if (templateForm) {
    templateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('template-id').value;
        const data = {
            template_name: document.getElementById('template-name').value,
            subject: document.getElementById('template-subject').value,
            body: document.getElementById('template-body').value,
            is_active: document.getElementById('template-active').checked
        };
        
        let error;
        if (id) {
            ({ error } = await _supabase.from('email_templates').update(data).eq('id', id));
        } else {
            ({ error } = await _supabase.from('email_templates').insert(data));
        }
        if (error) alert(error.message); else { alert("Template saved."); templateModal.style.display = 'none'; loadTemplates(); }
    });
}
document.getElementById('add-template-btn').addEventListener('click', () => openTemplateModal());
document.getElementById('template-modal-close').onclick = () => templateModal.style.display = 'none';


// --- 8. USER MANAGEMENT LOGIC ---
const usersTableBody = document.getElementById('users-list-table');
const inviteUserForm = document.getElementById('invite-user-form');
const changePassModal = document.getElementById('change-password-modal');
const changePassForm = document.getElementById('change-password-form');
const deleteUserModal = document.getElementById('delete-user-modal');
const deleteUserForm = document.getElementById('delete-user-form');

async function loadUsers() {
    if (!usersTableBody) return;
    const { data: employees } = await _supabase.from('employees').select('user_id, full_name, email, role');
    usersTableBody.innerHTML = '';
    if (!employees) return;
    
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
        btn.addEventListener('click', () => {
            document.getElementById('change-password-form').reset();
            document.getElementById('change-password-user-id').value = btn.dataset.userId;
            changePassModal.style.display = 'flex';
        });
    });
    
    document.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('delete-user-form').reset();
            document.getElementById('delete-user-id').value = btn.dataset.userId;
            deleteUserModal.style.display = 'flex';
        });
    });
}

if (inviteUserForm) {
    inviteUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('user-email').value;
        const password = document.getElementById('user-password').value;
        const role = document.getElementById('user-role').value;
        
        try {
            const { error } = await _supabase.functions.invoke('create-user', { body: { email, password, role } });
            if (error) throw error;
            alert('User created successfully!');
            inviteUserForm.reset();
            loadUsers();
        } catch (error) {
            console.error('Error creating user:', error);
            alert(`Failed to create user: ${error.message}`);
        }
    });
}

if (changePassForm) {
    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('change-password-user-id').value;
        const newPassword = document.getElementById('new-password').value;
        try {
            const { error } = await _supabase.functions.invoke('admin-reset-user-password', { body: { userId, newPassword } });
            if (error) throw error;
            alert('Password updated.');
            changePassModal.style.display = 'none';
        } catch (error) { alert(`Failed: ${error.message}`); }
    });
}

if (deleteUserForm) {
    document.getElementById('delete-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetUserId = document.getElementById('delete-user-id').value;
        const adminPassword = document.getElementById('admin-password-confirm').value;
        const { data: { user } } = await _supabase.auth.getUser();
        
        try {
            const { error } = await _supabase.functions.invoke('admin-delete-user', { body: { targetUserId, adminEmail: user.email, adminPassword } });
            if (error) throw error;
            alert('User deleted.');
            deleteUserModal.style.display = 'none';
            loadUsers();
        } catch (error) { alert(`Failed: ${error.message}`); }
    });
}

if (document.getElementById('change-password-close')) document.getElementById('change-password-close').onclick = () => changePassModal.style.display = 'none';
if (document.getElementById('delete-user-close')) document.getElementById('delete-user-close').onclick = () => deleteUserModal.style.display = 'none';


// --- INITIALIZATION ---
checkAdminAccess();

// Only try to load these if we have access (otherwise they might 401 error)
const role = import('./auth.js').then(m => {
    const r = m.getUserRole();
    if (r === 'admin' || r === 'manager') {
        loadPositions();
        loadPayrollRules();
        loadUnionRules();
        loadTemplates();
    }
    if (r === 'admin') {
        loadUsers();
    }
});