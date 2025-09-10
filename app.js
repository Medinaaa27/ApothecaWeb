import { supabase, clinicId } from './db.js';

let selectedAppointment = null;
let sortDesc = true;
let sortDescAccom = true;
let freezeAutoRefresh = false;
let clinicType = null;
let isMedicalClinic = false;

// Progress bar
function startLoadingBar() {
  const bar = document.getElementById('loading-bar');
  bar.style.width = '0%';
  bar.style.opacity = '1';
  setTimeout(() => bar.style.width = '80%', 50);
}

function finishLoadingBar() {
  const bar = document.getElementById('loading-bar');
  bar.style.width = '100%';
  setTimeout(() => {
    bar.style.opacity = '0';
    bar.style.width = '0%';
  }, 500);
}

async function loadClinicName() {
  const heading = document.getElementById('clinic-name');
  const { data, error } = await supabase
    .from('clinics')
    .select('name, type')
    .eq('id', clinicId)
    .single();
  if (error || !data) {
    heading.innerText = 'Clinic Name Unavailable';
    clinicType = null;
    isMedicalClinic = false;
  } else {
    heading.innerText = data.name;
    clinicType = data.type || null;
    isMedicalClinic = (data?.type || '').toLowerCase() === 'medical';
  }
}

function formatTimeTo12Hr(timeStr) {
  if (!timeStr) return '';
  const [hourStr, minuteStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr || '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

// Date utility functions for Philippine timezone
function getPhilippineDate() {
  // Get current date in Philippine timezone (UTC+8)
  const now = new Date();
  const philippineTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Manila"}));
  return philippineTime;
}

function formatDateForComparison(dateStr) {
  // Convert date string (YYYY-MM-DD) to Date object
  return new Date(dateStr + 'T00:00:00');
}

function getAppointmentCategory(appointmentDate) {
  const today = getPhilippineDate();
  const appointment = formatDateForComparison(appointmentDate);
  
  // Set time to start of day for comparison
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const appointmentStart = new Date(appointment.getFullYear(), appointment.getMonth(), appointment.getDate());
  
  if (appointmentStart.getTime() === todayStart.getTime()) {
    return 'today';
  } else if (appointmentStart.getTime() < todayStart.getTime()) {
    return 'past';
  } else {
    return 'upcoming';
  }
}


function showPage(page, options = {}) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.getElementById(page).style.display = 'block';

    if (page === 'requests') loadAppointments();
    if (page === 'accommodated') loadApprovedPatients();
    if (page === 'doctors') loadDoctors();
    if (page === 'calendar') loadCalendar();
    if (page === 'reports') generateReport();

    if (page === 'details') {
    const isManage = options.manageMode === true;
    if (!isManage) {
      document.getElementById('details-title').innerHTML = '';
      document.getElementById('details-content').innerHTML = '';
      document.getElementById('completed-list').style.display = '';
      document.getElementById('patient-list-section').style.display = '';
      document.getElementById('patient-details-filters').style.display = 'none';
      loadCompletedAppointments();
    } else {
      document.getElementById('completed-list').style.display = 'none';
      document.getElementById('patient-list-section').style.display = 'none';
    }
  }
}

// Sort toggles
document.getElementById('sort-toggle').addEventListener('click', () => {
  sortDesc = !sortDesc;
  document.getElementById('sort-toggle').innerText = sortDesc ? 'Sort: Newest' : 'Sort: Oldest';
  loadAppointments();
  loadCompletedAppointments();
});

window.toggleSortAccom = function () {
  sortDescAccom = !sortDescAccom;
  document.getElementById('accom-sort-toggle').innerText = sortDescAccom ? 'Sort: Latest Time' : 'Sort: Earliest Time';
  loadApprovedPatients();
};

// View upcoming appointment details
window.viewUpcomingDetails = async function(app) {
  const { name, address } = await getPatientInfo(app.user_id);
  const time12Hr = formatTimeTo12Hr(app.time);
  const specializationMap = await getSpecializationMap();
  
  const detailsHtml = `
    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 700px; margin: 20px auto;">
      <h3 style="margin-top: 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Appointment Details</h3>
      <div style="line-height: 1.6;">
        <strong>Patient Name:</strong> ${app.patient_name}<br><br>
        <strong>Patient Identity:</strong> ${app.patient_identity || 'N/A'}<br><br>
        <strong>Address:</strong> <small style="font-size: 0.9rem;">${address || 'N/A'}</small><br><br>
        <strong>Gender:</strong> ${app.patient_gender}<br><br>
        <strong>Age:</strong> ${app.patient_age}<br><br>
        <strong>Blood Type:</strong> ${app.blood_type || 'N/A'}<br><br>
        <strong>Date:</strong> ${app.date}<br><br>
        <strong>Time:</strong> ${time12Hr}<br><br>
        <strong>Reason:</strong> ${app.reason}<br><br>
        <strong>Doctor:</strong> ${app.doctors?.name || 'Unknown'}<br><br>
        <strong>Specialization:</strong> ${specializationMap[app.specialization_id] || 'No specialization'}<br>
      </div>
      <div style="margin-top: 50px; text-align: center;">
        <button onclick="closeUpcomingDetails()" style="background-color: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Close</button>
      </div>
    </div>
  `;
  
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'upcoming-details-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;
  modal.innerHTML = detailsHtml;
  
  document.body.appendChild(modal);
  
  // Close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeUpcomingDetails();
    }
  });
};

// Close upcoming details modal
window.closeUpcomingDetails = function() {
  const modal = document.getElementById('upcoming-details-modal');
  if (modal) {
    modal.remove();
  }
};

async function getPatientInfo(user_id) {
  const { data, error } = await supabase
    .from('patients')
    .select('full_name, address, gender')
    .eq('id', user_id)
    .single();
  return error ? { name: 'Unknown', address: 'No address', gender: 'N/A' } : {
    name: data.full_name,
    address: data.address,
    gender: data.gender || 'N/A'
  };
}

// Requests
async function loadAppointments() {
  startLoadingBar();
  
  // Save current scroll position
  const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
  
  const list = document.getElementById('appointments-list');

  const [appointmentsRes, doctorsRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('status', 'pending')
      .order('created_at', { ascending: !sortDesc }),
    getDoctorsForDropdown()
  ]);

  if (appointmentsRes.error) {
    list.innerHTML = 'Error loading data.';
    finishLoadingBar();
    return;
  }

  // Load specialization names for mapping
  const specializationMap = await getSpecializationMap();

  // Build map of doctorId -> doctorName for quick lookup
  const doctorIdToName = {};
  for (const d of (doctorsRes || [])) doctorIdToName[d.id] = d.name;

  // Clear and render appointment requests
  list.innerHTML = '';
  for (const app of appointmentsRes.data) {
    const { name, gender } = await getPatientInfo(app.user_id);
    const time12Hr = formatTimeTo12Hr(app.time);


    const div = document.createElement('div');
    div.className = 'appointment';
    const doctorNameDisplay = app.doctors_id ? (doctorIdToName[app.doctors_id] || 'Unknown') : (app.subtitle || 'Unknown');
    const doctorNameArg = JSON.stringify(doctorNameDisplay);
    div.innerHTML = `
      <strong>User: ${name}</strong><br>
      <strong>Patient Name: ${app.patient_name}</strong><br><br>
      Gender: ${app.patient_gender}<br>
      Date: ${app.date}<br>
      Time: ${time12Hr}<br>
      Reason: ${app.reason}<br>
      Specialization: ${specializationMap[app.specialization_id] || 'No specialization'}<br>
      Doctor: ${doctorNameDisplay}<br>
        <button onclick="confirmAndApprove('${app.id}')">Approve</button>
        <button onclick="confirmAndDecline('${app.id}')">Decline</button>
    `;

    list.appendChild(div);
  }
  
  // Restore scroll position after a short delay to ensure DOM is updated
  setTimeout(() => {
    window.scrollTo(0, scrollPosition);
  }, 100);
  
  finishLoadingBar();
}

// Approve/Decline
async function updateAppointmentStatus(id, status, doctorName = null) {
  const updateFields = { status, updated_at: new Date().toISOString() };

  // If approving with a doctor name, resolve doctors_id and store it
  if (doctorName) {
    try {
      const { data: doctorRow, error: docErr } = await supabase
        .from('doctors')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('name', doctorName)
        .limit(1)
        .single();
      if (!docErr && doctorRow?.id) {
        updateFields.doctors_id = doctorRow.id;
      }
    } catch (e) {
      console.error('Doctor lookup failed:', e);
    }
  }

  const { error } = await supabase
    .from('appointments')
    .update(updateFields)
    .eq('id', id);

  if (!error) {
    // Refresh both requests and accommodated pages
    loadAppointments();
    loadApprovedPatients();
    
    const action = status === 'approved' ? 'accepted' : (status === 'declined' ? 'rejected' : status);
    alert(`Appointment ${action} successfully!`);
  } else {
    alert('Failed to update status. Please try again.');
    console.error('Database update error:', error);
  }
}

function confirmAndApprove(id, doctorName = null) {
  let resolvedDoctorName = doctorName;
  if (!resolvedDoctorName) {
    // Try to find doctor name from rendered card if needed
    const card = Array.from(document.querySelectorAll('.appointment')).find(el => el.innerHTML.includes(`confirmAndApprove('${id}'`));
    if (card) {
      const match = card.innerHTML.match(/Doctor:\s([^<]+)<br>/);
      if (match) resolvedDoctorName = match[1].trim();
    }
  }
  if (!resolvedDoctorName || resolvedDoctorName === 'Unknown') {
    alert('Doctor not set for this appointment.');
    return;
  }

  if (confirm(`Approve this appointment with Dr. ${resolvedDoctorName}?`)) {
    updateAppointmentStatus(id, 'approved', resolvedDoctorName);
  }
}

function confirmAndDecline(id) {
  if (confirm('Decline this appointment?')) {
    updateAppointmentStatus(id, 'declined');
  }
}

// Accommodated
async function loadApprovedPatients() {
  startLoadingBar();
  
  // Save current scroll position
  const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
  
  // Get the three column containers
  const todayList = document.getElementById('accommodated-today');
  const pastList = document.getElementById('accommodated-past');
  const upcomingList = document.getElementById('accommodated-upcoming');
  const refreshIndicator = document.getElementById('refresh-indicator');

  // Show refresh indicator
  if (refreshIndicator) {
    refreshIndicator.style.display = 'flex';
    setTimeout(() => refreshIndicator.classList.add('show'), 10);
  }

  // Add updating class for smooth transition
  [todayList, pastList, upcomingList].forEach(list => {
    list.classList.add('updating');
  });

  const { data, error } = await supabase
    .from('appointments')
    .select('*, doctors(name)')
    .eq('clinic_id', clinicId)
    .eq('status', 'approved')
    .order('date', { ascending: !sortDescAccom })
    .order('time', { ascending: !sortDescAccom });

  if (error) {
    todayList.innerHTML = 'Error loading data.';
    pastList.innerHTML = 'Error loading data.';
    upcomingList.innerHTML = 'Error loading data.';
    [todayList, pastList, upcomingList].forEach(list => {
      list.classList.remove('updating');
    });
    finishLoadingBar();
    return;
  }

  // Smooth fade out existing content
  [todayList, pastList, upcomingList].forEach(list => {
    const existingPatients = list.querySelectorAll('.patient');
    existingPatients.forEach(patient => {
      patient.classList.add('fade-out');
    });
  });

  // Wait for fade out animation to complete
  await new Promise(resolve => setTimeout(resolve, 200));

  // Clear all lists
  todayList.innerHTML = '';
  pastList.innerHTML = '';
  upcomingList.innerHTML = '';

  // Categorize appointments
  const todayAppointments = [];
  const pastAppointments = [];
  const upcomingAppointments = [];

  for (const app of data) {
    const category = getAppointmentCategory(app.date);
    if (category === 'today') {
      todayAppointments.push(app);
    } else if (category === 'past') {
      pastAppointments.push(app);
    } else {
      upcomingAppointments.push(app);
    }
  }

  // Sort each category by time
  const sortByTime = (a, b) => {
    const timeA = a.time || '00:00';
    const timeB = b.time || '00:00';
    return sortDescAccom ? timeB.localeCompare(timeA) : timeA.localeCompare(timeB);
  };

  todayAppointments.sort(sortByTime);
  pastAppointments.sort(sortByTime);
  upcomingAppointments.sort(sortByTime);

  // Populate today's appointments
  for (let i = 0; i < todayAppointments.length; i++) {
    const app = todayAppointments[i];
    const { name, gender } = await getPatientInfo(app.user_id);
    const time12Hr = formatTimeTo12Hr(app.time);
    const div = document.createElement('div');
    div.className = 'patient';
    div.style.opacity = '0';
    div.style.transform = 'translateY(20px)';
    div.innerHTML = `
      <strong>User: ${name}</strong><br>
      <strong>Patient Name: ${app.patient_name}</strong><br><br>
      Gender: ${app.patient_gender}<br>
      Age: ${app.patient_age}<br>
      Blood Type: ${app.blood_type || 'N/A'}<br>
      Date: ${app.date}<br>
      Time: ${time12Hr}<br>
      Reason: ${app.reason}<br>
      Doctor: ${app.doctors?.name || 'Unknown'}<br>
      <button onclick='managePatient(${JSON.stringify(app)})'>Manage</button>
    `;
    todayList.appendChild(div);
    
    // Staggered fade-in animation
    setTimeout(() => {
      div.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      div.style.opacity = '1';
      div.style.transform = 'translateY(0)';
    }, i * 100);
  }

  // Populate past appointments
  for (let i = 0; i < pastAppointments.length; i++) {
    const app = pastAppointments[i];
    const { name, gender } = await getPatientInfo(app.user_id);
    const time12Hr = formatTimeTo12Hr(app.time);
    const div = document.createElement('div');
    div.className = 'patient';
    div.style.opacity = '0';
    div.style.transform = 'translateY(20px)';
    div.innerHTML = `
      <strong>User: ${name}</strong><br>
      <strong>Patient Name: ${app.patient_name}</strong><br><br>
      Gender: ${app.patient_gender}<br>
      Age: ${app.patient_age}<br>
      Blood Type: ${app.blood_type || 'N/A'}<br>
      Date: ${app.date}<br>
      Time: ${time12Hr}<br>
      Reason: ${app.reason}<br>
      Doctor: ${app.doctors?.name || 'Unknown'}<br>
      <button onclick='managePatient(${JSON.stringify(app)})'>Manage</button>
    `;
    pastList.appendChild(div);
    
    // Staggered fade-in animation
    setTimeout(() => {
      div.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      div.style.opacity = '1';
      div.style.transform = 'translateY(0)';
    }, i * 100);
  }

   // Populate upcoming appointments
   for (let i = 0; i < upcomingAppointments.length; i++) {
     const app = upcomingAppointments[i];
     const { name, gender } = await getPatientInfo(app.user_id);
     const time12Hr = formatTimeTo12Hr(app.time);
     const div = document.createElement('div');
     div.className = 'patient';
     div.style.opacity = '0';
     div.style.transform = 'translateY(20px)';
     div.innerHTML = `
       <strong>User: ${name}</strong><br>
       <strong>Patient Name: ${app.patient_name}</strong><br><br>
       Gender: ${app.patient_gender}<br>
       Age: ${app.patient_age}<br>
       Blood Type: ${app.blood_type || 'N/A'}<br>
       Date: ${app.date}<br>
       Time: ${time12Hr}<br>
       Reason: ${app.reason}<br>
       Doctor: ${app.doctors?.name || 'Unknown'}<br>
       <button onclick='viewUpcomingDetails(${JSON.stringify(app)})'>View Details</button>
     `;
     upcomingList.appendChild(div);
     
     // Staggered fade-in animation
     setTimeout(() => {
       div.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
       div.style.opacity = '1';
       div.style.transform = 'translateY(0)';
     }, i * 100);
   }

  // Remove updating class and finish loading
  [todayList, pastList, upcomingList].forEach(list => {
    list.classList.remove('updating');
  });

  // Hide refresh indicator
  if (refreshIndicator) {
    refreshIndicator.classList.remove('show');
    setTimeout(() => {
      refreshIndicator.style.display = 'none';
    }, 300);
  }

  // Restore scroll position after a short delay to ensure DOM is updated
  setTimeout(() => {
    window.scrollTo(0, scrollPosition);
  }, 100);

  finishLoadingBar();
}

