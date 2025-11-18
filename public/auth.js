import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = 'https://dblgrrusqxkdwgzyagtg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibGdycnVzcXhrZHdnenlhZ3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NDYzNTcsImV4cCI6MjA3NzAyMjM1N30.Au4AyxrxE0HzLqYWfMcUePMesbZTrfoIFF3Cp0RloWI';

// 1. Create and export the Supabase client
export const _supabase = createClient(supabaseUrl, supabaseKey);

// 2. Check for a valid session
const { data: { session } } = await _supabase.auth.getSession();

if (!session) {
    // No user is logged in. Redirect to the login page.
    window.location.href = '/login.html';
} else {
    // User is logged in. Now, find their employee profile and role.
    const { data: employee, error } = await _supabase
        .from('employees')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

    if (error || !employee) {
        console.error("Authenticated user has no matching employee profile.");
        localStorage.setItem('userRole', 'crew');
    } else {
        // Success! Store the user's role locally.
        localStorage.setItem('userRole', employee.role);
    }
}

// 3. Export a helper function
export function getUserRole() {
    return localStorage.getItem('userRole') || 'crew';
}