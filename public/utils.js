// This is a global user preference, we'll fetch it from the DB
let timeFormat = '12h'; // default

// Call this once on page load in your main scripts
export async function loadDisplayPreferences(supabase) {
    const { data } = await supabase.from('payroll_rules').select('time_format').eq('id', 1).single();
    if (data) timeFormat = data.time_format;
}

// The main formatting function
export function formatProjectTime(dateStr, projectTimezone, options = {}) {
    const date = new Date(dateStr);
    if (isNaN(date)) return "Invalid Date";

    const defaultOptions = {
        timeZone: projectTimezone,
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: timeFormat === '12h',
        ...options
    };
    return date.toLocaleString('en-US', defaultOptions);
}