// Completed
async function loadCompletedAppointments() {
  const list = document.getElementById('completed-list');
  if (!list) return;

  startLoadingBar();

  // Get filter values
  const searchTerm = document.getElementById('patient-search')?.value?.toLowerCase() || '';
  const dateFilter = document.getElementById('patient-date-filter')?.value || '';
  const genderFilter = document.getElementById('patient-gender-filter')?.value || '';

  // Build query - always show completed appointments
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('status', 'completed');

  if (dateFilter) {
    query = query.eq('date', dateFilter);
  }

  const [appointmentsRes, patientsRes, prescRes, billingRes] = await Promise.all([
    query,
    supabase.from('patients').select('id, full_name, address, gender'),
    supabase.from('prescriptions').select('*'),
    supabase.from('billings').select('*')
  ]);

  if (
    appointmentsRes.error || patientsRes.error ||
    prescRes.error || billingRes.error
  ) {
    list.innerHTML = 'Error loading data.';
    finishLoadingBar();
    return;
  }

  list.innerHTML = '';

  const appointments = appointmentsRes.data;
  const prescriptions = prescRes.data;
  const billings = billingRes.data;

  const patientAppointmentsMap = new Map();

  for (const app of appointments) {
    if (!patientAppointmentsMap.has(app.user_id)) {
      patientAppointmentsMap.set(app.user_id, []);
    }
    patientAppointmentsMap.get(app.user_id).push(app);
  }


  function isWithinOneDay(a, b) {
    const diff = Math.abs(new Date(a) - new Date(b));
    return diff <= 86400000;
  }

  for (const [userId, apps] of patientAppointmentsMap) {
    const patient = patientsRes.data.find(p => p.id === userId);
    if (!patient) continue;

    // Apply filters
    if (searchTerm && !patient.full_name.toLowerCase().includes(searchTerm)) continue;
    if (genderFilter && patient.gender !== genderFilter) continue;

    // Show all patients who have completed appointments (removed the prescription/billing requirement)
    // Show patient as a list item
    const latestApp = apps[apps.length - 1];
    const time12Hr = formatTimeTo12Hr(latestApp.time);

    const div = document.createElement('div');
    div.className = 'appointment';
    div.style.cursor = 'pointer';
    div.onclick = () => loadPatientDetails(userId, apps);

    div.innerHTML = `
      <strong>${patient.full_name}</strong><br>
    `;

    list.appendChild(div);
  }

  finishLoadingBar();
}

// Populate year dropdown for reports
function populateYearDropdown() {
  const yearSelect = document.getElementById('filter-year');
  if (!yearSelect) return;
  
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5; // Show last 5 years
  const endYear = currentYear + 1;   // Show next year
  
  for (let year = endYear; year >= startYear; year--) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearSelect.appendChild(option);
  }
}

// Search filter for completed-list
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('patient-search');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      const query = this.value.toLowerCase();
      const patients = document.querySelectorAll('#completed-list .appointment');
      patients.forEach(patient => {
        const name = patient.textContent.toLowerCase();
        patient.style.display = name.includes(query) ? '' : 'none';
      });
    });
  }
  
  // Populate year dropdown when page loads
  populateYearDropdown();
});

async function loadPatientDetails(userId, appointments) {
  const content = document.getElementById('details-content');
  const title = document.getElementById('details-title');
  content.innerHTML = '';
  showPage('details', { manageMode: true });

  // Store current patient ID for filter functions
  window.currentPatientId = userId;

  // Hide patient details filters when managing appointment
  document.getElementById('patient-details-filters').style.display = 'none';
  
  // Store current filter values before repopulating dropdown
  const currentDoctorFilter = document.getElementById('patient-doctor-filter')?.value || '';
  const currentDateFilter = document.getElementById('patient-appointment-date-filter')?.value || '';
  const currentBillingFilter = document.getElementById('patient-billing-status-filter')?.value || '';
  
  // Populate doctor filter dropdown
  await populatePatientDoctorFilter();
  
  // Restore filter values after dropdown is populated
  if (currentDoctorFilter) document.getElementById('patient-doctor-filter').value = currentDoctorFilter;
  if (currentDateFilter) document.getElementById('patient-appointment-date-filter').value = currentDateFilter;
  if (currentBillingFilter) document.getElementById('patient-billing-status-filter').value = currentBillingFilter;

  const [patientRes, prescRes, billingRes] = await Promise.all([
    supabase.from('patients').select('full_name, address').eq('id', userId).single(),
    supabase.from('prescriptions').select('*').eq('user_id', userId),
    supabase.from('billings').select('*').eq('user_id', userId)
  ]);

  // Load prescription medicines for all prescriptions of this user
  let prescriptionMedicines = [];
  try {
    const prescIds = (prescRes?.data || []).map(p => p.id);
    if (prescIds.length > 0) {
      const { data: medsData } = await supabase
        .from('prescription_medicines')
        .select('*')
        .in('prescription_id', prescIds);
      prescriptionMedicines = medsData || [];
    }
  } catch (e) {
    prescriptionMedicines = [];
  }

  // Load the full appointment history for this patient within this clinic (only completed appointments)
  let appsToRender = [];
  try {
    const { data: allApps } = await supabase
      .from('appointments')
      .select('*, doctors(name)')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });
    appsToRender = allApps || [];
  } catch (e) {
    appsToRender = [];
  }
  if (appsToRender.length === 0 && Array.isArray(appointments)) {
    appsToRender = appointments;
  }

  // Fetch doctor's notes for these appointments (by appointment id)
  const appointmentIds = (appsToRender || []).map(a => a.id);
  let doctorNotes = [];
    if (appointmentIds.length > 0) {
    try {
      const { data: notes } = await supabase
        .from('doctor_notes')
        .select('*')
        .in('appointments_id', appointmentIds)
        .eq('clinic_id', clinicId);
      doctorNotes = notes || [];
  } catch (e) {
      doctorNotes = [];
    }
  }

  if (patientRes.error || prescRes.error || billingRes.error) {
    content.innerHTML = 'Error loading details.';
    return;
  }

  const patient = patientRes.data;
  const prescriptions = prescRes.data;
  // Map prescription_id -> array of medicines
  const prescIdToMeds = (function() {
    const map = {};
    for (const m of (prescriptionMedicines || [])) {
      if (!map[m.prescription_id]) map[m.prescription_id] = [];
      map[m.prescription_id].push(m);
    }
    return map;
  })();
  const billings = billingRes.data;

  title.innerHTML = `
    <div style="text-align: left; font-size: 0.95rem; line-height: 1.4;">
      <strong style="font-size: 1rem;">${patient.full_name}</strong><br>
      <small style="font-size: 0.85rem;">${patient.address || 'No address provided'}</small><br>
      <button class="sort-button" style="margin-top: 1em;" onclick="showPage('details')">← Back</button>
    </div>
  `;

  function getDateOnly(isoDateTime) {
    if (!isoDateTime) return null;
    return isoDateTime.split('T')[0];
  }

  // Apply filters to appointments
  const doctorFilter = document.getElementById('patient-doctor-filter')?.value || '';
  const dateFilter = document.getElementById('patient-appointment-date-filter')?.value || '';
  const billingStatusFilter = document.getElementById('patient-billing-status-filter')?.value || '';

  let filteredApps = appsToRender.filter(app => {
    // Doctor filter - use partial string matching like patient name search
    if (doctorFilter && app.doctors?.name && !app.doctors.name.toLowerCase().includes(doctorFilter.toLowerCase())) {
      return false;
    }
    
    // Date filter
    if (dateFilter && app.date !== dateFilter) {
      return false;
    }
    
    // Billing status filter
    if (billingStatusFilter) {
      const matchedBillings = billings.filter(b => b.appointment_id === app.id);
      if (matchedBillings.length === 0) {
        // No billing record means unpaid
        if (billingStatusFilter !== 'unpaid') return false;
      } else {
        // Check if any billing matches the status
        const hasMatchingStatus = matchedBillings.some(b => b.status === billingStatusFilter);
        if (!hasMatchingStatus) return false;
      }
    }
    
    return true;
  });

  for (const app of filteredApps) {
    const time12Hr = formatTimeTo12Hr(app.time);
    const vitalSignsBlock = isMedicalClinic ? `
      <div style="margin-top:8px;">
        <h4>Vital Signs</h4>
        <div id="vs-view-${app.id}" style="font-size:0.95rem;color:#333;"></div>
      </div>
    ` : '';

  const matchedPrescriptions = prescriptions.filter(p =>
    p.appointment_id === app.id
  );

  const matchedBillings = billings.filter(b =>
    b.appointment_id === app.id
  );

  const matchedNotes = doctorNotes.filter(n => n.appointments_id === app.id);


// Patient History sa Patient page
    const div = document.createElement('div');
    div.className = 'completed-entry';
    div.style.display = 'grid';
    div.style.gridTemplateColumns = '1fr 1fr 1fr 1fr';
    div.style.gap = '1em';
    div.style.marginTop = '1.5em';

    div.innerHTML = `
      <div>
        <strong>Date:</strong><br>${app.date}<br><br>
        <strong>Time:</strong><br>${time12Hr}<br><br>
        <strong>Reason:</strong><br>${app.reason}
      </div>
      <div>
        <strong>Patient Name:</strong><br>${app.patient_name || 'N/A'}<br><br>
        <strong>Doctor:</strong><br>${app.doctors?.name || 'Unknown'}<br><br>
        <strong>Prescription:</strong><br>
        ${matchedPrescriptions.length
          ? matchedPrescriptions.map(p => {
              const meds = (prescIdToMeds[p.id] || []);
              const medsList = meds.length
                ? `<ul style="margin:6px 0 0 16px; padding:0;">${meds.map(m => `<li>${m.med_name}${m.dosage ? `, ${m.dosage}` : ''}${m.frequency ? `, ${m.frequency}` : ''}${m.duration ? `, ${m.duration}` : ''}${m.instructions ? `, ${m.instructions}` : ''}</li>`).join('')}</ul>`
                : '<em>No medicines listed</em>';
              const title = p.name ? `<div><strong>${p.name}</strong></div>` : '';
              const details = p.details ? `<div>${p.details}</div>` : '';
              return `<div>${title}${details}${medsList}</div>`;
            }).join('<br>')
          : 'No prescription'}
      </div>
      <div>
        ${matchedNotes.length
          ? matchedNotes.map(n => `<div><strong>Doctor's Notes:</strong><br>${n.content}</div>`).join('<br>')
          : 'No doctors notes'}
        <br><br>
        <div>
          <label>Laboratory Results (jpg, png, pdf)</label><br>
          <input type="file" id="lab-result-file-${app.id}" accept=".jpg,.jpeg,.png,.pdf" />
          <button onclick="uploadLabResult('${app.id}')">Upload Lab Result</button>
        </div>
        ${vitalSignsBlock}
      </div>
      <div>
        ${matchedBillings.length
          ? matchedBillings.map(b => `
              <div>
                <strong>${b.title}</strong><br>
                  ₱${b.amount}<br><br>
                  <strong>Status:</strong> ${b.status}<br>
                  ${b.status === 'unpaid'
                  ? `<button onclick="markBillingAsPaid('${b.id}')">Mark as Paid</button>`
                  : ''}
              </div>
            `).join('<br>')
          : 'No billing'}
        <div style="margin-top: 8px;">
          <div id="lab-upload-status-${app.id}" style="margin-top: 8px; font-size: 0.9rem; color: #6c757d;"></div>
          <div id="lab-current-files-${app.id}" style="margin-top: 8px;"></div>
        </div>
      </div>
    `;
    content.appendChild(div);
    try { await listLabResultsForAppointment(app.id); } catch {}
    if (isMedicalClinic) { try { await loadVitalSignsForAppointment(app.id, userId); } catch (e) { console.warn('Vitals load error', e); } }
  }
}

//Paid Buuuon pop up alert
window.markBillingAsPaid = async function (billingId) {
  if (!confirm("Mark this billing as paid?")) return;

  const { error } = await supabase
    .from('billings')
    .update({ status: 'paid' })
    .eq('id', billingId);

  if (error) {
    alert('Failed to update billing status.');
    console.error(error);
  } else {
    alert('Billing marked as paid.');
    location.reload(); // Fully reload the page
  }
};

// Helper to get Supabase auth user id for Storage RLS folder
async function getAuthUserIdForStorage() {
  try {
    let { data } = await supabase.auth.getUser();
    let user = data?.user || null;
    if (!user) {
      const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) {
        console.warn('Anonymous sign-in failed:', anonErr);
        return null;
      }
      user = anonData?.user || null;
    }
    return user?.id || null;
  } catch (e) {
    console.warn('Unable to ensure Supabase auth user:', e);
    return null;
  }
}

// Vital signs: save and load
async function saveVitalSigns() {
  try {
    if (!selectedAppointment) { alert('No appointment selected.'); return; }
    const height = parseFloat(document.getElementById('vs-height')?.value || '') || null;
    const weight = parseFloat(document.getElementById('vs-weight')?.value || '') || null;
    const bp = (document.getElementById('vs-bp')?.value || '').trim() || null;
    const hr = document.getElementById('vs-hr')?.value ? parseInt(document.getElementById('vs-hr').value, 10) : null;
    const temp = parseFloat(document.getElementById('vs-temp')?.value || '') || null;
    const rr = document.getElementById('vs-rr')?.value ? parseInt(document.getElementById('vs-rr').value, 10) : null;
    const statusEl = document.getElementById('vs-status');
    if (statusEl) statusEl.textContent = 'Saving...';

    const payload = {
      user_id: selectedAppointment.user_id,
      height_cm: height,
      weight_kg: weight,
      blood_pressure: bp,
      heart_rate: hr,
      temperature_c: temp,
      respiratory_rate: rr,
      appointment_id: selectedAppointment.id,
      clinic_id: clinicId
    };

    const { error } = await supabase.from('vital_signs').insert([payload]);
    if (error) {
      console.error('Save vital signs error:', error);
      if (statusEl) statusEl.textContent = 'Failed to save vital signs.';
      alert('Failed to save vital signs.');
      return;
    }
    if (statusEl) statusEl.textContent = 'Vital signs saved.';
    try { await loadVitalSignsForAppointment(selectedAppointment.id, selectedAppointment.user_id); } catch {}
  } catch (e) {
    console.error('saveVitalSigns error:', e);
    alert('Error saving vital signs.');
  }
}

function addMedicineRow() {
  const list = document.getElementById('med-list');
  if (!list) return;
  const rowId = `med-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  const wrapper = document.createElement('div');
  wrapper.className = 'med-row';
  wrapper.style.marginBottom = '10px';
  wrapper.innerHTML = `
    <div class="form-row">
      <label>Medicine Name</label>
      <input type="text" class="med-name" placeholder="Medicine name" aria-label="Medicine name" />
    </div>
    <div class="form-row">
      <label>Dosage</label>
      <input type="text" class="med-dosage" placeholder="(e.g., 500 mg)" aria-label="Dosage" />
    </div>
    <div class="form-row">
      <label>Frequency</label>
      <input type="text" class="med-frequency" placeholder="(e.g., 2 times a day)" aria-label="Frequency" />
    </div>
    <div class="form-row">
      <label>Duration</label>
      <input type="text" class="med-duration" placeholder="(e.g., 7 days)" aria-label="Duration" />
    </div>
    <div class="form-row">
      <label>Instructions</label>
      <textarea class="med-instructions" rows="2" placeholder="(e.g., after meals)" aria-label="Instructions"></textarea>
    </div>
  `;
  list.appendChild(wrapper);
}

function collectPrescriptionMedicines() {
  const list = document.getElementById('med-list');
  if (!list) return [];
  const rows = Array.from(list.querySelectorAll('.med-row'));
  return rows.map(r => ({
    med_name: r.querySelector('.med-name')?.value?.trim() || '',
    dosage: r.querySelector('.med-dosage')?.value?.trim() || null,
    frequency: r.querySelector('.med-frequency')?.value?.trim() || null,
    duration: r.querySelector('.med-duration')?.value?.trim() || null,
    instructions: r.querySelector('.med-instructions')?.value?.trim() || null,
  })).filter(m => m.med_name);
}

async function loadVitalSignsForAppointment(appointmentId, userId) {
  const target = document.getElementById(`vs-view-${appointmentId}`);
  if (!target) return;
  target.textContent = 'Loading vital signs...';
  try {
    const { data, error } = await supabase
      .from('vital_signs')
      .select('height_cm, weight_kg, bmi, blood_pressure, heart_rate, temperature_c, respiratory_rate, created_at')
      .eq('appointment_id', appointmentId)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { target.textContent = 'No vital signs.'; return; }
    if (!data) { target.textContent = 'No vital signs recorded.'; return; }
    const parts = [];
    if (data.height_cm != null) parts.push(`Height: ${data.height_cm} cm`);
    if (data.weight_kg != null) parts.push(`Weight: ${data.weight_kg} kg`);
    if (data.bmi != null) parts.push(`BMI: ${Number(data.bmi).toFixed(1)}`);
    if (data.blood_pressure) parts.push(`BP: ${data.blood_pressure}`);
    if (data.heart_rate != null) parts.push(`HR: ${data.heart_rate} bpm`);
    if (data.temperature_c != null) parts.push(`Temp: ${data.temperature_c} °C`);
    if (data.respiratory_rate != null) parts.push(`RR: ${data.respiratory_rate}`);
    target.textContent = parts.join(' | ');
  } catch (e) {
    console.error('loadVitalSignsForAppointment error:', e);
    target.textContent = 'Error loading vital signs';
  }
}

