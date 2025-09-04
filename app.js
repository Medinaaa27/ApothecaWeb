import { supabase, clinicId } from './db.js';

let selectedAppointment = null;
let sortDesc = true;
let sortDescAccom = true;
let freezeAutoRefresh = false;

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
    .select('name')
    .eq('id', clinicId)
    .single();
  heading.innerText = error || !data ? 'Clinic Name Unavailable' : data.name;
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
  document.getElementById('accom-sort-toggle').innerText = sortDescAccom ? 'Sort: Newest' : 'Sort: Oldest';
  loadApprovedPatients();
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
      Gender: ${gender}<br>
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
  const list = document.getElementById('accommodated-list');

  const { data, error } = await supabase
    .from('appointments')
    .select('*, doctors(name)')
    .eq('clinic_id', clinicId)
    .eq('status', 'approved')
    .order('created_at', { ascending: !sortDescAccom });

  if (error) {
    list.innerHTML = 'Error loading data.';
    finishLoadingBar();
    return;
  }

  list.innerHTML = '';
  for (const app of data) {
    const { name, gender } = await getPatientInfo(app.user_id);
    const time12Hr = formatTimeTo12Hr(app.time);
    const div = document.createElement('div');
    div.className = 'patient';
    div.innerHTML = `
      <strong>User: ${name}</strong><br>
      <strong>Patient Name: ${app.patient_name}</strong><br><br>
      Gender: ${gender}<br>
      Age: ${app.patient_age}<br>
      Blood Type: ${app.blood_type || 'N/A'}<br>
      Date: ${app.date}<br>
      Time: ${time12Hr}<br>
      Reason: ${app.reason}<br>
      Doctor: ${app.doctors?.name || 'Unknown'}<br>
      <button onclick='managePatient(${JSON.stringify(app)})'>Manage</button>
    `;
    list.appendChild(div);
  }

  finishLoadingBar();
}

// Completed
async function loadCompletedAppointments() {
  const list = document.getElementById('completed-list');
  if (!list) return;

  startLoadingBar();

  // Get filter values
  const searchTerm = document.getElementById('patient-search')?.value?.toLowerCase() || '';
  const statusFilter = document.getElementById('patient-status-filter')?.value || '';
  const dateFilter = document.getElementById('patient-date-filter')?.value || '';
  const doctorFilter = document.getElementById('patient-doctor-filter')?.value || '';
  const genderFilter = document.getElementById('patient-gender-filter')?.value || '';

  // Build query
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  } else {
    query = query.eq('status', 'completed');
  }

  if (dateFilter) {
    query = query.eq('date', dateFilter);
  }

  if (doctorFilter) {
    query = query.eq('doctors.name', doctorFilter);
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

    // Check if at least one of this patient's appointments has matching prescription or billing
    const hasMatch = apps.some(app => {
      const appDate = new Date(app.date);

      const prescMatch = prescriptions.some(p =>
        p.user_id === userId &&
        p.last_updated && isWithinOneDay(p.last_updated, appDate)
      );

      const billingMatch = billings.some(b =>
        b.user_id === userId &&
        b.due_date && isWithinOneDay(b.due_date, appDate)
      );

      return prescMatch || billingMatch;
    });

    if (!hasMatch) continue; // Skip patient if no match

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
});

