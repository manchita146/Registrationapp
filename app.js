const state = {
  participants: [],
  activities: [],
  attendance: [],
  instruments: [],
  teachers: [],
  report: null,
  authenticated: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
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
        <td>${formatDate(participant.registered_at)}</td>
        <td><span class="pill ${statusClass}">${status}</span></td>
        <td>${participant.attendance_count || 0}</td>
        <td><button type="button" class="danger" data-delete-participant="${participant.id}">Eliminar</button></td>
      </tr>
    `;
  });
  $("#participantRows").innerHTML = rows.join("") || emptyRow(6, "No hay participantes con esos filtros");
}

function renderInstruments() {
  const rows = state.instruments.map((instrument) => `
    <tr><td>${instrument.name}</td></tr>
  `);
  $("#instrumentRows").innerHTML = rows.join("") || emptyRow(1, "Agrega instrumentos para usarlos en actividades");
}

function renderTeachers() {
  const rows = state.teachers.map((teacher) => `
    <tr><td>${teacher.name}</td></tr>
  `);
  $("#teacherRows").innerHTML = rows.join("") || emptyRow(1, "Agrega profesores para usarlos en asistencia");
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
      <td><button type="button" class="danger" data-delete-activity="${activity.id}">Eliminar</button></td>
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
      <td>${item.instrument_name || "Sin instrumento"}</td>
      <td>${item.teacher_name || "Sin profesor"}</td>
    </tr>
  `);
  $("#attendanceRows").innerHTML = rows.join("") || emptyRow(6, "No hay asistencias registradas");
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

  $('[name="participant_id"]').innerHTML = participantOptions.join("") || `<option value="">Sin participantes</option>`;
  $('[name="activity_id"]').innerHTML = activityOptions.join("") || `<option value="">Sin actividades</option>`;
  $('[name="instrument_id"]').innerHTML = `<option value="">Sin instrumento</option>${instrumentOptions.join("")}`;
  const activityTeacherSelect = $('#activityForm [name="teacher_id"]');
  if (activityTeacherSelect) {
    activityTeacherSelect.innerHTML = `<option value="">Sin profesor</option>${teacherOptions.join("")}`;
  }
  $("#reportActivity").innerHTML = `<option value="">Todas las actividades</option>${activityOptions.join("")}`;
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
      <td>${activity.attendance_count}</td>
      <td>${activity.unique_participants}</td>
    </tr>
  `);
  $("#reportActivityRows").innerHTML = activityRows.join("") || emptyRow(7, "Sin datos para el periodo");

  const participantRows = state.report.participant_detail.map((participant) => `
    <tr>
      <td>${participant.full_name}</td>
      <td>${formatDate(participant.birth_date)}</td>
      <td>${formatDate(participant.registered_at)}</td>
      <td>${formatDate(participant.first_attendance_on)}</td>
      <td>${participant.attendance_count}</td>
    </tr>
  `);
  $("#reportParticipantRows").innerHTML = participantRows.join("") || emptyRow(5, "Sin participantes");
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
  state.attendance = await api("/api/attendance");
  renderAttendance();
}

async function loadReports() {
  const params = new URLSearchParams();
  if ($("#reportFrom").value) params.set("from", $("#reportFrom").value);
  if ($("#reportTo").value) params.set("to", $("#reportTo").value);
  if ($("#reportActivity").value) params.set("activity_id", $("#reportActivity").value);
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
    try {
      const result = await api("/api/participants", {
        method: "POST",
        body: JSON.stringify(formData(event.currentTarget)),
      });
      setMessage("#participantMessage", result.existing ? "Ya existia; no se duplico." : "Participante guardado.");
      if (!result.existing) event.currentTarget.reset();
      await refreshAll();
      toast(result.existing ? "Participante encontrado" : "Participante inscrito");
    } catch (error) {
      setMessage("#participantMessage", error.message, "error");
    }
  });

  $("#instrumentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/instruments", {
        method: "POST",
        body: JSON.stringify(formData(event.currentTarget)),
      });
      setMessage("#instrumentMessage", result.existing ? "Ese instrumento ya existe." : "Instrumento agregado.");
      if (!result.existing) event.currentTarget.reset();
      await loadInstruments();
      toast(result.existing ? "Instrumento existente" : "Instrumento agregado");
    } catch (error) {
      setMessage("#instrumentMessage", error.message, "error");
    }
  });

  $("#teacherForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/teachers", {
        method: "POST",
        body: JSON.stringify(formData(event.currentTarget)),
      });
      setMessage("#teacherMessage", result.existing ? "Ese profesor ya existe." : "Profesor agregado.");
      if (!result.existing) event.currentTarget.reset();
      await loadTeachers();
      toast(result.existing ? "Profesor existente" : "Profesor agregado");
    } catch (error) {
      setMessage("#teacherMessage", error.message, "error");
    }
  });

  $("#activityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/activities", {
        method: "POST",
        body: JSON.stringify(formData(event.currentTarget)),
      });
      setMessage("#activityMessage", "Actividad creada.");
      event.currentTarget.reset();
      await refreshAll();
      toast("Actividad creada");
    } catch (error) {
      setMessage("#activityMessage", error.message, "error");
    }
  });

  $("#attendanceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/attendance", {
        method: "POST",
        body: JSON.stringify(formData(event.currentTarget)),
      });
      setMessage("#attendanceMessage", result.existing ? "Esa asistencia ya estaba registrada." : "Asistencia registrada.");
      await refreshAll();
      toast(result.existing ? "Asistencia existente" : "Asistencia registrada");
    } catch (error) {
      setMessage("#attendanceMessage", error.message, "error");
    }
  });
}

function setupFilters() {
  ["participantSearch", "participantBirthSearch"].forEach((id) => {
    $(`#${id}`).addEventListener("input", loadParticipants);
  });
  $("#activitySearch").addEventListener("input", loadActivities);
  ["reportFrom", "reportTo", "reportActivity"].forEach((id) => {
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
  $("#exportButton").addEventListener("click", () => {
    window.location.href = "/api/export";
  });

  $("#participantRows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-participant]");
    if (!button) return;
    if (!confirm("Eliminar este participante tambien eliminara sus asistencias. Deseas continuar?")) return;
    await api(`/api/participants/${button.dataset.deleteParticipant}`, { method: "DELETE" });
    await refreshAll();
    toast("Participante eliminado");
  });

  $("#activityRows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-activity]");
    if (!button) return;
    if (!confirm("Eliminar esta actividad tambien eliminara sus asistencias. Deseas continuar?")) return;
    await api(`/api/activities/${button.dataset.deleteActivity}`, { method: "DELETE" });
    await refreshAll();
    toast("Actividad eliminada");
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
  setDefaultDates();
  await loadAuth();
  await refreshAll();
}

init().catch((error) => toast(error.message));
