import { _supabase } from './auth.js';

// 1. Select the form element
const createProjectForm = document.getElementById('create-project-form');

// 2. Listen for the "Submit" event
createProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Stop the page from reloading

    // 3. Gather data from inputs
    const name = document.getElementById('project-name').value;
    const client = document.getElementById('client-name').value;
    const startDate = document.getElementById('start-date').value;
    const status = document.getElementById('project-status').value;
    
    // Checkbox returns 'true' or 'false'
    const isUnion = document.getElementById('is-union-project').checked;

    // 4. Create the data object for Supabase
    const newProject = {
        name: name,
        client: client,
        start_date: startDate,
        status: status,
        is_union_project: isUnion
    };

    // 5. Send to Database
    const { data, error } = await _supabase
        .from('projects')
        .insert([newProject])
        .select();

    // 6. Handle Response
    if (error) {
        console.error('Error creating project:', error);
        alert('Error creating project: ' + error.message);
    } else {
        // Success! Go back to the list.
        alert('Project created successfully!');
        window.location.href = '/projects.html';
    }
});