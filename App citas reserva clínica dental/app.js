// app.js
// Gestión de citas: alta, listado, edición y borrado.
// Persistencia: cookie (array de citas) + LocalStorage (cita por id para edición).

class Cita {
  constructor({ id, fechaCita, paciente, observaciones = '', createdAt }) {
    this.id = id || Cita.generateId();
    this.fechaCita = fechaCita;
    this.paciente = paciente;
    this.observaciones = observaciones;
    this.createdAt = createdAt || Date.now();
  }

  static generateId() {
    const rand = Math.random().toString(36).substring(2, 8);
    return `CITA-${Date.now()}-${rand}`;
  }
}

const COOKIE_KEY = 'clinicdental_appointments';

const Storage = {
  getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  },

  setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  },

  loadAll() {
    const raw = this.getCookie(COOKIE_KEY);
    try {
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },

  saveAll(arr) {
    this.setCookie(COOKIE_KEY, JSON.stringify(arr));
  },

  upsert(cita) {
    const arr = this.loadAll();
    const idx = arr.findIndex(c => c.id === cita.id);
    if (idx >= 0) arr[idx] = cita;
    else arr.push(cita);

    this.saveAll(arr);
    localStorage.setItem(cita.id, JSON.stringify(cita));
  },

  removeById(id) {
    const arr = this.loadAll().filter(c => c.id !== id);
    this.saveAll(arr);
    localStorage.removeItem(id);
  },

  syncLocalFromCookie() {
    const arr = this.loadAll();
    arr.forEach(cita => {
      if (!localStorage.getItem(cita.id)) {
        localStorage.setItem(cita.id, JSON.stringify(cita));
      }
    });
  },

  getById(id) {
    const raw = localStorage.getItem(id);
    if (raw) {
      try { return JSON.parse(raw); } catch { /* fallback */ }
    }
    return this.loadAll().find(c => c.id === id) || null;
  }
};

const Validators = {
  isInt(val) { return /^\d+$/.test(String(val).trim()); },
  isDNI(val) { return /^[0-9]{7,8}[A-Za-z]$/.test(String(val).trim()); },
  isPhone(val) { return /^[\d\s()+-]{9,}$/.test(String(val).trim()); },

  isRealDate(d, m, y) {
    const dd = Number(d), mm = Number(m), yy = Number(y);
    if (!Number.isInteger(dd) || !Number.isInteger(mm) || !Number.isInteger(yy)) return false;
    const date = new Date(yy, mm - 1, dd);
    return date.getFullYear() === yy && (date.getMonth() + 1) === mm && date.getDate() === dd;
  },

  validateForm(form) {
    const errors = {};
    const get = name => form.querySelector(`[name="${name}"]`).value.trim();

    const dia = get('dia'), mes = get('mes'), anio = get('anio'), hora = get('hora'), minuto = get('minuto');
    const dni = get('dni'), nombre = get('nombre'), apellidos = get('apellidos');
    const telefono = get('telefono'), fechaNacimiento = get('fechaNacimiento');
    const observaciones = get('observaciones');

    const required = { dia, mes, anio, hora, minuto, dni, nombre, apellidos, telefono, fechaNacimiento };
    Object.entries(required).forEach(([k, v]) => {
      if (!v) errors[k] = 'Campo obligatorio.';
    });

    if (!errors.dia && (!this.isInt(dia) || Number(dia) < 1 || Number(dia) > 31)) errors.dia = 'Día inválido (1-31).';
    if (!errors.mes && (!this.isInt(mes) || Number(mes) < 1 || Number(mes) > 12)) errors.mes = 'Mes inválido (1-12).';
    if (!errors.anio && (!this.isInt(anio) || Number(anio) < 1900 || Number(anio) > 2100)) errors.anio = 'Año inválido (1900-2100).';
    if (!errors.hora && (!this.isInt(hora) || Number(hora) < 0 || Number(hora) > 23)) errors.hora = 'Hora inválida (0-23).';
    if (!errors.minuto && (!this.isInt(minuto) || Number(minuto) < 0 || Number(minuto) > 59)) errors.minuto = 'Minuto inválido (0-59).';
    if (!errors.dni && !this.isDNI(dni)) errors.dni = 'DNI inválido (7–8 dígitos + letra).';
    if (!errors.telefono && !this.isPhone(telefono)) errors.telefono = 'Teléfono inválido (mín. 9).';

    if (!errors.dia && !errors.mes && !errors.anio && !this.isRealDate(dia, mes, anio)) {
      errors.dia = 'Fecha de cita no válida.';
      errors.mes = 'Fecha de cita no válida.';
      errors.anio = 'Fecha de cita no válida.';
    }

    if (!errors.fechaNacimiento) {
      const d = new Date(fechaNacimiento);
      if (Number.isNaN(d.getTime())) errors.fechaNacimiento = 'Fecha de nacimiento inválida.';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      data: {
        fechaCita: { dia, mes, anio, hora, minuto },
        paciente: { dni, nombre, apellidos, telefono, fechaNacimiento },
        observaciones
      }
    };
  }
};

