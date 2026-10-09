const state = {
  participants: [],
  activities: [],
  attendance: [],
  instruments: [],
  teachers: [],
  report: null,
  authenticated: false,
  editingInstrumentId: null,
  editingTeacherId: null,
  editingParticipantId: null,
  editingActivityId: null,
  editingAttendanceId: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const academicLevels = [
  "No escolarizado / No aplica",
  "Inicial - Maternal",
  "Inicial - Infantes",
  "Inicial - Parvulos",
  "Inicial - Pre-Kinder",
  "Inicial - Kinder",
  "Inicial - Pre-Primario",
  "Primaria - 1ro",
  "Primaria - 2do",
  "Primaria - 3ro",
  "Primaria - 4to",
  "Primaria - 5to",
  "Primaria - 6to",
  "Secundaria - 1ro",
  "Secundaria - 2do",
  "Secundaria - 3ro",
  "Secundaria - 4to",
  "Secundaria - 5to",
  "Secundaria - 6to",
  "Adultos - Alfabetizacion",
  "Adultos - Primaria",
  "Adultos - Secundaria / PREPARA",
  "Educacion laboral / Tecnica",
  "Universitario",
  "Bachiller / Egresado",
];

const genderOptions = ["Masculino", "Femenino"];

const activityCategories = [
  "Clase regular",
  "Master class",
  "Taller",
  "Recital",
  "Donacion",
  "Otro",
];

const activityLocations = [
  "Parque San Jose",
  "Villa Mella",
  "Otro",
];

function formatDate(value) {
  if (!value) return "Sin registro";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo completar la solicitud");
  }
  return response.json();
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("show"), 2600);
}

function setMessage(selector, message, kind = "normal") {
  const node = $(selector);
  node.textContent = message;
  node.style.color = kind === "error" ? "#b91c1c" : "";
}

function emptyRow(colspan, text) {
  return `<tr><td colspan="${colspan}" class="empty">${text}</td></tr>`;
}

function actionButtons(type, id) {
  if (!state.authenticated) return "";
  return `
    <button type="button" data-edit-${type}="${id}">Editar</button>
    <button type="button" class="danger" data-delete-${type}="${id}">Eliminar</button>
  `;
}

function setSelectOptions(selector, optionsHtml, fallbackHtml = "", placeholderHtml = "") {
  const node = $(selector);
  if (!node) return;
  const selected = node.value;
  node.innerHTML = optionsHtml || placeholderHtml ? `${placeholderHtml}${optionsHtml}` : fallbackHtml;
  if ([...node.options].some((option) => option.value === selected)) {
    node.value = selected;
  }
}

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
}

function renderAcademicLevels() {
  const options = academicLevels.map((level) => `<option value="${level}">${level}</option>`);
  $('[name="academic_level"]').innerHTML = `<option value="">Seleccionar nivel</option>${options.join("")}`;
}

function renderStaticSelects() {
  const locationOptions = activityLocations.map((value) => `<option value="${value}">${value}</option>`).join("");
  $('[name="gender"]').innerHTML = `<option value="">Seleccionar genero</option>${genderOptions.map((value) => `<option value="${value}">${value}</option>`).join("")}`;
  $('#activityForm [name="category"]').innerHTML = `<option value="">Seleccionar categoria</option>${activityCategories.map((value) => `<option value="${value}">${value}</option>`).join("")}`;
  $('#activityForm [name="location"]').innerHTML = `<option value="">Seleccionar lugar</option>${locationOptions}`;
  $('#participantForm [name="location"]').innerHTML = `<option value="">Seleccionar lugar</option>${locationOptions}`;
}

function renderMetrics(target, totals) {
  $(target).innerHTML = [
    metric("Participantes inscritos", totals.registered_total || 0),
    metric("Actividades en periodo", totals.activities_in_period || 0),
    metric("Asistencias en periodo", totals.attendance_in_period || 0),
    metric("Nuevos en periodo", totals.new_registrations || 0),
    metric("Primera asistencia", totals.first_time_attendees || 0),
  ].join("");
}

