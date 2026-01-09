import { _supabase } from './auth.js';

const createProjectForm = document.getElementById('create-project-form');

createProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newProject = {
        name: document.getElementById('name').value,
        client_name: document.getElementById('client_name').value,
        start_date: document.getElementById('start_date').value,
        end_date: document.getElementById('end_date').value || null,
        start_time: document.getElementById('start_time').value || null,
        venue_address: document.getElementById('venue_address').value,
        on_site_contact: document.getElementById('on_site_contact').value,
        dress_code: document.getElementById('dress_code').value,
        parking_instructions: document.getElementById('parking_instructions').value,
        project_notes: document.getElementById('project_notes').value,
        status: document.getElementById('project-status').value,
        is_union_project: document.getElementById('is_union_project').checked
    };

    const { data, error } = await _supabase
        .from('projects')
        .insert([newProject])
        .select();

    if (error) {
        console.error('Error creating project:', error);
        alert('Error: ' + error.message);
    } else {
        alert('Project created successfully!');
        window.location.href = '/projects.html';
    }
});