import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://pwmeplonzmcpyscujjkx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3bWVwbG9uem1jcHlzY3Vqamt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NjMxOTcsImV4cCI6MjA2NjQzOTE5N30.7cCIZ7z46veYI0wL5hj4dHP4Zv3iWn2W7dxbevYp7yU';

export const supabase = createClient(supabaseUrl, supabaseKey);
/*
*AVAILABLE CLINICS*
0b95522c-7287-42ef-a6f9-3b587c33ee20 = Mod Dental Clinic
15a83b95-cd36-4393-a06a-79b23b501bd1 = Guevarra Dental Clinic
3d362882-da27-4d88-ad4d-fdf62d2372d8 = Arzadon Clinic
7a9f15f6-7c2f-439e-ac48-1025bc380f4e = Megason Diagnostic Clinic
87e1863f-16cc-405c-a6bd-f2c841cccc3d = San Roque Medical Clinic
*/
export const clinicId = '0b95522c-7287-42ef-a6f9-3b587c33ee20'; 
