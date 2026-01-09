import { _supabase } from './auth.js';

const createProjectForm = document.getElementById('create-project-form');

createProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Get values from the full form
    const name = document.getElementById('project-name').value;
    const clientName = document.getElementById('client-name').value;
    const location = document.getElementById('project-location').value;
    const status = document.getElementById('project-status').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const startTime = document.getElementById('start-time').value;
    const dressCode = document.getElementById('dress-code').value;
    const isUnion = document.getElementById('is-union-project').checked;

    // 2. Prepare the object for the database.
    // IMPORTANT: These keys (left side) must match your Supabase columns EXACTLY.
    const newProject = {
        name: name,
        client_name: clientName, // Replaced 'client' with 'client_name' to fix your previous error
        location: location,
        status: status,
        start_date: startDate,
        end_date: endDate || null,
        start_time: startTime || null,
        dress_code: dressCode,
        is_union_project: isUnion
    };

    // 3. Insert into Supabase
    const { data, error } = await _supabase
        .from('projects')
        .insert([newProject])
        .select();

    if (error) {
        console.error('Error creating project:', error);
        // This will tell us if 'client_name' or another column name is wrong
        alert('Error creating project: ' + error.message);
    } else {
        alert('Project created successfully!');
        window.location.href = '/projects.html';
    }
});