import { _supabase } from './auth.js';

const createProjectForm = document.getElementById('create-project-form');

createProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('project-name').value;
    const startDate = document.getElementById('start-date').value;
    const status = document.getElementById('project-status').value;
    const isUnion = document.getElementById('is-union-project').checked;

    const newProject = {
        name: name,
        start_date: startDate,
        status: status,
        is_union_project: isUnion
    };

    const { data, error } = await _supabase
        .from('projects')
        .insert([newProject])
        .select();

    if (error) {
        console.error('Error creating project:', error);
        alert('Error creating project: ' + error.message);
    } else {
        alert('Project created successfully!');
        window.location.href = '/projects.html';
    }
});