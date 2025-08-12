/* ======== Estado & utilidades ======== */
const STORAGE = {
  USERS: 'et_users',
  SESSION: 'et_session_user',
  TICKETS: 'et_tickets', // por usuario: { [userId]: Ticket[] }
};

const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

const pad2 = n => String(n).padStart(2,'0');

const routes = {
  M_BA: 'Mercedes → CABA',
  BA_M: 'CABA → Mercedes',
};

const HOURS_RULES = {
  M_BA: { start: 5, end: 18 },   // 05:00 a 18:59
  BA_M: { start: 8, end: 21 },   // 08:00 a 21:59
};

function genTimesFor(routeKey) {
  const rule = routeKey === 'M_BA' ? HOURS_RULES.M_BA : HOURS_RULES.BA_M;
  const slots = [];
  for (let h=rule.start; h<=rule.end; h++) {
    slots.push(`${pad2(h)}:00`);
    slots.push(`${pad2(h)}:30`);
  }
  return slots;
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function formatDateLocalYMD(ymd) { // 'YYYY-MM-DD' -> 'dd/mm/aaaa' local
  const dt = parseYMDLocal(ymd);
  return dt.toLocaleDateString('es-AR', { year:'numeric', month:'2-digit', day:'2-digit' });
}
function parseYMDLocal(ymd) { // 'YYYY-MM-DD' -> Date local (sin zona)
  const [y,m,d] = ymd.split('-').map(Number);
  return new Date(y, m-1, d);
}
function toYMD(date) { // Date local -> 'YYYY-MM-DD'
  const y = date.getFullYear(), m = pad2(date.getMonth()+1), d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

/* ======== Modelos ======== */
function getUsers() { return readJSON(STORAGE.USERS, []); }
function setUsers(u) { writeJSON(STORAGE.USERS, u); }

function getSession() { return readJSON(STORAGE.SESSION, null); }
function setSession(s) { writeJSON(STORAGE.SESSION, s); }
function clearSession() { localStorage.removeItem(STORAGE.SESSION); }

function getTicketsMap() { return readJSON(STORAGE.TICKETS, {}); }
function setTicketsMap(m) { writeJSON(STORAGE.TICKETS, m); }

function getUserTickets(userId) {
  const map = getTicketsMap();
  return map[userId] || [];
}
function setUserTickets(userId, tickets) {
  const map = getTicketsMap();
  map[userId] = tickets;
  setTicketsMap(map);
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

/* ======== Auth (demo local) ======== */
function registerUser({ login, password }) {
  const users = getUsers();
  if (users.some(u => u.login === login)) return { ok:false, error:'El usuario ya existe.' };
  const u = { id: uid(), login, password }; // demo; en prod, no guardar plano
  users.push(u); setUsers(users);
  setSession({ id: u.id, login: u.login });
  return { ok:true };
}
function loginUser({ login, password }) {
  const u = getUsers().find(u => u.login === login && u.password === password);
  if (!u) return { ok:false, error:'Usuario o contraseña incorrectos.' };
  setSession({ id: u.id, login: u.login });
  return { ok:true };
}
function logout() { clearSession(); }

/* ======== Vistas ======== */
const app = $('#app');

function render() {
  app.innerHTML = '';
  const session = getSession();
  if (!session) return viewAuth();

  // Topbar
  const top = document.createElement('div');
  top.className = 'topbar';
  const title = document.createElement('div');
  title.innerHTML = '<div class="header"><h1>Estrella Tour</h1></div>';
  title.style.flex = '1';
  const user = document.createElement('div');
  user.className = 'user';
  user.innerHTML = `👤 ${session.login} · <span class="link" id="logout">Salir</span>`;
  top.appendChild(title); top.appendChild(user);
  app.appendChild(top);

  $('#logout', top).addEventListener('click', ()=>{ logout(); render(); });

  // Router simple
  const raw = location.hash.slice(1);           // ej: "reservar?edit=XYZ"
  const [route] = raw.split('?');               // "reservar"
  if (route === 'reservar') return viewReservar();
  return viewHome();
}

/* ---- Auth ---- */
function viewAuth() {
  const wrap = document.createElement('div');

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="center mb12"><h2>Iniciar sesión</h2></div>
    <div class="mb8"><input class="input" id="login_user" placeholder="Email o teléfono" /></div>
    <div class="mb12"><input class="input" id="login_pass" type="password" placeholder="Contraseña" /></div>
    <button class="btn" id="btn_ingresar">Ingresar</button>
    <div class="divider"></div>
    <div class="center small">¿No tenés cuenta?</div>
    <button class="btn secondary mt8" id="btn_registrar">Registrarse</button>
  `;
  wrap.appendChild(card);

  app.appendChild(wrap);

  $('#btn_ingresar', card).addEventListener('click', ()=>{
    const login = $('#login_user').value.trim();
    const password = $('#login_pass').value.trim();
    if (!login || !password) return alert('Completá usuario y contraseña.');
    const res = loginUser({ login, password });
    if (!res.ok) return alert(res.error);
    render();
  });

  $('#btn_registrar', card).addEventListener('click', ()=>{
    showRegisterModal();
  });
}

/* ---- Home ---- */
function viewHome() {
  const session = getSession();
  const wrap = document.createElement('div');

  // CTA reservar
  const cta = document.createElement('div');
  cta.className = 'card';
  cta.innerHTML = `<button class="btn" id="go_reservar">Reservar pasaje</button>`;
  wrap.appendChild(cta);

  $('#go_reservar', cta).addEventListener('click', ()=>{ location.hash = 'reservar'; render(); });

  // Lista de pasajes del usuario
  const listCard = document.createElement('div');
  listCard.className = 'card';
  listCard.innerHTML = `<h3 class="mb8">Tus pasajes</h3><div id="tickets_list"></div>`;
  wrap.appendChild(listCard);

  const tickets = getUserTickets(session.id).sort((a,b)=> a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const list = document.createElement('div'); list.className = 'list';

  if (!tickets.length) {
    const empty = document.createElement('div');
    empty.className = 'small';
    empty.textContent = 'Todavía no tenés pasajes. Reservá el primero con el botón de arriba.';
    list.appendChild(empty);
  } else {
    tickets.forEach(t => list.appendChild(ticketItem(t)));
  }

  $('#tickets_list', listCard).appendChild(list);

  app.appendChild(wrap);
}

function ticketItem(ticket) {
  const session = getSession();
  const el = document.createElement('div');
  el.className = 'ticket';
  const left = document.createElement('div');
  left.className = 'meta';
  left.innerHTML = `
    <strong>${formatDateLocalYMD(ticket.date)} · ${ticket.time}</strong>
    <span class="small">${routes[ticket.route]} · Estado: <span class="badge">${ticket.status || 'Confirmada'}</span></span>
    <span class="small">Código: ${ticket.code}</span>
  `;

  const right = document.createElement('div');
  right.style.display = 'flex'; right.style.alignItems = 'center'; right.style.gap = '8px';

  // Botón QR cuadrado con ícono
  const btnQR = document.createElement('button');
  btnQR.className = 'btn square ghost icon';
  btnQR.title = 'Ver QR';
  btnQR.setAttribute('aria-label', 'Ver código QR');
  btnQR.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v4h-4v-2h2v-2zm-6 2h2v2h-2v-2z"/>
    </svg>`;
  btnQR.addEventListener('click', ()=> showQRModal(ticket));

  const kebab = document.createElement('div');
  kebab.className = 'kebab';
  const kb = document.createElement('button'); kb.textContent = '⋮';
  const menu = document.createElement('div'); menu.className = 'menu'; menu.style.display = 'none';
  const bCancel = document.createElement('button'); bCancel.textContent = 'Cancelar';
  const bReprog = document.createElement('button'); bReprog.textContent = 'Reprogramar';

  bCancel.addEventListener('click', ()=>{
    menu.style.display = 'none';
    const now = new Date();
    const trip = parseYMDLocal(ticket.date);
    const [hh, mm] = ticket.time.split(':').map(Number);
    trip.setHours(hh, mm || 0, 0, 0);
    const diffH = (trip - now) / 36e5;
    const refundable = diffH >= 24;
    const ok = confirm(`¿Cancelar el pasaje del ${formatDateLocalYMD(ticket.date)} ${ticket.time}?\n${refundable ? 'Se aplicará reembolso.' : 'No aplica reembolso (faltan <24h).'} `);
    if (!ok) return;
    const all = getUserTickets(session.id).filter(t => t.id !== ticket.id);
    setUserTickets(session.id, all);
    alert('Pasaje cancelado.');
    render();
  });

  bReprog.addEventListener('click', ()=>{
    menu.style.display = 'none';
    location.hash = `reservar?edit=${ticket.id}`;
    render();
  });

  kb.addEventListener('click', ()=>{
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', (e)=>{
    if (!kebab.contains(e.target)) menu.style.display = 'none';
  });

  menu.appendChild(bReprog);
  menu.appendChild(bCancel);
  kebab.appendChild(kb); kebab.appendChild(menu);

  right.appendChild(btnQR);
  right.appendChild(kebab);

  el.appendChild(left);
  el.appendChild(right);
  return el;
}

/* ---- Reservar ---- */
function viewReservar() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const editId = params.get('edit'); // si estamos reprogramando
  const session = getSession();
  const editingTicket = editId ? getUserTickets(session.id).find(t => t.id === editId) : null;

  const wrap = document.createElement('div');

  // Barra superior
  const head = document.createElement('div');
  head.className = 'card';
  head.innerHTML = `<div class="row">
    <button class="btn secondary" id="volver">← Volver</button>
    <div class="col"></div>
  </div>`;
  wrap.appendChild(head);
  $('#volver', head).addEventListener('click', ()=>{ location.hash = 'home'; render(); });

  // Selecciones
  const form = document.createElement('div');
  form.className = 'card';
  form.innerHTML = `
    <h3 class="mb12">${editingTicket ? 'Reprogramar pasaje' : 'Reservar pasaje'}</h3>
    <div class="row mt8">
      <div class="col">
        <label class="small">Destino</label>
        <select class="input" id="sel_route">
          <option value="M_BA">Mercedes → CABA</option>
          <option value="BA_M">CABA → Mercedes</option>
        </select>
      </div>
      <div class="col">
        <label class="small">Horario</label>
        <select class="input" id="sel_time">
          <option value="">Seleccioná destino primero</option>
        </select>
      </div>
    </div>

    <div class="mt16">
      <div class="legend">Seleccioná una fecha en el calendario</div>
      <div class="row mt8" style="align-items:center; justify-content:center; gap:12px;">
        <button class="btn square ghost icon" id="prev_m" title="Mes anterior" aria-label="Mes anterior">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="15,4 7,12 15,20"></polygon>
          </svg>
        </button>
        <div class="col center" id="month_label" style="font-weight:600;"></div>
        <button class="btn square ghost icon" id="next_m" title="Mes siguiente" aria-label="Mes siguiente">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="9,4 17,12 9,20"></polygon>
          </svg>
        </button>
      </div>
      <div class="calendar mt8" id="cal_grid"></div>
    </div>

    <button class="btn mt16" id="btn_reservar">${editingTicket ? 'Guardar cambios' : 'Reservar'}</button>
    <div class="small mt8">Al confirmar, se abrirá el flujo de pago (Mercado Pago). En esta demo, se simula la confirmación.</div>
  `;
  wrap.appendChild(form);

  // Estado UI local
  let state = {
    route: editingTicket ? editingTicket.route : 'M_BA',
    time: editingTicket ? editingTicket.time : '',
    date: editingTicket ? editingTicket.date : null, // YYYY-MM-DD
    calRef: editingTicket ? parseYMDLocal(editingTicket.date) : new Date(), // mes actual o del ticket
  };

  const selRoute = $('#sel_route', form);
  const selTime = $('#sel_time', form);
  const calGrid = $('#cal_grid', form);
  const monthLabel = $('#month_label', form);

  // Prefill
  selRoute.value = state.route;
  populateTimes();
  if (editingTicket) selTime.value = state.time;

  renderCalendar();

  selRoute.addEventListener('change', ()=>{
    state.route = selRoute.value;
    populateTimes();
  });
  $('#prev_m', form).addEventListener('click', ()=>{ state.calRef.setMonth(state.calRef.getMonth()-1); renderCalendar(); });
  $('#next_m', form).addEventListener('click', ()=>{ state.calRef.setMonth(state.calRef.getMonth()+1); renderCalendar(); });

  $('#btn_reservar', form).addEventListener('click', ()=>{
    if (!state.date) return alert('Seleccioná una fecha del calendario.');
    if (!selTime.value) return alert('Seleccioná un horario.');
    const ok = confirm(editingTicket ? '¿Guardar la nueva fecha/horario del pasaje?' : '¿Confirmar reserva y proceder al pago?');
    if (!ok) return;

    // Simulación de pago OK
    const session = getSession();
    const tickets = getUserTickets(session.id);

    if (editingTicket) {
      const idx = tickets.findIndex(t => t.id === editingTicket.id);
      tickets[idx] = { ...tickets[idx], route: state.route, date: state.date, time: selTime.value };
      setUserTickets(session.id, tickets);
      alert('Pasaje reprogramado con éxito.');
    } else {
      const newTicket = {
        id: uid(),
        route: state.route,
        date: state.date,
        time: selTime.value,
        status: 'Confirmada',
        code: `ET-${Math.random().toString(36).slice(2,7).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
      };
      tickets.push(newTicket);
      setUserTickets(session.id, tickets);
      alert('Reserva confirmada. ¡Gracias!');
    }
    location.hash = 'home';
    render();
  });

  app.appendChild(wrap);

  function populateTimes() {
    const times = genTimesFor(selRoute.value);
    selTime.innerHTML = times.map(t => `<option value="${t}">${t}</option>`).join('');
    state.time = selTime.value || '';
  }

  function renderCalendar() {
    calGrid.innerHTML = '';
    const y = state.calRef.getFullYear();
    const m = state.calRef.getMonth();
    const first = new Date(y, m, 1);
    const last  = new Date(y, m+1, 0);
    monthLabel.textContent = state.calRef.toLocaleDateString('es-AR', { month:'long', year:'numeric' });

    // Encabezado L a D
    const weekdays = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    weekdays.forEach(w => {
      const h = document.createElement('div');
      h.className = 'weekday';
      h.textContent = w;
      calGrid.appendChild(h);
    });

    // offset para semana que comienza lunes
    const startWeekday = (first.getDay() + 6) % 7; // 0=Lun ... 6=Dom
    for (let i=0; i<startWeekday; i++) {
      const s = document.createElement('div');
      s.className = 'day disabled';
      s.textContent = '';
      calGrid.appendChild(s);
    }

    const today = new Date(); today.setHours(0,0,0,0);

    for (let d=1; d<=last.getDate(); d++) {
      const date = new Date(y, m, d); // Local
      const day = document.createElement('div');
      day.className = 'day';
      day.innerHTML = `<strong>${d}</strong>`;
      if (date < today) day.classList.add('disabled');

      if (state.date === toYMD(date)) day.classList.add('selected');

      day.addEventListener('click', ()=>{
        if (day.classList.contains('disabled')) return;
        state.date = toYMD(date);
        $$('.calendar .day', form).forEach(x=>x.classList.remove('selected'));
        day.classList.add('selected');
      });

      calGrid.appendChild(day);
    }
  }
}

/* ======== Modales ======== */
function showRegisterModal() {
  const back = document.createElement('div'); back.className='modal-backdrop';
  const modal = document.createElement('div'); modal.className='modal';
  modal.innerHTML = `
    <h3>Crear cuenta</h3>
    <div class="mt12"><input class="input" id="reg_user" placeholder="Email o teléfono" /></div>
    <div class="mt8"><input class="input" id="reg_pass" type="password" placeholder="Contraseña" /></div>
    <div class="row mt16">
      <button class="btn" id="ok">Registrarme</button>
      <button class="btn secondary" id="cancel">Cancelar</button>
    </div>
    <div class="small mt8">Demo local: los datos se guardan en tu navegador.</div>
  `;
  back.appendChild(modal);
  document.body.appendChild(back);

  $('#cancel', modal).addEventListener('click', ()=> back.remove());
  $('#ok', modal).addEventListener('click', ()=>{
    const login = $('#reg_user', modal).value.trim();
    const password = $('#reg_pass', modal).value.trim();
    if (!login || !password) return alert('Completá los campos.');
    const res = registerUser({ login, password });
    if (!res.ok) return alert(res.error);
    back.remove(); render();
  });

  back.addEventListener('click', (e)=>{ if (e.target === back) back.remove(); });
  modal.addEventListener('click', (e)=> e.stopPropagation());
}

function showQRModal(ticket) {
  const back = document.createElement('div'); back.className='modal-backdrop';
  const modal = document.createElement('div'); modal.className='modal';
  const payload = {
    code: ticket.code,
    route: routes[ticket.route],
    date: formatDateLocalYMD(ticket.date),
    time: ticket.time
  };
  modal.innerHTML = `
    <h3>Ticket / QR</h3>
    <div class="small">Mostralo al chofer al momento de abordar.</div>
    <div id="qr" class="center mt12"></div>
    <pre class="card mt12" style="overflow:auto; white-space:pre-wrap; font-size:12px;">${JSON.stringify(payload,null,2)}</pre>
  `;
  back.appendChild(modal);
  document.body.appendChild(back);

  const qrDiv = document.querySelector('#qr');
  const qrText = JSON.stringify(payload);

  // Usar la librería local (qrcode.min.js) si está cargada
  if (window.QRCode && typeof window.QRCode === 'function') {
    try {
      new window.QRCode(qrDiv, { text: qrText, width: 200, height: 200 });
    } catch {
      qrDiv.innerHTML = '<div class="small">No se pudo generar el QR. Mostrá el código textual de abajo.</div>';
    }
  } else {
    qrDiv.innerHTML = '<div class="small">No se pudo cargar qrcode.min.js. Verificá que el archivo exista junto a index.html.</div>';
  }

  // Cerrar modal: clic fuera o tecla Esc
  back.addEventListener('click', (e)=>{ if (e.target === back) back.remove(); });
  modal.addEventListener('click', (e)=> e.stopPropagation());
  document.addEventListener('keydown', escClose);
  function escClose(e) {
    if (e.key === 'Escape') {
      back.remove();
      document.removeEventListener('keydown', escClose);
    }
  }
}

/* ======== Init ======== */
window.addEventListener('hashchange', render);
render();