// Manage Patient
async function managePatient(app) {
  selectedAppointment = app;
  const { name, address, gender } = await getPatientInfo(app.user_id);
  const time12Hr = formatTimeTo12Hr(app.time);
  
  // Set minimum date to today in Philippine timezone (UTC+8) to prevent past date selection
  const today = new Date();
  const philippineTime = new Date(today.getTime() + (8 * 60 * 60 * 1000));
  const todayString = philippineTime.toISOString().split('T')[0];

  // Load specialization names for mapping
  const specializationMap = await getSpecializationMap();
  
  // Check if billing record already exists for this appointment
  let existingBillingStatus = 'unpaid';
  let existingBillingData = null;
  try {
    const { data: billingData } = await supabase
      .from('billings')
      .select('status, title, amount, due_date')
      .eq('appointment_id', app.id)
      .single();
    
    if (billingData) {
      existingBillingStatus = billingData.status || 'unpaid';
      existingBillingData = billingData;
    }
  } catch (error) {
    console.log('No existing billing record found');
  }


  document.getElementById('details-title').innerHTML = `
    <div style="text-align: left; font-size: 0.95rem; line-height: 1.4;">
      ${name}<br><br>
      <strong>Patient Name: </strong>${app.patient_name}<br>
      <strong>Relation with the user:</strong> ${app.patient_identity || 'N/A' }<br>
      <strong>Address: </strong><small style="font-size: 0.85rem;"> ${address}</small><br>
      <strong>Gender:</strong> ${app.patient_gender}<br>
      <strong>Age:</strong> ${app.patient_age}<br>
      <strong>Blood Type:</strong> ${app.blood_type || 'N/A'}<br>
      <strong>Date:</strong> ${app.date}<br>
      <strong>Time:</strong> ${time12Hr}<br>
      <strong>Reason:</strong> ${app.reason}<br>
      <strong>Doctor:</strong> ${app.doctors?.name || app.subtitle || 'Unknown'}<br>
      <strong>Specialization:</strong> ${specializationMap[app.specialization_id] || 'No specialization'}<br>
    </div>
  `;
  document.getElementById('patient-list-section').style.display = 'none';
// insert data
  document.getElementById('details-content').innerHTML = `
    <!-- Complete Appointment Button -->
    <div style="margin-bottom: 20px; text-align: center;">
      <button
        onclick="completeAppointment()" 
        style="
          padding: 12px 24px;
          background-color: #28a745;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
        "
        onmouseover="this.style.backgroundColor='#218838'"
        onmouseout="this.style.backgroundColor='#28a745'"
      >
        ✓ Complete Appointment
      </button>
    </div>
    
    <div class="manage-columns">
      <div class="column">
        <h3>Prescription</h3>
        <label>Prescription Name</label>
        <input type="text" id="presc-name" placeholder="e.g., prescription for ...(reason)" /> 
        <label>Prescription Details (summary)</label>
         <textarea id="presc-details" placeholder="Enter summary details, overall instructions, etc." rows="4" style="width: 100%; resize: vertical; min-height: 80px;"></textarea>
         <div id="presc-meds-section" style="margin-top:12px;">
           <h4>Prescription Medicines</h4>
           <div id="med-list"></div>
           <button type="button" onclick="addMedicineRow()">+ Add another Medicine</button>
         </div>
      </div>
      <div class="column">
         <h3>Doctor's Notes</h3>
         <label>Clinical Notes</label>
         <textarea id="doctors-note-input" placeholder="Enter doctor's notes, observations, recommendations, etc." rows="4" style="width: 100%; resize: vertical; min-height: 80px;"></textarea>
         ${isMedicalClinic ? `
         <div style="margin-top: 12px;">
           <h4>Vital Signs</h4>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center;">
             <label>Height (cm)</label><input type="number" id="vs-height" step="0.1" min="0" placeholder="e.g. 170" />
             <label>Weight (kg)</label><input type="number" id="vs-weight" step="0.1" min="0" placeholder="e.g. 65" />
             <label>Blood Pressure</label><input type="text" id="vs-bp" placeholder="e.g. 120/80" />
             <label>Heart Rate (bpm)</label><input type="number" id="vs-hr" min="0" placeholder="e.g. 72" />
             <label>Temperature (°C)</label><input type="number" id="vs-temp" step="0.1" placeholder="e.g. 36.8" />
             <label>Respiratory Rate</label><input type="number" id="vs-rr" min="0" placeholder="e.g. 16" />
           </div>
           <div id="vs-status" style="margin-top:6px;color:#6c757d;font-size:0.9rem;"></div>
         </div>
         ` : ''}
       </div>
       <div class="column">
         <h3>Billing of Appointment</h3>
        <label>Billing Title</label>
          <input type="text" id="billing-title" value="${existingBillingData?.title || app.reason}" placeholder="Service description" onchange="updateBillingField('title')" />
        <label>Billing Amount</label>
          <input type="number" id="billing-amount" value="${existingBillingData?.amount || ''}" placeholder="Enter amount" step="0.01" onchange="updateBillingField('amount')" />
        <label>Due Date</label>
          <input type="date" id="billing-due" value="${existingBillingData?.due_date || ''}" min="${todayString}" onchange="updateBillingField('due_date')" />
        <label>Payment Status</label>
          <select id="billing-status" onchange="updateBillingStatus()">
            <option value="unpaid" ${existingBillingStatus === 'unpaid' ? 'selected' : ''}>Unpaid</option>
            <option value="paid" ${existingBillingStatus === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="partial" ${existingBillingStatus === 'partial' ? 'selected' : ''}>Partial Payment</option>
        </select>
      </div>
    </div>
  `;


  showPage('details', { manageMode: true });
  // After rendering, load existing lab files for this appointment
  try {
    await listLabResultsForAppointment(app.id);
  } catch (e) {
    console.warn('Unable to list lab results:', e);
  }
}

// Complete Appointment Function
window.completeAppointment = async function() {
  if (!selectedAppointment) {
    alert('No appointment selected.');
    return;
  }

     // Check if prescription, billing, and doctor's note are filled
   const prescName = document.getElementById('presc-name')?.value.trim();
   const prescDetails = document.getElementById('presc-details')?.value.trim();
   const billingTitle = document.getElementById('billing-title')?.value.trim();
   const billingAmount = document.getElementById('billing-amount')?.value.trim();
   const billingDue = document.getElementById('billing-due')?.value.trim();
   const noteContent = document.getElementById('doctors-note-input')?.value.trim();

  // For medical clinics, vital signs must be filled before completion
  let vitalsPayload = null;
  if (isMedicalClinic) {
    const vsHeightStr = document.getElementById('vs-height')?.value?.trim();
    const vsWeightStr = document.getElementById('vs-weight')?.value?.trim();
    const vsBp = document.getElementById('vs-bp')?.value?.trim();
    const vsHrStr = document.getElementById('vs-hr')?.value?.trim();
    const vsTempStr = document.getElementById('vs-temp')?.value?.trim();
    const vsRrStr = document.getElementById('vs-rr')?.value?.trim();

    if (!vsHeightStr || !vsWeightStr || !vsBp || !vsHrStr || !vsTempStr || !vsRrStr) {
      alert('Please fill in all vital signs before completing the appointment.');
      return;
    }

    vitalsPayload = {
      user_id: selectedAppointment.user_id,
      height_cm: parseFloat(vsHeightStr),
      weight_kg: parseFloat(vsWeightStr),
      blood_pressure: vsBp,
      heart_rate: parseInt(vsHrStr, 10),
      temperature_c: parseFloat(vsTempStr),
      respiratory_rate: parseInt(vsRrStr, 10),
      appointment_id: selectedAppointment.id,
      clinic_id: clinicId
    };

    if (
      Number.isNaN(vitalsPayload.height_cm) ||
      Number.isNaN(vitalsPayload.weight_kg) ||
      Number.isNaN(vitalsPayload.heart_rate) ||
      Number.isNaN(vitalsPayload.temperature_c) ||
      Number.isNaN(vitalsPayload.respiratory_rate)
    ) {
      alert('Please enter valid numeric values for vital signs.');
      return;
    }
  }

   // Check if required fields are filled
   if (!prescName || !prescDetails || !billingTitle || !billingAmount || !billingDue || !noteContent) {
     alert("Please fill in prescription, billing, and doctor's note before completing the appointment.");
     return;
   }

  // Confirm completion
  if (!confirm('Are you sure you want to complete this appointment? This will move it to the completed appointments history.')) {
    return;
  }

  try {
    const userId = selectedAppointment.user_id;
    const appointmentId = selectedAppointment.id;

    // Resolve doctor_id (prefer direct id from appointment if present)
    let doctorId = selectedAppointment.doctors_id || null;
    if (!doctorId) {
      const doctorName = selectedAppointment.doctors?.name;
      if (doctorName) {
        const { data: doctorRows } = await supabase
          .from('doctors')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('name', doctorName)
          .limit(1);
        if (doctorRows && doctorRows.length > 0) {
          doctorId = doctorRows[0].id;
        }
      }
         }

     // Get the auth user ID from the patients table for doctor's notes
     let authUserId = null;
     try {
       const { data: patientData, error: patientError } = await supabase
         .from('patients')
         .select('user_id')
         .eq('id', userId)
         .single();
       
       if (patientError) {
         console.error('Patient lookup error:', patientError);
         // Try alternative approach - maybe userId is already an auth user ID
         authUserId = userId;
       } else if (patientData && patientData.user_id) {
         authUserId = patientData.user_id;
       } else {
         console.log('No user_id found in patient data, using original userId as fallback');
         authUserId = userId;
       }
     } catch (error) {
       console.error('Error getting auth user ID:', error);
       // Fallback: try using the user_id directly if it might already be an auth user ID
       authUserId = userId;
     }

     // Validate that we have a valid authUserId
     if (!authUserId) {
       alert("Error: Could not determine the correct patient ID. Please try again.");
       console.error("authUserId is null or undefined");
       return;
     }

     // Create doctor's note record
     const doctorNote = {
       patient_id: authUserId,
       content: noteContent,
       doctor_id: doctorId,
       clinic_id: clinicId,
       appointments_id: appointmentId
     };

     // Create prescription record
    const prescription = {
      user_id: userId,
      name: prescName,
      details: prescDetails,
      appointment_id: appointmentId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      icon: 'pill',
      color: 'blue'
    };

    // Create billing record
    const billing = {
      user_id: userId,
      title: billingTitle,
      amount: parseFloat(billingAmount),
      due_date: billingDue,
      status: document.getElementById('billing-status').value,
      description: `Billing for service on ${selectedAppointment.date}`,
      appointment_id: appointmentId,
      clinic_id: clinicId
    };

    // Update appointment status to completed
    const appointmentUpdate = {
      status: 'completed',
      updated_at: new Date().toISOString()
    };

         // Execute remaining database operations
    const operations = [
       supabase.from('doctor_notes').insert([doctorNote]),
       supabase.from('prescriptions').insert([prescription]),
      supabase.from('billings').insert([billing])
    ];
    if (isMedicalClinic && vitalsPayload) {
      operations.push(supabase.from('vital_signs').insert([vitalsPayload]));
    }
    operations.push(supabase.from('appointments').update(appointmentUpdate).eq('id', appointmentId));

    const results = await Promise.all(operations);
    const firstError = results.find(r => r && r.error);
    if (firstError && firstError.error) {
       alert('Failed to complete appointment. Please try again.');
      console.error('Completion error:', firstError.error);
       return;
     }

    // If we have medicines, insert them referencing the created prescription id
    if (collectPrescriptionMedicines().length > 0) {
      // Fetch created prescription id by unique combo (latest for appointment)
      const { data: prescRows } = await supabase
        .from('prescriptions')
        .select('id')
        .eq('appointment_id', appointmentId)
        .eq('clinic_id', clinicId)
        .order('last_updated', { ascending: false })
        .limit(1);
      const prescId = prescRows && prescRows[0]?.id;
      if (prescId) {
        const medsPayload = collectPrescriptionMedicines().map(m => ({
          prescription_id: prescId,
          med_name: m.med_name,
          dosage: m.dosage,
          frequency: m.frequency,
          duration: m.duration,
          instructions: m.instructions
        }));
        const { error: medsErr } = await supabase.from('prescription_medicines').insert(medsPayload);
        if (medsErr) {
          console.error('Failed to insert prescription medicines:', medsErr);
          alert('Prescription saved, but medicines failed to save.');
        }
      }
     }

    // Success - show confirmation and redirect
    alert('Appointment completed successfully! The patient has been moved to completed appointments.');

    // Go directly to this patient's full history view on the Patients page
    try {
      const { data: userHistory } = await supabase
        .from('appointments')
        .select('*, doctors(name)')
        .eq('clinic_id', clinicId)
        .eq('user_id', userId)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      showPage('details', { manageMode: true });
      await loadPatientDetails(userId, userHistory || []);
      // Refresh lab files list if the same appointment is still selected
      try { await listLabResultsForAppointment(appointmentId); } catch {}
    } catch (e) {
      // Fallback to Patients page if loading history fails
      showPage('details');
    }

  } catch (error) {
    alert('Error completing appointment. Please try again.');
    console.error('Error completing appointment:', error);
  }
};

// Submit Management
async function submitManagement() {
  const userId = selectedAppointment.user_id;
  const appointmentId = selectedAppointment.id;

  const prescName = document.getElementById('presc-name').value.trim();
  const prescDetails = document.getElementById('presc-details').value.trim();
  const billingTitle = document.getElementById('billing-title').value.trim();
  const billingAmount = document.getElementById('billing-amount').value.trim();
  const billingDue = document.getElementById('billing-due').value.trim();
  const noteContent = document.getElementById('doctors-note-input').value.trim();


  const anyEmpty = !prescName || !prescDetails || !billingTitle || !billingAmount || !billingDue || !noteContent;
  if (anyEmpty && !confirm("Some fields are empty. Submit anyway with null values?")) return;

  // Get the auth user ID from the patients table for doctor's notes
  let authUserId = null;
  try {
    const { data: patientData, error: patientError } = await supabase
      .from('patients')
      .select('user_id')
      .eq('id', userId)
      .single();
    
    if (patientError) {
      console.error('Patient lookup error:', patientError);
      // Try alternative approach - maybe userId is already an auth user ID
      authUserId = userId;
    } else if (patientData && patientData.user_id) {
      authUserId = patientData.user_id;
    } else {
      console.log('No user_id found in patient data, using original userId as fallback');
      authUserId = userId;
    }
  } catch (error) {
    console.error('Error getting auth user ID:', error);
    // Fallback: try using the user_id directly if it might already be an auth user ID
    authUserId = userId;
  }

  // Validate that we have a valid authUserId
  if (!authUserId) {
    alert("Error: Could not determine the correct patient ID. Please try again.");
    console.error("authUserId is null or undefined");
    return;
  }

  // Resolve doctor_id by matching the appointment's doctor name within this clinic
  const doctorName = selectedAppointment.doctors?.name;
  let doctorId = null;
  if (doctorName) {
    const { data: doctorRows } = await supabase
      .from('doctors')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('name', doctorName)
      .limit(1);
    if (doctorRows && doctorRows.length > 0) {
      doctorId = doctorRows[0].id;
    }
  }

  const presc = {
    user_id: userId,
    name: prescName || null,
    details: prescDetails || null,
    appointment_id: appointmentId,
    clinic_id: clinicId,
    doctor_id: doctorId,
    icon: 'pill',
    color: 'blue'
  };

  const billing = {
    user_id: userId,
    title: billingTitle || null,
    amount: billingAmount ? parseFloat(billingAmount) : null,
    due_date: billingDue || null,
    status: 'unpaid',
    description: `Billing for service on ${selectedAppointment.date}`,
    appointment_id: appointmentId,
    clinic_id: clinicId
  };

  // Create doctor's note record
  const doctorNote = {
    patient_id: authUserId,
    content: noteContent || null,
    doctor_id: doctorId,
    clinic_id: clinicId,
    appointments_id: appointmentId
  };

  const [noteRes, prescRes, billRes, apptRes] = await Promise.all([
    supabase.from('doctor_notes').insert([doctorNote]),
    supabase.from('prescriptions').insert([presc]),
    supabase.from('billings').insert([billing]),
    supabase.from('appointments').update({ status: 'completed' }).eq('id', appointmentId)
  ]);

  if (noteRes.error || prescRes.error || billRes.error || apptRes.error) {
    alert('Failed to complete appointment.');
    console.error('Doctor note error:', noteRes.error);
    console.error('Prescription error:', prescRes.error);
    console.error('Billing error:', billRes.error);
    console.error('Appointment error:', apptRes.error);
  } else {
    alert('Appointment completed.');
    showPage('accommodated');
  }
}

// Auto-refresh requests and accommodated pages
setInterval(() => {
  if (freezeAutoRefresh) return;
  const current = document.querySelector('.page:not([style*="display: none"])');
  if (current?.id === 'requests') loadAppointments();
  if (current?.id === 'accommodated') loadApprovedPatients();
}, 30000);

// Doctor Management Functions
async function loadDoctors() {
  startLoadingBar();
  const list = document.getElementById('doctors-list');

  const { data, error } = await supabase
    .from('doctors')
    .select('id, name, specialization_id')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true });

  if (error) {
    list.innerHTML = 'Error loading doctors.';
    finishLoadingBar();
    return;
  }

  list.innerHTML = '';
  
  if (data.length === 0) {
    list.innerHTML = '<p style="text-align: center; color: #6c757d; font-style: italic;">No doctors found. Add your first doctor using the button above.</p>';
    finishLoadingBar();
    return;
  }

  // Load specialization names for mapping
  const specializationMap = await getSpecializationMap();

  for (const doctor of data) {
    console.log('Creating doctor item for:', doctor.name, 'with ID:', doctor.id);
    const div = document.createElement('div');
    div.className = 'doctor-item';
    div.innerHTML = `
      <div class="doctor-info">
        <strong>${doctor.name}</strong>
        <small>Specialization: ${specializationMap[doctor.specialization_id] || 'Not specified'}</small>
      </div>
      <div class="doctor-actions">
        <button class="edit-doctor-btn" onclick="editDoctor('${doctor.id}')">Edit</button>
      </div>
    `;
    list.appendChild(div);
  }

  finishLoadingBar();
}

