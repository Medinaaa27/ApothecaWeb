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

  // Clear and render appointment requests
  list.innerHTML = '';
  for (const app of appointmentsRes.data) {
    const { name, gender } = await getPatientInfo(app.user_id);
    const time12Hr = formatTimeTo12Hr(app.time);

    // Create doctor dropdown
    let doctorDropdown = '<select class="doctor-select" id="doctor-' + app.id + '">';
    doctorDropdown += '<option value="">Select a doctor...</option>';
    
    for (const doctor of doctorsRes) {
      const selected = app.subtitle === doctor.name ? 'selected' : '';
      const specializationDisplay = doctor.specialization_name || 'No specialization';
      doctorDropdown += `<option value="${doctor.name}" ${selected}>${doctor.name} (${specializationDisplay})</option>`;
    }
    doctorDropdown += '</select>';

    const div = document.createElement('div');
    div.className = 'appointment';
    div.innerHTML = `
      <strong>${name}</strong><br>
      Gender: ${gender}<br>
      Date: ${app.date}<br>
      Time: ${time12Hr}<br>
      Reason: ${app.reason}<br>
      Specialization: ${specializationMap[app.specialization_id] || 'No specialization'}<br>
      Doctor: ${app.subtitle || 'Unknown'}<br>
      <div class="appointment-actions">
        <button onclick="confirmAndApprove('${app.id}')">Approve</button>
        <button onclick="confirmAndDecline('${app.id}')">Decline</button>
      </div>
    `;

    list.appendChild(div);

    // Freeze auto-refresh when doctor dropdown is focused
    setTimeout(() => {
      const select = document.getElementById(`doctor-${app.id}`);
      if (select) {
        select.addEventListener('focus', () => freezeAutoRefresh = true);
        select.addEventListener('blur', () => freezeAutoRefresh = false);
      }
    }, 0);
  }

  finishLoadingBar();
}

// Approve/Decline
function confirmAndApprove(id) {
  const doctorSelect = document.getElementById(`doctor-${id}`);
  const doctorName = doctorSelect ? doctorSelect.value : '';
  if (!doctorName) {
    alert("Please select a doctor before approving.");
    if (doctorSelect) doctorSelect.focus();
    return;
  }

  if (confirm(`Approve this appointment with Dr. ${doctorName}?`)) {
    // Show loading state
    const acceptBtn = document.querySelector(`[onclick="confirmAndApprove(${id})"]`);
    if (acceptBtn) {
      acceptBtn.textContent = 'Processing...';
      acceptBtn.disabled = true;
    }
    
    updateAppointmentStatus(id, 'approved', doctorName).then(() => {
      // Reset button state
      if (acceptBtn) {
        acceptBtn.textContent = 'Accept';
        acceptBtn.disabled = false;
      }
    });
  }
}

function confirmAndDecline(id) {
  if (confirm("Decline this appointment?")) {
    // Show loading state
    const rejectBtn = document.querySelector(`[onclick="confirmAndDecline(${id})"]`);
    if (rejectBtn) {
      rejectBtn.textContent = 'Processing...';
      rejectBtn.disabled = true;
    }
    
    updateAppointmentStatus(id, 'declined').then(() => {
      // Reset button state
      if (rejectBtn) {
        rejectBtn.textContent = 'Reject';
        rejectBtn.disabled = false;
      }
    });
  }
}

async function updateAppointmentStatus(id, status, doctorName = null) {
  const updateFields = { status };
  if (doctorName !== null) {
    updateFields.subtitle = doctorName;
  }

  const { error } = await supabase
    .from('appointments')
    .update(updateFields)
    .eq('id', id);

  if (!error) {
    // Refresh both requests and accommodated pages
    loadAppointments();
    loadApprovedPatients();
    
    // Show success message
    const action = status === 'approved' ? 'accepted' : 'rejected';
    alert(`Appointment ${action} successfully!`);
    
    // If approved, show a message about it moving to accommodated page
    if (status === 'approved') {
      console.log('Appointment approved and moved to accommodated page');
    }
  } else {
    alert('Failed to update status. Please try again.');
    console.error('Database update error:', error);
  }
}


