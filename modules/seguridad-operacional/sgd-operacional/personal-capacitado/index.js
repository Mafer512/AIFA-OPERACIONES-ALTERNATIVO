// ===================================================================
//  GSO — Personal Capacitado Prestadores
//  Lee public.personal_capacitado (Supabase)
//  KPIs + 5 gráficas + tabla histórica con filtros + CRUD completo
//
//  API pública:
//    window.initPersonalCapacitadoPrestadores()  → inicializa / muestra
//    window.personalCapacitadoReload()           → recarga silenciosa
// ===================================================================
(function () {
    'use strict';

    const PREFIX = 'pc';   // prefijo para IDs del DOM

    const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                         'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const COL = {
        green:   '#16a34a',
        green2:  '#14532d',
        red:     '#dc2626',
        red2:    '#991b1b',
        blue:    '#2563eb',
        blue2:   '#1e3a8a',
        amber:   '#d97706',
        amber2:  '#92400e',
        teal:    '#0d9488',
        teal2:   '#134e4a',
        purple:  '#7c3aed',
        slate:   '#64748b',
    };

    const PALETTE = [COL.blue, COL.teal, COL.purple, COL.amber,
                     COL.green, '#0891b2', '#be185d', '#ca8a04'];

    // ─── CATÁLOGO DE TIPOS DE LICENCIA (DGAC / AIFA) ──────────────────
    // Fuente: Tabla de categorías de licencias de conductor de vehículos
    // en el aeródromo AIFA. Cada entrada puede consultarse, filtrarse y
    // reutilizarse en cualquier módulo a través de window.LICENCIAS_CATALOGO.
    const LICENCIAS_CATALOGO = [
        {
            categoria:  'A',
            nombre:     'Tipo "A" Vehículos ligeros',
            area:       'Área de plataforma (lado aire) — zonas de bajo riesgo, accesos perimetrales y vialidades internas del aeródromo',
            personal:   'Personal administrativo, supervisores de rampa, coordinadores de operaciones, vigilancia y seguridad aeroportuaria',
            vehiculos:  'Automóviles, camionetas pick-up, vehículos utilitarios ligeros sin equipo especializado de rampa',
        },
        {
            categoria:  'B',
            nombre:     'Tipo "B" Vehículos especializados',
            area:       'Plataforma y zonas de servicio a aeronaves (lado aire) — áreas con tránsito directo de aeronaves, equipos de carga y servicio',
            personal:   'Técnicos de mantenimiento aeronáutico, operadores de rampa, agentes de carga, personal de abastecimiento de combustible, tripulaciones de cabina de carga',
            vehiculos:  'Vehículos especializados de rampa: bandas transportadoras, escaleras de embarque, GPU (ground power units), cargadores de contenedores, camiones cisterna de combustible, push-back de ala',
        },
        {
            categoria:  'C',
            nombre:     'Tipo "C" Área de maniobras',
            area:       'Área de movimiento completa: pistas de aterrizaje/despegue, calles de rodaje y plataforma — zona de máximo control operacional',
            personal:   'Controladores de tránsito aéreo (TWR/APP), inspectores de aeródromo, pilotos en servicio, personal de rescate y extinción de incendios (ARFF), inspectores de la DGAC',
            vehiculos:  'Vehículos de inspección de pista, camiones ARFF (contra-incendio), vehículos Follow-Me, ambulancias aeroportuarias, equipos de remoción de obstáculos (FOD)',
        },
        {
            categoria:  'BR',
            nombre:     'Tipo "BR" Vehículos para remolques en rodajes',
            area:       'Plataforma y calles de rodaje habilitadas para maniobras de remolque de aeronaves',
            personal:   'Operadores certificados de equipos de remolque, mecánicos de línea con habilitación de towing, supervisores de operaciones de plataforma con certificación especial',
            vehiculos:  'Tractores de remolque (towbarless y con barra de tiro), vehículos push-back de aeronaves de fuselaje estrecho y ancho',
        },
    ];

    // Expose catalog globally for use in other modules
    window.LICENCIAS_CATALOGO = LICENCIAS_CATALOGO;

    // Helper: returns the catalog entry for a given tipo_licencia value
    window.getLicenciaInfo = function (tipoNombre) {
        return LICENCIAS_CATALOGO.find(l => l.nombre === tipoNombre) || null;
    };

    // Short list of names for selects/dropdowns
    const TIPOS_LICENCIA_OPTS = LICENCIAS_CATALOGO.map(l => l.nombre);

    // ─── state ──────────────────────────────────────────────────────
    let _charts   = {};
    let _initOnce = false;
    let _allData  = [];
    let _editId   = null;   // id del registro en edición (null = nuevo)

    // ─── helpers ────────────────────────────────────────────────────
    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') {
            return await window.ensureSupabaseClient();
        }
        throw new Error('Cliente de Supabase no disponible');
    }

    function canEdit() {
        try {
            const role = sessionStorage.getItem('user_role') || '';
            if (['admin', 'superadmin'].includes(role)) return true;
            const ovr = (window.dataManager?.sectionLevels || {})['personal-capacitado-prestadores'];
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

    function setStatus(msg, type) {
        const el = document.getElementById(`${PREFIX}-status`);
        if (!el) return;
        if (!msg) { el.classList.add('d-none'); el.innerHTML = ''; return; }
        el.classList.remove('d-none', 'alert-info', 'alert-warning', 'alert-danger', 'alert-success');
        el.classList.add('alert-' + (type || 'info'));
        el.innerHTML = msg;
    }

    const fmt1  = (n) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const fmtDate = (d) => {
        if (!d) return '—';
        try { const [y, m, day] = String(d).split('-'); return `${day}/${m}/${y}`; }
        catch (_) { return String(d); }
    };
    const today = () => new Date().toISOString().slice(0, 10);

    // ─── DATA ────────────────────────────────────────────────────────
    async function loadAll() {
        const sb = await getClient();
        const { data, error } = await sb
            .from('personal_capacitado')
            .select('*')
            .order('fecha_curso', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    // ─── FILTROS ────────────────────────────────────────────────────
    function getFiltered() {
        const empresa   = document.getElementById(`${PREFIX}-fil-empresa`)?.value  || 'all';
        const estatus   = document.getElementById(`${PREFIX}-fil-estatus`)?.value  || 'all';
        const licencia  = document.getElementById(`${PREFIX}-fil-licencia`)?.value || 'all';
        const buscar    = (document.getElementById(`${PREFIX}-fil-buscar`)?.value  || '').toLowerCase().trim();

        return _allData.filter(r => {
            if (empresa  !== 'all' && r.empresa        !== empresa)   return false;
            if (estatus  !== 'all' && r.estatus         !== estatus)   return false;
            if (licencia !== 'all' && r.tipo_licencia   !== licencia)  return false;
            if (buscar && ![r.nombre, r.puesto, r.empresa, r.estatus]
                .some(v => String(v || '').toLowerCase().includes(buscar))) return false;
            return true;
        });
    }

    // ─── KPIs ────────────────────────────────────────────────────────
    function renderKpis(rows) {
        const total      = rows.length;
        const aprobados  = rows.filter(r => r.estatus === 'Aprobado').length;
        const pctAprob   = total > 0 ? (100 * aprobados / total) : 0;
        const califs     = rows.map(r => Number(r.calificacion)).filter(v => !isNaN(v) && v > 0);
        const avgCalif   = califs.length ? califs.reduce((a, b) => a + b, 0) / califs.length : 0;
        const empresas   = new Set(rows.map(r => r.empresa).filter(Boolean)).size;
        const hoy        = new Date();
        const en6m       = new Date(hoy); en6m.setMonth(en6m.getMonth() + 6);
        const proxVencer = rows.filter(r => {
            if (!r.vigencia_curso) return false;
            const v = new Date(r.vigencia_curso);
            return v >= hoy && v <= en6m;
        }).length;

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set(`${PREFIX}-kpi-total`,       String(total));
        set(`${PREFIX}-kpi-aprobados`,   `${pctAprob.toFixed(1)}%`);
        set(`${PREFIX}-kpi-calificacion`, avgCalif > 0 ? fmt1(avgCalif) : '—');
        set(`${PREFIX}-kpi-empresas`,    String(empresas));
        set(`${PREFIX}-kpi-vencer`,      String(proxVencer));
    }

    // ─── TABLA ───────────────────────────────────────────────────────
    function renderTable(rows) {
        const tbody    = document.getElementById(`${PREFIX}-tbl-body`);
        const countEl  = document.getElementById(`${PREFIX}-tbl-count`);
        if (!tbody) return;
        if (countEl) countEl.textContent = `${rows.length} registro${rows.length !== 1 ? 's' : ''}`;
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">Sin registros para los filtros seleccionados.</td></tr>`;
            return;
        }
        const editable = canEdit();
        const deletable = canDelete();
        tbody.innerHTML = rows.map(r => {
            const hoy     = new Date();
            const vigDate = r.vigencia_curso ? new Date(r.vigencia_curso) : null;
            const en6m    = new Date(hoy); en6m.setMonth(en6m.getMonth() + 6);
            let vigClass = '';
            if (vigDate) {
                if (vigDate < hoy)         vigClass = 'text-danger fw-semibold';
                else if (vigDate <= en6m)  vigClass = 'text-warning fw-semibold';
            }
            const estatusBadge = r.estatus === 'Aprobado'
                ? `<span class="badge bg-success">${r.estatus}</span>`
                : `<span class="badge bg-danger">${r.estatus || '—'}</span>`;
            const calif = r.calificacion != null ? Number(r.calificacion).toFixed(1) : '—';
            const califClass = r.calificacion >= 8 ? 'text-success fw-bold' : r.calificacion >= 7 ? 'text-warning fw-semibold' : 'text-danger fw-semibold';
            return `<tr>
                <td class="text-nowrap">${fmtDate(r.fecha_curso)}</td>
                <td class="text-nowrap ${vigClass}">${fmtDate(r.vigencia_curso)}</td>
                <td>${r.nombre || '—'}</td>
                <td class="text-muted small">${r.empresa || '—'}</td>
                <td class="text-muted small">${r.puesto || '—'}</td>
                <td class="small">${r.tipo_licencia || '—'}</td>
                <td class="text-center">${estatusBadge}</td>
                <td class="text-end ${califClass}">${calif}</td>
                <td class="text-center text-nowrap">
                    ${editable  ? `<button class="btn btn-xs btn-outline-primary me-1 pc-btn-edit"   data-id="${r.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>` : ''}
                    ${deletable ? `<button class="btn btn-xs btn-outline-danger  pc-btn-delete" data-id="${r.id}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');

        // Bind edit/delete row buttons
        tbody.querySelectorAll('.pc-btn-edit').forEach(btn => {
            btn.addEventListener('click', () => openModal(Number(btn.dataset.id)));
        });
        tbody.querySelectorAll('.pc-btn-delete').forEach(btn => {
            btn.addEventListener('click', () => confirmDelete(Number(btn.dataset.id)));
        });
    }

    // ─── CHARTS ──────────────────────────────────────────────────────
    function destroyCharts() {
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    }

    function vGrad(ctx, chartArea, c1, c2) {
        if (!chartArea) return c1;
        const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
        g.addColorStop(0, c2 + 'aa');
        g.addColorStop(1, c1);
        return g;
    }

    const baseTooltip = {
        backgroundColor: 'rgba(15,23,42,.93)',
        titleColor: '#fff', bodyColor: '#e2e8f0',
        titleFont: { weight: '700', size: 13 },
        bodyFont: { size: 12 }, padding: 12, cornerRadius: 10,
        displayColors: true, boxPadding: 4,
        borderColor: 'rgba(255,255,255,.08)', borderWidth: 1
    };
    const baseScales = {
        y: {
            beginAtZero: true, grace: '12%',
            grid: { color: '#eef2f7', drawBorder: false },
            border: { display: false },
            ticks: { color: '#64748b', font: { size: 11, weight: '600' }, maxTicksLimit: 6 }
        },
        x: {
            grid: { display: false, drawBorder: false },
            border: { display: false },
            ticks: { color: '#475569', font: { size: 11, weight: '700' } }
        }
    };

    function renderCharts(rows) {
        if (typeof Chart === 'undefined') return;
        destroyCharts();
        Chart.defaults.font.family = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
        Chart.defaults.color = '#475569';

        // Datos base
        const totalRows  = rows.length;
        const aprobados  = rows.filter(r => r.estatus === 'Aprobado').length;
        const reprobados = rows.filter(r => r.estatus === 'Reprobado').length;

        /* ── 1. Donut — Estatus ── */
        const c1 = document.getElementById(`${PREFIX}-chart-estatus`);
        if (c1) {
            _charts.estatus = new Chart(c1, {
                type: 'doughnut',
                data: {
                    labels: ['Aprobado', 'Reprobado'],
                    datasets: [{
                        data: [aprobados, reprobados],
                        backgroundColor: [COL.green, COL.red],
                        borderColor: '#fff', borderWidth: 3, hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '62%',
                    animation: { animateRotate: true, duration: 800 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 11, boxHeight: 11, usePointStyle: true,
                                      pointStyle: 'circle', color: '#0f172a',
                                      font: { weight: '700', size: 11 }, padding: 12 }
                        },
                        tooltip: { ...baseTooltip,
                            callbacks: {
                                label: ctx => {
                                    const pct = totalRows > 0 ? (100 * ctx.parsed / totalRows) : 0;
                                    return `  ${ctx.label}: ${ctx.parsed}  ·  ${pct.toFixed(1)}%`;
                                }
                            }
                        },
                        datalabels: {
                            color: '#fff', font: { weight: '800', size: 12 },
                            textStrokeColor: 'rgba(15,23,42,.5)', textStrokeWidth: 3,
                            display: ctx => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
                            formatter: (v) => {
                                const pct = totalRows > 0 ? (100 * v / totalRows) : 0;
                                return pct >= 8 ? pct.toFixed(0) + '%' : '';
                            }
                        }
                    }
                }
            });
        }

        /* ── 2. Barras apiladas — Empresa × Estatus ── */
        const empresaSet = [...new Set(rows.map(r => r.empresa).filter(Boolean))].sort();
        const empAprob   = empresaSet.map(e => rows.filter(r => r.empresa === e && r.estatus === 'Aprobado').length);
        const empRepro   = empresaSet.map(e => rows.filter(r => r.empresa === e && r.estatus === 'Reprobado').length);
        const c2 = document.getElementById(`${PREFIX}-chart-empresa`);
        if (c2) {
            _charts.empresa = new Chart(c2, {
                type: 'bar',
                data: {
                    labels: empresaSet.map(e => e.length > 22 ? e.slice(0, 20) + '…' : e),
                    datasets: [
                        { label: 'Aprobado',  data: empAprob, backgroundColor: COL.green, borderRadius: { topLeft: 6, topRight: 6 }, stack: 'est' },
                        { label: 'Reprobado', data: empRepro, backgroundColor: COL.red,   borderRadius: { topLeft: 6, topRight: 6 }, stack: 'est' }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: { duration: 700, easing: 'easeOutQuart' },
                    plugins: {
                        legend: {
                            position: 'top', align: 'end',
                            labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true,
                                      font: { weight: '700', size: 11 }, padding: 12 }
                        },
                        tooltip: { ...baseTooltip,
                            callbacks: { label: ctx => `  ${ctx.dataset.label}: ${ctx.parsed.y}` }
                        },
                        datalabels: {
                            anchor: 'center', align: 'center',
                            color: '#fff', font: { weight: '800', size: 11 },
                            display: ctx => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
                            formatter: v => v
                        }
                    },
                    scales: { ...baseScales, x: { ...baseScales.x, stacked: true }, y: { ...baseScales.y, stacked: true, ticks: { ...baseScales.y.ticks, stepSize: 1 } } }
                }
            });
        }

        /* ── 3. Barras — Calificación promedio por empresa ── */
        const avgEmpresa = empresaSet.map(e => {
            const califs = rows.filter(r => r.empresa === e && r.calificacion != null)
                               .map(r => Number(r.calificacion));
            return califs.length ? califs.reduce((a, b) => a + b, 0) / califs.length : 0;
        });
        const c3 = document.getElementById(`${PREFIX}-chart-calificacion`);
        if (c3) {
            _charts.calificacion = new Chart(c3, {
                type: 'bar',
                data: {
                    labels: empresaSet.map(e => e.length > 22 ? e.slice(0, 20) + '…' : e),
                    datasets: [{
                        label: 'Calificación promedio',
                        data: avgEmpresa.map(v => +v.toFixed(2)),
                        backgroundColor: ctx => {
                            const v = avgEmpresa[ctx.dataIndex];
                            return v >= 8 ? COL.blue : v >= 7 ? COL.amber : COL.red;
                        },
                        borderRadius: 8, borderSkipped: false, barPercentage: .55
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: { duration: 700, easing: 'easeOutQuart' },
                    layout: { padding: { top: 20 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: { ...baseTooltip,
                            callbacks: { label: ctx => `  Promedio: ${ctx.parsed.y.toFixed(1)}` }
                        },
                        datalabels: {
                            anchor: 'end', align: 'top', offset: 2, clip: false,
                            color: '#0f172a', font: { weight: '800', size: 12 },
                            display: ctx => avgEmpresa[ctx.dataIndex] > 0,
                            formatter: v => v.toFixed(1)
                        }
                    },
                    scales: {
                        ...baseScales,
                        y: { ...baseScales.y, min: 0, max: 10, ticks: { ...baseScales.y.ticks, stepSize: 2 } }
                    }
                }
            });
        }

        /* ── 4. Donut — Tipo de licencia ── */
        const licSet  = [...new Set(rows.map(r => r.tipo_licencia).filter(Boolean))].sort();
        const licData = licSet.map(l => rows.filter(r => r.tipo_licencia === l).length);
        const licTotal = licData.reduce((a, b) => a + b, 0);
        const c4 = document.getElementById(`${PREFIX}-chart-licencia`);
        if (c4) {
            _charts.licencia = new Chart(c4, {
                type: 'doughnut',
                data: {
                    labels: licSet.map(l => l.replace('Tipo ', '').replace(' Vehículos', ' Veh.')),
                    datasets: [{
                        data: licData,
                        backgroundColor: [COL.blue, COL.teal, COL.purple, COL.amber],
                        borderColor: '#fff', borderWidth: 3, hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '58%',
                    animation: { animateRotate: true, duration: 800 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 11, boxHeight: 11, usePointStyle: true,
                                      pointStyle: 'circle', color: '#0f172a',
                                      font: { weight: '700', size: 10 }, padding: 10 }
                        },
                        tooltip: { ...baseTooltip,
                            callbacks: {
                                label: ctx => {
                                    const pct = licTotal > 0 ? (100 * ctx.parsed / licTotal) : 0;
                                    return `  ${ctx.parsed} personas  ·  ${pct.toFixed(1)}%`;
                                }
                            }
                        },
                        datalabels: {
                            color: '#fff', font: { weight: '800', size: 11 },
                            textStrokeColor: 'rgba(15,23,42,.5)', textStrokeWidth: 3,
                            display: ctx => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
                            formatter: (v) => {
                                const pct = licTotal > 0 ? (100 * v / licTotal) : 0;
                                return pct >= 8 ? pct.toFixed(0) + '%' : '';
                            }
                        }
                    }
                }
            });
        }

        /* ── 5. Barras — Cursos por mes ── */
        const mesMap = {};
        rows.forEach(r => {
            if (!r.fecha_curso) return;
            const key = r.fecha_curso.slice(0, 7); // YYYY-MM
            mesMap[key] = (mesMap[key] || 0) + 1;
        });
        const mesKeys = Object.keys(mesMap).sort();
        const mesLabels = mesKeys.map(k => {
            const [y, m] = k.split('-');
            return MESES_SHORT[(Number(m) - 1)] + ' ' + y.slice(2);
        });
        const mesData = mesKeys.map(k => mesMap[k]);
        const c5 = document.getElementById(`${PREFIX}-chart-timeline`);
        if (c5) {
            _charts.timeline = new Chart(c5, {
                type: 'bar',
                data: {
                    labels: mesLabels,
                    datasets: [{
                        label: 'Cursos impartidos',
                        data: mesData,
                        backgroundColor: ctx => vGrad(ctx.chart.ctx, ctx.chart.chartArea, COL.teal, COL.teal2),
                        hoverBackgroundColor: COL.teal,
                        borderRadius: 8, borderSkipped: false, barPercentage: .6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: { duration: 700, easing: 'easeOutQuart' },
                    layout: { padding: { top: 18 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: { ...baseTooltip,
                            callbacks: { label: ctx => `  Cursos: ${ctx.parsed.y}` }
                        },
                        datalabels: {
                            anchor: 'end', align: 'top', offset: 2, clip: false,
                            color: COL.teal2, font: { weight: '800', size: 11.5 },
                            display: ctx => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
                            formatter: v => v
                        }
                    },
                    scales: {
                        ...baseScales,
                        y: { ...baseScales.y, grace: '20%', ticks: { ...baseScales.y.ticks, stepSize: 1 } }
                    }
                }
            });
        }
    }

    // ─── POPULATE SELECTS ────────────────────────────────────────────
    function populateFilters() {
        const empresas  = [...new Set(_allData.map(r => r.empresa).filter(Boolean))].sort();
        const licencias = [...new Set(_allData.map(r => r.tipo_licencia).filter(Boolean))].sort();

        const filEmpresa  = document.getElementById(`${PREFIX}-fil-empresa`);
        const filLicencia = document.getElementById(`${PREFIX}-fil-licencia`);
        if (filEmpresa) {
            const cur = filEmpresa.value;
            filEmpresa.innerHTML = '<option value="all">Todas las empresas</option>' +
                empresas.map(e => `<option value="${e}">${e}</option>`).join('');
            if (cur && cur !== 'all') filEmpresa.value = cur;
        }
        if (filLicencia) {
            const cur = filLicencia.value;
            filLicencia.innerHTML = '<option value="all">Todos los tipos</option>' +
                licencias.map(l => `<option value="${l}">${l}</option>`).join('');
            if (cur && cur !== 'all') filLicencia.value = cur;
        }

        // Populate datalist for company autocomplete in modal form
        const dl = document.getElementById('pc-empresa-list');
        if (dl) {
            dl.innerHTML = empresas.map(e => `<option value="${e}"></option>`).join('');
        }
    }

    // ─── RENDER PRINCIPAL ────────────────────────────────────────────
    async function renderAll() {
        try {
            setStatus('<i class="fas fa-spinner fa-spin me-1"></i>Cargando datos de Supabase…', 'info');
            _allData = await loadAll();
            populateFilters();
            const filtered = getFiltered();
            renderKpis(filtered);
            renderTable(filtered);
            renderCharts(filtered);
            setStatus('');
            // Mostrar/ocultar botón según permisos
            const addBtn = document.getElementById(`${PREFIX}-add-btn`);
            if (addBtn) addBtn.classList.toggle('d-none', !canEdit());
        } catch (e) {
            console.error('[personal-capacitado] render error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>Error al cargar: ' + (e.message || e), 'danger');
        }
    }

    function onFilterChange() {
        const filtered = getFiltered();
        renderKpis(filtered);
        renderTable(filtered);
        renderCharts(filtered);
    }

    // ─── MODAL ADD / EDIT ─────────────────────────────────────────────
    function buildLicenciaOptions(selected) {
        return '<option value="">— Selecciona —</option>' +
            TIPOS_LICENCIA_OPTS.map(n =>
                `<option value="${n}" ${n === selected ? 'selected' : ''}>${n}</option>`
            ).join('');
    }

    function updateLicenciaInfo(val) {
        const infoEl = document.getElementById('pc-f-licencia-info');
        if (!infoEl) return;
        const lic = LICENCIAS_CATALOGO.find(l => l.nombre === val);
        if (!lic) { infoEl.classList.add('d-none'); return; }
        infoEl.classList.remove('d-none');
        infoEl.innerHTML = `
            <div class="row g-2 mt-1" style="font-size:.8rem;">
                <div class="col-12 col-sm-6">
                    <div class="fw-semibold text-muted text-uppercase" style="font-size:.65rem;letter-spacing:.05em;">
                        <i class="fas fa-map-marker-alt me-1 text-danger"></i>Área autorizada
                    </div>
                    <div class="mt-1">${lic.area}</div>
                </div>
                <div class="col-12 col-sm-6">
                    <div class="fw-semibold text-muted text-uppercase" style="font-size:.65rem;letter-spacing:.05em;">
                        <i class="fas fa-user-check me-1 text-primary"></i>Ejemplo de personal autorizado
                    </div>
                    <div class="mt-1">${lic.personal}</div>
                </div>
                <div class="col-12">
                    <div class="fw-semibold text-muted text-uppercase" style="font-size:.65rem;letter-spacing:.05em;">
                        <i class="fas fa-truck me-1 text-success"></i>Tipo de vehículo autorizado
                    </div>
                    <div class="mt-1">${lic.vehiculos}</div>
                </div>
            </div>`;
    }

    function openModal(id) {
        if (!canEdit()) return;
        _editId = id || null;
        const titleEl = document.getElementById(`${PREFIX}-modal-title`);
        if (titleEl) titleEl.textContent = _editId ? 'Editar Registro' : 'Nuevo Registro';

        // Limpiar
        ['pc-f-nombre','pc-f-empresa','pc-f-puesto','pc-f-licencia',
         'pc-f-fecha','pc-f-vigencia','pc-f-calificacion','pc-f-estatus'].forEach(fid => {
            const el = document.getElementById(fid);
            if (el) el.value = '';
        });

        // Rellenar select de licencia con catálogo actualizado
        const selLic = document.getElementById('pc-f-licencia');
        if (selLic) selLic.innerHTML = buildLicenciaOptions('');

        // Ocultar panel de info
        updateLicenciaInfo('');

        // Pre-llenar si es edición
        if (_editId) {
            const row = _allData.find(r => r.id === _editId);
            if (row) {
                const set = (fid, v) => { const el = document.getElementById(fid); if (el) el.value = v || ''; };
                set('pc-f-nombre',      row.nombre);
                set('pc-f-empresa',     row.empresa);
                set('pc-f-puesto',      row.puesto);
                set('pc-f-licencia',    row.tipo_licencia);
                set('pc-f-fecha',       row.fecha_curso);
                set('pc-f-vigencia',    row.vigencia_curso);
                set('pc-f-calificacion', row.calificacion != null ? row.calificacion : '');
                set('pc-f-estatus',     row.estatus);
                updateLicenciaInfo(row.tipo_licencia || '');
            }
        } else {
            // Fecha de hoy como default
            const fechaEl = document.getElementById('pc-f-fecha');
            if (fechaEl) fechaEl.value = today();
            autoCalcVigencia();
        }

        const msgEl = document.getElementById(`${PREFIX}-modal-msg`);
        if (msgEl) { msgEl.innerHTML = ''; msgEl.className = ''; }

        const modal = document.getElementById(`${PREFIX}-modal`);
        if (modal) bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    function autoCalcVigencia() {
        const fechaEl = document.getElementById('pc-f-fecha');
        const vigEl   = document.getElementById('pc-f-vigencia');
        if (!fechaEl || !vigEl || vigEl.value) return;
        try {
            const d = new Date(fechaEl.value);
            if (isNaN(d)) return;
            d.setFullYear(d.getFullYear() + 2);
            vigEl.value = d.toISOString().slice(0, 10);
        } catch (_) {}
    }

    async function saveRecord() {
        const msgEl = document.getElementById(`${PREFIX}-modal-msg`);
        const btn   = document.getElementById(`${PREFIX}-modal-save`);
        try {
            if (!canEdit()) {
                if (msgEl) { msgEl.className = 'alert alert-danger mt-2 py-2'; msgEl.innerHTML = '<i class="fas fa-lock me-1"></i>Sin permisos de edición.'; }
                return;
            }
            const nombre     = document.getElementById('pc-f-nombre')?.value?.trim();
            const empresa    = document.getElementById('pc-f-empresa')?.value?.trim();
            const puesto     = document.getElementById('pc-f-puesto')?.value?.trim();
            const licencia   = document.getElementById('pc-f-licencia')?.value?.trim();
            const fecha      = document.getElementById('pc-f-fecha')?.value?.trim();
            const vigencia   = document.getElementById('pc-f-vigencia')?.value?.trim();
            const califRaw   = document.getElementById('pc-f-calificacion')?.value;
            const estatus    = document.getElementById('pc-f-estatus')?.value?.trim();

            if (!nombre || !empresa || !fecha || !estatus) {
                if (msgEl) { msgEl.className = 'alert alert-warning mt-2 py-2'; msgEl.innerHTML = '<i class="fas fa-triangle-exclamation me-1"></i>Nombre, empresa, fecha y estatus son obligatorios.'; }
                return;
            }

            const payload = {
                nombre,
                empresa,
                puesto:         puesto   || null,
                tipo_licencia:  licencia || null,
                fecha_curso:    fecha,
                vigencia_curso: vigencia || null,
                calificacion:   califRaw !== '' && califRaw != null ? Number(califRaw) : null,
                estatus
            };

            if (btn) btn.disabled = true;
            if (msgEl) { msgEl.className = 'alert alert-info mt-2 py-2'; msgEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Guardando…'; }

            const sb = await getClient();
            let error;
            if (_editId) {
                ({ error } = await sb.from('personal_capacitado').update(payload).eq('id', _editId));
            } else {
                ({ error } = await sb.from('personal_capacitado').insert(payload));
            }
            if (error) throw error;

            if (msgEl) { msgEl.className = 'alert alert-success mt-2 py-2'; msgEl.innerHTML = '<i class="fas fa-check-circle me-1"></i>Registro guardado correctamente.'; }

            setTimeout(async () => {
                try {
                    const bsModal = bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}-modal`));
                    if (bsModal) bsModal.hide();
                } catch (_) {}
                await renderAll();
            }, 1000);
        } catch (err) {
            console.error('[personal-capacitado] save error', err);
            if (msgEl) { msgEl.className = 'alert alert-danger mt-2 py-2'; msgEl.innerHTML = '<i class="fas fa-triangle-exclamation me-1"></i>' + (err.message || err); }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ─── ELIMINAR ─────────────────────────────────────────────────────
    async function confirmDelete(id) {
        if (!canDelete()) return;
        const row = _allData.find(r => r.id === id);
        if (!row) return;
        const confirmed = window.confirm(`¿Eliminar el registro de "${row.nombre}"?\nEsta acción no se puede deshacer.`);
        if (!confirmed) return;
        try {
            setStatus('<i class="fas fa-spinner fa-spin me-1"></i>Eliminando…', 'info');
            const sb = await getClient();
            const { error } = await sb.from('personal_capacitado').delete().eq('id', id);
            if (error) throw error;
            setStatus('<i class="fas fa-check-circle me-1"></i>Registro eliminado.', 'success');
            setTimeout(() => { setStatus(''); renderAll(); }, 1200);
        } catch (err) {
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (err.message || err), 'danger');
        }
    }

    // ─── EXPORT CSV ──────────────────────────────────────────────────
    function exportCsv() {
        const filtered = getFiltered();
        if (!filtered.length) return;
        const cols = ['id', 'nombre', 'empresa', 'puesto', 'tipo_licencia', 'fecha_curso', 'vigencia_curso', 'calificacion', 'estatus'];
        const header = ['#', 'Nombre', 'Empresa', 'Puesto', 'Tipo Licencia', 'Fecha Curso', 'Vigencia', 'Calificación', 'Estatus'];
        const rows = filtered.map(r => cols.map(c => `"${(r[c] ?? '').toString().replace(/"/g, '""')}"`).join(','));
        const csv = [header.join(','), ...rows].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'personal_capacitado.csv'; a.click();
        URL.revokeObjectURL(url);
    }

    // ─── BINDINGS ────────────────────────────────────────────────────
    function wireUi() {
        if (_initOnce) return;
        _initOnce = true;

        const addBtn = document.getElementById(`${PREFIX}-add-btn`);
        if (addBtn) addBtn.addEventListener('click', () => openModal(null));

        const refreshBtn = document.getElementById(`${PREFIX}-refresh-btn`);
        if (refreshBtn) refreshBtn.addEventListener('click', renderAll);

        const saveBtn = document.getElementById(`${PREFIX}-modal-save`);
        if (saveBtn) saveBtn.addEventListener('click', saveRecord);

        const exportBtn = document.getElementById(`${PREFIX}-export-btn`);
        if (exportBtn) exportBtn.addEventListener('click', exportCsv);

        // Filtros
        [`${PREFIX}-fil-empresa`, `${PREFIX}-fil-estatus`, `${PREFIX}-fil-licencia`].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', onFilterChange);
        });
        const buscar = document.getElementById(`${PREFIX}-fil-buscar`);
        if (buscar) buscar.addEventListener('input', onFilterChange);

        // Auto-calcular vigencia (fecha + 2 años)
        const fechaEl = document.getElementById('pc-f-fecha');
        if (fechaEl) fechaEl.addEventListener('change', autoCalcVigencia);

        // Mostrar detalle del tipo de licencia al cambiar el select
        const selLic = document.getElementById('pc-f-licencia');
        if (selLic) selLic.addEventListener('change', () => updateLicenciaInfo(selLic.value));

        // Animar ícono del panel catálogo de licencias
        const catEl   = document.getElementById('pc-licencias-cat');
        const catIcon = document.getElementById('pc-licencias-cat-icon');
        if (catEl && catIcon) {
            catEl.addEventListener('show.bs.collapse',  () => catIcon.style.transform = 'rotate(180deg)');
            catEl.addEventListener('hide.bs.collapse',  () => catIcon.style.transform = 'rotate(0deg)');
        }
    }

    // ─── API PÚBLICA ─────────────────────────────────────────────────
    window.initPersonalCapacitadoPrestadores = async function () {
        try {
            wireUi();
            await renderAll();
        } catch (e) {
            console.error('[personal-capacitado] init error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (e.message || e), 'danger');
        }
    };

    window.personalCapacitadoReload = renderAll;


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
    window.destroyPersonalCapacitadoPrestadores = function () {
        try { destroyCharts(); } catch (_) {}
    };
})();