// Show/Hide Add Doctor Form
window.showAddDoctorForm = function() {
  document.getElementById('add-doctor-form').style.display = 'block';
  document.getElementById('add-doctor-btn').style.display = 'none';
  document.getElementById('schedule-doctor-btn').style.display = 'none';
  // Clear form fields
  document.getElementById('doctor-name').value = '';
  document.getElementById('doctor-specialization').value = '';
  // Populate specializations
  populateSpecializationsDropdown('doctor-specialization');
};

// Show/Hide Schedule Doctor Form
window.showScheduleForm = async function() {
  document.getElementById('schedule-doctor-form').style.display = 'block';
  document.getElementById('add-doctor-btn').style.display = 'none';
  document.getElementById('schedule-doctor-btn').style.display = 'none';
  document.getElementById('doctors-list').style.display = 'none';
  
  await populateScheduleDoctorDropdown();
  initSimpleScheduler();
};

window.hideAddDoctorForm = function() {
  document.getElementById('add-doctor-form').style.display = 'none';
  document.getElementById('add-doctor-btn').style.display = 'block';
  document.getElementById('schedule-doctor-btn').style.display = 'block';
  document.getElementById('doctors-list').style.display = 'block';
};

window.hideScheduleForm = function() {
  document.getElementById('schedule-doctor-form').style.display = 'none';
  document.getElementById('add-doctor-btn').style.display = 'block';
  document.getElementById('schedule-doctor-btn').style.display = 'block';
  document.getElementById('doctors-list').style.display = 'block';
};

// Add New Doctor
window.addDoctor = async function() {
  const name = document.getElementById('doctor-name').value.trim();
  const specializationId = document.getElementById('doctor-specialization').value || null;
  

  if (!name) {
    alert('Please enter a doctor name.');
    return;
  }

  const doctorData = {
    clinic_id: clinicId,
    name: name,
    specialization_id: specializationId,
    
  };

  const { error } = await supabase
    .from('doctors')
    .insert([doctorData]);

  if (error) {
    alert('Failed to add doctor. Please try again.');
    console.error(error);
  } else {
    alert('Doctor added successfully!');
    hideAddDoctorForm();
    loadDoctors();
  }
};

let currentEditingDoctorId = null;

// Edit Doctor
window.editDoctor = async function(doctorId) {
  // Get current doctor data
  const { data: doctor, error: fetchError } = await supabase
    .from('doctors')
    .select('id, name, specialization_id')
    .eq('id', doctorId)
    .single();

  if (fetchError) {
    alert('Failed to load doctor data.');
    return;
  }

  // Store the doctor ID being edited
  currentEditingDoctorId = doctorId;

  // Populate the edit form with current data
  document.getElementById('edit-doctor-name').value = doctor.name || '';
  await populateSpecializationsDropdown('edit-doctor-specialization');
  document.getElementById('edit-doctor-specialization').value = doctor.specialization_id || '';
  
  // Load doctor schedule calendar
  await loadDoctorScheduleCalendar(doctorId);

  // Show the edit form and hide other elements
  document.getElementById('edit-doctor-form').style.display = 'block';
  document.getElementById('add-doctor-form').style.display = 'none';
  document.getElementById('add-doctor-btn').style.display = 'none';
  document.getElementById('schedule-doctor-btn').style.display = 'none';
  document.getElementById('doctors-list').style.display = 'none';
};

// Save Doctor Edit
window.saveDoctorEdit = async function() {
  if (!currentEditingDoctorId) {
    alert('No doctor selected for editing.');
    return;
  }

  const name = document.getElementById('edit-doctor-name').value.trim();
  const specializationId = document.getElementById('edit-doctor-specialization').value || null;
  

  if (!name) {
    alert('Please enter a doctor name.');
    return;
  }

  // Get the old doctor name before updating
  const { data: oldDoctor, error: fetchError } = await supabase
    .from('doctors')
    .select('name')
    .eq('id', currentEditingDoctorId)
    .single();

  if (fetchError) {
    alert('Failed to fetch current doctor data.');
    return;
  }

  const oldDoctorName = oldDoctor.name;
  const newDoctorName = name;

  const updateData = {
    name: name,
    specialization_id: specializationId,
    
  };

  // Update the doctor record
  const { error: doctorError } = await supabase
    .from('doctors')
    .update(updateData)
    .eq('id', currentEditingDoctorId);

  if (doctorError) {
    alert('Failed to update doctor. Please try again.');
    console.error(doctorError);
    return;
  }

  // Update all foreign key references
  if (oldDoctorName !== newDoctorName) {
    const { updates, errors } = await updateAllDoctorReferences(oldDoctorName, newDoctorName, false);
    
    if (errors.length > 0) {
      console.error('Warning: Some foreign key updates failed:', errors);
      alert(`Doctor updated successfully, but there were issues updating related records:\n${errors.join('\n')}`);
    } else {
      console.log(`Updated foreign key references: ${updates.join(', ')}`);
    }
  }

  alert('Doctor updated successfully!');
  cancelDoctorEdit();
  loadDoctors();
};

// Cancel Doctor Edit
window.cancelDoctorEdit = function() {
  currentEditingDoctorId = null;
  document.getElementById('edit-doctor-form').style.display = 'none';
  document.getElementById('add-doctor-btn').style.display = 'block';
  document.getElementById('schedule-doctor-btn').style.display = 'block';
  document.getElementById('doctors-list').style.display = 'block';
  
  // Clear form fields
  document.getElementById('edit-doctor-name').value = '';
  document.getElementById('edit-doctor-specialization').value = '';
  
};

// Delete Doctor
window.deleteDoctor = async function(doctorId) {
  console.log('Attempting to delete doctor with ID:', doctorId);
  
  // Get doctor information before deletion
  const { data: doctor, error: fetchError } = await supabase
    .from('doctors')
    .select('name')
    .eq('id', doctorId)
    .single();

  if (fetchError) {
    alert('Failed to fetch doctor information.');
    return;
  }

  const doctorName = doctor.name;
  
  // Check if there are any appointments assigned to this doctor
  const { data: appointments, error: appointmentCheckError } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('subtitle', doctorName)
    .eq('clinic_id', clinicId);

  if (appointmentCheckError) {
    console.error('Error checking appointments:', appointmentCheckError);
  }

  let appointmentCount = appointments ? appointments.length : 0;
  let activeAppointments = appointments ? appointments.filter(app => app.status === 'approved' || app.status === 'pending').length : 0;

  // Show detailed confirmation message
  let confirmMessage = `Are you sure you want to delete Dr. ${doctorName}?`;
  if (appointmentCount > 0) {
    confirmMessage += `\n\nThis doctor has ${appointmentCount} total appointment(s), including ${activeAppointments} active appointment(s).`;
    confirmMessage += `\n\nDeleting this doctor will:`;
    confirmMessage += `\n- Remove the doctor from the doctors list`;
    confirmMessage += `\n- Set all related appointments to "Unknown" doctor`;
    confirmMessage += `\n- This action cannot be undone`;
  }

  if (!confirm(confirmMessage)) {
    console.log('Delete cancelled by user');
    return;
  }

  console.log('Proceeding with deletion...');
  
  // Update all foreign key references to remove doctor reference
  if (appointmentCount > 0) {
    const { updates, errors } = await updateAllDoctorReferences(doctorName, null, true);
    
    if (errors.length > 0) {
      console.error('Error updating foreign key references:', errors);
      alert('Failed to update related records. Doctor deletion cancelled.');
      return;
    }
    
    console.log(`Updated foreign key references: ${updates.join(', ')}`);
  }

  // Now delete the doctor
  const { error } = await supabase
    .from('doctors')
    .delete()
    .eq('id', doctorId);

  if (error) {
    console.error('Delete error:', error);
    alert('Failed to delete doctor. Please try again. Error: ' + error.message);
  } else {
    console.log('Doctor deleted successfully');
    alert(`Doctor ${doctorName} deleted successfully!${appointmentCount > 0 ? `\n\n${appointmentCount} appointment(s) have been updated to show "Unknown" doctor.` : ''}`);
    loadDoctors();
  }
};

// Get Doctors for Dropdown
async function getDoctorsForDropdown() {
  const { data, error } = await supabase
    .from('doctors')
    .select('id, name, specialization_id, specializations(name)')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error loading doctors:', error);
    return [];
  }

  return (data || []).map(d => ({
    id: d.id,
    name: d.name,
    specialization_id: d.specialization_id,
    specialization_name: d.specializations?.name || null
  }));
}

// Load specializations and produce id->name map
async function getSpecializationMap() {
  const { data, error } = await supabase
    .from('specializations')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true });
  if (error) {
    console.error('Error loading specializations:', error);
    return {};
  }
  const map = {};
  for (const s of (data || [])) map[s.id] = s.name;
  return map;
}

// Populate a <select> with specializations
async function populateSpecializationsDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">Select specialization</option>';
  const { data, error } = await supabase
    .from('specializations')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true });
  if (error) {
    console.error('Failed to load specializations:', error);
    return;
  }
  for (const s of (data || [])) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  }
}

// Populate schedule doctor dropdown
async function populateScheduleDoctorDropdown() {
  const select = document.getElementById('schedule-doctor-select');
  if (!select) return;
  
  select.innerHTML = '<option value="">Select a doctor...</option>';
  
  const { data: doctors, error } = await supabase
    .from('doctors')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true });
  
  if (error) {
    console.error('Failed to load doctors for schedule:', error);
    return;
  }
  
  for (const doctor of (doctors || [])) {
    const option = document.createElement('option');
    option.value = doctor.id;
    option.textContent = doctor.name;
    select.appendChild(option);
  }
}

// Populate patient details doctor filter dropdown
async function populatePatientDoctorFilter() {
  const select = document.getElementById('patient-doctor-filter');
  if (!select) return;
  
  // Clear existing options except "All Doctors"
  select.innerHTML = '<option value="">All Doctors</option>';
  
  const { data: doctors, error } = await supabase
    .from('doctors')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true });
  
  if (error) {
    console.error('Failed to load doctors for patient filter:', error);
    return;
  }
  
  for (const doctor of (doctors || [])) {
    const option = document.createElement('option');
    option.value = doctor.name; // Use name for filtering
    option.textContent = doctor.name;
    select.appendChild(option);
  }
}

// Build simple dropdown scheduler
function initSimpleScheduler() {
  const select = document.getElementById('schedule-doctor-select');
  const startSel = document.getElementById('slot-start');
  const daySel = document.getElementById('schedule-day-select');
  const dateInput = document.getElementById('schedule-date');
  const repeatSel = document.getElementById('repeat-months');
  if (!select || !startSel || !daySel || !dateInput || !repeatSel) return;

  // Set minimum date to today to prevent past date selection (Philippine timezone)
  const today = new Date();
  // Convert to Philippine timezone (UTC+8)
  const philippineTime = new Date(today.getTime() + (8 * 60 * 60 * 1000));
  const todayString = philippineTime.toISOString().split('T')[0];
  dateInput.min = todayString;

  // Populate 24h times in 30-minute steps for start dropdown with 12-hour labels
  const times = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      times.push(`${hh}:${mm}`);
    }
  }
  startSel.innerHTML = times
    .map(t => `<option value="${t}">${formatTimeTo12Hr(t)}</option>`)
    .join('');
  startSel.value = '09:00';

  // Day of week selection - clear specific date and handle special options
  daySel.addEventListener('change', function() {
    if (this.value) {
      dateInput.value = '';
      
      // Handle special options
      if (this.value === 'next-7-days') {
        // Clear the selection of Repeat for next months when "Next 7 days" is chosen
        repeatSel.value = 'select-month';
      }
    }
    loadSimpleSchedulePreview();
  });

  // Specific date selection - clear day of week and set to "Select day..."
  dateInput.addEventListener('change', function() {
    if (this.value) {
      daySel.value = '';
      // Update available times based on selected date
      updateAvailableTimesForDate(this.value);
    }
    loadSimpleSchedulePreview();
  });

  // Repeat months selection - clear day of week when any option is selected
  repeatSel.addEventListener('change', function() {
    if (this.value && this.value !== 'select-month') {
      // Clear the selection of Day of the week when any repeat option is selected
      daySel.value = '';
    }
    loadSimpleSchedulePreview();
  });

  // Load existing for selected doctor + day/date
  select.addEventListener('change', loadSimpleSchedulePreview);
  daySel.addEventListener('change', loadSimpleSchedulePreview);
  dateInput.addEventListener('change', loadSimpleSchedulePreview);
}

// Update available times based on selected date to prevent past times
function updateAvailableTimesForDate(selectedDate) {
  const startSel = document.getElementById('slot-start');
  if (!startSel) return;

  // Use Philippine timezone (UTC+8)
  const today = new Date();
  const philippineTime = new Date(today.getTime() + (8 * 60 * 60 * 1000));
  const selected = new Date(selectedDate);
  const isToday = selected.toDateString() === philippineTime.toDateString();
  
  // Get current time in Philippine timezone
  const currentHour = philippineTime.getHours();
  const currentMinute = philippineTime.getMinutes();
  
  // Clear and repopulate times
  const times = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      const timeString = `${hh}:${mm}`;
      
      // If it's today, only show future times
      if (isToday) {
        if (h > currentHour || (h === currentHour && m > currentMinute)) {
          times.push(timeString);
        }
      } else {
        // For future dates, show all times
        times.push(timeString);
      }
    }
  }
  
  startSel.innerHTML = times
    .map(t => `<option value="${t}">${formatTimeTo12Hr(t)}</option>`)
    .join('');
  
  // Set default to first available time or 9:00 AM
  if (times.length > 0) {
    startSel.value = times[0];
  } else {
    startSel.value = '09:00';
  }
}