async function loadPatientDetails(userId, appointments) {
  const content = document.getElementById('details-content');
  const title = document.getElementById('details-title');
  content.innerHTML = '';
  showPage('details', { manageMode: true });

  const [patientRes, prescRes, billingRes] = await Promise.all([
    supabase.from('patients').select('full_name, address').eq('id', userId).single(),
    supabase.from('prescriptions').select('*').eq('user_id', userId),
    supabase.from('billings').select('*').eq('user_id', userId)
  ]);

  // Load the full appointment history for this patient within this clinic
  let appsToRender = [];
  try {
    const { data: allApps } = await supabase
      .from('appointments')
      .select('*, doctors(name)')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
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

  for (const app of appsToRender) {
    const time12Hr = formatTimeTo12Hr(app.time);

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
          ? matchedPrescriptions.map(p => `${p.details}</div>`).join('<br>')
          : 'No prescription'}
      </div>
      <div>
        ${matchedNotes.length
          ? matchedNotes.map(n => `<div><strong>Doctor's Notes:</strong><br>${n.content}</div>`).join('<br>')
          : 'No doctors notes'}
        <br><br>
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
      </div>
    `;
    content.appendChild(div);
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

// Manage Patient
async function managePatient(app) {
  selectedAppointment = app;
  const { name, address, gender } = await getPatientInfo(app.user_id);
  const time12Hr = formatTimeTo12Hr(app.time);
  const today = new Date().toISOString().split('T')[0];

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
      <strong>Gender:</strong> ${gender}<br>
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
    <div class="manage-columns">
      <div class="column">
        <h3>Prescription</h3>
        <label>Medicine Name(s)</label>
        <input type="text" id="presc-name" placeholder="Enter medicine(s) name" /> 
        <label>Prescription Details</label>
         <textarea id="presc-details" placeholder="Enter prescription details, dosage, instructions, etc." rows="4" style="width: 100%; resize: vertical; min-height: 80px;"></textarea>
      </div>
      <div class="column">
         <h3>Doctor's Notes</h3>
         <label>Clinical Notes</label>
         <textarea id="doctors-note-input" placeholder="Enter doctor's notes, observations, recommendations, etc." rows="4" style="width: 100%; resize: vertical; min-height: 80px;"></textarea>
       </div>
       <div class="column">
         <h3>Billing of Appointment</h3>
        <label>Billing Title</label>
          <input type="text" id="billing-title" value="${existingBillingData?.title || app.reason}" placeholder="Service description" onchange="updateBillingField('title')" />
        <label>Billing Amount</label>
          <input type="number" id="billing-amount" value="${existingBillingData?.amount || ''}" placeholder="Enter amount" step="0.01" onchange="updateBillingField('amount')" />
        <label>Due Date</label>
          <input type="date" id="billing-due" value="${existingBillingData?.due_date || ''}" min="${today}" onchange="updateBillingField('due_date')" />
        <label>Payment Status</label>
          <select id="billing-status" onchange="updateBillingStatus()">
            <option value="unpaid" ${existingBillingStatus === 'unpaid' ? 'selected' : ''}>Unpaid</option>
            <option value="paid" ${existingBillingStatus === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="partial" ${existingBillingStatus === 'partial' ? 'selected' : ''}>Partial Payment</option>
        </select>
      </div>
    </div>
    
     <!-- Complete Appointment Button -->
    <div style="position: fixed; bottom: 20px; left: 20px; z-index: 100;">
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
  `;


  showPage('details', { manageMode: true });
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
     const [noteRes, prescRes, billRes, apptRes] = await Promise.all([
       supabase.from('doctor_notes').insert([doctorNote]),
       supabase.from('prescriptions').insert([prescription]),
       supabase.from('billings').insert([billing]),
       supabase.from('appointments').update(appointmentUpdate).eq('id', appointmentId)
     ]);

     if (noteRes.error || prescRes.error || billRes.error || apptRes.error) {
       alert('Failed to complete appointment. Please try again.');
       console.error('Doctor note error:', noteRes.error);
       console.error('Prescription error:', prescRes.error);
       console.error('Billing error:', billRes.error);
       console.error('Appointment error:', apptRes.error);
       return;
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
}, 10000);

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
        <button class="delete-doctor-btn" onclick="deleteDoctor('${doctor.id}')">Delete</button>
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

// Build simple dropdown scheduler
function initSimpleScheduler() {
  const select = document.getElementById('schedule-doctor-select');
  const startSel = document.getElementById('slot-start');
  const daySel = document.getElementById('schedule-day-select');
  const dateInput = document.getElementById('schedule-date');
  const repeatSel = document.getElementById('repeat-months');
  if (!select || !startSel || !daySel || !dateInput || !repeatSel) return;

  // Populate 24h times in 5-minute steps for start dropdown with 12-hour labels
  const times = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      times.push(`${hh}:${mm}`);
    }
  }
  startSel.innerHTML = times
    .map(t => `<option value="${t}">${formatTimeTo12Hr(t)}</option>`)
    .join('');
  startSel.value = '09:00';

  // Date → day-of-week detection
  dateInput.addEventListener('change', function() {
    const v = this.value;
    if (!v) return;
    const d = new Date(v + 'T00:00:00');
    // Map Monday=1 ... Sunday=7
    const jsDow = d.getDay(); // 0..6 (Sun..Sat)
    const dow = jsDow === 0 ? 7 : jsDow; // Sun->7, Mon->1, ... Sat->6
    daySel.value = String(dow);
  });

  // No end time; single-slot per time

  // Load existing for selected doctor + day/date
  select.addEventListener('change', loadSimpleSchedulePreview);
  daySel.addEventListener('change', loadSimpleSchedulePreview);
  dateInput.addEventListener('change', loadSimpleSchedulePreview);

  // If admin selects "Only this week pattern", clear date and day-of-week
  repeatSel.addEventListener('change', function() {
    if (this.value === '0') {
      dateInput.value = '';
      daySel.value = '';
    }
  });
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
  const repeatMonths = parseInt(document.getElementById('repeat-months').value, 10) || 0;

  // When repeatMonths === 0 (only this week pattern), allow day/date to be empty
  if (repeatMonths !== 0 && !dayVal && !dateVal) {
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
  if (dateVal) {
    targetDates.push(dateVal);
  } else if (repeatMonths === 0) {
    // Save all days within the current week (Mon..Sun)
    const today = new Date();
    const jsDow = today.getDay(); // 0..6 (Sun..Sat)
    const daysSinceMonday = (jsDow + 6) % 7; // Monday=0, Sunday=6
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysSinceMonday);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      targetDates.push(toLocalDateString(dt));
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
  if (!confirm('Clear availability for the selected day/date?')) return;
  try {
    let del = supabase.from('clinic_schedules').delete().eq('doctors_id', doctorId);
    if (dateVal) {
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
  
  // Populate doctor filter dropdown
  await populateCalendarDoctorFilter();
  
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
    
    const dateStr = date.toISOString().split('T')[0];
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

// Populate Calendar Doctor Filter
async function populateCalendarDoctorFilter() {
  const select = document.getElementById('calendar-doctor-filter');
  if (!select) return;
  
  // Clear existing options except "All Doctors"
  select.innerHTML = '<option value="">All Doctors</option>';
  
  // Get all doctors for this clinic
  const { data: doctors, error } = await supabase
    .from('doctors')
    .select('id, name, specialization_id, specializations(name)')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true });
  
  if (error) {
    console.error('Error loading doctors for calendar filter:', error);
    return;
  }
  
  // Add doctor options
  for (const doctor of (doctors || [])) {
    const specializationName = doctor.specializations?.name || 'No specialization';
    const option = document.createElement('option');
    option.value = doctor.name;
    option.textContent = `${doctor.name} (${specializationName})`;
    select.appendChild(option);
  }
  
  // Add event listener for filter changes
  select.removeEventListener('change', handleCalendarDoctorFilterChange);
  select.addEventListener('change', handleCalendarDoctorFilterChange);
}

// Handle Calendar Doctor Filter Change
async function handleCalendarDoctorFilterChange() {
  const selectedDoctor = document.getElementById('calendar-doctor-filter').value;
  
  // Get appointments for the month with doctor filter
  const startDate = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
  const endDate = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
  
  let query = supabase
    .from('appointments')
    .select('*, doctors(name)')
    .eq('clinic_id', clinicId)
    .gte('date', startDate)
    .lte('date', endDate);
  
  if (selectedDoctor) {
    query = query.eq('doctors.name', selectedDoctor);
  }
  
  const { data: appointments } = await query;
  renderCalendar(appointments || []);
}

// Show Calendar Day Appointments
window.showCalendarDayAppointments = function(dateStr, appointmentCount) {
  if (appointmentCount === 0) return;
  
  const selectedDoctor = document.getElementById('calendar-doctor-filter').value;
  
  // Get appointments for this specific day
  let query = supabase
    .from('appointments')
    .select('*, doctors(name)')
    .eq('clinic_id', clinicId)
    .eq('date', dateStr);
  
  if (selectedDoctor) {
    query = query.eq('doctors.name', selectedDoctor);
  }
  
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
  const dateDisplay = new Date(dateStr).toLocaleDateString();
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
    <div class="calendar-appointments-header">
      <h3>Appointments for ${dateDisplay}</h3>
      <button class="close-btn" onclick="hideCalendarAppointmentsWindow()">×</button>
    </div>
    <div class="calendar-appointments-content">
      ${appointmentsList}
    </div>
  `;
  
  windowElement.style.display = 'block';
}

// Hide Calendar Appointments Window
window.hideCalendarAppointmentsWindow = function() {
  const windowElement = document.getElementById('calendar-appointments-window');
  if (windowElement) {
    windowElement.style.display = 'none';
  }
};

// Report Functions
window.generateReport = async function() {
  const reportDate = document.getElementById('report-date').value || new Date().toISOString().split('T')[0];
  const doctorFilter = document.getElementById('report-doctor-filter').value;
  
  await loadDailyStats(reportDate, doctorFilter);
  await loadDoctorReports(reportDate, doctorFilter);
};

async function loadDailyStats(date, doctorFilter = '') {
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('date', date);
  
  if (doctorFilter) {
    query = query.eq('subtitle', doctorFilter);
  }
  
  const { data: appointments } = await query;
  
  const stats = {
    total: appointments?.length || 0,
    pending: appointments?.filter(apt => apt.status === 'pending').length || 0,
    approved: appointments?.filter(apt => apt.status === 'approved').length || 0,
    completed: appointments?.filter(apt => apt.status === 'completed').length || 0
  };
  
  document.getElementById('report-date-display').textContent = new Date(date).toLocaleDateString();
  
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
      .eq('subtitle', doctor.name)
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
  // Simple export functionality
  const reportDate = document.getElementById('report-date').value || new Date().toISOString().split('T')[0];
  const content = `Clinic Report for ${reportDate}\nGenerated on ${new Date().toLocaleString()}`;
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clinic-report-${reportDate}.txt`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Patient Filter Functions
window.applyPatientFilters = function() {
  loadCompletedAppointments();
};

window.clearPatientFilters = function() {
  document.getElementById('patient-search').value = '';
  document.getElementById('patient-status-filter').value = '';
  document.getElementById('patient-date-filter').value = '';
  document.getElementById('patient-doctor-filter').value = '';
  document.getElementById('patient-gender-filter').value = '';
  loadCompletedAppointments();
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

// Expose to HTML
window.showPage = showPage;
window.managePatient = managePatient;
window.submitManagement = submitManagement;
window.confirmAndApprove = confirmAndApprove;
window.confirmAndDecline = confirmAndDecline;
window.updateAppointmentStatus = updateAppointmentStatus;

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