// Accommodated
async function loadApprovedPatients() {
  startLoadingBar();
  const list = document.getElementById('accommodated-list');

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
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
      <strong>${name}</strong><br><br>
      Gender: ${gender}<br>
      Age: ${app.patient_age}<br>
      Blood Type: ${app.blood_type || 'N/A'}<br>
      Date: ${app.date}<br>
      Time: ${time12Hr}<br>
      Reason: ${app.reason}<br>
      Doctor: ${app.subtitle || 'Unknown'}<br>
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
    query = query.eq('subtitle', doctorFilter);
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

  for (const app of appointments) {
    const time12Hr = formatTimeTo12Hr(app.time);

  const matchedPrescriptions = prescriptions.filter(p =>
    p.appointment_id === app.id
  );

  const matchedBillings = billings.filter(b =>
    b.appointment_id === app.id
  );


    const div = document.createElement('div');
    div.className = 'completed-entry';
    div.style.display = 'grid';
    div.style.gridTemplateColumns = '1fr 1fr 1fr';
    div.style.gap = '1em';
    div.style.marginTop = '1.5em';

    div.innerHTML = `
      <div>
        <strong>Date:</strong><br>${app.date}<br><br>
        <strong>Time:</strong><br>${time12Hr}<br><br>
        <strong>Reason:</strong><br>${app.reason}
      </div>
      <div>
        <strong>Doctor:</strong><br>${app.subtitle || 'Unknown'}<br><br>
        ${matchedPrescriptions.length
          ? matchedPrescriptions.map(p => `<div><strong>${p.name}</strong><br>${p.details}</div>`).join('<br>')
          : 'No prescription'}
      </div>
      <div>
        ${matchedBillings.length
          ? matchedBillings.map(b => `
              <div>
                <strong>${b.title}</strong><br>
                  ₱${b.amount}<br>
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

// Manage Patient
async function managePatient(app) {
  selectedAppointment = app;
  const { name, address, gender } = await getPatientInfo(app.user_id);
  const time12Hr = formatTimeTo12Hr(app.time);
  const today = new Date().toISOString().split('T')[0];

  // Load specialization names for mapping
  const specializationMap = await getSpecializationMap();


  document.getElementById('details-title').innerHTML = `
    <div style="text-align: left; font-size: 0.95rem; line-height: 1.4;">
      ${name}<br><br>
      <strong>Patient Name: </strong>${app.patient_name}<br>
      <strong>Relation with the user?</strong> ${app.patient_identity || 'N/A' }<br>
      <strong>Address: </strong><small style="font-size: 0.85rem;"> ${address}</small><br>
      <strong>Gender:</strong> ${gender}<br>
      <strong>Age:</strong> ${app.patient_age}<br>
      <strong>Blood Type:</strong> ${app.blood_type || 'N/A'}<br>
      <strong>Date:</strong> ${app.date}<br>
      <strong>Time:</strong> ${time12Hr}<br>
      <strong>Reason:</strong> ${app.reason}<br>
      <strong>Doctor:</strong> ${app.subtitle}<br>
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
        <input type="text" id="presc-name" placeholder="Enter medicine name" /> 
        <label>Prescription Details</label>
        <input type="text" id="presc-details" placeholder="Enter prescription details, dosage, instructions, etc." />
      </div>
      <div class="column">
        <h3>Billing</h3>
        <label>Billing Title</label>
        <input type="text" id="billing-title" value="${app.reason}" placeholder="Service description" />
        <label>Billing Amount</label>
        <input type="number" id="billing-amount" placeholder="Enter amount" step="0.01" />
        <label>Due Date</label>
        <input type="date" id="billing-due" min="${today}" />
        <label>Payment Status</label>
        <select id="billing-status">
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial Payment</option>
        </select>
      </div>
    </div>
    
      <!-- Clinical Notes Section -->
    <div class="clinical-notes">
      <div class="notes-header">
        <h3>Clinical Notes</h3>
        <button onclick="addClinicalNote()">Add Note</button>
      </div>
      <div id="clinical-notes-list" class="notes-list">
        <!-- Notes will be populated here -->
      </div>
    </div>
  `;


  showPage('details', { manageMode: true });
}

// Submit Management
async function submitManagement() {
  const userId = selectedAppointment.user_id;
  const appointmentId = selectedAppointment.id;

  const prescName = document.getElementById('presc-name').value.trim();
  const prescDetails = document.getElementById('presc-details').value.trim();
  const billingTitle = document.getElementById('billing-title').value.trim();
  const billingAmount = document.getElementById('billing-amount').value.trim();
  const billingDue = document.getElementById('billing-due').value.trim();

  const anyEmpty = !prescName || !prescDetails || !billingTitle || !billingAmount || !billingDue;
  if (anyEmpty && !confirm("Some fields are empty. Submit anyway with null values?")) return;

  // Resolve doctor_id by matching the appointment's doctor name within this clinic
  const doctorName = selectedAppointment.subtitle;
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
    clinic_id: clinicId,
    doctor_id: doctorId
  };

  const [prescRes, billRes, apptRes] = await Promise.all([
    supabase.from('prescriptions').insert([presc]),
    supabase.from('billings').insert([billing]),
    supabase.from('appointments').update({ status: 'completed' }).eq('id', appointmentId)
  ]);

  if (prescRes.error || billRes.error || apptRes.error) {
    alert('Failed to complete appointment.');
    console.error(prescRes.error, billRes.error, apptRes.error);
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
        <button class="schedule-doctor-btn" onclick="showDoctorSchedule('${doctor.id}', '${doctor.name}')">Schedule</button>
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
  // Clear form fields
  document.getElementById('doctor-name').value = '';
  document.getElementById('doctor-specialization').value = '';
  // Populate specializations
  populateSpecializationsDropdown('doctor-specialization');
};

window.hideAddDoctorForm = function() {
  document.getElementById('add-doctor-form').style.display = 'none';
  document.getElementById('add-doctor-btn').style.display = 'block';
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

// Doctor Schedule Functions
let currentScheduleDoctorId = null;
let currentScheduleDoctorName = null;
let scheduleCurrentDate = new Date();
let scheduleCurrentMonth = scheduleCurrentDate.getMonth();
let scheduleCurrentYear = scheduleCurrentDate.getFullYear();

// Show Doctor Schedule Window
window.showDoctorSchedule = function(doctorId, doctorName) {
  currentScheduleDoctorId = doctorId;
  currentScheduleDoctorName = doctorName;
  
  // Reset calendar to current month
  scheduleCurrentDate = new Date();
  scheduleCurrentMonth = scheduleCurrentDate.getMonth();
  scheduleCurrentYear = scheduleCurrentDate.getFullYear();
  
  // Show the schedule window
  document.getElementById('doctor-schedule-window').style.display = 'block';
  document.getElementById('doctor-schedule-overlay').style.display = 'block';
  
  // Load the doctor's schedule and availability
  loadDoctorSchedule();
  loadDoctorAvailability();
};

// Hide Doctor Schedule Window
window.hideDoctorSchedule = function() {
  document.getElementById('doctor-schedule-window').style.display = 'none';
  document.getElementById('doctor-schedule-overlay').style.display = 'none';
  currentScheduleDoctorId = null;
  currentScheduleDoctorName = null;
};

// Load Doctor Schedule
async function loadDoctorSchedule() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
  
  document.getElementById('doctor-schedule-title').textContent = `Dr. ${currentScheduleDoctorName} - Schedule`;
  document.getElementById('doctor-schedule-month-year').textContent = `${monthNames[scheduleCurrentMonth]} ${scheduleCurrentYear}`;
  
  // Get appointments for the doctor for the current month
  const startDate = new Date(scheduleCurrentYear, scheduleCurrentMonth, 1).toISOString().split('T')[0];
  const endDate = new Date(scheduleCurrentYear, scheduleCurrentMonth + 1, 0).toISOString().split('T')[0];
  
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('subtitle', currentScheduleDoctorName)
    .gte('date', startDate)
    .lte('date', endDate);
  
  renderDoctorScheduleCalendar(appointments || []);
}

// Render Doctor Schedule Calendar
function renderDoctorScheduleCalendar(appointments) {
  const grid = document.getElementById('doctor-schedule-grid');
  const firstDay = new Date(scheduleCurrentYear, scheduleCurrentMonth, 1);
  const lastDay = new Date(scheduleCurrentYear, scheduleCurrentMonth + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  
  let html = '';
  
  // Day headers
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach(day => {
    html += `<div class="schedule-day-header">${day}</div>`;
  });
  
  // Calendar days
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    const dateStr = date.toISOString().split('T')[0];
    const dayAppointments = appointments.filter(apt => apt.date === dateStr);
    const isToday = date.toDateString() === new Date().toDateString();
    const isCurrentMonth = date.getMonth() === scheduleCurrentMonth;
    
    let dayClass = 'schedule-day';
    if (!isCurrentMonth) dayClass += ' other-month';
    if (isToday) dayClass += ' today';
    if (dayAppointments.length > 0) dayClass += ' has-appointment';
    
    html += `
      <div class="${dayClass}" onclick="showDayAppointments('${dateStr}', ${dayAppointments.length})">
        ${date.getDate()}
        ${dayAppointments.length > 0 ? '<div class="appointment-dot"></div>' : ''}
        ${dayAppointments.length > 0 ? `<div class="appointment-count">${dayAppointments.length}</div>` : ''}
      </div>
    `;
  }
  
  grid.innerHTML = html;
}

// Show Day Appointments
window.showDayAppointments = function(dateStr, appointmentCount) {
  if (appointmentCount === 0) return;
  
  // Get appointments for this specific day
  supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('subtitle', currentScheduleDoctorName)
    .eq('date', dateStr)
    .then(({ data: appointments }) => {
      if (appointments && appointments.length > 0) {
        let appointmentsList = '';
        for (const app of appointments) {
          const time12Hr = formatTimeTo12Hr(app.time);
          appointmentsList += `
            <div class="day-appointment">
              <strong>${time12Hr}</strong><br>
              Status: ${app.status}<br>
              Reason: ${app.reason || 'No reason provided'}
            </div>
          `;
        }
        
        alert(`Appointments for ${new Date(dateStr).toLocaleDateString()}:\n\n${appointmentsList}`);
      }
    });
};

// Schedule Calendar Navigation
window.previousScheduleMonth = function() {
  scheduleCurrentMonth--;
  if (scheduleCurrentMonth < 0) {
    scheduleCurrentMonth = 11;
    scheduleCurrentYear--;
  }
  loadDoctorSchedule();
};

window.nextScheduleMonth = function() {
  scheduleCurrentMonth++;
  if (scheduleCurrentMonth > 11) {
    scheduleCurrentMonth = 0;
    scheduleCurrentYear++;
  }
  loadDoctorSchedule();
};

window.todaySchedule = function() {
  scheduleCurrentDate = new Date();
  scheduleCurrentMonth = scheduleCurrentDate.getMonth();
  scheduleCurrentYear = scheduleCurrentDate.getFullYear();
  loadDoctorSchedule();
};

// Switch between schedule tabs
window.switchScheduleTab = function(tabName, element) {
  // Hide all tab contents
  document.querySelectorAll('.schedule-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Remove active class from all tabs
  document.querySelectorAll('.schedule-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Show selected tab content
  document.getElementById(`${tabName}-tab`).classList.add('active');
  
  // Add active class to selected tab
  if (element) {
    element.classList.add('active');
  }
};

// Toggle day availability
window.toggleDayAvailability = function(day) {
  const checkbox = document.getElementById(`${day}-available`);
  const startSelect = document.getElementById(`${day}-start`);
  const endSelect = document.getElementById(`${day}-end`);
  
  if (checkbox.checked) {
    startSelect.disabled = false;
    endSelect.disabled = false;
    startSelect.value = '09:00';
    endSelect.value = '18:00';
  } else {
    startSelect.disabled = true;
    endSelect.disabled = true;
    startSelect.value = '';
    endSelect.value = '';
  }
};

// Load doctor availability from database
async function loadDoctorAvailability() {
  if (!currentScheduleDoctorId) return;
  
  try {
    const { data: schedules, error } = await supabase
      .from('clinic_schedules')
      .select('*')
      .eq('doctors_id', currentScheduleDoctorId);
    
    if (error) {
      console.error('Error loading doctor availability:', error);
      return;
    }
    
    // Reset all checkboxes and selects
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
      const checkbox = document.getElementById(`${day}-available`);
      const startSelect = document.getElementById(`${day}-start`);
      const endSelect = document.getElementById(`${day}-end`);
      
      checkbox.checked = false;
      startSelect.disabled = true;
      startSelect.value = '';
      endSelect.disabled = true;
      endSelect.value = '';
    });
    
    // Populate with existing data
    if (schedules && schedules.length > 0) {
      schedules.forEach(schedule => {
        const dayNumber = schedule.day_of_week;
        const dayNames = ['', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayName = dayNames[dayNumber];
        
        if (dayName) {
          const checkbox = document.getElementById(`${dayName}-available`);
          const startSelect = document.getElementById(`${dayName}-start`);
          const endSelect = document.getElementById(`${dayName}-end`);
          
          checkbox.checked = true;
          startSelect.disabled = false;
          endSelect.disabled = false;
          startSelect.value = schedule.available_time;
          // For end time, we'll set it to 6 PM by default or use a calculated end time
          endSelect.value = '18:00';
        }
      });
    }
  } catch (error) {
    console.error('Error loading doctor availability:', error);
  }
}

// Save doctor availability to database
window.saveDoctorAvailability = async function() {
  if (!currentScheduleDoctorId) {
    alert('No doctor selected');
    return;
  }
  
  try {
    // First, delete existing schedules for this doctor
    const { error: deleteError } = await supabase
      .from('clinic_schedules')
      .delete()
      .eq('doctors_id', currentScheduleDoctorId);
    
    if (deleteError) {
      console.error('Error deleting existing schedules:', deleteError);
      alert('Error saving availability. Please try again.');
      return;
    }
    
    // Get all available days
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNumbers = [1, 2, 3, 4, 5, 6, 7];
    const schedulesToInsert = [];
    
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dayNumber = dayNumbers[i];
      const checkbox = document.getElementById(`${day}-available`);
      
      if (checkbox.checked) {
        const startSelect = document.getElementById(`${day}-start`);
        const endSelect = document.getElementById(`${day}-end`);
        
        if (startSelect.value && endSelect.value) {
          schedulesToInsert.push({
            doctors_id: currentScheduleDoctorId,
            day_of_week: dayNumber,
            available_time: startSelect.value,
            date: null, // This will be set when creating specific date schedules
            appointments_id: null
          });
        }
      }
    }
    
    // Insert new schedules
    if (schedulesToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('clinic_schedules')
        .insert(schedulesToInsert);
      
      if (insertError) {
        console.error('Error inserting schedules:', insertError);
        alert('Error saving availability. Please try again.');
        return;
      }
    }
    
    alert('Doctor availability saved successfully!');
    
  } catch (error) {
    console.error('Error saving doctor availability:', error);
    alert('Error saving availability. Please try again.');
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
    .select('*')
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
    .select('*')
    .eq('clinic_id', clinicId)
    .gte('date', startDate)
    .lte('date', endDate);
  
  if (selectedDoctor) {
    query = query.eq('subtitle', selectedDoctor);
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
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('date', dateStr);
  
  if (selectedDoctor) {
    query = query.eq('subtitle', selectedDoctor);
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
          <small>Doctor: ${app.subtitle || 'Unknown'}</small><br>
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
      .select('*')
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

// Clinical Notes Functions
window.addClinicalNote = function() {
  const note = prompt('Enter clinical note:');
  if (note && note.trim()) {
    const notesList = document.getElementById('clinical-notes-list');
    const noteItem = document.createElement('div');
    noteItem.className = 'note-item';
    noteItem.innerHTML = `
      <div class="note-date">${new Date().toLocaleString()}</div>
      <div class="note-content">${note}</div>
    `;
    notesList.appendChild(noteItem);
  }
};

// Separate Prescription and Billing Functions
window.savePrescriptionOnly = async function() {
  const userId = selectedAppointment.user_id;
  const appointmentId = selectedAppointment.id;
  
  const prescName = document.getElementById('presc-name').value.trim();
  const prescDetails = document.getElementById('presc-details').value.trim();
  const prescQuantity = document.getElementById('presc-quantity').value.trim();
  const prescDuration = document.getElementById('presc-duration').value.trim();
  
  if (!prescName || !prescDetails) {
    alert('Please enter medicine name and details.');
    return;
  }
  
  // Resolve doctor_id by matching the appointment's doctor name within this clinic
  const doctorName = selectedAppointment.subtitle;
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
    quantity: prescQuantity || null,
    duration: prescDuration || null,
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
    document.getElementById('presc-quantity').value = '';
    document.getElementById('presc-duration').value = '';
  }
};

window.saveBillingOnly = async function() {
  const userId = selectedAppointment.user_id;
  const appointmentId = selectedAppointment.id;
  
  // Resolve doctor_id by matching the appointment's doctor name within this clinic
  const doctorName = selectedAppointment.subtitle;
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
    clinic_id: clinicId,
    doctor_id: doctorId
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