function generateTimeSlots(start, end, intervalMinutes) {
  const slots = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  while (startMins < endMins) {
    const h = Math.floor(startMins / 60).toString().padStart(2, '0');
    const m = (startMins % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    startMins += intervalMinutes;
  }
  return slots;
}

async function loadSimpleSchedulePreview() {
  const doctorId = document.getElementById('schedule-doctor-select').value;
  const daySel = document.getElementById('schedule-day-select');
  const dateInput = document.getElementById('schedule-date');
  if (!doctorId || !daySel) return;
  const dayVal = daySel.value ? parseInt(daySel.value, 10) : null;
  const dateVal = dateInput.value || null;

  try {
    let query = supabase
      .from('clinic_schedules')
      .select('available_time')
      .eq('doctors_id', doctorId);
    if (dateVal) {
      query = query.eq('date', dateVal);
    } else if (dayVal) {
      query = query.is('date', null).eq('day_of_week', dayVal);
    }
    const { data, error } = await query;
    if (error) return;
    // Optional: could display preview somewhere; skipping UI preview for brevity
  } catch {}
}

window.saveSimpleSchedule = async function() {
  const doctorId = document.getElementById('schedule-doctor-select').value;
  if (!doctorId) {
    alert('Please select a doctor first.');
      return;
    }
  const dayVal = document.getElementById('schedule-day-select').value;
  const dateVal = document.getElementById('schedule-date').value || null;
  const start = document.getElementById('slot-start').value;
  const repeatMonths = document.getElementById('repeat-months').value;
  const repeatMonthsNum = parseInt(repeatMonths, 10) || 1;

  // Require either day of week or specific date
  if (!dayVal && !dateVal) {
    alert('Please select a day of the week or a specific date.');
    return;
  }
  if (!start) {
    alert('Please select an available time.');
    return;
  }

  // Determine day_of_week from date if provided
  let dayOfWeek = dayVal ? parseInt(dayVal, 10) : null;
  if (!dayOfWeek && dateVal) {
    const jsDow = new Date(dateVal + 'T00:00:00').getDay();
    dayOfWeek = jsDow === 0 ? 7 : jsDow; // Monday=1 ... Sunday=7
  }

  // Build list of dates to insert
  const targetDates = [];
  function toLocalDateString(dt) {
    const y = dt.getFullYear();
    const m = (dt.getMonth() + 1).toString().padStart(2, '0');
    const d = dt.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  // Handle "next-7-days" option
  if (dayVal === 'next-7-days') {
    // Get next 7 days starting from today in Philippine timezone
    const today = new Date();
    const philippineTime = new Date(today.getTime() + (8 * 60 * 60 * 1000));
    
    // Generate dates for the next 7 days
    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(philippineTime);
      nextDate.setDate(philippineTime.getDate() + i);
      targetDates.push(toLocalDateString(nextDate));
    }
  } else if (dateVal) {
    targetDates.push(dateVal);
  } else if (repeatMonths === 'select-month') {
    // For "select-month", only save the next 7 days (used with "next-7-days")
    const today = new Date();
    const philippineTime = new Date(today.getTime() + (8 * 60 * 60 * 1000));
    
    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(philippineTime);
      nextDate.setDate(philippineTime.getDate() + i);
      targetDates.push(toLocalDateString(nextDate));
    }
  } else if (repeatMonths > 0) {
    // Generate all matching weekdays for the current month and the next (repeatMonths-1) months
    const today = new Date();
    const startOfRange = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // start from today (this week forward)
    const endMonthIndex = today.getMonth() + (repeatMonths - 1);
    const endBoundary = new Date(today.getFullYear(), endMonthIndex + 1, 0); // last day of last covered month
    let cursor = new Date(startOfRange);
    while (cursor <= endBoundary) {
      const jsDow = cursor.getDay(); // 0..6 (Sun..Sat)
      const mapped = jsDow === 0 ? 7 : jsDow; // Monday=1 ... Sunday=7
      if (mapped === dayOfWeek) {
        targetDates.push(toLocalDateString(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  try {
    // Clear existing slots for this scope
    // If a specific date is chosen, clear existing for that date/time; if weekly, clear for every generated date
    if (targetDates.length > 0) {
      for (const d of targetDates) {
        const { error: delErr } = await supabase
      .from('clinic_schedules')
        .delete()
        .eq('doctors_id', doctorId)
          .eq('available_time', start)
          .eq('date', d);
        if (delErr) {
          alert('Failed to clear existing slots for some dates.');
          console.error(delErr);
      return;
    }
      }
    } else {
      // No targetDates implies weekly pattern without date window (unlikely path)
      const { error: delErr } = await supabase
      .from('clinic_schedules')
        .delete()
        .eq('doctors_id', doctorId)
        .is('date', null)
        .eq('day_of_week', dayOfWeek)
        .eq('available_time', start);
      if (delErr) {
        alert('Failed to clear existing weekly slot.');
        console.error(delErr);
      return;
    }
  }
  
    // Insert rows: one per target date, or a weekly pattern row when no specific dates
    let rows = [];
    if (targetDates.length > 0) {
      rows = targetDates.map(d => {
        const jsDow = new Date(d + 'T00:00:00').getDay();
        const mappedDow = jsDow === 0 ? 7 : jsDow; // Monday=1 ... Sunday=7
        return {
          doctors_id: doctorId,
          day_of_week: mappedDow,
          available_time: start,
          date: d,
          appointments_id: null
        };
      });
    } else {
      rows = [{
        doctors_id: doctorId,
        day_of_week: dayOfWeek,
        available_time: start,
        date: null,
        appointments_id: null
      }];
    }

    const { error: insErr } = await supabase.from('clinic_schedules').insert(rows);
    if (insErr) {
      alert('Failed to save schedule.');
      console.error(insErr);
      return;
    }
    
    alert('Schedule saved successfully!');
  } catch (e) {
    console.error('Error saving schedule:', e);
    alert('Error saving schedule.');
  }
};

window.clearSimpleSchedule = async function() {
  const doctorId = document.getElementById('schedule-doctor-select').value;
  if (!doctorId) {
    alert('Please select a doctor first.');
        return;
      }
  const dayVal = document.getElementById('schedule-day-select').value;
  const dateVal = document.getElementById('schedule-date').value || null;
  if (!dayVal && !dateVal) {
    alert('Select a day of week or a date to clear.');
    return;
  }
  let confirmMessage = 'Clear availability for the selected day/date?';
  if (dayVal === 'next-7-days') {
    confirmMessage = 'Clear availability for the next 7 days?';
  }
  
  if (!confirm(confirmMessage)) return;
  try {
    let del = supabase.from('clinic_schedules').delete().eq('doctors_id', doctorId);
    
    if (dayVal === 'next-7-days') {
      // Clear all dates in the next 7 days (Philippine timezone)
      const today = new Date();
      const philippineTime = new Date(today.getTime() + (8 * 60 * 60 * 1000));
      
      const next7Dates = [];
      for (let i = 0; i < 7; i++) {
        const nextDate = new Date(philippineTime);
        nextDate.setDate(philippineTime.getDate() + i);
        next7Dates.push(nextDate.toISOString().split('T')[0]);
      }
      
      del = del.in('date', next7Dates);
    } else if (dateVal) {
      del = del.eq('date', dateVal);
    } else {
      del = del.is('date', null).eq('day_of_week', parseInt(dayVal, 10));
    }
    const { error } = await del;
      if (error) {
      alert('Failed to clear schedule.');
      console.error(error);
        return;
      }
    alert('Selected schedule cleared.');
  } catch (e) {
    console.error('Error clearing schedule:', e);
    alert('Error clearing schedule.');
  }
};
// Helper function to check and update all foreign key references
async function updateAllDoctorReferences(oldDoctorName, newDoctorName, isDeletion = false) {
  const updates = [];
  const errors = [];

  // 1. Update appointments table
  try {
    const { error: appointmentError } = await supabase
      .from('appointments')
      .update({ subtitle: isDeletion ? 'Unknown' : newDoctorName })
      .eq('subtitle', oldDoctorName)
      .eq('clinic_id', clinicId);

    if (appointmentError) {
      errors.push(`Appointments: ${appointmentError.message}`);
    } else {
      updates.push('appointments');
    }
  } catch (error) {
    errors.push(`Appointments: ${error.message}`);
  }

  // 2. Check for any other potential references (future-proofing)
  // add more tables here if they reference doctors 
  
  return { updates, errors };
}

// Test delete function accessibility
console.log('Testing delete function accessibility...');
console.log('deleteDoctor function available:', typeof window.deleteDoctor);

// Authentication Check
function checkAuth() {
  const isLoggedIn = localStorage.getItem('adminLoggedIn') === 'true';
  if (!isLoggedIn) {
    window.location.href = 'login.html';
    return false;
  }
  
  // Display user info
  const userInfo = document.getElementById('user-info');
  if (userInfo) {
    const username = localStorage.getItem('adminUser') || 'Unknown';
    const role = localStorage.getItem('adminRole') || 'user';
    userInfo.textContent = `${username} (${role})`;
  }
  
  return true;
}

// Logout function
window.logout = function() {
  localStorage.removeItem('adminLoggedIn');
  localStorage.removeItem('adminUser');
  localStorage.removeItem('adminRole');
  window.location.href = 'login.html';
};

// Calendar Functions
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

window.previousMonth = function() {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  loadCalendar();
};

window.nextMonth = function() {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  loadCalendar();
};

window.today = function() {
  currentDate = new Date();
  currentMonth = currentDate.getMonth();
  currentYear = currentDate.getFullYear();
  loadCalendar();
};

async function loadCalendar() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
  
  document.getElementById('calendar-month-year').textContent = `${monthNames[currentMonth]} ${currentYear}`;
  
  // Get appointments for the month
  const startDate = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
  const endDate = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
  
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, doctors(name)')
    .eq('clinic_id', clinicId)
    .gte('date', startDate)
    .lte('date', endDate);
  
  renderCalendar(appointments || []);
}

function renderCalendar(appointments) {
  const grid = document.getElementById('calendar-grid');
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  
  let html = '';
  
  // Day headers
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach(day => {
    html += `<div class="calendar-day" style="background: #f8f9fa; font-weight: bold; text-align: center; padding: 10px;">${day}</div>`;
  });
  
  // Calendar days
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    const dateStr = date.getFullYear() + '-' + 
                   String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(date.getDate()).padStart(2, '0');
    const dayAppointments = appointments.filter(apt => apt.date === dateStr);
    const isToday = date.toDateString() === new Date().toDateString();
    const isCurrentMonth = date.getMonth() === currentMonth;
    
    let dayClass = 'calendar-day';
    if (!isCurrentMonth) dayClass += ' other-month';
    if (isToday) dayClass += ' today';
    if (dayAppointments.length > 0) dayClass += ' has-appointment';
    
    html += `
      <div class="${dayClass}" onclick="showCalendarDayAppointments('${dateStr}', ${dayAppointments.length})">
        ${date.getDate()}
        ${dayAppointments.length > 0 ? '<div class="appointment-dot"></div>' : ''}
        ${dayAppointments.length > 0 ? `<div style="font-size: 0.7rem; margin-top: 5px;">${dayAppointments.length} apt(s)</div>` : ''}
      </div>
    `;
  }
  
  grid.innerHTML = html;
}


// Show Calendar Day Appointments
window.showCalendarDayAppointments = function(dateStr, appointmentCount) {
  if (appointmentCount === 0) return;
  
  // Get appointments for this specific day
  const query = supabase
    .from('appointments')
    .select('*, doctors(name)')
    .eq('clinic_id', clinicId)
    .eq('date', dateStr);
  
  query.then(({ data: appointments }) => {
    if (appointments && appointments.length > 0) {
      showCalendarAppointmentsWindow(dateStr, appointments);
    }
  });
};

// Show Calendar Appointments Window
async function showCalendarAppointmentsWindow(dateStr, appointments) {
  // Create or update the appointments window
  let windowElement = document.getElementById('calendar-appointments-window');
  if (!windowElement) {
    windowElement = document.createElement('div');
    windowElement.id = 'calendar-appointments-window';
    windowElement.className = 'calendar-appointments-window';
    document.body.appendChild(windowElement);
  }
  
  //Calendar Pop up details
  const dateDisplay = new Date(dateStr + 'T00:00:00').toLocaleDateString();
  let appointmentsList = '';
  
  for (const app of appointments) {
    const time12Hr = formatTimeTo12Hr(app.time);
    const { name } = await getPatientInfo(app.user_id);
    
    appointmentsList += `
      <div class="calendar-appointment-item">
        <div class="appointment-time">${time12Hr}</div>
        <div class="appointment-details">
          <strong>${name}</strong><br>
          <small>Patient Name: ${app.patient_name || 'No patient name provided'}</small><br>
          <small>Doctor: ${app.doctors?.name || app.subtitle || 'Unknown'}</small><br>
          <small>Status: ${app.status}</small><br>
          <small>Reason: ${app.reason || 'No reason provided'}</small>
        </div>
      </div>
    `;
  }
  
  windowElement.innerHTML = `
    <div class="calendar-appointments-modal">
    <div class="calendar-appointments-header">
      <h3>Appointments for ${dateDisplay}</h3>
      <button class="close-btn" onclick="hideCalendarAppointmentsWindow()">×</button>
    </div>
    <div class="calendar-appointments-content">
      ${appointmentsList}
      </div>
    </div>
  `;
  
  windowElement.style.display = 'flex';
  
  // Add click event to backdrop to close modal
  windowElement.onclick = function(event) {
    if (event.target === windowElement) {
      hideCalendarAppointmentsWindow();
    }
  };
  
  // Add keyboard event listener to close modal with Escape key
  const handleEscapeKey = function(event) {
    if (event.key === 'Escape') {
      hideCalendarAppointmentsWindow();
      document.removeEventListener('keydown', handleEscapeKey);
    }
  };
  document.addEventListener('keydown', handleEscapeKey);
}

// Hide Calendar Appointments Window
window.hideCalendarAppointmentsWindow = function() {
  const windowElement = document.getElementById('calendar-appointments-window');
  if (windowElement) {
    windowElement.style.display = 'none';
    // Remove any existing event listeners
    windowElement.onclick = null;
  }
};

// Chart cleanup function
function cleanupCharts() {
  if (window.chartInstances) {
    Object.values(window.chartInstances).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    window.chartInstances = {};
  }
}

// Date range functions for stats
window.applyStatsDateRange = async function() {
  const startDate = document.getElementById('stats-start-date').value;
  const endDate = document.getElementById('stats-end-date').value;
  const doctorFilter = document.getElementById('report-doctor-filter').value;
  
  // Validate date range
  if (startDate && endDate && startDate > endDate) {
    alert('Start date cannot be after end date. Please correct the date range.');
    return;
  }
  
  // Load stats with date range
  await loadTotalAppointmentStats(doctorFilter, startDate || null, endDate || null);
};

window.clearStatsDateRange = async function() {
  // Clear date inputs
  document.getElementById('stats-start-date').value = '';
  document.getElementById('stats-end-date').value = '';
  
  // Reload stats without date range
  const doctorFilter = document.getElementById('report-doctor-filter').value;
  await loadTotalAppointmentStats(doctorFilter);
};

window.setQuickRange = async function(rangeType) {
  const today = new Date();
  let startDate, endDate;
  
  switch (rangeType) {
    case 'thisMonth':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case 'lastMonth':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'thisYear':
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31);
      break;
    default:
      return;
  }
  
  // Set the date inputs
  document.getElementById('stats-start-date').value = startDate.toISOString().split('T')[0];
  document.getElementById('stats-end-date').value = endDate.toISOString().split('T')[0];
  
  // Apply the range
  await applyStatsDateRange();
};

// Report Functions
window.generateReport = async function() {
  // Clean up existing charts before generating new report
  cleanupCharts();
  
  const reportDate = document.getElementById('report-date').value || new Date().toISOString().split('T')[0];
  const doctorFilter = document.getElementById('report-doctor-filter').value;
  const filterMonth = document.getElementById('filter-month').value;
  const filterYear = document.getElementById('filter-year').value;
  
  // Determine matrix dates based on filters
  let monthlyAnchor = reportDate;
  let annualAnchor = reportDate;
  
  if (filterMonth && filterYear) {
    monthlyAnchor = `${filterYear}-${filterMonth}-01`;
    annualAnchor = `${filterYear}-01-01`;
  } else if (filterYear) {
    annualAnchor = `${filterYear}-01-01`;
  } else if (filterMonth) {
    const currentYear = new Date().getFullYear();
    monthlyAnchor = `${currentYear}-${filterMonth}-01`;
  }
  
  // Get date range from stats controls if set
  const statsStartDate = document.getElementById('stats-start-date').value;
  const statsEndDate = document.getElementById('stats-end-date').value;
  
  await loadTotalAppointmentStats(doctorFilter, statsStartDate || null, statsEndDate || null);
  await loadDailyStats(reportDate, doctorFilter);
  await loadDoctorReports(reportDate, doctorFilter);
  await loadSalesMonthly(monthlyAnchor);
  await loadSalesAnnual(annualAnchor);
  await loadSalesWeekly(monthlyAnchor);
  await loadAppointmentsMonthlyMatrix(monthlyAnchor);
  await loadAppointmentsAnnualMatrix(annualAnchor);
};

async function loadTotalAppointmentStats(doctorFilter = '', startDate = null, endDate = null) {
  try {
    const statsContainer = document.getElementById('total-stats');
    const periodDisplay = document.getElementById('total-stats-period');
    
    // Build query for all appointments
    let query = supabase
      .from('appointments')
      .select('*, doctors(name), specializations(name)')
      .eq('clinic_id', clinicId);
    
    // Apply doctor filter if specified
    if (doctorFilter) {
      query = query.eq('doctors.name', doctorFilter);
    }
    
    // Apply date range filter if specified
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }
    
    const { data: appointments, error } = await query;
    
    if (error) {
      console.error('Error loading total appointment stats:', error);
      statsContainer.innerHTML = '<p>Error loading statistics</p>';
      return;
    }
    
    const allAppointments = appointments || [];
    
    // Update period display based on filters
    if (startDate && endDate) {
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');
      periodDisplay.textContent = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    } else if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      periodDisplay.textContent = `From ${start.toLocaleDateString()}`;
    } else if (endDate) {
      const end = new Date(endDate + 'T00:00:00');
      periodDisplay.textContent = `Until ${end.toLocaleDateString()}`;
    } else {
      periodDisplay.textContent = 'All Time';
    }
    
    // Calculate comprehensive statistics
    const totalAppointments = allAppointments.length;
    const completedAppointments = allAppointments.filter(apt => apt.status === 'completed').length;
    const pendingAppointments = allAppointments.filter(apt => apt.status === 'pending').length;
    const declinedAppointments = allAppointments.filter(apt => apt.status === 'declined').length;
    const cancelledAppointments = allAppointments.filter(apt => apt.status === 'cancelled').length;
    
    // Calculate completion rate
    const completionRate = totalAppointments > 0 ? ((completedAppointments / totalAppointments) * 100).toFixed(1) : 0;
    
    // Group by specialization
    const specializationStats = {};
    allAppointments.forEach(apt => {
      const specName = apt.specializations?.name || 'No Specialization';
      if (!specializationStats[specName]) {
        specializationStats[specName] = { total: 0, completed: 0 };
      }
      specializationStats[specName].total++;
      if (apt.status === 'completed') {
        specializationStats[specName].completed++;
      }
    });
    
    // Group by doctor
    const doctorStats = {};
    allAppointments.forEach(apt => {
      const doctorName = apt.doctors?.name || 'Unassigned';
      if (!doctorStats[doctorName]) {
        doctorStats[doctorName] = { total: 0, completed: 0 };
      }
      doctorStats[doctorName].total++;
      if (apt.status === 'completed') {
        doctorStats[doctorName].completed++;
      }
    });
    
    
    // Build HTML
    let html = `
      <div class="stats-grid">
        <div class="stat-card primary">
          <div class="stat-number">${totalAppointments}</div>
          <div class="stat-label">Total Appointments</div>
        </div>
        <div class="stat-card success">
          <div class="stat-number">${completedAppointments}</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-number">${pendingAppointments}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card danger">
          <div class="stat-number">${declinedAppointments}</div>
          <div class="stat-label">Declined</div>
        </div>
        <div class="stat-card info">
          <div class="stat-number">${completionRate}%</div>
          <div class="stat-label">Completion Rate</div>
        </div>
        <div class="stat-card secondary">
          <div class="stat-number">${cancelledAppointments}</div>
          <div class="stat-label">Cancelled</div>
        </div>
      </div>
    `;
    
    // Add specialization breakdown
    if (Object.keys(specializationStats).length > 0) {
      html += `
        <div class="stats-breakdown">
          <h4>By Specialization</h4>
          <div class="breakdown-grid">
      `;
      
      Object.entries(specializationStats)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([spec, stats]) => {
          const completionRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0;
          html += `
            <div class="breakdown-item">
              <div class="breakdown-name">${spec}</div>
              <div class="breakdown-stats">
                <span class="breakdown-total">${stats.total} total</span>
                <span class="breakdown-completed">${stats.completed} completed (${completionRate}%)</span>
              </div>
            </div>
          `;
        });
      
      html += `
          </div>
        </div>
      `;
    }
    
    // Add doctor breakdown
    if (Object.keys(doctorStats).length > 0) {
      html += `
        <div class="stats-breakdown">
          <h4>By Doctor</h4>
          <div class="breakdown-grid">
      `;
      
      Object.entries(doctorStats)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([doctor, stats]) => {
          const completionRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0;
          html += `
            <div class="breakdown-item">
              <div class="breakdown-name">${doctor}</div>
              <div class="breakdown-stats">
                <span class="breakdown-total">${stats.total} total</span>
                <span class="breakdown-completed">${stats.completed} completed (${completionRate}%)</span>
              </div>
            </div>
          `;
        });
      
      html += `
          </div>
        </div>
      `;
    }
    
    
    statsContainer.innerHTML = html;
    
    // Update period display
    if (doctorFilter) {
      periodDisplay.textContent = `Filtered by: ${doctorFilter}`;
    } else {
      periodDisplay.textContent = 'All Time';
    }
    
  } catch (error) {
    console.error('Error in loadTotalAppointmentStats:', error);
    document.getElementById('total-stats').innerHTML = '<p>Error loading total statistics</p>';
  }
}

