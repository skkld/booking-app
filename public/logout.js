import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = 'https://dblgrrusqxkdwgzyagtg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibGdycnVzcXhrZHdnenlhZ3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NDYzNTcsImV4cCI6MjA3NzAyMjM1N30.Au4AyxrxE0HzLqYWfMcUePMesbZTrfoIFF3Cp0RloWI';

const _supabase = createClient(supabaseUrl, supabaseKey);

async function logout() {
    // 1. Tell Supabase to end the session
    await _supabase.auth.signOut();

    // 2. FORCE CLEAR all local browser data
    // This ensures login.js won't find any leftover tokens
    localStorage.clear();
    sessionStorage.clear();

    // 3. Redirect to login page
    // .replace() is better than .href here because it prevents the "Back" button 
    // from taking you back to the restricted page
    window.location.replace('/login.html');
}

const logoutButton = document.getElementById('logout-btn');
if (logoutButton) {
    logoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}