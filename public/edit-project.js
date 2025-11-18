import { _supabase } from './auth.js';

const form = document.getElementById('edit-project-form');
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

// Helper to format date for <input type="datetime-local">
const formatDateTimeLocal = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
};

// Function to fetch timezone from address
async function fetchTimezone() {
    const address = document.getElementById('venue_address').value;
    if (address.length < 5) return; 
    try {
        const { data, error } = await _supabase.functions.invoke('get-timezone-from-address', {
            body: { address: address },
        });
        if (error) throw error;
        document.getElementById('timezone').value = data.timezoneId;
    } catch (err) {
        console.error('Timezone fetch failed:', err);
    }
}
document.getElementById('venue_address').addEventListener('blur', fetchTimezone);

// Function to fetch project data and pre-fill the form
async function loadProjectData() {
    if (!projectId) {
        alert('No project ID provided.');
        window.location.href = '/';
        return;
    }

    const { data: project, error } = await _supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (error) {
        console.error('Error fetching project:', error);
        alert('Failed to load project data.');
        return;
    }

    // Pre-fill all the form fields
    form.elements.name.value = project.name;
    form.elements.client_name.value = project.client_name;
    form.elements.start_date.value = formatDateTimeLocal(project.start_date);
    form.elements.end_date.value = formatDateTimeLocal(project.end_date);
    form.elements.venue_address.value = project.venue_address;
    form.elements.on_site_contact.value = project.on_site_contact;
    form.elements.dress_code.value = project.dress_code;
    form.elements.parking_instructions.value = project.parking_instructions;
    form.elements.project_notes.value = project.project_notes;
    form.elements.timezone.value = project.timezone; // Pre-fill timezone
    form.elements.is_union_project.checked = project.is_union_project; // Pre-fill union status
}

// Handle the form submission to UPDATE the data
form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form); // formData is declared HERE
    const updatedData = {};
    for (const [key, value] of formData.entries()) {
        updatedData[key] = value;
    }
    
    // Convert dates and checkboxes to correct format
    updatedData.start_date = new Date(updatedData.start_date).toISOString();
    updatedData.end_date = new Date(updatedData.end_date).toISOString();
    updatedData.is_union_project = formData.get('is_union_project') === 'on';
    if (!updatedData.timezone) updatedData.timezone = 'UTC'; // Fallback timezone

    const { error } = await _supabase
        .from('projects')
        .update(updatedData)
        .eq('id', projectId);

    if (error) {
        console.error('Error updating project:', error);
        alert(`Failed to update project: ${error.message}`);
    } else {
        alert('Project updated successfully!');
        window.location.href = `/project-details.html?id=${projectId}`;
    }
});

// Run the function to load the data when the page opens
loadProjectData();