async function loadDailyStats(date, doctorFilter = '') {
  let query = supabase
    .from('appointments')
    .select('*, doctors(name)')
    .eq('clinic_id', clinicId)
    .eq('date', date);
  
  if (doctorFilter) {
    query = query.eq('doctors.name', doctorFilter);
  }
  
  const { data: appointments } = await query;
  
  const stats = {
    total: appointments?.length || 0,
    pending: appointments?.filter(apt => apt.status === 'pending').length || 0,
    approved: appointments?.filter(apt => apt.status === 'approved').length || 0,
    completed: appointments?.filter(apt => apt.status === 'completed').length || 0
  };
  
  document.getElementById('report-date-display').textContent = new Date(date + 'T00:00:00').toLocaleDateString();
  
  const statsContainer = document.getElementById('daily-stats');
  statsContainer.innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${stats.total}</div>
      <div class="stat-label">Total Appointments</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.pending}</div>
      <div class="stat-label">Pending</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.approved}</div>
      <div class="stat-label">Approved</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.completed}</div>
      <div class="stat-label">Completed</div>
    </div>
  `;
}

// Sales Reports (Monthly and Annual)
async function loadSalesMonthly(reportDate) {
  try {
    const root = ensureSalesContainers();
    const container = root.monthly;
    const d = new Date(reportDate + 'T00:00:00');
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = new Date(year, month, 1).toISOString().split('T')[0];
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [{ data: billings }, { data: appts }, specializationMap] = await Promise.all([
      supabase
        .from('billings')
        .select('id, amount, due_date, status, appointment_id')
        .eq('clinic_id', clinicId)
        .eq('status', 'paid')
        .gte('due_date', start)
        .lte('due_date', end),
      supabase
        .from('appointments')
        .select('id, date, specialization_id, doctors(name)')
        .eq('clinic_id', clinicId)
        .gte('date', start)
        .lte('date', end),
      getSpecializationMap()
    ]);

    const apptById = new Map((appts || []).map(a => [a.id, a]));

    // Aggregate by date + specialization + doctor
    const rows = [];
    for (const b of (billings || [])) {
      const a = apptById.get(b.appointment_id);
      if (!a) continue;
      const specName = specializationMap[a.specialization_id] || 'Uncategorized';
      const dateKey = a.date || b.due_date || start;
      const doctorName = (a.doctors && a.doctors.name) ? a.doctors.name : 'Unassigned';
      rows.push({ date: dateKey, specialization: specName, doctor: doctorName, amount: Number(b.amount) || 0 });
    }

    const grouped = new Map();
    for (const r of rows) {
      const key = `${r.date}|${r.specialization}|${r.doctor}`;
      grouped.set(key, (grouped.get(key) || 0) + r.amount);
    }

    // Build table
    const sortedKeys = Array.from(grouped.keys()).sort((k1, k2) => {
      const [d1, s1, dr1] = k1.split('|');
      const [d2, s2, dr2] = k2.split('|');
      return d1.localeCompare(d2) || s1.localeCompare(s2) || dr1.localeCompare(dr2);
    });

    let total = 0;
    const rowsHtml = sortedKeys.map(k => {
      const [dateStr, spec, doc] = k.split('|');
      const amt = grouped.get(k) || 0;
      total += amt;
      return `<tr><td>${dateStr}</td><td>${spec}</td><td>${doc}</td><td style="text-align:right;">₱${formatAmount(amt)}</td></tr>`;
    }).join('');

    container.innerHTML = `
      <div class="report-container">
        <div class="report-header">
          <h3>Monthly Sales (by Date, Specialization & Doctor)</h3>
          <span>${new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
        </div>
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Date</th>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Specialization</th>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Doctor</th>
              <th style="text-align:right; border-bottom:1px solid #e9ecef; padding:8px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="4" style="padding:8px; color:#6c757d;">No paid billings for this month.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right; padding:8px; font-weight:600;">Total</td>
              <td style="text-align:right; padding:8px; font-weight:600;">₱${formatAmount(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    // Add pie charts for monthly sales
    if (rows.length > 0) {
      createSalesPieCharts(rows, 'monthly', 'sales-monthly');
    }
  } catch (e) {
    console.error('loadSalesMonthly error:', e);
  }
}

async function loadSalesAnnual(reportDate) {
  try {
    const root = ensureSalesContainers();
    const container = root.annual;
    const d = new Date(reportDate + 'T00:00:00');
    const year = d.getFullYear();
    const start = new Date(year, 0, 1).toISOString().split('T')[0];
    const end = new Date(year, 11, 31).toISOString().split('T')[0];

    const [{ data: billings }, { data: appts }, specializationMap] = await Promise.all([
      supabase
        .from('billings')
        .select('id, amount, due_date, status, appointment_id')
        .eq('clinic_id', clinicId)
        .eq('status', 'paid')
        .gte('due_date', start)
        .lte('due_date', end),
      supabase
        .from('appointments')
        .select('id, date, specialization_id, doctors(name)')
        .eq('clinic_id', clinicId)
        .gte('date', start)
        .lte('date', end),
      getSpecializationMap()
    ]);

    const apptById = new Map((appts || []).map(a => [a.id, a]));

    // Aggregate by month + specialization + doctor
    const rows = [];
    for (const b of (billings || [])) {
      const a = apptById.get(b.appointment_id);
      if (!a) continue;
      const specName = specializationMap[a.specialization_id] || 'Uncategorized';
      const dateKey = a.date || b.due_date || start;
      const dt = new Date(dateKey + 'T00:00:00');
      const monthKey = `${year}-${String(dt.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
      const doctorName = (a.doctors && a.doctors.name) ? a.doctors.name : 'Unassigned';
      rows.push({ month: monthKey, specialization: specName, doctor: doctorName, amount: Number(b.amount) || 0 });
    }

    const grouped = new Map();
    for (const r of rows) {
      const key = `${r.month}|${r.specialization}|${r.doctor}`;
      grouped.set(key, (grouped.get(key) || 0) + r.amount);
    }

    const sortedKeys = Array.from(grouped.keys()).sort((k1, k2) => {
      const [m1, s1, dr1] = k1.split('|');
      const [m2, s2, dr2] = k2.split('|');
      return m1.localeCompare(m2) || s1.localeCompare(s2) || dr1.localeCompare(dr2);
    });

    let total = 0;
    const rowsHtml = sortedKeys.map(k => {
      const [monthStr, spec, doc] = k.split('|');
      const amt = grouped.get(k) || 0;
      total += amt;
      const pretty = new Date(monthStr + '-01T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
      return `<tr><td>${pretty}</td><td>${spec}</td><td>${doc}</td><td style="text-align:right;">₱${formatAmount(amt)}</td></tr>`;
    }).join('');

    container.innerHTML = `
      <div class="report-container">
        <div class="report-header">
          <h3>Annual Sales (by Month, Specialization & Doctor)</h3>
          <span>${year}</span>
        </div>
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Month</th>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Specialization</th>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Doctor</th>
              <th style="text-align:right; border-bottom:1px solid #e9ecef; padding:8px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="4" style="padding:8px; color:#6c757d;">No paid billings for this year.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right; padding:8px; font-weight:600;">Total</td>
              <td style="text-align:right; padding:8px; font-weight:600;">₱${formatAmount(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    // Add pie charts for annual sales
    if (rows.length > 0) {
      createSalesPieCharts(rows, 'annual', 'sales-annual');
    }
  } catch (e) {
    console.error('loadSalesAnnual error:', e);
  }
}

// Weekly Sales Report
async function loadSalesWeekly(reportDate) {
  try {
    const root = ensureSalesContainers();
    const container = root.weekly;
    const d = new Date(reportDate + 'T00:00:00');
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = new Date(year, month, 1).toISOString().split('T')[0];
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [{ data: billings }, { data: appts }, specializationMap] = await Promise.all([
      supabase
        .from('billings')
        .select('id, amount, due_date, status, appointment_id')
        .eq('clinic_id', clinicId)
        .eq('status', 'paid')
        .gte('due_date', start)
        .lte('due_date', end),
      supabase
        .from('appointments')
        .select('id, date, specialization_id, doctors(name)')
        .eq('clinic_id', clinicId)
        .gte('date', start)
        .lte('date', end),
      getSpecializationMap()
    ]);

    const apptById = new Map((appts || []).map(a => [a.id, a]));

    // Aggregate by week + specialization + doctor
    const rows = [];
    for (const b of (billings || [])) {
      const a = apptById.get(b.appointment_id);
      if (!a) continue;
      const specName = specializationMap[a.specialization_id] || 'Uncategorized';
      const dateKey = a.date || b.due_date || start;
      const doctorName = (a.doctors && a.doctors.name) ? a.doctors.name : 'Unassigned';
      
      // Calculate week number within the month
      const weekNumber = getWeekNumberInMonth(dateKey);
      const weekLabel = `Week ${weekNumber}`;
      
      rows.push({ 
        week: weekLabel, 
        weekNumber: weekNumber,
        date: dateKey,
        specialization: specName, 
        doctor: doctorName, 
        amount: Number(b.amount) || 0 
      });
    }

    // Group by week
    const grouped = new Map();
    for (const r of rows) {
      const key = `${r.week}|${r.specialization}|${r.doctor}`;
      grouped.set(key, (grouped.get(key) || 0) + r.amount);
    }

    // Build table
    const sortedKeys = Array.from(grouped.keys()).sort((k1, k2) => {
      const [w1, s1, dr1] = k1.split('|');
      const [w2, s2, dr2] = k2.split('|');
      const weekNum1 = parseInt(w1.replace('Week ', ''));
      const weekNum2 = parseInt(w2.replace('Week ', ''));
      return weekNum1 - weekNum2 || s1.localeCompare(s2) || dr1.localeCompare(dr2);
    });

    let total = 0;
    const rowsHtml = sortedKeys.map(k => {
      const [weekStr, spec, doc] = k.split('|');
      const amt = grouped.get(k) || 0;
      total += amt;
      return `<tr><td>${weekStr}</td><td>${spec}</td><td>${doc}</td><td style="text-align:right;">₱${formatAmount(amt)}</td></tr>`;
    }).join('');

    container.innerHTML = `
      <div class="report-container">
        <div class="report-header">
          <h3>Weekly Sales (by Week, Specialization & Doctor)</h3>
          <span>${new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
        </div>
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Week</th>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Specialization</th>
              <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Doctor</th>
              <th style="text-align:right; border-bottom:1px solid #e9ecef; padding:8px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="4" style="padding:8px; color:#6c757d;">No paid billings for this month.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right; padding:8px; font-weight:600;">Total</td>
              <td style="text-align:right; padding:8px; font-weight:600;">₱${formatAmount(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    // Add pie charts for weekly sales
    if (rows.length > 0) {
      createWeeklySalesPieCharts(rows, 'weekly', 'sales-weekly');
    }
  } catch (e) {
    console.error('loadSalesWeekly error:', e);
  }
}

// Helper function to calculate week number within a month
function getWeekNumberInMonth(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstWeekStart = new Date(firstDay);
  firstWeekStart.setDate(firstDay.getDate() - firstDay.getDay()); // Start from Sunday
  
  const diffTime = date - firstWeekStart;
  const diffWeeks = Math.ceil(diffTime / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks);
}

function ensureSalesContainers() {
  const reportsPage = document.getElementById('reports');
  let monthly = document.getElementById('sales-monthly');
  let annual = document.getElementById('sales-annual');
  let weekly = document.getElementById('sales-weekly');
  if (!monthly) {
    monthly = document.createElement('div');
    monthly.id = 'sales-monthly';
    reportsPage.appendChild(monthly);
  }
  if (!annual) {
    annual = document.createElement('div');
    annual.id = 'sales-annual';
    reportsPage.appendChild(annual);
  }
  if (!weekly) {
    weekly = document.createElement('div');
    weekly.id = 'sales-weekly';
    reportsPage.appendChild(weekly);
  }
  return { monthly, annual, weekly };
}

// Chart.js color palette
const CHART_COLORS = [
  '#9534db', '#007bff', '#28a745', '#ffc107', '#dc3545', '#17a2b8', 
  '#6c757d', '#fd7e14', '#20c997', '#6f42c1', '#e83e8c', '#20c997'
];

// Pie Chart Functions
function createPieChart(canvasId, data, title, total) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  // Destroy existing chart if it exists
  if (window.chartInstances && window.chartInstances[canvasId]) {
    window.chartInstances[canvasId].destroy();
  }

  const chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.values,
        backgroundColor: CHART_COLORS.slice(0, data.labels.length),
        borderColor: '#fff',
        borderWidth: 2,
        hoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed;
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ₱${formatAmount(value)} (${percentage}%)`;
            }
          }
        }
      },
      animation: {
        animateRotate: true,
        animateScale: true
      }
    }
  });

  // Store chart instance for cleanup
  if (!window.chartInstances) window.chartInstances = {};
  window.chartInstances[canvasId] = chart;

  return chart;
}

function createSalesPieCharts(rows, period, containerId) {
  // Group by specialization
  const specData = {};
  const doctorData = {};
  
  rows.forEach(row => {
    const amount = row.amount || 0;
    
    // Specialization data
    if (!specData[row.specialization]) {
      specData[row.specialization] = 0;
    }
    specData[row.specialization] += amount;
    
    // Doctor data
    if (!doctorData[row.doctor]) {
      doctorData[row.doctor] = 0;
    }
    doctorData[row.doctor] += amount;
  });

  // Calculate totals
  const specTotal = Object.values(specData).reduce((sum, val) => sum + val, 0);
  const doctorTotal = Object.values(doctorData).reduce((sum, val) => sum + val, 0);

  // Prepare chart data
  const specChartData = {
    labels: Object.keys(specData),
    values: Object.values(specData)
  };

  const doctorChartData = {
    labels: Object.keys(doctorData),
    values: Object.values(doctorData)
  };

  // Create charts HTML
  const chartsHtml = `
    <div class="charts-container">
      <div class="chart-wrapper">
        <div class="chart-title">Revenue by Specialization</div>
        <div class="chart-container">
          <canvas id="${containerId}-spec-chart"></canvas>
        </div>
        <div class="chart-total">Total: ₱${formatAmount(specTotal)}</div>
      </div>
      <div class="chart-wrapper">
        <div class="chart-title">Revenue by Doctor</div>
        <div class="chart-container">
          <canvas id="${containerId}-doctor-chart"></canvas>
        </div>
        <div class="chart-total">Total: ₱${formatAmount(doctorTotal)}</div>
      </div>
    </div>
  `;

  // Add charts to container
  const container = document.getElementById(containerId);
  if (container) {
    // Remove existing charts
    const existingCharts = container.querySelector('.charts-container');
    if (existingCharts) {
      existingCharts.remove();
    }
    
    // Add new charts
    container.insertAdjacentHTML('beforeend', chartsHtml);

    // Create the actual charts
    if (specChartData.labels.length > 0) {
      createPieChart(`${containerId}-spec-chart`, specChartData, 'Revenue by Specialization', specTotal);
    }
    
    if (doctorChartData.labels.length > 0) {
      createPieChart(`${containerId}-doctor-chart`, doctorChartData, 'Revenue by Doctor', doctorTotal);
    }
  }
}

