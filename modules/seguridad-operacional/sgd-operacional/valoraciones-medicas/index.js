// ===================================================================
//  GSO — Valoraciones Médicas del Personal
//  Tabla: public.valoraciones_medicas (Supabase)
//
//  Columnas: id, no_prog, fecha, hora, cantidad, empresa,
//            valoracion_practicada, observaciones, created_at
//
//  KPIs + 4 gráficas + tabla con filtros + CRUD completo
//
//  API pública:
//    window.initValoracionesMedicas()   → inicializa / muestra
//    window.valoracionesMedicasReload() → recarga silenciosa
// ===================================================================
(function () {
    'use strict';

    const PREFIX = 'vm';  // prefijo para todos los IDs del DOM

    // ─── PALETA ─────────────────────────────────────────────────────
    const COL = {
        blue:    '#2563eb',
        blue2:   '#1e3a8a',
        teal:    '#0d9488',
        teal2:   '#134e4a',
        green:   '#16a34a',
        green2:  '#14532d',
        amber:   '#d97706',
        amber2:  '#92400e',
        red:     '#dc2626',
        red2:    '#991b1b',
        purple:  '#7c3aed',
        slate:   '#64748b',
    };

    const PALETTE = [COL.blue, COL.teal, COL.purple, COL.amber,
                     COL.green, '#0891b2', '#be185d', '#ca8a04',
                     '#0e7490', '#7c3aed'];

    // Tipos de valoración predefinidos (checkboxes en el modal)
    const TIPOS_VAL = [
        'Toma de signos vitales',
        'Alcoholímetro',
        'Saturación de oxígeno',
        'Presión arterial',
    ];

    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun',
                         'Jul','Ago','Sep','Oct','Nov','Dic'];

    let _charts   = {};
    let _initOnce = false;
    let _allData  = [];
    let _editId   = null;   // null → nuevo registro

    // ─── SUPABASE ────────────────────────────────────────────────────
    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') {
            return await window.ensureSupabaseClient();
        }
        throw new Error('Cliente de Supabase no disponible');
    }

    // ─── PERMISOS ────────────────────────────────────────────────────
    function canEdit() {
        try {
            const role = sessionStorage.getItem('user_role') || '';
            if (['admin', 'superadmin'].includes(role)) return true;
            const ovr = (window.dataManager?.sectionLevels || {})['valoraciones-medicas'];
            if (ovr === 'read' || ovr === 'none') return false;
            if (ovr === 'capture' || ovr === 'edit') return true;
            return ['editor', 'gso'].includes(role);
        } catch (_) { return false; }
    }

    function canDelete() {
        try {
            const role = sessionStorage.getItem('user_role') || '';
            return ['admin', 'superadmin'].includes(role);
        } catch (_) { return false; }
    }

    // ─── UTILIDADES ──────────────────────────────────────────────────
    function setStatus(msg, type) {
        const el = document.getElementById(`${PREFIX}-status`);
        if (!el) return;
        if (!msg) { el.classList.add('d-none'); el.innerHTML = ''; return; }
        el.classList.remove('d-none', 'alert-info', 'alert-warning', 'alert-danger', 'alert-success');
        el.classList.add('alert-' + (type || 'info'));
        el.innerHTML = msg;
    }

    const fmtDate = (d) => {
        if (!d) return '—';
        try { const [y, m, day] = String(d).split('-'); return `${day}/${m}/${y}`; }
        catch (_) { return String(d); }
    };

    const today = () => new Date().toISOString().slice(0, 10);

    // Extrae año de fecha ISO
    const yearOf = (d) => d ? String(d).slice(0, 4) : null;

    // ─── CARGA DE DATOS ──────────────────────────────────────────────
    async function loadAll() {
        const sb = await getClient();
        const { data, error } = await sb
            .from('valoraciones_medicas')
            .select('*')
            .order('fecha', { ascending: false })
            .order('no_prog', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    // ─── FILTROS ────────────────────────────────────────────────────
    function getFiltered() {
        const empresa = document.getElementById(`${PREFIX}-fil-empresa`)?.value || 'all';
        const anio    = document.getElementById(`${PREFIX}-fil-anio`)?.value    || 'all';
        const buscar  = (document.getElementById(`${PREFIX}-fil-buscar`)?.value || '').toLowerCase().trim();

        return _allData.filter(r => {
            if (empresa !== 'all' && r.empresa !== empresa) return false;
            if (anio    !== 'all' && yearOf(r.fecha) !== anio) return false;
            if (buscar && ![r.empresa, r.valoracion_practicada, r.observaciones, String(r.no_prog || '')]
                .some(v => String(v || '').toLowerCase().includes(buscar))) return false;
            return true;
        });
    }

    // Llena selects de filtro con valores únicos
    function populateFilters() {
        const empresas = [...new Set(_allData.map(r => r.empresa).filter(Boolean))].sort();
        const anios    = [...new Set(_allData.map(r => yearOf(r.fecha)).filter(Boolean))].sort().reverse();

        const fillSel = (id, opts) => {
            const el = document.getElementById(id);
            if (!el) return;
            const cur = el.value;
            el.innerHTML = `<option value="all">Todas</option>` +
                opts.map(o => `<option value="${o}">${o}</option>`).join('');
            if (opts.includes(cur)) el.value = cur;
        };

        fillSel(`${PREFIX}-fil-empresa`, empresas);
        fillSel(`${PREFIX}-fil-anio`,    anios);
    }

    // ─── KPIs ────────────────────────────────────────────────────────
    function renderKpis(rows) {
        const total        = rows.length;
        const totalPersonas = rows.reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
        const empresas     = new Set(rows.map(r => r.empresa).filter(Boolean)).size;
        const conObs       = rows.filter(r => r.observaciones && r.observaciones.trim()).length;

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set(`${PREFIX}-kpi-total`,     String(total));
        set(`${PREFIX}-kpi-personas`,  String(totalPersonas));
        set(`${PREFIX}-kpi-empresas`,  String(empresas));
        set(`${PREFIX}-kpi-obs`,       String(conObs));
    }

    // ─── TABLA ───────────────────────────────────────────────────────
    function renderTable(rows) {
        const tbody   = document.getElementById(`${PREFIX}-tbl-body`);
        const countEl = document.getElementById(`${PREFIX}-tbl-count`);
        if (!tbody) return;
        if (countEl) countEl.textContent = `${rows.length} registro${rows.length !== 1 ? 's' : ''}`;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">
                Sin registros para los filtros seleccionados.</td></tr>`;
            return;
        }

        const editable  = canEdit();
        const deletable = canDelete();

        tbody.innerHTML = rows.map(r => {
            // Badges para cada tipo de valoración
            const tiposBadges = (r.valoracion_practicada || '')
                .split(',')
                .map(t => t.trim())
                .filter(Boolean)
                .map(t => `<span class="badge rounded-pill me-1" style="background:#e0f2fe;color:#0369a1;font-weight:500;">${t}</span>`)
                .join('') || '<span class="text-muted small">—</span>';

            const horaDisplay = r.hora ? `<span class="badge bg-secondary">${r.hora}</span>` : '—';

            return `<tr>
                <td class="fw-semibold text-center">${r.no_prog ?? '—'}</td>
                <td class="text-nowrap">${fmtDate(r.fecha)}</td>
                <td class="text-center">${horaDisplay}</td>
                <td class="text-muted small">${r.empresa || '—'}</td>
                <td class="text-center fw-semibold">${r.cantidad ?? '—'}</td>
                <td style="max-width:280px;">${tiposBadges}</td>
                <td class="small text-muted" style="max-width:200px;white-space:normal;">
                    ${r.observaciones ? `<i class="fas fa-comment-medical me-1 text-warning"></i>${r.observaciones}` : '—'}
                </td>
                <td class="text-center text-nowrap">
                    ${editable  ? `<button class="btn btn-xs btn-outline-primary me-1 vm-btn-edit"   data-id="${r.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>` : ''}
                    ${deletable ? `<button class="btn btn-xs btn-outline-danger  vm-btn-delete" data-id="${r.id}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');

        // Eventos de filas
        tbody.querySelectorAll('.vm-btn-edit').forEach(btn =>
            btn.addEventListener('click', () => openModal(Number(btn.dataset.id))));
        tbody.querySelectorAll('.vm-btn-delete').forEach(btn =>
            btn.addEventListener('click', () => confirmDelete(Number(btn.dataset.id))));
    }

    // ─── GRÁFICAS ────────────────────────────────────────────────────
    function destroyCharts() {
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    }

    function renderCharts(rows) {
        destroyCharts();

        // ── Chart 1: Distribución de personas por empresa (doughnut) ──
        const c1 = document.getElementById(`${PREFIX}-chart-empresa`);
        if (c1) {
            const byEmpresa = {};
            rows.forEach(r => {
                const e = r.empresa || 'Sin empresa';
                byEmpresa[e] = (byEmpresa[e] || 0) + (Number(r.cantidad) || 0);
            });
            const labels = Object.keys(byEmpresa);
            const data   = Object.values(byEmpresa);
            const totalP = data.reduce((s, v) => s + v, 0);

            // Plugin centro de doughnut
            const centerPlugin = {
                id: 'vmCenterText1',
                beforeDraw(chart) {
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return;
                    const cx = (chartArea.left + chartArea.right) / 2;
                    const cy = (chartArea.top  + chartArea.bottom) / 2;
                    ctx.save();
                    ctx.font = 'bold 22px sans-serif';
                    ctx.fillStyle = '#1e293b';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(totalP, cx, cy - 8);
                    ctx.font = '11px sans-serif';
                    ctx.fillStyle = '#64748b';
                    ctx.fillText('personas', cx, cy + 10);
                    ctx.restore();
                }
            };

            _charts.empresa = new Chart(c1, {
                type: 'doughnut',
                plugins: [centerPlugin],
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: PALETTE.slice(0, labels.length),
                        borderWidth: 2,
                        borderColor: '#fff',
                    }]
                },
                options: {
                    cutout: '60%',
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
                        datalabels: { display: false },
                    },
                    responsive: true, maintainAspectRatio: false,
                }
            });
        }

        // ── Chart 2: Valoraciones por mes (barras apiladas) ──
        const c2 = document.getElementById(`${PREFIX}-chart-mensual`);
        if (c2) {
            const byMes = {};
            rows.forEach(r => {
                if (!r.fecha) return;
                const m = parseInt(r.fecha.slice(5, 7), 10) - 1;
                const y = r.fecha.slice(0, 4);
                const key = `${y}-${String(m + 1).padStart(2, '0')}`;
                byMes[key] = (byMes[key] || 0) + (Number(r.cantidad) || 0);
            });
            const sortedKeys = Object.keys(byMes).sort();
            const labels = sortedKeys.map(k => {
                const [y, m] = k.split('-');
                return MESES_SHORT[parseInt(m, 10) - 1] + ' ' + y;
            });

            _charts.mensual = new Chart(c2, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Personas valoradas',
                        data: sortedKeys.map(k => byMes[k]),
                        backgroundColor: COL.teal + 'cc',
                        borderColor: COL.teal,
                        borderWidth: 1.5,
                        borderRadius: 5,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            display: true,
                            anchor: 'end', align: 'top',
                            font: { size: 11, weight: 'bold' },
                            color: COL.teal2,
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        // ── Chart 3: Tipos de valoración más frecuentes (barras horizontales) ──
        const c3 = document.getElementById(`${PREFIX}-chart-tipos`);
        if (c3) {
            const countTipo = {};
            rows.forEach(r => {
                if (!r.valoracion_practicada) return;
                r.valoracion_practicada.split(',').forEach(t => {
                    const k = t.trim();
                    if (k) countTipo[k] = (countTipo[k] || 0) + 1;
                });
            });
            const sorted = Object.entries(countTipo).sort((a, b) => b[1] - a[1]);

            _charts.tipos = new Chart(c3, {
                type: 'bar',
                data: {
                    labels: sorted.map(([k]) => k),
                    datasets: [{
                        label: 'Frecuencia',
                        data: sorted.map(([, v]) => v),
                        backgroundColor: [COL.blue, COL.teal, COL.green, COL.amber].slice(0, sorted.length),
                        borderRadius: 5,
                        borderSkipped: false,
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            display: true,
                            anchor: 'end', align: 'right',
                            font: { size: 11, weight: 'bold' },
                            color: '#374151',
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
                        y: { grid: { display: false } }
                    }
                }
            });
        }

        // ── Chart 4: Eventos por empresa (columnas) ──
        const c4 = document.getElementById(`${PREFIX}-chart-eventos`);
        if (c4) {
            const byEmpresaEvt = {};
            rows.forEach(r => {
                const e = r.empresa || 'Sin empresa';
                byEmpresaEvt[e] = (byEmpresaEvt[e] || 0) + 1;
            });
            const sorted = Object.entries(byEmpresaEvt).sort((a, b) => b[1] - a[1]);

            _charts.eventos = new Chart(c4, {
                type: 'bar',
                data: {
                    labels: sorted.map(([k]) => k.length > 22 ? k.slice(0, 20) + '…' : k),
                    datasets: [{
                        label: 'Eventos',
                        data: sorted.map(([, v]) => v),
                        backgroundColor: PALETTE.slice(0, sorted.length).map(c => c + 'cc'),
                        borderColor: PALETTE.slice(0, sorted.length),
                        borderWidth: 1.5,
                        borderRadius: 5,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            display: true,
                            anchor: 'end', align: 'top',
                            font: { size: 10, weight: 'bold' },
                            color: '#374151',
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
                        x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                    }
                }
            });
        }
    }

    // ─── RENDER PRINCIPAL ────────────────────────────────────────────
    async function renderAll() {
        setStatus('<i class="fas fa-spinner fa-spin me-1"></i>Cargando datos…', 'info');
        try {
            _allData = await loadAll();
            populateFilters();
            const rows = getFiltered();
            renderKpis(rows);
            renderTable(rows);
            renderCharts(rows);
            setStatus('', '');
        } catch (err) {
            console.error('[vm] renderAll error', err);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (err.message || err), 'danger');
        }
    }

    function renderFiltered() {
        const rows = getFiltered();
        renderKpis(rows);
        renderTable(rows);
        renderCharts(rows);
    }

    // ─── MODAL CRUD ──────────────────────────────────────────────────
    function clearModal() {
        [   `${PREFIX}-f-noprog`, `${PREFIX}-f-fecha`, `${PREFIX}-f-hora`,
            `${PREFIX}-f-cantidad`, `${PREFIX}-f-empresa`, `${PREFIX}-f-obs`
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        // Desmarcar todos los checkboxes de valoración
        document.querySelectorAll('.vm-val-check').forEach(cb => cb.checked = false);

        const msgEl = document.getElementById(`${PREFIX}-modal-msg`);
        if (msgEl) { msgEl.className = 'd-none'; msgEl.innerHTML = ''; }

        const titleEl = document.getElementById(`${PREFIX}-modal-title`);
        if (titleEl) titleEl.textContent = 'Nueva Valoración';
    }

    async function openModal(id) {
        _editId = id || null;
        clearModal();

        if (_editId) {
            // Modo edición: cargar datos del registro
            const rec = _allData.find(r => r.id === _editId);
            if (!rec) return;

            const titleEl = document.getElementById(`${PREFIX}-modal-title`);
            if (titleEl) titleEl.textContent = 'Editar Valoración';

            const set = (elId, val) => {
                const el = document.getElementById(elId);
                if (el) el.value = val ?? '';
            };
            set(`${PREFIX}-f-noprog`,   rec.no_prog);
            set(`${PREFIX}-f-fecha`,    rec.fecha);
            set(`${PREFIX}-f-hora`,     rec.hora);
            set(`${PREFIX}-f-cantidad`, rec.cantidad);
            set(`${PREFIX}-f-empresa`,  rec.empresa);
            set(`${PREFIX}-f-obs`,      rec.observaciones);

            // Marcar checkboxes que correspondan
            const tiposActivos = (rec.valoracion_practicada || '').split(',').map(t => t.trim());
            document.querySelectorAll('.vm-val-check').forEach(cb => {
                cb.checked = tiposActivos.includes(cb.value);
            });
        } else {
            // Modo nuevo: pre-llenar fecha hoy
            const fechaEl = document.getElementById(`${PREFIX}-f-fecha`);
            if (fechaEl) fechaEl.value = today();
        }

        // Mostrar modal Bootstrap
        try {
            const modalEl = document.getElementById(`${PREFIX}-modal`);
            if (modalEl) {
                const bsModal = new bootstrap.Modal(modalEl);
                bsModal.show();
            }
        } catch (_) {}
    }

    async function saveRecord() {
        const msgEl = document.getElementById(`${PREFIX}-modal-msg`);
        const btn   = document.getElementById(`${PREFIX}-modal-save`);

        try {
            if (!canEdit()) {
                if (msgEl) {
                    msgEl.className = 'alert alert-danger mt-2 py-2';
                    msgEl.innerHTML = '<i class="fas fa-lock me-1"></i>No tienes permisos de edición.';
                }
                return;
            }

            // Leer valores
            const noprog   = document.getElementById(`${PREFIX}-f-noprog`)?.value?.trim();
            const fecha    = document.getElementById(`${PREFIX}-f-fecha`)?.value?.trim();
            const hora     = document.getElementById(`${PREFIX}-f-hora`)?.value?.trim();
            const cantidad = document.getElementById(`${PREFIX}-f-cantidad`)?.value?.trim();
            const empresa  = document.getElementById(`${PREFIX}-f-empresa`)?.value?.trim();
            const obs      = document.getElementById(`${PREFIX}-f-obs`)?.value?.trim();

            // Recopilar valoraciones seleccionadas
            const tiposSeleccionados = [];
            document.querySelectorAll('.vm-val-check:checked').forEach(cb => {
                tiposSeleccionados.push(cb.value);
            });
            const valoracionPracticada = tiposSeleccionados.join(', ') || null;

            // Validaciones
            if (!fecha || !empresa) {
                if (msgEl) {
                    msgEl.className = 'alert alert-warning mt-2 py-2';
                    msgEl.innerHTML = '<i class="fas fa-triangle-exclamation me-1"></i>Fecha y Empresa son campos obligatorios.';
                }
                return;
            }

            // Validar hora si se proporcionó (formato HH:MM-HH:MM o HH:MM)
            if (hora) {
                const horaRe = /^([01]\d|2[0-3]):[0-5]\d(-([01]\d|2[0-3]):[0-5]\d)?$/;
                if (!horaRe.test(hora)) {
                    if (msgEl) {
                        msgEl.className = 'alert alert-warning mt-2 py-2';
                        msgEl.innerHTML = '<i class="fas fa-triangle-exclamation me-1"></i>Formato de hora inválido. Usa HH:MM o HH:MM-HH:MM (ej. 09:00-10:30).';
                    }
                    document.getElementById(`${PREFIX}-f-hora`)?.focus();
                    return;
                }
            }

            const payload = {
                no_prog:               noprog   ? parseInt(noprog, 10)   : null,
                fecha,
                hora:                  hora     || null,
                cantidad:              cantidad ? parseInt(cantidad, 10) : null,
                empresa,
                valoracion_practicada: valoracionPracticada,
                observaciones:         obs      || null,
            };

            if (btn) btn.disabled = true;
            if (msgEl) {
                msgEl.className = 'alert alert-info mt-2 py-2';
                msgEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Guardando…';
            }

            const sb = await getClient();
            let error;

            if (_editId) {
                ({ error } = await sb.from('valoraciones_medicas').update(payload).eq('id', _editId));
            } else {
                ({ error } = await sb.from('valoraciones_medicas').insert(payload));
            }

            if (error) throw error;

            if (msgEl) {
                msgEl.className = 'alert alert-success mt-2 py-2';
                msgEl.innerHTML = '<i class="fas fa-check-circle me-1"></i>Registro guardado correctamente.';
            }

            setTimeout(async () => {
                try {
                    const bsModal = bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}-modal`));
                    if (bsModal) bsModal.hide();
                } catch (_) {}
                await renderAll();
            }, 1200);

        } catch (err) {
            console.error('[vm] save error', err);
            if (msgEl) {
                msgEl.className = 'alert alert-danger mt-2 py-2';
                msgEl.innerHTML = '<i class="fas fa-triangle-exclamation me-1"></i>' + (err.message || err);
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function confirmDelete(id) {
        if (!canDelete()) return;
        const rec = _allData.find(r => r.id === id);
        const label = rec ? `Prog. ${rec.no_prog} — ${rec.empresa || ''} (${fmtDate(rec.fecha)})` : `ID ${id}`;
        if (!confirm(`¿Eliminar el registro "${label}"? Esta acción no se puede deshacer.`)) return;
        try {
            const sb = await getClient();
            const { error } = await sb.from('valoraciones_medicas').delete().eq('id', id);
            if (error) throw error;
            await renderAll();
        } catch (err) {
            alert('Error al eliminar: ' + (err.message || err));
        }
    }

    // ─── EXPORTAR CSV ────────────────────────────────────────────────
    function exportCsv() {
        const rows = getFiltered();
        if (!rows.length) { alert('No hay registros para exportar.'); return; }
        const headers = ['No.Prog','Fecha','Hora','Empresa','Cantidad','Valoraciones','Observaciones'];
        const lines = [
            headers.join(','),
            ...rows.map(r => [
                r.no_prog ?? '',
                r.fecha   ?? '',
                r.hora    ?? '',
                `"${(r.empresa || '').replace(/"/g, '""')}"`,
                r.cantidad ?? '',
                `"${(r.valoracion_practicada || '').replace(/"/g, '""')}"`,
                `"${(r.observaciones || '').replace(/"/g, '""')}"`,
            ].join(','))
        ];
        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `valoraciones_medicas_${today()}.csv`
        });
        a.click();
    }

    // ─── BINDINGS ────────────────────────────────────────────────────
    function wireUi() {
        if (_initOnce) return;
        _initOnce = true;

        // Filtros
        [`${PREFIX}-fil-empresa`, `${PREFIX}-fil-anio`].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', renderFiltered);
        });

        const buscarEl = document.getElementById(`${PREFIX}-fil-buscar`);
        if (buscarEl) buscarEl.addEventListener('input', renderFiltered);

        // Botón refrescar
        const btnRefresh = document.getElementById(`${PREFIX}-refresh-btn`);
        if (btnRefresh) btnRefresh.addEventListener('click', renderAll);

        // Botón agregar
        const btnAdd = document.getElementById(`${PREFIX}-add-btn`);
        if (btnAdd) {
            btnAdd.classList.toggle('d-none', !canEdit());
            btnAdd.addEventListener('click', () => openModal(null));
        }

        // Botón exportar CSV
        const btnCsv = document.getElementById(`${PREFIX}-csv-btn`);
        if (btnCsv) btnCsv.addEventListener('click', exportCsv);

        // Guardar modal
        const btnSave = document.getElementById(`${PREFIX}-modal-save`);
        if (btnSave) btnSave.addEventListener('click', saveRecord);
    }

    // ─── API PÚBLICA ─────────────────────────────────────────────────
    window.initValoracionesMedicas = async function () {
        try {
            wireUi();
            await renderAll();
        } catch (e) {
            console.error('[vm] init error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (e.message || e), 'danger');
        }
    };

    window.valoracionesMedicasReload = renderAll;


    // Contrato de ciclo de vida del modulo.
    //
    // Lo que se acumulaba visita tras visita eran las instancias de Chart.js:
    // cada render creaba las suyas y nadie las soltaba al salir de la seccion.
    // destroyCharts() ya existia para reconstruirlas; aqui se usa tambien para
    // apagarlas.
    //
    // Los listeners de los controles NO se retiran: wireUi() corre una sola vez
    // (guardado por _initOnce) sobre nodos que viven dentro de la vista, y la
    // vista se queda cacheada en el DOM. Retirarlos obligaria a volver a
    // cablearlos sin ganar nada.
    window.destroyValoracionesMedicas = function () {
        try { destroyCharts(); } catch (_) {}
    };
})();
