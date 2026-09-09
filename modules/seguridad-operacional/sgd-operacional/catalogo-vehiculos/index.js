// ===================================================================
//  GSO — Catálogo de Vehículos
//  Tabla: public.catalogo_vehiculos (Supabase)
//
//  Columnas: id, codigo_aifa, numero_economico, marca, tipo_vehiculo, color,
//            estado, numero_serie, notas, combustible, placas,
//            transmision, created_at, updated_at
//
//  API pública:
//    window.initCatalogoVehiculos()    → inicializa / muestra
//    window.catalogoVehiculosReload()  → recarga silenciosa
// ===================================================================
(function () {
    'use strict';

    const PREFIX = 'cv';

    // ─── CATÁLOGOS FIJOS ────────────────────────────────────────────
    const TIPOS_VEHICULO = [
        'Automóvil', 'Camioneta', 'Camión', 'Motocicleta',
        'Vehículo de emergencia', 'Autobús', 'Remolque', 'Grúa',
        'Tractor', 'Carretilla elevadora', 'Vehículo aeroportuario', 'Otro',
    ];

    const COMBUSTIBLES = ['Gasolina', 'Diésel', 'Gas LP', 'Eléctrico', 'Híbrido', 'Otro'];
    const TRANSMISIONES = ['Automática', 'Manual', 'CVT', 'Otro'];
    // Debe coincidir con el CHECK de public.catalogo_vehiculos.
    const ESTADOS = ['Activo', 'Mantenimiento', 'Baja'];

    // ─── PALETA ─────────────────────────────────────────────────────
    const COL = {
        indigo:  '#4f46e5',
        indigo2: '#312e81',
        blue:    '#2563eb',
        teal:    '#0d9488',
        green:   '#16a34a',
        amber:   '#d97706',
        red:     '#dc2626',
        slate:   '#64748b',
        violet:  '#7c3aed',
    };
    const PALETTE = [COL.indigo, COL.teal, COL.green, COL.amber,
                     COL.blue, COL.violet, COL.red, '#0891b2', '#be185d'];

    // ─── ESTADO ─────────────────────────────────────────────────────
    let _charts   = {};
    let _initOnce = false;
    let _allData  = [];
    let _editId   = null;

    // Paginación
    const PAGE_SIZE = 20;
    let _currentPage = 0;

    // Orden actual (columna y dirección)
    let _sortCol = 'numero_economico';
    let _sortDir = 'asc';

    // ─── SUPABASE ────────────────────────────────────────────────────
    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') {
            return await window.ensureSupabaseClient();
        }
        throw new Error('Cliente Supabase no disponible');
    }

    // ─── PERMISOS ────────────────────────────────────────────────────
    function canEdit() {
        try {
            const role = sessionStorage.getItem('user_role') || '';
            if (['admin', 'superadmin'].includes(role)) return true;
            const ovr = (window.dataManager?.sectionLevels || {})['catalogo-vehiculos'];
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

    function setModalMsg(msg, type) {
        const el = document.getElementById(`${PREFIX}-modal-msg`);
        if (!el) return;
        if (!msg) { el.className = 'd-none'; el.innerHTML = ''; return; }
        el.className = 'alert alert-' + (type || 'info') + ' mt-3 py-2';
        el.innerHTML = msg;
    }

    const fmtDate = (d) => {
        if (!d) return '—';
        try { const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}`; }
        catch (_) { return '—'; }
    };

    function estadoBadge(estado) {
        const map = {
            'Activo':            'bg-success',
            'Mantenimiento':     'bg-warning text-dark',
            'Baja':              'bg-danger',
        };
        const cls = map[estado] || 'bg-light text-dark';
        return `<span class="badge ${cls}">${estado || '—'}</span>`;
    }

    // ─── CARGA DE DATOS ──────────────────────────────────────────────
    async function loadAll() {
        const sb = await getClient();
        const { data, error } = await sb
            .from('catalogo_vehiculos')
            .select('*')
            .order('numero_economico', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    // ─── FILTROS / BÚSQUEDA ──────────────────────────────────────────
    function getFiltered() {
        const marca   = document.getElementById(`${PREFIX}-fil-marca`)?.value  || 'all';
        const tipo    = document.getElementById(`${PREFIX}-fil-tipo`)?.value   || 'all';
        const estado  = document.getElementById(`${PREFIX}-fil-estado`)?.value || 'all';
        const buscar  = (document.getElementById(`${PREFIX}-fil-buscar`)?.value || '').toLowerCase().trim();

        return _allData.filter(r => {
            if (marca  !== 'all' && r.marca        !== marca)  return false;
            if (tipo   !== 'all' && r.tipo_vehiculo !== tipo)  return false;
            if (estado !== 'all' && r.estado        !== estado) return false;
            if (buscar && ![r.codigo_aifa, r.numero_economico, r.marca, r.tipo_vehiculo, r.placas,
                            r.color, r.numero_serie, r.notas, r.estado]
                .some(v => String(v || '').toLowerCase().includes(buscar))) return false;
            return true;
        });
    }

    function getSorted(rows) {
        const dir = _sortDir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const va = String(a[_sortCol] ?? '').toLowerCase();
            const vb = String(b[_sortCol] ?? '').toLowerCase();
            return va < vb ? -dir : va > vb ? dir : 0;
        });
    }

    function getPage(rows) {
        const start = _currentPage * PAGE_SIZE;
        return rows.slice(start, start + PAGE_SIZE);
    }

    function populateFilters() {
        const marcas  = [...new Set(_allData.map(r => r.marca).filter(Boolean))].sort();
        const tipos   = [...new Set(_allData.map(r => r.tipo_vehiculo).filter(Boolean))].sort();
        const estados = [...new Set(_allData.map(r => r.estado).filter(Boolean))].sort();

        const fillSel = (id, opts) => {
            const el = document.getElementById(id);
            if (!el) return;
            const cur = el.value;
            el.innerHTML = `<option value="all">Todos</option>` +
                opts.map(o => `<option value="${o}">${o}</option>`).join('');
            if (opts.includes(cur)) el.value = cur;
        };
        fillSel(`${PREFIX}-fil-marca`,  marcas);
        fillSel(`${PREFIX}-fil-tipo`,   tipos);
        fillSel(`${PREFIX}-fil-estado`, estados);
    }

    // ─── KPIs ────────────────────────────────────────────────────────
    function renderKpis(rows) {
        const total    = rows.length;
        const activos  = rows.filter(r => r.estado === 'Activo').length;
        const tipos    = new Set(rows.map(r => r.tipo_vehiculo).filter(Boolean)).size;
        const marcas   = new Set(rows.map(r => r.marca).filter(Boolean)).size;

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set(`${PREFIX}-kpi-total`,   String(total));
        set(`${PREFIX}-kpi-activos`, String(activos));
        set(`${PREFIX}-kpi-tipos`,   String(tipos));
        set(`${PREFIX}-kpi-marcas`,  String(marcas));
    }

    // ─── TABLA ───────────────────────────────────────────────────────
    function renderTable(allFiltered) {
        const sorted   = getSorted(allFiltered);
        const page     = getPage(sorted);
        const tbody    = document.getElementById(`${PREFIX}-tbl-body`);
        const countEl  = document.getElementById(`${PREFIX}-tbl-count`);
        const pagEl    = document.getElementById(`${PREFIX}-pagination`);
        if (!tbody) return;

        const total = allFiltered.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

        if (countEl) countEl.textContent = `${total} vehículo${total !== 1 ? 's' : ''}`;

        // Corregir página fuera de rango
        if (_currentPage >= totalPages) _currentPage = totalPages - 1;

        if (!total) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-5">
                <i class="fas fa-car-side fa-2x d-block mb-2 opacity-25"></i>
                Sin vehículos para los filtros seleccionados.</td></tr>`;
            if (pagEl) pagEl.innerHTML = '';
            return;
        }

        const editable  = canEdit();
        const deletable = canDelete();

        tbody.innerHTML = page.map(r => `
            <tr class="${r.estado === 'Baja' ? 'opacity-60' : ''}">
                <td class="fw-semibold text-nowrap">${r.numero_economico || '—'}</td>
                <td>${r.marca || '—'}</td>
                <td class="small text-muted">${r.tipo_vehiculo || '—'}</td>
                <td class="text-center">${r.placas || '—'}</td>
                <td class="small">${r.color || '—'}</td>
                <td class="small">${r.combustible || '—'}</td>
                <td class="small">${r.transmision || '—'}</td>
                <td class="text-center">${estadoBadge(r.estado)}</td>
                <td class="text-center text-nowrap">
                    ${editable  ? `<button class="btn btn-xs btn-outline-primary  me-1 cv-btn-edit"   data-id="${r.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>` : ''}
                    ${deletable ? `<button class="btn btn-xs btn-outline-danger   cv-btn-delete" data-id="${r.id}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>` : ''}
                </td>
            </tr>`).join('');

        // Paginación
        if (pagEl) {
            const start = _currentPage * PAGE_SIZE;
            const end   = Math.min(start + PAGE_SIZE, total);
            const maxBtn = 7;
            let pages = '';
            for (let i = 0; i < totalPages; i++) {
                if (totalPages > maxBtn) {
                    if (i !== 0 && i !== totalPages - 1 && Math.abs(i - _currentPage) > 2) {
                        if (i === 1 || i === totalPages - 2) pages += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
                        continue;
                    }
                }
                pages += `<li class="page-item ${i === _currentPage ? 'active' : ''}">
                    <button class="page-link cv-page-btn" data-page="${i}">${i + 1}</button></li>`;
            }
            pagEl.innerHTML = `
                <nav>
                  <ul class="pagination pagination-sm mb-0 flex-wrap">
                    <li class="page-item ${_currentPage === 0 ? 'disabled' : ''}">
                        <button class="page-link cv-page-btn" data-page="${_currentPage - 1}">‹</button></li>
                    ${pages}
                    <li class="page-item ${_currentPage >= totalPages - 1 ? 'disabled' : ''}">
                        <button class="page-link cv-page-btn" data-page="${_currentPage + 1}">›</button></li>
                  </ul>
                </nav>
                <small class="text-muted ms-2">${start + 1}–${end} de ${total}</small>`;

            pagEl.querySelectorAll('.cv-page-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const p = parseInt(btn.dataset.page, 10);
                    if (p >= 0 && p < totalPages) { _currentPage = p; renderTable(allFiltered); }
                });
            });
        }

        // Ordenamiento — clic en cabeceras
        document.querySelectorAll(`#${PREFIX}-tbl thead th[data-sort]`).forEach(th => {
            th.style.cursor = 'pointer';
            const col = th.dataset.sort;
            th.innerHTML = th.dataset.label + (col === _sortCol
                ? ` <i class="fas fa-sort-${_sortDir === 'asc' ? 'up' : 'down'} ms-1 text-primary"></i>`
                : ` <i class="fas fa-sort ms-1 text-muted opacity-50"></i>`);
            th.addEventListener('click', () => {
                if (_sortCol === col) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
                else { _sortCol = col; _sortDir = 'asc'; }
                _currentPage = 0;
                renderTable(allFiltered);
            });
        });

        // Eventos editar/eliminar
        tbody.querySelectorAll('.cv-btn-edit').forEach(btn =>
            btn.addEventListener('click', () => openModal(String(btn.dataset.id))));
        tbody.querySelectorAll('.cv-btn-delete').forEach(btn =>
            btn.addEventListener('click', () => confirmDelete(String(btn.dataset.id))));
    }

    // ─── GRÁFICAS ────────────────────────────────────────────────────
    function destroyCharts() {
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    }

    function renderCharts(rows) {
        destroyCharts();
        if (!rows.length) return;

        // Chart 1: Por tipo de vehículo (doughnut)
        const c1 = document.getElementById(`${PREFIX}-chart-tipo`);
        if (c1) {
            const counts = {};
            rows.forEach(r => { const k = r.tipo_vehiculo || 'Sin tipo'; counts[k] = (counts[k] || 0) + 1; });
            const total = rows.length;
            const centerPlugin = {
                id: 'cvCenter1',
                beforeDraw(chart) {
                    const { ctx, chartArea: a } = chart;
                    if (!a) return;
                    const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
                    ctx.save();
                    ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#1e293b';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(total, cx, cy - 7);
                    ctx.font = '11px sans-serif'; ctx.fillStyle = '#64748b';
                    ctx.fillText('vehículos', cx, cy + 9);
                    ctx.restore();
                }
            };
            _charts.tipo = new Chart(c1, {
                type: 'doughnut', plugins: [centerPlugin],
                data: {
                    labels: Object.keys(counts),
                    datasets: [{ data: Object.values(counts), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }]
                },
                options: {
                    cutout: '60%', responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } },
                        datalabels: { display: false }
                    }
                }
            });
        }

        // Chart 2: Por marca (barras horizontales)
        const c2 = document.getElementById(`${PREFIX}-chart-marca`);
        if (c2) {
            const counts = {};
            rows.forEach(r => { const k = r.marca || 'Sin marca'; counts[k] = (counts[k] || 0) + 1; });
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
            _charts.marca = new Chart(c2, {
                type: 'bar',
                data: {
                    labels: sorted.map(([k]) => k),
                    datasets: [{ label: 'Unidades', data: sorted.map(([, v]) => v),
                        backgroundColor: COL.indigo + 'cc', borderColor: COL.indigo,
                        borderWidth: 1.5, borderRadius: 4, borderSkipped: false }]
                },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: true, anchor: 'end', align: 'right', font: { size: 11, weight: 'bold' }, color: '#374151' }
                    },
                    scales: {
                        x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
                        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
                    }
                }
            });
        }

        // Chart 3: Por combustible (donut)
        const c3 = document.getElementById(`${PREFIX}-chart-combustible`);
        if (c3) {
            const counts = {};
            rows.forEach(r => { const k = r.combustible || 'Sin especificar'; counts[k] = (counts[k] || 0) + 1; });
            _charts.combustible = new Chart(c3, {
                type: 'pie',
                data: {
                    labels: Object.keys(counts),
                    datasets: [{ data: Object.values(counts),
                        backgroundColor: [COL.green, COL.slate, COL.amber, COL.teal, COL.blue, COL.violet],
                        borderWidth: 2, borderColor: '#fff' }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } },
                        datalabels: { display: true, formatter: (val, ctx) => {
                            const pct = (val / ctx.dataset.data.reduce((a, b) => a + b, 0) * 100).toFixed(0);
                            return pct > 5 ? pct + '%' : '';
                        }, color: '#fff', font: { weight: 'bold', size: 11 } }
                    }
                }
            });
        }

        // Chart 4: Estado del parque vehicular (barras)
        const c4 = document.getElementById(`${PREFIX}-chart-estado`);
        if (c4) {
            const counts = {};
            ESTADOS.forEach(e => { counts[e] = 0; });
            rows.forEach(r => { const k = r.estado || 'Sin estado'; counts[k] = (counts[k] || 0) + 1; });
            const colorMap = { 'Activo': COL.green, 'Mantenimiento': COL.amber, 'Baja': COL.red };
            const labels = Object.keys(counts).filter(k => counts[k] > 0);
            _charts.estado = new Chart(c4, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: 'Vehículos', data: labels.map(k => counts[k]),
                        backgroundColor: labels.map(k => colorMap[k] || COL.slate),
                        borderRadius: 6, borderSkipped: false }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: true, anchor: 'end', align: 'top',
                            font: { size: 13, weight: 'bold' }, color: '#374151' }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    }

    // ─── RENDER PRINCIPAL ────────────────────────────────────────────
    async function renderAll() {
        setStatus('<i class="fas fa-spinner fa-spin me-1"></i>Cargando catálogo…', 'info');
        try {
            _allData = await loadAll();
            populateFilters();
            const filtered = getFiltered();
            renderKpis(filtered);
            renderTable(filtered);
            renderCharts(filtered);
            setStatus('', '');
        } catch (err) {
            console.error('[cv] renderAll error', err);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (err.message || err), 'danger');
        }
    }

    function renderFiltered() {
        _currentPage = 0;
        const filtered = getFiltered();
        renderKpis(filtered);
        renderTable(filtered);
        renderCharts(filtered);
    }

    // ─── VALIDACIONES ────────────────────────────────────────────────
    function validateForm() {
        const codigo  = document.getElementById(`${PREFIX}-f-codigo`)?.value?.trim();
        const numEco  = document.getElementById(`${PREFIX}-f-numeco`)?.value?.trim();
        const marca   = document.getElementById(`${PREFIX}-f-marca`)?.value?.trim();
        const tipo    = document.getElementById(`${PREFIX}-f-tipo`)?.value;
        const estado  = document.getElementById(`${PREFIX}-f-estado`)?.value;

        if (!codigo) return '⚠ El código AIFA es obligatorio.';
        if (!numEco) return '⚠ El número económico es obligatorio.';
        if (!marca)  return '⚠ La marca es obligatoria.';
        if (!tipo)   return '⚠ El tipo de vehículo es obligatorio.';
        if (!estado) return '⚠ El estado del vehículo es obligatorio.';

        // codigo_aifa tiene una restricción UNIQUE en la base de datos.
        const dupCodigo = _allData.find(r =>
            r.codigo_aifa?.trim().toLowerCase() === codigo.toLowerCase() &&
            String(r.id) !== String(_editId)
        );
        if (dupCodigo) return `⚠ Ya existe un vehículo con código AIFA "${codigo}".`;

        // Verificar duplicado (por numero_economico), excepto al editar el mismo
        const dup = _allData.find(r =>
            r.numero_economico?.trim().toLowerCase() === numEco.toLowerCase() &&
            String(r.id) !== String(_editId)
        );
        if (dup) return `⚠ Ya existe un vehículo con número económico "${numEco}".`;

        return null;
    }

    // ─── MODAL CRUD ──────────────────────────────────────────────────
    function buildSelectOptions(arr, selected) {
        return `<option value="">— Seleccionar —</option>` +
            arr.map(o => `<option value="${o}" ${o === selected ? 'selected' : ''}>${o}</option>`).join('');
    }

    function clearModal() {
        [`${PREFIX}-f-codigo`, `${PREFIX}-f-numeco`, `${PREFIX}-f-marca`, `${PREFIX}-f-tipo`,
         `${PREFIX}-f-placas`, `${PREFIX}-f-color`, `${PREFIX}-f-serie`,
         `${PREFIX}-f-combustible`, `${PREFIX}-f-transmision`,
         `${PREFIX}-f-estado`, `${PREFIX}-f-notas`
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        setModalMsg('', '');

        // Rellena selects con catálogo
        const selTipo    = document.getElementById(`${PREFIX}-f-tipo`);
        const selComb    = document.getElementById(`${PREFIX}-f-combustible`);
        const selTrans   = document.getElementById(`${PREFIX}-f-transmision`);
        const selEstado  = document.getElementById(`${PREFIX}-f-estado`);
        if (selTipo)   selTipo.innerHTML   = buildSelectOptions(TIPOS_VEHICULO, '');
        if (selComb)   selComb.innerHTML   = buildSelectOptions(COMBUSTIBLES,   '');
        if (selTrans)  selTrans.innerHTML  = buildSelectOptions(TRANSMISIONES,  '');
        if (selEstado) selEstado.innerHTML = buildSelectOptions(ESTADOS,        'Activo');
    }

    async function openModal(id) {
        _editId = id || null;
        clearModal();

        const titleEl = document.getElementById(`${PREFIX}-modal-title`);

        if (_editId) {
            if (titleEl) titleEl.textContent = 'Editar Vehículo';
            const rec = _allData.find(r => String(r.id) === String(_editId));
            if (!rec) return;

            const set = (elId, val) => {
                const el = document.getElementById(elId);
                if (el) el.value = val ?? '';
            };
            set(`${PREFIX}-f-codigo`,      rec.codigo_aifa);
            set(`${PREFIX}-f-numeco`,      rec.numero_economico);
            set(`${PREFIX}-f-marca`,       rec.marca);
            set(`${PREFIX}-f-placas`,      rec.placas);
            set(`${PREFIX}-f-color`,       rec.color);
            set(`${PREFIX}-f-serie`,       rec.numero_serie);
            set(`${PREFIX}-f-notas`,       rec.notas);

            // Selects con catálogo + valor actual
            const setOpts = (elId, arr, val) => {
                const el = document.getElementById(elId);
                if (!el) return;
                el.innerHTML = buildSelectOptions(arr, val);
                el.value = val || '';
            };
            setOpts(`${PREFIX}-f-tipo`,       TIPOS_VEHICULO, rec.tipo_vehiculo);
            setOpts(`${PREFIX}-f-combustible`, COMBUSTIBLES,  rec.combustible);
            setOpts(`${PREFIX}-f-transmision`, TRANSMISIONES, rec.transmision);
            setOpts(`${PREFIX}-f-estado`,      ESTADOS,       rec.estado);
        } else {
            if (titleEl) titleEl.textContent = 'Nuevo Vehículo';
        }

        try {
            const bsModal = new bootstrap.Modal(document.getElementById(`${PREFIX}-modal`));
            bsModal.show();
        } catch (_) {}
    }

    async function saveRecord() {
        const btn = document.getElementById(`${PREFIX}-modal-save`);
        try {
            if (!canEdit()) {
                setModalMsg('<i class="fas fa-lock me-1"></i>Sin permisos de edición.', 'danger');
                return;
            }

            const err = validateForm();
            if (err) { setModalMsg(err, 'warning'); return; }

            const payload = {
                codigo_aifa:      document.getElementById(`${PREFIX}-f-codigo`)?.value?.trim().toUpperCase() || null,
                numero_economico: document.getElementById(`${PREFIX}-f-numeco`)?.value?.trim()  || null,
                marca:            document.getElementById(`${PREFIX}-f-marca`)?.value?.trim()   || null,
                tipo_vehiculo:    document.getElementById(`${PREFIX}-f-tipo`)?.value           || null,
                placas:           document.getElementById(`${PREFIX}-f-placas`)?.value?.trim() || null,
                color:            document.getElementById(`${PREFIX}-f-color`)?.value?.trim()  || null,
                numero_serie:     document.getElementById(`${PREFIX}-f-serie`)?.value?.trim()  || null,
                combustible:      document.getElementById(`${PREFIX}-f-combustible`)?.value   || null,
                transmision:      document.getElementById(`${PREFIX}-f-transmision`)?.value   || null,
                estado:           document.getElementById(`${PREFIX}-f-estado`)?.value        || 'Activo',
                notas:            document.getElementById(`${PREFIX}-f-notas`)?.value?.trim() || null,
            };

            if (btn) btn.disabled = true;
            setModalMsg('<i class="fas fa-spinner fa-spin me-1"></i>Guardando…', 'info');

            const sb = await getClient();
            let dbErr;
            if (_editId) {
                ({ error: dbErr } = await sb.from('catalogo_vehiculos').update(payload).eq('id', _editId));
            } else {
                ({ error: dbErr } = await sb.from('catalogo_vehiculos').insert(payload));
            }
            if (dbErr) {
                if (dbErr.code === '23505' && String(dbErr.message || '').includes('codigo_aifa')) {
                    throw new Error('Ya existe un vehículo con ese código AIFA. Usa un código diferente.');
                }
                if (dbErr.code === '23514' && String(dbErr.message || '').includes('estado')) {
                    throw new Error('El estado seleccionado no es válido. Elige Activo, Mantenimiento o Baja.');
                }
                throw dbErr;
            }

            setModalMsg('<i class="fas fa-check-circle me-1"></i>Guardado correctamente.', 'success');
            setTimeout(async () => {
                try {
                    bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}-modal`))?.hide();
                } catch (_) {}
                await renderAll();
            }, 1100);
        } catch (err) {
            console.error('[cv] save', err);
            setModalMsg('<i class="fas fa-triangle-exclamation me-1"></i>' + (err.message || err), 'danger');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function confirmDelete(id) {
        if (!canDelete()) return;
        const rec = _allData.find(r => String(r.id) === String(id));
        const label = rec ? `${rec.numero_economico} — ${rec.marca || ''}` : `ID ${id}`;

        if (!confirm(`¿Eliminar el vehículo "${label}"?\nEsta acción no se puede deshacer.`)) return;

        try {
            const sb = await getClient();
            const { error } = await sb.from('catalogo_vehiculos').delete().eq('id', id);
            if (error) {
                // Detectar error de FK (vehículo referenciado en otro módulo)
                if (error.code === '23503') {
                    alert(`No se puede eliminar el vehículo "${label}" porque está referenciado en otros registros del sistema.`);
                } else {
                    throw error;
                }
                return;
            }
            await renderAll();
        } catch (err) {
            alert('Error al eliminar: ' + (err.message || err));
        }
    }

    // ─── EXPORTAR CSV ────────────────────────────────────────────────
    function exportCsv() {
        const rows = getFiltered();
        if (!rows.length) { alert('No hay vehículos para exportar.'); return; }
        const headers = ['No. Económico','Marca','Tipo','Placas','Color','No. Serie',
                         'Combustible','Transmisión','Estado','Notas','Creado'];
        const lines = [
            headers.join(','),
            ...rows.map(r => [
                `"${(r.numero_economico || '').replace(/"/g, '""')}"`,
                `"${(r.marca           || '').replace(/"/g, '""')}"`,
                `"${(r.tipo_vehiculo   || '').replace(/"/g, '""')}"`,
                `"${(r.placas         || '').replace(/"/g, '""')}"`,
                `"${(r.color          || '').replace(/"/g, '""')}"`,
                `"${(r.numero_serie   || '').replace(/"/g, '""')}"`,
                `"${(r.combustible    || '').replace(/"/g, '""')}"`,
                `"${(r.transmision    || '').replace(/"/g, '""')}"`,
                `"${(r.estado        || '').replace(/"/g, '""')}"`,
                `"${(r.notas         || '').replace(/"/g, '""')}"`,
                fmtDate(r.created_at),
            ].join(','))
        ];
        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `catalogo_vehiculos_${new Date().toISOString().slice(0,10)}.csv`,
        });
        a.click();
    }

    // ─── BINDINGS ────────────────────────────────────────────────────
    function wireUi() {
        if (_initOnce) return;
        _initOnce = true;

        // Filtros
        [`${PREFIX}-fil-marca`, `${PREFIX}-fil-tipo`, `${PREFIX}-fil-estado`].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', renderFiltered);
        });
        const buscarEl = document.getElementById(`${PREFIX}-fil-buscar`);
        if (buscarEl) buscarEl.addEventListener('input', renderFiltered);

        // Botones de cabecera
        const btnRefresh = document.getElementById(`${PREFIX}-refresh-btn`);
        if (btnRefresh) btnRefresh.addEventListener('click', renderAll);

        const btnAdd = document.getElementById(`${PREFIX}-add-btn`);
        if (btnAdd) {
            btnAdd.classList.toggle('d-none', !canEdit());
            btnAdd.addEventListener('click', () => openModal(null));
        }

        const btnCsv = document.getElementById(`${PREFIX}-csv-btn`);
        if (btnCsv) btnCsv.addEventListener('click', exportCsv);

        // Guardar modal
        const btnSave = document.getElementById(`${PREFIX}-modal-save`);
        if (btnSave) btnSave.addEventListener('click', saveRecord);
    }

    // ─── API PÚBLICA ─────────────────────────────────────────────────
    window.initCatalogoVehiculos = async function () {
        try {
            wireUi();
            await renderAll();
        } catch (e) {
            console.error('[cv] init error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (e.message || e), 'danger');
        }
    };

    window.catalogoVehiculosReload = renderAll;


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
    window.destroyCatalogoVehiculos = function () {
        try { destroyCharts(); } catch (_) {}
    };
})();