function createWeeklySalesPieCharts(rows, period, containerId) {
  // Group by week, specialization, and doctor
  const weekData = {};
  const specData = {};
  const doctorData = {};
  
  rows.forEach(row => {
    const amount = row.amount || 0;
    
    // Week data
    if (!weekData[row.week]) {
      weekData[row.week] = 0;
    }
    weekData[row.week] += amount;
    
    // Specialization data
    if (!specData[row.specialization]) {
      specData[row.specialization] = 0;
    }
    specData[row.specialization] += amount;
    
    // Doctor data
    if (!doctorData[row.doctor]) {
      doctorData[row.doctor] = 0;
    }
    doctorData[row.doctor] += amount;
  });

  // Calculate totals
  const weekTotal = Object.values(weekData).reduce((sum, val) => sum + val, 0);
  const specTotal = Object.values(specData).reduce((sum, val) => sum + val, 0);
  const doctorTotal = Object.values(doctorData).reduce((sum, val) => sum + val, 0);

  // Prepare chart data
  const weekChartData = {
    labels: Object.keys(weekData).sort((a, b) => {
      const weekNum1 = parseInt(a.replace('Week ', ''));
      const weekNum2 = parseInt(b.replace('Week ', ''));
      return weekNum1 - weekNum2;
    }),
    values: Object.keys(weekData).sort((a, b) => {
      const weekNum1 = parseInt(a.replace('Week ', ''));
      const weekNum2 = parseInt(b.replace('Week ', ''));
      return weekNum1 - weekNum2;
    }).map(week => weekData[week])
  };

  const specChartData = {
    labels: Object.keys(specData),
    values: Object.values(specData)
  };

  const doctorChartData = {
    labels: Object.keys(doctorData),
    values: Object.values(doctorData)
  };

  // Create charts HTML
  const chartsHtml = `
    <div class="charts-container weekly">
      <div class="chart-wrapper">
        <div class="chart-title">Revenue by Week</div>
        <div class="chart-container">
          <canvas id="${containerId}-week-chart"></canvas>
        </div>
        <div class="chart-total">Total: ₱${formatAmount(weekTotal)}</div>
      </div>
      <div class="chart-wrapper">
        <div class="chart-title">Revenue by Specialization</div>
        <div class="chart-container">
          <canvas id="${containerId}-spec-chart"></canvas>
        </div>
        <div class="chart-total">Total: ₱${formatAmount(specTotal)}</div>
      </div>
      <div class="chart-wrapper">
        <div class="chart-title">Revenue by Doctor</div>
        <div class="chart-container">
          <canvas id="${containerId}-doctor-chart"></canvas>
        </div>
        <div class="chart-total">Total: ₱${formatAmount(doctorTotal)}</div>
      </div>
    </div>
  `;

  // Add charts to container
  const container = document.getElementById(containerId);
  if (container) {
    // Remove existing charts
    const existingCharts = container.querySelector('.charts-container');
    if (existingCharts) {
      existingCharts.remove();
    }
    
    // Add new charts
    container.insertAdjacentHTML('beforeend', chartsHtml);

    // Create the actual charts
    if (weekChartData.labels.length > 0) {
      createPieChart(`${containerId}-week-chart`, weekChartData, 'Revenue by Week', weekTotal);
    }
    
    if (specChartData.labels.length > 0) {
      createPieChart(`${containerId}-spec-chart`, specChartData, 'Revenue by Specialization', specTotal);
    }
    
    if (doctorChartData.labels.length > 0) {
      createPieChart(`${containerId}-doctor-chart`, doctorChartData, 'Revenue by Doctor', doctorTotal);
    }
  }
}