function renderDashboard() {
  if (!state.report) return;
  renderMetrics("#metrics", state.report.totals);
  const rows = state.report.attendance_by_activity.slice(0, 8).map((activity) => `
    <tr>
      <td>${formatDate(activity.last_attendance_on)}</td>
      <td>${activity.name}</td>
      <td>${activity.instrument_name || "Sin instrumento"}</td>
      <td><span class="pill green">${activity.attendance_count}</span></td>
    </tr>
  `);
  $("#recentActivities").innerHTML = rows.join("") || emptyRow(4, "Sin actividades registradas");

  const monthly = state.report.new_registrations_by_month;
  const max = Math.max(1, ...monthly.map((row) => row.new_registrations));
  $("#newByMonth").innerHTML = monthly.map((row) => `
    <div class="timeline-row">
      <strong>${row.period}</strong>
      <div class="bar"><span style="width:${(row.new_registrations / max) * 100}%"></span></div>
      <span>${row.new_registrations}</span>
    </div>
  `).join("") || `<p class="empty">Sin registros en el periodo.</p>`;
}

function renderParticipants() {
  const rows = state.participants.map((participant) => {
    const statusClass = participant.first_attendance_on ? "green" : "amber";
    const status = participant.first_attendance_on ? formatDate(participant.first_attendance_on) : "Pendiente";
    return `
      <tr>
        <td>${participant.full_name}</td>
        <td>${formatDate(participant.birth_date)}</td>
        <td>${participant.gender || "Sin genero"}</td>
        <td>${participant.academic_level || "Sin nivel"}</td>
        <td>${participant.guardian_name || "Sin tutor"}</td>
        <td>${participant.location || "Sin lugar"}</td>
        <td>${participant.health_conditions || "Sin registro"}</td>
        <td>${formatDate(participant.registered_at)}</td>
        <td><span class="pill ${statusClass}">${status}</span></td>
        <td>${participant.attendance_count || 0}</td>
        <td class="row-actions">${actionButtons("participant", participant.id)}</td>
      </tr>
    `;
  });
  $("#participantRows").innerHTML = rows.join("") || emptyRow(11, "No hay participantes con esos filtros");
}

function renderInstruments() {
  const rows = state.instruments.map((instrument) => `
    <tr>
      <td>${instrument.name}</td>
      <td class="row-actions">${actionButtons("instrument", instrument.id)}</td>
    </tr>
  `);
  $("#instrumentRows").innerHTML = rows.join("") || emptyRow(2, "Agrega instrumentos para usarlos en actividades");
}

function renderTeachers() {
  const rows = state.teachers.map((teacher) => `
    <tr>
      <td>${teacher.name}</td>
      <td class="row-actions">${actionButtons("teacher", teacher.id)}</td>
    </tr>
  `);
  $("#teacherRows").innerHTML = rows.join("") || emptyRow(2, "Agrega profesores para usarlos en asistencia");
}

function renderActivities() {
  const rows = state.activities.map((activity) => `
    <tr>
      <td>${activity.name}</td>
      <td>${activity.instrument_name || "Sin instrumento"}</td>
      <td>${activity.teacher_name || "Sin profesor"}</td>
      <td>${activity.category || "Sin categoria"}</td>
      <td>${activity.location || "Sin lugar"}</td>
      <td><span class="pill green">${activity.attendance_count || 0}</span></td>
      <td class="row-actions">${actionButtons("activity", activity.id)}</td>
    </tr>
  `);
  $("#activityRows").innerHTML = rows.join("") || emptyRow(7, "No hay actividades con esos filtros");
}

function renderAttendance() {
  const rows = state.attendance.map((item) => `
    <tr>
      <td>${formatDate(item.attended_on)}</td>
      <td>${item.full_name}</td>
      <td>${formatDate(item.birth_date)}</td>
      <td>${item.activity_name}</td>
      <td>${item.location || "Sin lugar"}</td>
      <td>${item.instrument_name || "Sin instrumento"}</td>
      <td>${item.teacher_name || "Sin profesor"}</td>
      <td class="row-actions">${actionButtons("attendance", item.id)}</td>
    </tr>
  `);
  $("#attendanceRows").innerHTML = rows.join("") || emptyRow(8, "No hay asistencias registradas");
}