const UI = {
  setErrors(form, errors) {
    form.querySelectorAll('.error-msg').forEach(e => e.remove());
    form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

    Object.entries(errors).forEach(([name, msg]) => {
      const field = form.querySelector(`[name="${name}"]`);
      if (!field) return;

      field.classList.add('input-error');
      const div = document.createElement('div');
      div.className = 'error-msg';
      div.textContent = msg;

      field.closest('.field')?.appendChild(div);
    });
  },

  wireLiveValidation(form) {
    form.addEventListener('input', (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (!el.matches('input, textarea, select')) return;

      el.classList.remove('input-error');
      const wrap = el.closest('.field');
      const msg = wrap?.querySelector('.error-msg');
      if (msg) msg.remove();
    });
  }
};

const Pages = {
  initList() {
    const tbody = document.querySelector('#citas-tbody');
    const counterEl = document.querySelector('#citas-count');
    const btnCrear = document.querySelector('#btn-crear');

    btnCrear.addEventListener('click', () => {
      window.location.href = 'cita.html';
    });

    const render = () => {
      Storage.syncLocalFromCookie();

      const citas = Storage.loadAll();
      tbody.innerHTML = '';
      counterEl.textContent = String(citas.length);

      if (citas.length === 0) {
        const tr = document.createElement('tr');
        tr.className = 'empty-row';
        tr.innerHTML = `<td colspan="8">dato vacío</td>`;
        tbody.appendChild(tr);
        return;
      }

      citas.forEach((cita, i) => {
        const tr = document.createElement('tr');
        const { fechaCita, paciente } = cita;

        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${fechaCita.dia}/${fechaCita.mes}/${fechaCita.anio}</td>
          <td>${String(fechaCita.hora).padStart(2, '0')}:${String(fechaCita.minuto).padStart(2, '0')}</td>
          <td>${paciente.dni}</td>
          <td>${paciente.nombre} ${paciente.apellidos}</td>
          <td>${paciente.telefono}</td>
          <td>${paciente.fechaNacimiento}</td>
          <td>
            <button class="btn btn-link" data-edit="${cita.id}">Editar</button>
            <button class="btn btn-link" data-del="${cita.id}">Eliminar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.currentTarget.getAttribute('data-edit');
          window.location.href = `cita.html?id=${encodeURIComponent(id)}`;
        });
      });

      tbody.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.currentTarget.getAttribute('data-del');
          const ok = confirm('¿Eliminar esta cita? Esta acción no se puede deshacer.');
          if (!ok) return;
          Storage.removeById(id);
          render();
        });
      });
    };

    render();
  },

  initForm() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    const form = document.querySelector('#cita-form');
    const btnCancel = document.querySelector('#btn-cancel');
    const heading = document.querySelector('#form-heading');

    UI.wireLiveValidation(form);

    btnCancel.addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    let loaded = null;
    if (id) {
      Storage.syncLocalFromCookie();
      loaded = Storage.getById(id);

      if (loaded) {
        heading.textContent = 'Editar cita';

        const f = loaded.fechaCita;
        const p = loaded.paciente;

        form.querySelector('[name="dia"]').value = f.dia;
        form.querySelector('[name="mes"]').value = f.mes;
        form.querySelector('[name="anio"]').value = f.anio;
        form.querySelector('[name="hora"]').value = f.hora;
        form.querySelector('[name="minuto"]').value = f.minuto;

        form.querySelector('[name="dni"]').value = p.dni;
        form.querySelector('[name="nombre"]').value = p.nombre;
        form.querySelector('[name="apellidos"]').value = p.apellidos;
        form.querySelector('[name="telefono"]').value = p.telefono;
        form.querySelector('[name="fechaNacimiento"]').value = p.fechaNacimiento;
        form.querySelector('[name="observaciones"]').value = loaded.observaciones || '';
      } else {
        heading.textContent = 'Crear cita';
      }
    }

    form.addEventListener('submit', e => {
      e.preventDefault();

      const v = Validators.validateForm(form);
      if (!v.isValid) {
        UI.setErrors(form, v.errors);
        return;
      }

      const citaData = new Cita({
        id: loaded?.id,
        createdAt: loaded?.createdAt,
        fechaCita: v.data.fechaCita,
        paciente: v.data.paciente,
        observaciones: v.data.observaciones
      });

      Storage.upsert(citaData);
      alert(loaded ? 'Cita actualizada correctamente.' : 'Cita creada correctamente.');
      window.location.href = 'index.html';
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'list') Pages.initList();
  if (document.body.dataset.page === 'form') Pages.initForm();
});