function formatAmount(n) {
  try { return (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch { return String(n); }
}

// Appointment Matrices (Monthly and Annual)
async function loadAppointmentsMonthlyMatrix(reportDate) {
  try {
    const root = ensureAppointmentMatrixContainers();
    const container = root.monthly;
    const d = new Date(reportDate + 'T00:00:00');
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = new Date(year, month, 1).toISOString().split('T')[0];
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [{ data: appts }, specializationMap] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, date, time, patient_name, specialization_id, doctors(name)')
        .eq('clinic_id', clinicId)
        .gte('date', start)
        .lte('date', end),
      getSpecializationMap()
    ]);

    const specs = Array.from(new Set((appts || []).map(a => specializationMap[a.specialization_id] || 'Uncategorized'))).sort();

    // date -> spec -> entries[]
    const byDateSpec = new Map();
    for (const a of (appts || [])) {
      const dateKey = a.date;
      const specName = specializationMap[a.specialization_id] || 'Uncategorized';
      const doctorName = a.doctors?.name || 'Unknown';
      const time12 = formatTimeTo12Hr(a.time);
      const line = `${time12} - Patient: ${a.patient_name || 'N/A'} | Doctor: ${doctorName}`;
      if (!byDateSpec.has(dateKey)) byDateSpec.set(dateKey, new Map());
      const inner = byDateSpec.get(dateKey);
      if (!inner.has(specName)) inner.set(specName, []);
      inner.get(specName).push(line);
    }

    const sortedDates = Array.from(byDateSpec.keys()).sort();

    const headerCells = specs.map(s => `<th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">${s}</th>`).join('');
    const bodyRows = sortedDates.map(dateStr => {
      const inner = byDateSpec.get(dateStr);
      const cells = specs.map(s => {
        const lines = inner.get(s) || [];
        const content = lines.length ? `<ul style=\"margin:0; padding-left:16px;\">${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : '<span style="color:#6c757d;">—</span>';
        return `<td style="vertical-align:top; padding:8px;">${content}</td>`;
      }).join('');
      return `<tr><td style="padding:8px; white-space:nowrap;">${dateStr}</td>${cells}</tr>`;
    }).join('');

    container.innerHTML = `
      <div class="report-container">
        <div class="report-header">
          <h3>Monthly Appointment Matrix</h3>
          <span>${new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
        </div>
        <div style="overflow:auto;">
          <table style="width:100%; border-collapse: collapse; min-width: 720px;">
            <thead>
              <tr>
                <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Date</th>
                ${headerCells}
              </tr>
            </thead>
            <tbody>
              ${bodyRows || `<tr><td colspan="${1 + specs.length}" style="padding:8px; color:#6c757d;">No appointments this month.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    console.error('loadAppointmentsMonthlyMatrix error:', e);
  }
}

async function loadAppointmentsAnnualMatrix(reportDate) {
  try {
    const root = ensureAppointmentMatrixContainers();
    const container = root.annual;
    const d = new Date(reportDate + 'T00:00:00');
    const year = d.getFullYear();
    const start = new Date(year, 0, 1).toISOString().split('T')[0];
    const end = new Date(year, 11, 31).toISOString().split('T')[0];

    const [{ data: appts }, specializationMap] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, date, time, patient_name, specialization_id, doctors(name)')
        .eq('clinic_id', clinicId)
        .gte('date', start)
        .lte('date', end),
      getSpecializationMap()
    ]);

    const specs = Array.from(new Set((appts || []).map(a => specializationMap[a.specialization_id] || 'Uncategorized'))).sort();

    // month -> spec -> entries[]
    const byMonthSpec = new Map();
    for (const a of (appts || [])) {
      const dt = new Date(a.date + 'T00:00:00');
      const monthKey = `${year}-${String(dt.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
      const specName = specializationMap[a.specialization_id] || 'Uncategorized';
      const doctorName = a.doctors?.name || 'Unknown';
      const time12 = formatTimeTo12Hr(a.time);
      const line = `${a.date} ${time12} - Patient: ${a.patient_name || 'N/A'} | Doctor: ${doctorName}`;
      if (!byMonthSpec.has(monthKey)) byMonthSpec.set(monthKey, new Map());
      const inner = byMonthSpec.get(monthKey);
      if (!inner.has(specName)) inner.set(specName, []);
      inner.get(specName).push(line);
    }

    const sortedMonths = Array.from(byMonthSpec.keys()).sort();

    const headerCells = specs.map(s => `<th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">${s}</th>`).join('');
    const bodyRows = sortedMonths.map(mKey => {
      const inner = byMonthSpec.get(mKey);
      const pretty = new Date(mKey + '-01T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const cells = specs.map(s => {
        const lines = inner.get(s) || [];
        const content = lines.length ? `<ul style=\"margin:0; padding-left:16px;\">${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : '<span style="color:#6c757d;">—</span>';
        return `<td style="vertical-align:top; padding:8px;">${content}</td>`;
      }).join('');
      return `<tr><td style="padding:8px; white-space:nowrap;">${pretty}</td>${cells}</tr>`;
    }).join('');

    container.innerHTML = `
      <div class="report-container">
        <div class="report-header">
          <h3>Annual Appointment Matrix</h3>
          <span>${year}</span>
        </div>
        <div style="overflow:auto;">
          <table style="width:100%; border-collapse: collapse; min-width: 720px;">
            <thead>
              <tr>
                <th style="text-align:left; border-bottom:1px solid #e9ecef; padding:8px;">Month</th>
                ${headerCells}
              </tr>
            </thead>
            <tbody>
              ${bodyRows || `<tr><td colspan="${1 + specs.length}" style="padding:8px; color:#6c757d;">No appointments this year.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    console.error('loadAppointmentsAnnualMatrix error:', e);
  }
}

function ensureAppointmentMatrixContainers() {
  const reportsPage = document.getElementById('reports');
  let monthly = document.getElementById('appointments-monthly-matrix');
  let annual = document.getElementById('appointments-annual-matrix');
  if (!monthly) {
    monthly = document.createElement('div');
    monthly.id = 'appointments-monthly-matrix';
    reportsPage.appendChild(monthly);
  }
  if (!annual) {
    annual = document.createElement('div');
    annual.id = 'appointments-annual-matrix';
    reportsPage.appendChild(annual);
  }
  return { monthly, annual };
}

// Builders to generate Excel-ready AOAs for matrices
async function buildMonthlyAppointmentMatrixAOA(reportDate) {
  const d = new Date(reportDate + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  const start = new Date(year, month, 1).toISOString().split('T')[0];
  const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

  const [{ data: appts }, specializationMap] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, date, time, patient_name, specialization_id, doctors(name)')
      .eq('clinic_id', clinicId)
      .gte('date', start)
      .lte('date', end),
    getSpecializationMap()
  ]);

  const specs = Array.from(new Set((appts || []).map(a => specializationMap[a.specialization_id] || 'Uncategorized'))).sort();
  const byDateSpec = new Map();
  for (const a of (appts || [])) {
    const dateKey = a.date;
    const specName = specializationMap[a.specialization_id] || 'Uncategorized';
    const doctorName = a.doctors?.name || 'Unknown';
    const time12 = formatTimeTo12Hr(a.time);
    const line = `${time12} - Patient: ${a.patient_name || 'N/A'} | Doctor: ${doctorName}`;
    if (!byDateSpec.has(dateKey)) byDateSpec.set(dateKey, new Map());
    const inner = byDateSpec.get(dateKey);
    if (!inner.has(specName)) inner.set(specName, []);
    inner.get(specName).push(line);
  }

  const sortedDates = Array.from(byDateSpec.keys()).sort();
  const header = ['Date', ...specs];
  const aoa = [header];
  for (const dateStr of sortedDates) {
    const inner = byDateSpec.get(dateStr);
    const row = [dateStr, ...specs.map(s => (inner.get(s) || []).join('\n'))];
    aoa.push(row);
  }
  return { aoa, specs };
}

async function buildAnnualAppointmentMatrixAOA(reportDate) {
  const d = new Date(reportDate + 'T00:00:00');
  const year = d.getFullYear();
  const start = new Date(year, 0, 1).toISOString().split('T')[0];
  const end = new Date(year, 11, 31).toISOString().split('T')[0];

  const [{ data: appts }, specializationMap] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, date, time, patient_name, specialization_id, doctors(name)')
      .eq('clinic_id', clinicId)
      .gte('date', start)
      .lte('date', end),
    getSpecializationMap()
  ]);

  const specs = Array.from(new Set((appts || []).map(a => specializationMap[a.specialization_id] || 'Uncategorized'))).sort();
  const byMonthSpec = new Map();
  for (const a of (appts || [])) {
    const dt = new Date(a.date + 'T00:00:00');
    const monthKey = `${year}-${String(dt.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
    const specName = specializationMap[a.specialization_id] || 'Uncategorized';
    const doctorName = a.doctors?.name || 'Unknown';
    const time12 = formatTimeTo12Hr(a.time);
    const line = `${a.date} ${time12} - Patient: ${a.patient_name || 'N/A'} | Doctor: ${doctorName}`;
    if (!byMonthSpec.has(monthKey)) byMonthSpec.set(monthKey, new Map());
    const inner = byMonthSpec.get(monthKey);
    if (!inner.has(specName)) inner.set(specName, []);
    inner.get(specName).push(line);
  }

  const sortedMonths = Array.from(byMonthSpec.keys()).sort();
  const header = ['Month', ...specs];
  const aoa = [header];
  for (const mKey of sortedMonths) {
    const inner = byMonthSpec.get(mKey);
    const pretty = new Date(mKey + '-01T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const row = [pretty, ...specs.map(s => (inner.get(s) || []).join('\n'))];
    aoa.push(row);
  }
  return { aoa, specs };
}

async function loadDoctorReports(date, doctorFilter = '') {
  const doctors = await getDoctorsForDropdown();
  const reportsContainer = document.getElementById('doctor-reports');
  
  let html = '';
  
  for (const doctor of doctors) {
    if (doctorFilter && doctor.name !== doctorFilter) continue;
    
    // Get doctor's appointments for the date
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*, doctors(name)')
      .eq('clinic_id', clinicId)
      .eq('doctors.name', doctor.name)
      .eq('date', date);
    
    const completedAppointments = appointments?.filter(apt => apt.status === 'completed') || [];
    
    html += `
      <div class="report-container">
        <h4>${doctor.name}</h4>
        <div class="report-stats">
          <div class="stat-card">
            <div class="stat-number">${appointments?.length || 0}</div>
            <div class="stat-label">Total Appointments</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${completedAppointments.length}</div>
            <div class="stat-label">Completed</div>
          </div>
        </div>
      </div>
    `;
  }
  
  reportsContainer.innerHTML = html;
}

window.exportReport = function() {
  const reportDate = document.getElementById('report-date').value || new Date().toISOString().split('T')[0];
  const monthInput = document.getElementById('matrix-month')?.value; // YYYY-MM
  const yearInput = document.getElementById('matrix-year')?.value; // YYYY
  (async () => {
    const XLSXLib = window.XLSX;
    if (!XLSXLib) {
      alert('Excel library not loaded. Please check your internet connection.');
      return;
    }

    // Build AOAs for monthly and annual matrices
    const monthlyAnchor = monthInput ? monthInput + '-01' : reportDate;
    const annualAnchor = yearInput ? yearInput + '-01-01' : reportDate;
    const monthly = await buildMonthlyAppointmentMatrixAOA(monthlyAnchor);
    const annual = await buildAnnualAppointmentMatrixAOA(annualAnchor);

    const wb = XLSXLib.utils.book_new();
    const wsMonth = XLSXLib.utils.aoa_to_sheet(monthly.aoa);
    const wsYear = XLSXLib.utils.aoa_to_sheet(annual.aoa);

    XLSXLib.utils.book_append_sheet(wb, wsMonth, 'Monthly Matrix');
    XLSXLib.utils.book_append_sheet(wb, wsYear, 'Annual Matrix');

    const fileName = `Clinic_Appointments_Matrix_${reportDate}.xlsx`;
    XLSXLib.writeFile(wb, fileName);
  })();
};

// Patient Filter Functions
window.applyPatientFilters = function() {
  loadCompletedAppointments();
};

window.clearPatientFilters = function() {
  document.getElementById('patient-search').value = '';
  document.getElementById('patient-date-filter').value = '';
  document.getElementById('patient-gender-filter').value = '';
  loadCompletedAppointments();
};

// Patient Details Filter Functions
window.applyPatientDetailsFilters = function() {
  // Get the current patient ID from the URL or stored variable
  const currentPatientId = window.currentPatientId;
  if (currentPatientId) {
    // Reload patient details (filter values will be preserved automatically)
    loadPatientDetails(currentPatientId, []);
  }
};

window.clearPatientDetailsFilters = function() {
  document.getElementById('patient-doctor-filter').value = '';
  document.getElementById('patient-appointment-date-filter').value = '';
  document.getElementById('patient-billing-status-filter').value = '';
  
  // Reapply filters (which will show all appointments since filters are cleared)
  const currentPatientId = window.currentPatientId;
  if (currentPatientId) {
    loadPatientDetails(currentPatientId, []);
  }
};





// Separate Prescription and Billing Functions
window.savePrescriptionOnly = async function() {
  const userId = selectedAppointment.user_id;
  const appointmentId = selectedAppointment.id;
  
  const prescName = document.getElementById('presc-name').value.trim();
  const prescDetails = document.getElementById('presc-details').value.trim();
  
  if (!prescName || !prescDetails) {
    alert('Please enter medicine name and details.');
    return;
  }
  
  // Resolve doctor_id by matching the appointment's doctor name within this clinic
  const doctorName = selectedAppointment.doctors?.name;
  let doctorId = null;
  if (doctorName) {
    const { data: doctorRows } = await supabase
      .from('doctors')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('name', doctorName)
      .limit(1);
    if (doctorRows && doctorRows.length > 0) {
      doctorId = doctorRows[0].id;
    }
  }
  
  const presc = {
    user_id: userId,
    name: prescName,
    details: prescDetails,
    appointment_id: appointmentId,
    clinic_id: clinicId,
    doctor_id: doctorId,
    icon: 'pill',
    color: 'blue'
  };
  
  const { error } = await supabase.from('prescriptions').insert([presc]);
  
  if (error) {
    alert('Failed to save prescription.');
    console.error(error);
  } else {
    alert('Prescription saved successfully!');
    // Clear prescription fields
    document.getElementById('presc-name').value = '';
    document.getElementById('presc-details').value = '';
  }
};

window.saveBillingOnly = async function() {
  const userId = selectedAppointment.user_id;
  const appointmentId = selectedAppointment.id;
  
  // Resolve doctor_id by matching the appointment's doctor name within this clinic
  const doctorName = selectedAppointment.doctors?.name;
  let doctorId = null;
  if (doctorName) {
    const { data: doctorRows } = await supabase
      .from('doctors')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('name', doctorName)
      .limit(1);
    if (doctorRows && doctorRows.length > 0) {
      doctorId = doctorRows[0].id;
    }
  }
  
  const billingTitle = document.getElementById('billing-title').value.trim();
  const billingAmount = document.getElementById('billing-amount').value.trim();
  const billingDue = document.getElementById('billing-due').value.trim();
  const billingStatus = document.getElementById('billing-status').value;
  
  if (!billingTitle || !billingAmount) {
    alert('Please enter billing title and amount.');
    return;
  }
  
  const billing = {
    user_id: userId,
    title: billingTitle,
    amount: parseFloat(billingAmount),
    due_date: billingDue || null,
    status: billingStatus,
    description: `Billing for service on ${selectedAppointment.date}`,
    appointment_id: appointmentId,
    clinic_id: clinicId
  };
  
  const { error } = await supabase.from('billings').insert([billing]);
  
  if (error) {
    alert('Failed to save billing.');
    console.error(error);
  } else {
    alert('Billing saved successfully!');
    // Clear billing fields
    document.getElementById('billing-title').value = '';
    document.getElementById('billing-amount').value = '';
    document.getElementById('billing-due').value = '';
    document.getElementById('billing-status').value = 'unpaid';
  }
};

// Real-time subscription for appointment updates
function setupRealtimeSubscription() {
  const subscription = supabase
    .channel('appointment_updates')
    .on('postgres_changes', 
      { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'appointments',
        filter: `clinic_id=eq.${clinicId}`
      }, 
      (payload) => {
        console.log('Appointment updated:', payload);
        // Refresh current page if it's requests or accommodated
        const current = document.querySelector('.page:not([style*="display: none"])');
        if (current?.id === 'requests') loadAppointments();
        if (current?.id === 'accommodated') loadApprovedPatients();
      }
    )
    .subscribe();
  
  return subscription;
}

// Initial
if (checkAuth()) {
  loadClinicName();
  showPage('requests');
  setupRealtimeSubscription();
}

// ================= LAB RESULTS STORAGE =================

// Upload a lab result file to Supabase Storage and link it to the appointment
window.uploadLabResult = async function (appointmentId) {
  const fileInput = document.getElementById(`lab-result-file-${appointmentId}`);
  if (!fileInput || fileInput.files.length === 0) {
    alert("Please choose a file first.");
    return;
  }
  const file = fileInput.files[0];
  const fileExt = (file.name.split('.').pop() || '').toLowerCase();
  const fileName = file.name; // keep original filename
  const filePath = `${appointmentId}/${fileName}`;

  try {
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('lab_results')
      .upload(filePath, file, { upsert: true }); // upsert keeps same name and overwrites if it exists

    if (uploadError) {
      alert("Upload failed: " + uploadError.message);
      console.error(uploadError);
      return;
    }

    // Get public URL (or signed URL if bucket is private)
    const { data } = supabase.storage.from('lab_results').getPublicUrl(filePath);
    const publicUrl = data.publicUrl;

    // If the uploaded file is PDF or image (png/jpg/jpeg), push its URL to appointments.file_url
    const mime = (file.type || '').toLowerCase();
    const isPdfOrImage =
      fileExt === 'pdf' || fileExt === 'png' || fileExt === 'jpg' || fileExt === 'jpeg' ||
      mime === 'application/pdf' || mime.startsWith('image/');
    if (isPdfOrImage) {
      const { error: dbError } = await supabase
        .from('appointments')
        .update({ file_url: publicUrl })
        .eq('id', appointmentId);
      if (dbError) {
        alert("File uploaded but failed to link in database.");
        console.error(dbError);
      }
    }

    alert("Lab result uploaded successfully!");
    await listLabResultsForAppointment(appointmentId);
  } catch (e) {
    console.error("Upload error:", e);
    alert("Unexpected error while uploading.");
  }
};

// List all lab result files for an appointment
async function listLabResultsForAppointment(appointmentId) {
  const container = document.getElementById(`lab-current-files-${appointmentId}`);
  if (!container) return;

  try {
    const { data, error } = await supabase.storage
      .from('lab_results')
      .list(appointmentId + '/');

    if (error) {
      console.error("Error listing lab results:", error);
      container.innerHTML = "No lab results found.";
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = "No lab results uploaded.";
      return;
    }

    const fileLinks = data.map(file => {
      const { data: pub } = supabase.storage.from('lab_results').getPublicUrl(`${appointmentId}/${file.name}`);
      return `<a href="${pub.publicUrl}" target="_blank">${file.name}</a>`;
    });

    container.innerHTML = `<strong>Uploaded Lab Results:</strong><br>${fileLinks.join('<br>')}`;
  } catch (e) {
    console.error("Error loading lab results:", e);
    container.innerHTML = "Error loading lab results.";
  }
}

// Expose to HTML
window.showPage = showPage;
window.managePatient = managePatient;
window.submitManagement = submitManagement;
window.confirmAndApprove = confirmAndApprove;
window.confirmAndDecline = confirmAndDecline;
window.updateAppointmentStatus = updateAppointmentStatus;
window.uploadLabResult = uploadLabResult;
window.saveVitalSigns = saveVitalSigns;
window.addMedicineRow = addMedicineRow;

// Update billing status in database
window.updateBillingStatus = async function() {
  if (!selectedAppointment) return;
  
  const billingStatus = document.getElementById('billing-status').value;
  if (!billingStatus) return;
  
  try {
    // Find the billing record for this appointment
    const { data: billingData, error: fetchError } = await supabase
      .from('billings')
      .select('id')
      .eq('appointment_id', selectedAppointment.id)
      .single();
    
    if (fetchError) {
      console.log('No existing billing record found for this appointment');
      return; // No billing record exists yet, so no need to update
    }
    
    if (billingData && billingData.id) {
      // Update the billing status
      const { error: updateError } = await supabase
        .from('billings')
        .update({ status: billingStatus })
        .eq('id', billingData.id);
      
      if (updateError) {
        console.error('Error updating billing status:', updateError);
        alert('Failed to update billing status. Please try again.');
      } else {
        console.log('Billing status updated successfully to:', billingStatus);
      }
    }
  } catch (error) {
    console.error('Error in updateBillingStatus:', error);
  }
};

// Update billing field in database
window.updateBillingField = async function(fieldName) {
  if (!selectedAppointment) return;
  
  let fieldValue;
  switch (fieldName) {
    case 'title':
      fieldValue = document.getElementById('billing-title').value.trim();
      break;
    case 'amount':
      fieldValue = document.getElementById('billing-amount').value.trim();
      if (fieldValue) fieldValue = parseFloat(fieldValue);
      break;
    case 'due_date':
      fieldValue = document.getElementById('billing-due').value;
      break;
    default:
      return;
  }
  
  try {
    // Find the billing record for this appointment
    const { data: billingData, error: fetchError } = await supabase
      .from('billings')
      .select('id')
      .eq('appointment_id', selectedAppointment.id)
      .single();
    
    if (fetchError) {
      console.log('No existing billing record found for this appointment');
      return; // No billing record exists yet, so no need to update
    }
    
    if (billingData && billingData.id) {
      // Update the billing field
      const updateData = {};
      updateData[fieldName] = fieldValue;
      
      const { error: updateError } = await supabase
        .from('billings')
        .update(updateData)
        .eq('id', billingData.id);
      
      if (updateError) {
        console.error(`Error updating billing ${fieldName}:`, updateError);
        alert(`Failed to update billing ${fieldName}. Please try again.`);
      } else {
        console.log(`Billing ${fieldName} updated successfully to:`, fieldValue);
      }
    }
  } catch (error) {
    console.error(`Error in updateBillingField for ${fieldName}:`, error);
  }
};

// Doctor Schedule Management Functions
let currentScheduleCalendar = {
  doctorId: null,
  currentDate: new Date(),
  schedules: []
};

// Load Doctor Schedule Calendar
async function loadDoctorScheduleCalendar(doctorId) {
  currentScheduleCalendar.doctorId = doctorId;
  currentScheduleCalendar.currentDate = new Date();
  
  // Load existing schedules for the doctor
  await loadDoctorSchedules(doctorId);
  
  // Generate calendar HTML
  generateScheduleCalendar();
}

// Load doctor schedules from database
async function loadDoctorSchedules(doctorId) {
  const { data, error } = await supabase
    .from('clinic_schedules')
    .select('*')
    .eq('doctors_id', doctorId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error loading doctor schedules:', error);
    currentScheduleCalendar.schedules = [];
    return;
  }

  currentScheduleCalendar.schedules = data || [];
}

// Generate calendar HTML
function generateScheduleCalendar() {
  const calendarContainer = document.getElementById('doctor-schedule-calendar');
  if (!calendarContainer) return;

  const currentDate = currentScheduleCalendar.currentDate;
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  let calendarHTML = `
    <div class="calendar-header">
      <button class="calendar-nav-btn" onclick="navigateScheduleCalendar(-1)">‹ Previous</button>
      <div class="calendar-month-year">${monthNames[month]} ${year}</div>
      <button class="calendar-nav-btn" onclick="navigateScheduleCalendar(1)">Next ›</button>
    </div>
    <div class="calendar-grid">
  `;
  
  // Add day headers
  dayNames.forEach(day => {
    calendarHTML += `<div class="calendar-day-header">${day}</div>`;
  });
  
  // Add calendar days
  const currentDateObj = new Date();
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    const isCurrentMonth = date.getMonth() === month;
    const isToday = date.toDateString() === currentDateObj.toDateString();
    const dateString = date.getFullYear() + '-' + 
                      String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(date.getDate()).padStart(2, '0');
    
    // Check if this date has schedules
    const hasSchedule = currentScheduleCalendar.schedules.some(schedule => 
      schedule.date === dateString
    );
    
    let dayClass = 'calendar-day';
    if (!isCurrentMonth) dayClass += ' other-month';
    if (isToday) dayClass += ' today';
    if (hasSchedule) dayClass += ' scheduled';
    
    calendarHTML += `
      <div class="${dayClass}" onclick="handleScheduleDayClick('${dateString}', ${hasSchedule})">
        ${date.getDate()}
      </div>
    `;
  }
  
  calendarHTML += '</div>';
  calendarContainer.innerHTML = calendarHTML;
}

// Navigate calendar months
window.navigateScheduleCalendar = function(direction) {
  const newDate = new Date(currentScheduleCalendar.currentDate);
  newDate.setMonth(newDate.getMonth() + direction);
  currentScheduleCalendar.currentDate = newDate;
  generateScheduleCalendar();
};

// Handle day click
window.handleScheduleDayClick = function(dateString, hasSchedule) {
  if (hasSchedule) {
    // Show existing schedule popup
    showScheduleViewPopup(dateString);
  } else {
    // Show add schedule popup
    showScheduleAddPopup(dateString);
  }
};

// Show schedule view popup
function showScheduleViewPopup(dateString) {
  const schedules = currentScheduleCalendar.schedules.filter(schedule => 
    schedule.date === dateString
  );
  
  if (schedules.length === 0) return;
  
  // Sort schedules by time from morning to evening
  schedules.sort((a, b) => {
    // Handle "All day" schedules - put them at the end
    if (!a.available_time && !b.available_time) return 0;
    if (!a.available_time) return 1;
    if (!b.available_time) return -1;
    
    // Compare time strings (HH:MM format)
    return a.available_time.localeCompare(b.available_time);
  });
  
  const scheduleDetails = document.getElementById('schedule-details');
  let detailsHTML = `<strong>Date: ${formatDate(dateString)}</strong><br><br>`;
  
  schedules.forEach(schedule => {
    const time = schedule.available_time ? formatTime(schedule.available_time) : 'All day';
    detailsHTML += `<div class="time-slot" onclick="deleteTimeSlot('${schedule.id}')">
      <strong>Time:</strong> ${time}
    </div>`;
  });
  
  scheduleDetails.innerHTML = detailsHTML;
  
  // Store current date for adding more times
  window.currentScheduleDate = dateString;
  
  document.getElementById('schedule-view-popup').style.display = 'flex';
}

// Show schedule add popup
function showScheduleAddPopup(dateString) {
  // Store current date for adding
  window.currentScheduleDate = dateString;
  
  // Set default time to 9:00 AM
  document.getElementById('schedule-time').value = '09:00';
  
  document.getElementById('schedule-add-popup').style.display = 'flex';
}

// Close schedule view popup
window.closeScheduleViewPopup = function() {
  document.getElementById('schedule-view-popup').style.display = 'none';
};

// Close schedule add popup
window.closeScheduleAddPopup = function() {
  document.getElementById('schedule-add-popup').style.display = 'none';
};

// Check if selected time conflicts with existing schedules
function checkTimeConflict(dateString, timeString) {
  // Get existing schedules for this date
  const existingSchedules = currentScheduleCalendar.schedules.filter(schedule => 
    schedule.date === dateString
  );
  
  // Check if this time conflicts with existing schedules
  return existingSchedules.some(schedule => {
    if (!schedule.available_time) return false;
    
    const existingTime = new Date(`2000-01-01T${schedule.available_time}`);
    const newTime = new Date(`2000-01-01T${timeString}`);
    const timeDiff = Math.abs(newTime - existingTime) / (1000 * 60); // Difference in minutes
    
    return timeDiff <= 59; // Within 59 minutes
  });
}

// Validate time input (must be 00 or 30 minutes)
function validateTimeInput(timeString) {
  if (!timeString) return false;
  
  const [hours, minutes] = timeString.split(':');
  const minuteValue = parseInt(minutes);
  
  // Only allow 00 and 30 minutes
  return minuteValue === 0 || minuteValue === 30;
}

// Add new schedule
window.addSchedule = async function() {
  const time = document.getElementById('schedule-time').value;
  const date = window.currentScheduleDate;
  
  if (!time) {
    alert('Please enter a time.');
    return;
  }
  
  // Validate time format (must be 00 or 30 minutes)
  if (!validateTimeInput(time)) {
    alert('Please select a time with 00 or 30 minutes only (e.g., 9:00, 9:30).');
    return;
  }
  
  // Check for time conflicts
  if (checkTimeConflict(date, time)) {
    alert('This time conflicts with an existing schedule. Please choose a different time (must be at least 60 minutes apart).');
    return;
  }
  
  if (!confirm(`Are you sure you want to add a schedule for ${formatDate(date)} at ${formatTime(time)}?`)) {
    return;
  }
  
  const jsDow = new Date(date + 'T00:00:00').getDay();
  const scheduleData = {
    doctors_id: currentScheduleCalendar.doctorId,
    date: date,
    available_time: time,
    day_of_week: jsDow === 0 ? 7 : jsDow // Sunday=7, Monday=1, etc.
  };
  
  const { error } = await supabase
    .from('clinic_schedules')
    .insert([scheduleData]);
  
  if (error) {
    alert('Failed to add schedule. Please try again.');
    console.error(error);
  } else {
    alert('Schedule added successfully!');
    closeScheduleAddPopup();
    await loadDoctorSchedules(currentScheduleCalendar.doctorId);
    generateScheduleCalendar();
  }
};

// Add more time to existing schedule
window.addMoreTime = function() {
  closeScheduleViewPopup();
  showScheduleAddPopup(window.currentScheduleDate);
};

// Delete individual time slot
window.deleteTimeSlot = async function(scheduleId) {
  if (!confirm('Are you sure you want to delete this time slot?')) {
    return;
  }
  
  const { error } = await supabase
    .from('clinic_schedules')
    .delete()
    .eq('id', scheduleId);
  
  if (error) {
    alert('Failed to delete time slot. Please try again.');
    console.error(error);
  } else {
    alert('Time slot deleted successfully!');
    await loadDoctorSchedules(currentScheduleCalendar.doctorId);
    generateScheduleCalendar();
    
    // Refresh the popup if it's still open
    if (document.getElementById('schedule-view-popup').style.display === 'flex') {
      showScheduleViewPopup(window.currentScheduleDate);
    }
  }
};

// Utility functions
function formatDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function formatTime(timeString) {
  if (!timeString) return 'All day';
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