function renderSelects() {
  const participantOptions = state.participants.map((participant) =>
    `<option value="${participant.id}">${participant.full_name} - ${formatDate(participant.birth_date)}</option>`
  );
  const activityOptions = state.activities.map((activity) =>
    `<option value="${activity.id}">${activity.name}${activity.instrument_name ? ` - ${activity.instrument_name}` : ""}${activity.teacher_name ? ` - ${activity.teacher_name}` : ""}</option>`
  );
  const instrumentOptions = state.instruments.map((instrument) =>
    `<option value="${instrument.id}">${instrument.name}</option>`
  );
  const teacherOptions = state.teachers.map((teacher) =>
    `<option value="${teacher.id}">${teacher.name}</option>`
  );
  const locationOptions = activityLocations.map((location) =>
    `<option value="${location}">${location}</option>`
  );

  setSelectOptions('[name="participant_id"]', participantOptions.join(""), `<option value="">Sin participantes</option>`);
  setSelectOptions('[name="activity_id"]', activityOptions.join(""), `<option value="">Sin actividades</option>`);
  setSelectOptions('[name="instrument_id"]', instrumentOptions.join(""), "", `<option value="">Sin instrumento</option>`);
  setSelectOptions('#activityForm [name="teacher_id"]', teacherOptions.join(""), "", `<option value="">Sin profesor</option>`);
  setSelectOptions("#reportActivity", activityOptions.join(""), "", `<option value="">Todas las actividades</option>`);
  setSelectOptions("#reportTeacher", teacherOptions.join(""), "", `<option value="">Todos los profesores</option>`);
  setSelectOptions("#reportLocation", locationOptions.join(""), "", `<option value="">Todos los lugares</option>`);
  setSelectOptions("#attendanceActivityFilter", activityOptions.join(""), "", `<option value="">Todas las actividades</option>`);
  setSelectOptions("#attendanceTeacherFilter", teacherOptions.join(""), "", `<option value="">Todos los profesores</option>`);
}

function renderReports() {
  if (!state.report) return;
  renderMetrics("#reportMetrics", state.report.totals);
  const activityRows = state.report.attendance_by_activity.map((activity) => `
    <tr>
      <td>${formatDate(activity.last_attendance_on)}</td>
      <td>${activity.name}</td>
      <td>${activity.instrument_name || "Sin instrumento"}</td>
      <td>${activity.teacher_name || "Sin profesor"}</td>
      <td>${activity.category || "Sin categoria"}</td>
      <td>${activity.location || "Sin lugar"}</td>
      <td>${activity.attendance_count}</td>
      <td>${activity.unique_participants}</td>
    </tr>
  `);
  $("#reportActivityRows").innerHTML = activityRows.join("") || emptyRow(8, "Sin datos para el periodo");

  const participantRows = state.report.participant_detail.map((participant) => `
    <tr>
      <td>${participant.full_name}</td>
      <td>${formatDate(participant.birth_date)}</td>
      <td>${participant.gender || "Sin genero"}</td>
      <td>${participant.academic_level || "Sin nivel"}</td>
      <td>${participant.guardian_name || "Sin tutor"}</td>
      <td>${participant.location || "Sin lugar"}</td>
      <td>${participant.health_conditions || "Sin registro"}</td>
      <td>${formatDate(participant.registered_at)}</td>
      <td>${formatDate(participant.first_attendance_on)}</td>
      <td>${participant.attendance_count}</td>
    </tr>
  `);
  $("#reportParticipantRows").innerHTML = participantRows.join("") || emptyRow(10, "Sin participantes");

  const teacherRows = state.report.activities_by_teacher.map((row) => `
    <tr>
      <td>${row.teacher_name || "Sin profesor"}</td>
      <td>${row.location || "Sin lugar"}</td>
      <td>${row.activities_count}</td>
      <td>${row.attendance_count}</td>
      <td>${row.unique_participants}</td>
    </tr>
  `);
  $("#reportTeacherRows").innerHTML = teacherRows.join("") || emptyRow(5, "Sin actividades para esos filtros");

  const locationRows = state.report.participants_by_location.map((row) => `
    <tr>
      <td>${row.location || "Sin lugar"}</td>
      <td>${row.new_registrations}</td>
    </tr>
  `);
  $("#reportLocationRows").innerHTML = locationRows.join("") || emptyRow(2, "Sin participantes nuevos para esos filtros");
}

