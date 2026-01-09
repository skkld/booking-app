import { _supabase } from './auth.js';

const createProjectForm = document.getElementById('create-project-form');

createProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Gather all fields
    const name = document.getElementById('project-name').value;
    const client = document.getElementById('client-name').value;
    const location = document.getElementById('project-location').value;
    const status = document.getElementById('project-status').value;
    
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const startTime = document.getElementById('start-time').value;
    const dressCode = document.getElementById('dress-code').value;
    
    const isUnion = document.getElementById('is-union-project').checked;

    // Construct the data object matching your Supabase table columns
    const newProject = {
        name: name,
        client: client,
        location: location,
        status: status,
        start_date: startDate,
        end_date: endDate || null, // Handle empty dates gracefully
        start_time: startTime || null, // Handle empty times gracefully
        dress_code: dressCode,
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