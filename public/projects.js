import { _supabase, getUserRole } from './auth.js';

async function loadProjects() {
    const tableBody = document.getElementById('projects-list-table');
    const urlParams = new URLSearchParams(window.location.search);
    const filterStatus = urlParams.get('status') || 'active';

    // --- ROLE CHECK ---
    const role = getUserRole();
    if (role === 'crew') {
        const createBtn = document.getElementById('create-project-btn');
        if (createBtn) createBtn.style.display = 'none';
    }
    // ------------------

    const activeBtn = document.getElementById('active-projects-btn');
    const completedBtn = document.getElementById('completed-projects-btn');
    
    if (activeBtn && completedBtn) {
        if (filterStatus === 'active') {
            activeBtn.classList.add('btn-primary'); activeBtn.classList.remove('btn-secondary');
            completedBtn.classList.add('btn-secondary'); completedBtn.classList.remove('btn-primary');
        } else {
            completedBtn.classList.add('btn-primary'); completedBtn.classList.remove('btn-secondary');
            activeBtn.classList.add('btn-secondary'); activeBtn.classList.remove('btn-primary');
        }
    }

    const { data: projects, error } = await _supabase
        .from('projects')
        .select('*')
        .eq('status', filterStatus)
        .order('start_date', { ascending: false });

    if (error) { tableBody.innerHTML = `<tr><td colspan="5">Error loading projects.</td></tr>`; return; }
    if (projects.length === 0) { tableBody.innerHTML = `<tr><td colspan="5">No ${filterStatus} projects found.</td></tr>`; return; }

    tableBody.innerHTML = '';
    projects.forEach(project => {
        const startDate = new Date(project.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endDate = new Date(project.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const dateRange = `${startDate} - ${endDate}`;
        const statusDisplay = project.status === 'active' 
            ? `<span style="color: var(--primary-color); font-weight: 600;">Active</span>`
            : `<span style="color: var(--secondary-color);">Completed</span>`;
        
        // Only show "Mark Complete" if admin/manager
        const completeButtonHtml = (filterStatus === 'active' && role !== 'crew')
            ? `<button class="btn btn-success btn-complete" data-project-id="${project.id}" style="padding: 0.5rem 1rem; margin-left: 0.5rem;">Mark as Complete</button>`
            : '';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${project.name}</strong></td>
            <td>${project.client_name || 'N/A'}</td>
            <td>${dateRange}</td>
            <td>${statusDisplay}</td>
            <td>
                <a href="/project-details.html?id=${project.id}" class="btn btn-secondary" style="padding: 0.5rem 1rem;">View</a>
                ${completeButtonHtml}
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    if (role !== 'crew') addCompleteButtonListeners();
}

async function handleCompleteProject(projectId) {
    if (!confirm("Mark as completed?")) return;
    const { error } = await _supabase.from('projects').update({ status: 'completed' }).eq('id', projectId);
    if (error) alert(error.message); else { alert('Project marked as completed.'); loadProjects(); }
}

function addCompleteButtonListeners() {
    document.querySelectorAll('.btn-complete').forEach(button => {
        button.addEventListener('click', () => handleCompleteProject(button.dataset.projectId));
    });
}

loadProjects();