async function loadParticipants() {
  const params = new URLSearchParams();
  if ($("#participantSearch").value) params.set("search", $("#participantSearch").value);
  if ($("#participantBirthSearch").value) params.set("birth_date", $("#participantBirthSearch").value);
  state.participants = await api(`/api/participants?${params}`);
  renderParticipants();
  renderSelects();
}

async function loadInstruments() {
  state.instruments = await api("/api/instruments");
  renderInstruments();
  renderSelects();
}

async function loadTeachers() {
  state.teachers = await api("/api/teachers");
  renderTeachers();
  renderSelects();
}

async function loadActivities() {
  const params = new URLSearchParams();
  if ($("#activitySearch").value) params.set("search", $("#activitySearch").value);
  state.activities = await api(`/api/activities?${params}`);
  renderActivities();
  renderSelects();
}

async function loadAttendance() {
  const params = new URLSearchParams();
  if ($("#attendanceActivityFilter")?.value) params.set("activity_id", $("#attendanceActivityFilter").value);
  if ($("#attendanceStudentFilter")?.value) params.set("search", $("#attendanceStudentFilter").value);
  if ($("#attendanceTeacherFilter")?.value) params.set("teacher_id", $("#attendanceTeacherFilter").value);
  if ($("#attendanceFrom")?.value) params.set("from", $("#attendanceFrom").value);
  if ($("#attendanceTo")?.value) params.set("to", $("#attendanceTo").value);
  state.attendance = await api(`/api/attendance?${params}`);
  renderAttendance();
}

function reportParams() {
  const params = new URLSearchParams();
  if ($("#reportFrom").value) params.set("from", $("#reportFrom").value);
  if ($("#reportTo").value) params.set("to", $("#reportTo").value);
  if ($("#reportActivity").value) params.set("activity_id", $("#reportActivity").value);
  if ($("#reportTeacher").value) params.set("teacher_id", $("#reportTeacher").value);
  if ($("#reportLocation").value) params.set("location", $("#reportLocation").value);
  return params;
}

async function loadReports() {
  const params = reportParams();
  state.report = await api(`/api/reports?${params}`);
  renderDashboard();
  renderReports();
}

async function refreshAll() {
  await loadInstruments();
  await loadTeachers();
  await loadActivities();
  await loadParticipants();
  if (state.authenticated) {
    await loadAttendance();
    await loadReports();
  } else {
    state.attendance = [];
    renderAttendance();
  }
}

function fillForm(form, values) {
  [...form.elements].forEach((field) => {
    if (!field.name || values[field.name] === undefined || values[field.name] === null) return;
    field.value = values[field.name];
  });
}

function resetParticipantForm() {
  $("#participantForm").reset();
  state.editingParticipantId = null;
  $("#participantSubmitButton").textContent = "Guardar";
  $("#participantCancelEdit").classList.add("hidden");
}

function resetInstrumentForm() {
  $("#instrumentForm").reset();
  state.editingInstrumentId = null;
  $("#instrumentSubmitButton").textContent = "Agregar";
  $("#instrumentCancelEdit").classList.add("hidden");
}

function resetTeacherForm() {
  $("#teacherForm").reset();
  state.editingTeacherId = null;
  $("#teacherSubmitButton").textContent = "Agregar";
  $("#teacherCancelEdit").classList.add("hidden");
}

function resetActivityForm() {
  $("#activityForm").reset();
  state.editingActivityId = null;
  $("#activitySubmitButton").textContent = "Crear";
  $("#activityCancelEdit").classList.add("hidden");
}

