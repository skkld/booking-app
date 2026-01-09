import { _supabase } from './auth.js';

<<<<<<< HEAD
const createProjectForm = document.getElementById('create-project-form');

createProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Mapping HTML IDs to the Database Columns
    const newProject = {
        name: document.getElementById('name').value,
        client_name: document.getElementById('client_name').value,
        start_date: document.getElementById('start_date').value,
        end_date: document.getElementById('end_date').value,
        venue_address: document.getElementById('venue_address').value,
        on_site_contact: document.getElementById('on_site_contact').value,
        dress_code: document.getElementById('dress_code').value,
        parking_instructions: document.getElementById('parking_instructions').value,
        is_union_project: document.getElementById('is_union_project').checked,
        project_notes: document.getElementById('project_notes').value,
        status: 'active' // Default status
    };

=======
const form = document.getElementById('create-project-form');
// Add this near the top of the file
const addressInput = document.getElementById('venue_address');

// Add this new function
async function fetchTimezone() {
    const address = addressInput.value;
    if (address.length < 5) return; // Don't search for tiny strings

    try {
        const { data, error } = await _supabase.functions.invoke('get-timezone-from-address', {
            body: { address: address },
        });
        if (error) throw error;

        // Save the timezone ID in our hidden input
        document.getElementById('timezone').value = data.timezoneId;
    } catch (err) {
        console.error('Timezone fetch failed:', err);
    }
}

// Add the listener
addressInput.addEventListener('blur', fetchTimezone);
<form>
    <input type="hidden" name="timezone" id="timezone">
</form>
form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const projectData = {};
// Inside the submit handler
const projectData = {
    // ... all other fields
    timezone: formData.get('timezone') || 'UTC'
};
// ... rest of the save logic
    // Collect all data from the form
    for (const [key, value] of formData.entries()) {
        projectData[key] = value;
    }

    // Convert local datetime to the format Supabase expects (ISO 8601)
    projectData.start_date = new Date(projectData.start_date).toISOString();
    projectData.end_date = new Date(projectData.end_date).toISOString();
    projectData.is_union_project = formData.get('is_union_project') === 'on';
    
    // Save the project directly
>>>>>>> parent of 812755b (Update all files)
    const { data, error } = await _supabase
        .from('projects')
        .insert([projectData])
        .select()
        .single();

    if (error) {
        console.error('Error creating project:', error);
<<<<<<< HEAD
        // If you see "Could not find column", check your Supabase table names
        alert('Error creating project: ' + error.message);
=======
        alert(`Failed to create project: ${error.message}`);
>>>>>>> parent of 812755b (Update all files)
    } else {
        alert('Project created successfully!');
        // Redirect to the new project's detail page
        window.location.href = `/project-details.html?id=${data.id}`;
    }
});