function resetAttendanceForm() {
  const activityId = $('#attendanceForm [name="activity_id"]').value;
  const attendedOn = $('#attendanceForm [name="attended_on"]').value;
  $("#attendanceForm").reset();
  $('#attendanceForm [name="activity_id"]').value = activityId;
  $('#attendanceForm [name="attended_on"]').value = attendedOn;
  state.editingAttendanceId = null;
  $("#attendanceSubmitButton").textContent = "Registrar asistencia";
  $("#attendanceCancelEdit").classList.add("hidden");
}

function editParticipant(participant) {
  state.editingParticipantId = participant.id;
  fillForm($("#participantForm"), participant);
  $("#participantSubmitButton").textContent = "Guardar cambios";
  $("#participantCancelEdit").classList.remove("hidden");
  $("#participantForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editInstrument(instrument) {
  state.editingInstrumentId = instrument.id;
  fillForm($("#instrumentForm"), instrument);
  $("#instrumentSubmitButton").textContent = "Guardar cambios";
  $("#instrumentCancelEdit").classList.remove("hidden");
  $("#instrumentForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editTeacher(teacher) {
  state.editingTeacherId = teacher.id;
  fillForm($("#teacherForm"), teacher);
  $("#teacherSubmitButton").textContent = "Guardar cambios";
  $("#teacherCancelEdit").classList.remove("hidden");
  $("#teacherForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editActivity(activity) {
  state.editingActivityId = activity.id;
  fillForm($("#activityForm"), activity);
  $("#activitySubmitButton").textContent = "Guardar cambios";
  $("#activityCancelEdit").classList.remove("hidden");
  $("#activityForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editAttendance(attendance) {
  state.editingAttendanceId = attendance.id;
  fillForm($("#attendanceForm"), attendance);
  $("#attendanceSubmitButton").textContent = "Guardar cambios";
  $("#attendanceCancelEdit").classList.remove("hidden");
  $("#attendanceForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadAuth() {
  const auth = await api("/api/auth");
  state.authenticated = auth.authenticated;
  applyAuthState();
}

function applyAuthState() {
  $$('[data-protected="true"]').forEach((node) => {
    node.classList.toggle("hidden", !state.authenticated);
  });
  $("#schoolAccessButton").textContent = state.authenticated ? "Salir" : "Clave escuela";
  $("#schoolAccessButton").classList.toggle("active-access", state.authenticated);

  const activeProtected = $(".view.active")?.dataset.protected === "true";
  if (!state.authenticated && activeProtected) {
    $$(".tab").forEach((tab) => tab.classList.remove("active"));
    $$(".view").forEach((view) => view.classList.remove("active"));
    $('[data-view="attendance"]').classList.add("active");
    $("#attendance").classList.add("active");
  }
}

function setupTabs() {
  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.protected === "true" && !state.authenticated) {
        toast("Ingresa la clave de escuela para abrir esa seccion");
        return;
      }
      $$(".tab").forEach((tab) => tab.classList.remove("active"));
      $$(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.view}`).classList.add("active");
    });
  });
}

function setupForms() {
  $("#schoolAccessButton").addEventListener("click", async () => {
    if (state.authenticated) {
      await api("/api/logout", { method: "POST", body: "{}" });
      state.authenticated = false;
      applyAuthState();
      await refreshAll();
      toast("Sesion cerrada");
      return;
    }

    const accessCode = window.prompt("Clave de escuela");
    if (!accessCode) return;
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ access_code: accessCode }),
      });
      await loadAuth();
      await refreshAll();
      toast("Acceso concedido");
    } catch (error) {
      toast(error.message);
    }
  });

  $("#participantForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const editing = Boolean(state.editingParticipantId);
      const result = await api(editing ? `/api/participants/${state.editingParticipantId}` : "/api/participants", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(formData(form)),
      });
      setMessage("#participantMessage", result.existing ? "Ya existia; no se duplico." : editing ? "Participante actualizado." : "Participante guardado.");
      if (!result.existing) resetParticipantForm();
      await refreshAll();
      toast(result.existing ? "Participante encontrado" : editing ? "Participante actualizado" : "Participante inscrito");
    } catch (error) {
      setMessage("#participantMessage", error.message, "error");
    }
  });

  $("#instrumentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const editing = Boolean(state.editingInstrumentId);
      const result = await api(editing ? `/api/instruments/${state.editingInstrumentId}` : "/api/instruments", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(formData(form)),
      });
      setMessage("#instrumentMessage", result.existing ? "Ese instrumento ya existe." : editing ? "Instrumento actualizado." : "Instrumento agregado.");
      if (!result.existing) resetInstrumentForm();
      await loadInstruments();
      await loadActivities();
      toast(result.existing ? "Instrumento existente" : editing ? "Instrumento actualizado" : "Instrumento agregado");
    } catch (error) {
      setMessage("#instrumentMessage", error.message, "error");
    }
  });

  $("#teacherForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const editing = Boolean(state.editingTeacherId);
      const result = await api(editing ? `/api/teachers/${state.editingTeacherId}` : "/api/teachers", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(formData(form)),
      });
      setMessage("#teacherMessage", result.existing ? "Ese profesor ya existe." : editing ? "Profesor actualizado." : "Profesor agregado.");
      if (!result.existing) resetTeacherForm();
      await loadTeachers();
      await loadActivities();
      toast(result.existing ? "Profesor existente" : editing ? "Profesor actualizado" : "Profesor agregado");
    } catch (error) {
      setMessage("#teacherMessage", error.message, "error");
    }
  });

  $("#activityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const editing = Boolean(state.editingActivityId);
      await api(editing ? `/api/activities/${state.editingActivityId}` : "/api/activities", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(formData(form)),
      });
      setMessage("#activityMessage", editing ? "Actividad actualizada." : "Actividad creada.");
      resetActivityForm();
      await refreshAll();
      toast(editing ? "Actividad actualizada" : "Actividad creada");
    } catch (error) {
      setMessage("#activityMessage", error.message, "error");
    }
  });

  $("#attendanceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const editing = Boolean(state.editingAttendanceId);
      const result = await api(editing ? `/api/attendance/${state.editingAttendanceId}` : "/api/attendance", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(formData(form)),
      });
      setMessage("#attendanceMessage", result.existing ? "Esa asistencia ya estaba registrada." : editing ? "Asistencia actualizada." : "Asistencia registrada.");
      if (editing) resetAttendanceForm();
      await refreshAll();
      toast(result.existing ? "Asistencia existente" : editing ? "Asistencia actualizada" : "Asistencia registrada");
    } catch (error) {
      setMessage("#attendanceMessage", error.message, "error");
    }
  });

  $("#participantCancelEdit").addEventListener("click", resetParticipantForm);
  $("#instrumentCancelEdit").addEventListener("click", resetInstrumentForm);
  $("#teacherCancelEdit").addEventListener("click", resetTeacherForm);
  $("#activityCancelEdit").addEventListener("click", resetActivityForm);
  $("#attendanceCancelEdit").addEventListener("click", resetAttendanceForm);
}

function setupFilters() {
  ["participantSearch", "participantBirthSearch"].forEach((id) => {
    $(`#${id}`).addEventListener("input", loadParticipants);
  });
  $("#activitySearch").addEventListener("input", loadActivities);
  ["reportFrom", "reportTo", "reportActivity", "reportTeacher", "reportLocation"].forEach((id) => {
    $(`#${id}`).addEventListener("input", loadReports);
  });
  ["attendanceNameSearch", "attendanceBirthSearch"].forEach((id) => {
    $(`#${id}`).addEventListener("input", async () => {
      const params = new URLSearchParams();
      if ($("#attendanceNameSearch").value) params.set("search", $("#attendanceNameSearch").value);
      if ($("#attendanceBirthSearch").value) params.set("birth_date", $("#attendanceBirthSearch").value);
      state.participants = await api(`/api/participants?${params}`);
      renderParticipants();
      renderSelects();
    });
  });
  ["attendanceStudentFilter", "attendanceActivityFilter", "attendanceTeacherFilter", "attendanceFrom", "attendanceTo"].forEach((id) => {
    $(`#${id}`).addEventListener("input", loadAttendance);
  });
  $("#exportButton").addEventListener("click", () => {
    window.location.href = `/api/export?${reportParams()}`;
  });

  $("#instrumentRows").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-instrument]");
    if (editButton) {
      const instrument = state.instruments.find((item) => String(item.id) === editButton.dataset.editInstrument);
      if (instrument) editInstrument(instrument);
      return;
    }
    const button = event.target.closest("[data-delete-instrument]");
    if (!button) return;
    if (!confirm("Eliminar este instrumento lo quitara de las actividades que lo usan. Deseas continuar?")) return;
    await api(`/api/instruments/${button.dataset.deleteInstrument}`, { method: "DELETE" });
    if (String(state.editingInstrumentId) === button.dataset.deleteInstrument) resetInstrumentForm();
    await refreshAll();
    toast("Instrumento eliminado");
  });

  $("#teacherRows").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-teacher]");
    if (editButton) {
      const teacher = state.teachers.find((item) => String(item.id) === editButton.dataset.editTeacher);
      if (teacher) editTeacher(teacher);
      return;
    }
    const button = event.target.closest("[data-delete-teacher]");
    if (!button) return;
    if (!confirm("Eliminar este profesor lo quitara de actividades y asistencias que lo usan. Deseas continuar?")) return;
    await api(`/api/teachers/${button.dataset.deleteTeacher}`, { method: "DELETE" });
    if (String(state.editingTeacherId) === button.dataset.deleteTeacher) resetTeacherForm();
    await refreshAll();
    toast("Profesor eliminado");
  });

  $("#participantRows").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-participant]");
    if (editButton) {
      const participant = state.participants.find((item) => String(item.id) === editButton.dataset.editParticipant);
      if (participant) editParticipant(participant);
      return;
    }
    const button = event.target.closest("[data-delete-participant]");
    if (!button) return;
    if (!confirm("Eliminar este participante tambien eliminara sus asistencias. Deseas continuar?")) return;
    await api(`/api/participants/${button.dataset.deleteParticipant}`, { method: "DELETE" });
    if (String(state.editingParticipantId) === button.dataset.deleteParticipant) resetParticipantForm();
    await refreshAll();
    toast("Participante eliminado");
  });

  $("#activityRows").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-activity]");
    if (editButton) {
      const activity = state.activities.find((item) => String(item.id) === editButton.dataset.editActivity);
      if (activity) editActivity(activity);
      return;
    }
    const button = event.target.closest("[data-delete-activity]");
    if (!button) return;
    if (!confirm("Eliminar esta actividad tambien eliminara sus asistencias. Deseas continuar?")) return;
    await api(`/api/activities/${button.dataset.deleteActivity}`, { method: "DELETE" });
    if (String(state.editingActivityId) === button.dataset.deleteActivity) resetActivityForm();
    await refreshAll();
    toast("Actividad eliminada");
  });

  $("#attendanceRows").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-attendance]");
    if (editButton) {
      const attendance = state.attendance.find((item) => String(item.id) === editButton.dataset.editAttendance);
      if (attendance) editAttendance(attendance);
      return;
    }
    const button = event.target.closest("[data-delete-attendance]");
    if (!button) return;
    if (!confirm("Eliminar esta asistencia?")) return;
    await api(`/api/attendance/${button.dataset.deleteAttendance}`, { method: "DELETE" });
    if (String(state.editingAttendanceId) === button.dataset.deleteAttendance) resetAttendanceForm();
    await refreshAll();
    toast("Asistencia eliminada");
  });
}

function setDefaultDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const toIso = (value) => value.toISOString().slice(0, 10);
  $("#reportFrom").value = toIso(firstDay);
  $("#reportTo").value = toIso(today);
  $('[name="attended_on"]').value = toIso(today);
}

async function init() {
  setupTabs();
  setupForms();
  setupFilters();
  renderAcademicLevels();
  renderStaticSelects();
  setDefaultDates();
  await loadAuth();
  await refreshAll();
}

init().catch((error) => toast(error.message));
