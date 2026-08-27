// ===================================================================
//  Ingeniería Civil — ETP · Vidrios y Filtraciones
//  Lee public.vidrios_etp y public.filtraciones_etp (Supabase)
//  KPIs + gráficas + tablas + captura/edición por cada tema.
//
//  API pública:
//    window.initIngenieriaCivil()    → inicializa (showSection hook)
//    window.ingenieriaCivilReload()  → recarga silenciosa
// ===================================================================
(function () {
    'use strict';

    const T_VID = 'vidrios_etp';
    const T_FIL = 'filtraciones_etp';

    const COL = {
        blue:   '#2563eb', blue2:  '#1e3a8a',
        cyan:   '#0891b2', cyan2:  '#155e75',
        green:  '#16a34a', green2: '#14532d',
        amber:  '#f59e0b', amber2: '#b45309',
        red:    '#dc2626', red2:   '#991b1b',
        purple: '#7c3aed', purple2:'#5b21b6',
        slate:  '#64748b',
    };

    const PALETTE = ['#2563eb','#0891b2','#16a34a','#f59e0b','#dc2626','#7c3aed','#db2777','#0d9488','#ca8a04','#4f46e5','#65a30d','#e11d48','#0284c7','#9333ea','#ea580c','#059669','#7c3aed','#facc15'];

    let _charts = {};
    let _initOnce = false;
    let _vidData = [];
    let _filData = [];
    let _editing = { tabla: null, id: null };

    // ─── helpers ────────────────────────────────────────────────────
    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') return await window.ensureSupabaseClient();
        throw new Error('Cliente de Supabase no disponible');
    }

    function canEdit() {
        try {
            const role = sessionStorage.getItem('user_role') || '';
            if (role === 'admin' || role === 'superadmin') return true;
            // Respeta el override explícito "solo ver" por módulo (section_levels)
            const ovr = (window.dataManager && window.dataManager.sectionLevels || {})['ingenieria-civil'];
            if (ovr === 'read' || ovr === 'none') return false;
            if (ovr === 'capture' || ovr === 'edit') return true;
            return ['editor', 'ssei', 'ingenieria'].includes(role);
        } catch (_) { return false; }
    }

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const fmtDate = (d) => {
        if (!d) return '—';
        try {
            const [y, m, day] = String(d).split('-');
            if (!y || !m || !day) return String(d);
            return `${day}/${m}/${y}`;
        } catch (_) { return String(d); }
    };

    function setStatus(prefix, msg, type) {
        const el = document.getElementById(prefix + '-status');
        if (!el) return;
        if (!msg) { el.classList.add('d-none'); el.innerHTML = ''; return; }
        el.classList.remove('d-none', 'alert-info', 'alert-warning', 'alert-danger', 'alert-success');
        el.classList.add('alert-' + (type || 'info'));
        el.innerHTML = msg;
    }

    function vGradient(ctx, chartArea, c1, c2) {
        if (!chartArea) return c1;
        const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
        g.addColorStop(0, c2 + '99');
        g.addColorStop(1, c1);
        return g;
    }

    // Plugin: total al centro del doughnut
    const icCenterText = {
        id: 'icCenterText',
        afterDatasetDraw(chart, _args, opts) {
            if (!opts || !opts.display) return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const cx = (chartArea.left + chartArea.right) / 2;
            const cy = (chartArea.top + chartArea.bottom) / 2;
            const total = chart.data.datasets[0].data.reduce((a, b) => a + (Number(b) || 0), 0);
            ctx.save();
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = opts.color || '#0f172a';
            ctx.font = '800 1.4rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(opts.formatter ? opts.formatter(total) : String(total), cx, cy - 8);
            ctx.fillStyle = opts.subColor || '#94a3b8';
            ctx.font = '700 .6rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText((opts.label || 'TOTAL').toUpperCase(), cx, cy + 12);
            ctx.restore();
        }
    };
    try { if (typeof Chart !== 'undefined') Chart.register(icCenterText); } catch (_) {}

    const isAtendido = (r) => (r.estatus || '').toLowerCase() === 'atendido';

    // ─── DATA ────────────────────────────────────────────────────────
    async function loadVidrios() {
        const sb = await getClient();
        const { data, error } = await sb.from(T_VID).select('*').order('fecha_reporte', { ascending: true });
        if (error) throw error;
        return data || [];
    }
    async function loadFiltraciones() {
        const sb = await getClient();
        const { data, error } = await sb.from(T_FIL).select('*').order('fecha_reporte', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    // ════════════════════════════════════════════════════════════════
    //  VIDRIOS
    // ════════════════════════════════════════════════════════════════
    function vidFiltered() {
        const sel = document.getElementById('icv-anio-select');
        const anio = sel ? sel.value : 'all';
        if (!anio || anio === 'all') return _vidData;
        return _vidData.filter(r => String(r.anio) === String(anio));
    }

    function renderVidKpis(rows) {
        const total = rows.length;
        const atend = rows.filter(isAtendido).length;
        const pend  = total - atend;
        const avance = total ? Math.round((atend / total) * 100) : 0;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('icv-kpi-total', String(total));
        set('icv-kpi-atendidos', String(atend));
        set('icv-kpi-pendientes', String(pend));
        set('icv-kpi-avance', avance + '%');
    }

    function renderVidTable(rows) {
        const tbody = document.getElementById('icv-tbl-body');
        const countEl = document.getElementById('icv-tbl-count');
        if (!tbody) return;
        if (countEl) countEl.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Sin registros.</td></tr>';
            return;
        }
        const sorted = [...rows].sort((a, b) =>
            String(b.fecha_reporte || '').localeCompare(String(a.fecha_reporte || '')) ||
            (Number(b.no_consecutivo) || 0) - (Number(a.no_consecutivo) || 0));
        const allow = canEdit();
        tbody.innerHTML = sorted.map(r => {
            const badge = isAtendido(r)
                ? '<span class="ic-st ic-st--ok">Atendido</span>'
                : '<span class="ic-st ic-st--pend">Pendiente</span>';
            const acciones = allow ? `
                <button type="button" class="btn btn-sm btn-outline-primary me-1" data-icv-edit="${esc(r.id)}" title="Editar"><i class="fas fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-icv-del="${esc(r.id)}" title="Eliminar"><i class="fas fa-trash"></i></button>` : '—';
            return `
            <tr>
                <td class="text-center fw-semibold">${r.no_consecutivo != null ? r.no_consecutivo : '—'}</td>
                <td class="text-nowrap">${fmtDate(r.fecha_reporte)}</td>
                <td class="fw-semibold">${esc(r.ubicacion || '—')}</td>
                <td class="text-center">${esc(r.nivel || '—')}</td>
                <td>${esc(r.descripcion || '—')}</td>
                <td class="text-center">${r.cantidad != null ? r.cantidad : 1}</td>
                <td class="text-center">${badge}</td>
                <td class="text-nowrap text-center">${fmtDate(r.fecha_atencion)}</td>
                <td class="text-center text-nowrap">${acciones}</td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('[data-icv-edit]').forEach(b =>
            b.addEventListener('click', () => openVidModal(b.getAttribute('data-icv-edit'))));
        tbody.querySelectorAll('[data-icv-del]').forEach(b =>
            b.addEventListener('click', () => deleteRecord(T_VID, b.getAttribute('data-icv-del'))));
    }

    function renderVidCharts(rows) {
        if (typeof Chart === 'undefined') return;
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        Chart.defaults.color = '#475569';
        const baseTooltip = {
            backgroundColor: 'rgba(15,23,42,.92)', titleColor: '#fff', bodyColor: '#e2e8f0',
            titleFont: { weight: '700', size: 13 }, bodyFont: { size: 12 },
            padding: 12, cornerRadius: 10, boxPadding: 4, borderColor: 'rgba(255,255,255,.08)', borderWidth: 1
        };
        const yScale = {
            beginAtZero: true, grace: '20%',
            grid: { color: '#eef2f7', drawBorder: false }, border: { display: false },
            ticks: { color: '#64748b', font: { size: 11, weight: '600' }, maxTicksLimit: 6, stepSize: 1 }
        };
        const xScale = {
            grid: { display: false, drawBorder: false }, border: { display: false },
            ticks: { color: '#475569', font: { size: 11, weight: '700' } }
        };

        // 1) Por año: reportados vs atendidos
        const anios = Array.from(new Set(_vidData.map(r => r.anio).filter(v => v != null))).sort();
        const repByAnio = anios.map(a => _vidData.filter(r => r.anio === a).length);
        const atByAnio  = anios.map(a => _vidData.filter(r => r.anio === a && isAtendido(r)).length);
        const c1 = document.getElementById('icv-chart-anio');
        if (c1) {
            destroy('vAnio');
            _charts.vAnio = new Chart(c1, {
                type: 'bar',
                data: {
                    labels: anios.map(String),
                    datasets: [
                        { label: 'Reportados', data: repByAnio, borderRadius: 7, maxBarThickness: 38,
                          backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.blue, COL.blue2) },
                        { label: 'Atendidos', data: atByAnio, borderRadius: 7, maxBarThickness: 38,
                          backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.green, COL.green2) }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11, weight: '600' } } }, tooltip: baseTooltip,
                        datalabels: { anchor: 'end', align: 'top', offset: 2, clip: false, color: '#0f172a', font: { weight: '800', size: 11 }, formatter: v => v > 0 ? v : '' } },
                    scales: { y: yScale, x: xScale }
                }
            });
        }

        // 2) Por ubicación (barras horizontales)
        const ubicCount = {};
        _vidData.forEach(r => { const u = (r.ubicacion || 'N/D').trim(); ubicCount[u] = (ubicCount[u] || 0) + 1; });
        const ubicEntries = Object.entries(ubicCount).sort((a, b) => b[1] - a[1]);
        const c2 = document.getElementById('icv-chart-ubic');
        if (c2) {
            destroy('vUbic');
            _charts.vUbic = new Chart(c2, {
                type: 'bar',
                data: {
                    labels: ubicEntries.map(([k]) => k),
                    datasets: [{ label: 'Vidrios', data: ubicEntries.map(([, v]) => v), borderRadius: 6, maxBarThickness: 26,
                        backgroundColor: (c) => { const i = c.dataIndex; return PALETTE[i % PALETTE.length]; } }]
                },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: baseTooltip,
                        datalabels: { anchor: 'end', align: 'end', offset: 2, clip: false, color: '#0f172a', font: { weight: '800', size: 11 }, formatter: v => v } },
                    scales: {
                        x: { beginAtZero: true, grace: '12%', grid: { color: '#eef2f7', drawBorder: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11, weight: '600' }, stepSize: 1, maxTicksLimit: 6 } },
                        y: { grid: { display: false, drawBorder: false }, border: { display: false }, ticks: { color: '#475569', font: { size: 10.5, weight: '700' } } }
                    }
                }
            });
        }

        // 3) Avance (doughnut)
        const atend = _vidData.filter(isAtendido).length;
        const pend  = _vidData.length - atend;
        const c3 = document.getElementById('icv-chart-avance');
        if (c3) {
            destroy('vAvance');
            _charts.vAvance = new Chart(c3, {
                type: 'doughnut',
                data: { labels: ['Atendidos', 'Pendientes'], datasets: [{ data: [atend, pend], backgroundColor: [COL.green, COL.amber], borderWidth: 0, hoverOffset: 6 }] },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '64%',
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, weight: '600' }, padding: 12 } },
                        tooltip: baseTooltip,
                        icCenterText: { display: true, label: 'Total', color: '#0f172a', subColor: '#94a3b8' },
                        datalabels: { color: '#fff', font: { weight: '800', size: 13 }, formatter: (v) => v > 0 ? v : '' }
                    }
                }
            });
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  FILTRACIONES
    // ════════════════════════════════════════════════════════════════
    function renderFilKpis(rows) {
        const total = rows.reduce((s, r) => s + (Number(r.cantidad) || 1), 0);
        const atend = rows.filter(isAtendido).reduce((s, r) => s + (Number(r.cantidad) || 1), 0);
        const pend  = total - atend;
        const modulos = new Set(rows.map(r => (r.modulo || '').trim()).filter(Boolean)).size;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('icf-kpi-total', String(total));
        set('icf-kpi-atendidas', String(atend));
        set('icf-kpi-pendientes', String(pend));
        set('icf-kpi-modulos', String(modulos));
    }

    function renderFilTable(rows) {
        const tbody = document.getElementById('icf-tbl-body');
        const countEl = document.getElementById('icf-tbl-count');
        if (!tbody) return;
        if (countEl) countEl.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Sin registros.</td></tr>';
            return;
        }
        const sorted = [...rows].sort((a, b) =>
            String(b.fecha_reporte || '').localeCompare(String(a.fecha_reporte || '')) ||
            (Number(b.no_consecutivo) || 0) - (Number(a.no_consecutivo) || 0));
        const allow = canEdit();
        tbody.innerHTML = sorted.map(r => {
            const badge = isAtendido(r)
                ? '<span class="ic-st ic-st--ok">Atendido</span>'
                : `<span class="ic-st ic-st--pend">Pendiente${r.reincidencia ? ' · reinc.' : ''}</span>`;
            const acciones = allow ? `
                <button type="button" class="btn btn-sm btn-outline-primary me-1" data-icf-edit="${esc(r.id)}" title="Editar"><i class="fas fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-icf-del="${esc(r.id)}" title="Eliminar"><i class="fas fa-trash"></i></button>` : '—';
            return `
            <tr>
                <td class="text-center fw-semibold">${r.no_consecutivo != null ? r.no_consecutivo : '—'}</td>
                <td class="text-nowrap">${fmtDate(r.fecha_reporte)}</td>
                <td class="text-center"><span class="badge bg-light text-dark border">${esc(r.modulo || '—')}</span></td>
                <td>${esc(r.elemento_afectado || '—')}</td>
                <td class="text-center">${r.cantidad != null ? r.cantidad : 1}</td>
                <td class="text-center">${badge}</td>
                <td class="text-nowrap text-center">${fmtDate(r.fecha_atencion)}</td>
                <td class="text-center text-nowrap">${acciones}</td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('[data-icf-edit]').forEach(b =>
            b.addEventListener('click', () => openFilModal(b.getAttribute('data-icf-edit'))));
        tbody.querySelectorAll('[data-icf-del]').forEach(b =>
            b.addEventListener('click', () => deleteRecord(T_FIL, b.getAttribute('data-icf-del'))));
    }

    function renderFilCharts(rows) {
        if (typeof Chart === 'undefined') return;
        const baseTooltip = {
            backgroundColor: 'rgba(15,23,42,.92)', titleColor: '#fff', bodyColor: '#e2e8f0',
            titleFont: { weight: '700', size: 13 }, bodyFont: { size: 12 },
            padding: 12, cornerRadius: 10, boxPadding: 4, borderColor: 'rgba(255,255,255,.08)', borderWidth: 1
        };
        const yScale = {
            beginAtZero: true, grace: '20%',
            grid: { color: '#eef2f7', drawBorder: false }, border: { display: false },
            ticks: { color: '#64748b', font: { size: 11, weight: '600' }, maxTicksLimit: 6, stepSize: 2 }
        };
        const xScale = {
            grid: { display: false, drawBorder: false }, border: { display: false },
            ticks: { color: '#475569', font: { size: 10.5, weight: '700' } }
        };

        // Orden natural de módulos A, B, C, D, E1..E4, F, G1, G2, H..N
        const modOrder = ['A','B','C','D','E1','E2','E3','E4','F','G1','G2','H','I','J','K','L','M','N'];
        const modCount = {};
        rows.forEach(r => { const m = (r.modulo || 'N/D').trim(); modCount[m] = (modCount[m] || 0) + (Number(r.cantidad) || 1); });
        const mods = Object.keys(modCount).sort((a, b) => {
            const ia = modOrder.indexOf(a), ib = modOrder.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

        // 1) Por módulo (barras)
        const c1 = document.getElementById('icf-chart-modulo');
        if (c1) {
            destroy('fMod');
            _charts.fMod = new Chart(c1, {
                type: 'bar',
                data: { labels: mods, datasets: [{ label: 'Filtraciones', data: mods.map(m => modCount[m]), borderRadius: 6, maxBarThickness: 34,
                    backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.cyan, COL.cyan2) }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: baseTooltip,
                        datalabels: { anchor: 'end', align: 'top', offset: 2, clip: false, color: '#0f172a', font: { weight: '800', size: 10.5 }, formatter: v => v > 0 ? v : '' } },
                    scales: { y: yScale, x: xScale }
                }
            });
        }

        // 2) Por elemento dañado (doughnut)
        const elemCount = {};
        rows.forEach(r => { const e = (r.elemento_afectado || 'N/D').trim(); elemCount[e] = (elemCount[e] || 0) + (Number(r.cantidad) || 1); });
        const elemEntries = Object.entries(elemCount).sort((a, b) => b[1] - a[1]);
        const c2 = document.getElementById('icf-chart-elemento');
        if (c2) {
            destroy('fElem');
            _charts.fElem = new Chart(c2, {
                type: 'doughnut',
                data: { labels: elemEntries.map(([k]) => k), datasets: [{ data: elemEntries.map(([, v]) => v), backgroundColor: PALETTE, borderWidth: 0, hoverOffset: 6 }] },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '60%',
                    plugins: {
                        legend: { position: 'right', labels: { boxWidth: 11, font: { size: 10.5, weight: '600' }, padding: 8 } },
                        tooltip: baseTooltip,
                        icCenterText: { display: true, label: 'Total', color: '#0f172a', subColor: '#94a3b8' },
                        datalabels: { color: '#fff', font: { weight: '800', size: 11 }, formatter: (v) => v > 0 ? v : '' }
                    }
                }
            });
        }

        // 3) Tendencia por fecha (línea acumulada)
        const byFecha = {};
        rows.forEach(r => { const f = r.fecha_reporte; if (!f) return; byFecha[f] = (byFecha[f] || 0) + (Number(r.cantidad) || 1); });
        const fechas = Object.keys(byFecha).sort();
        let acc = 0; const accData = fechas.map(f => (acc += byFecha[f]));
        const c3 = document.getElementById('icf-chart-tendencia');
        if (c3) {
            destroy('fTend');
            _charts.fTend = new Chart(c3, {
                type: 'line',
                data: {
                    labels: fechas.map(fmtDate),
                    datasets: [
                        { label: 'Acumulado', data: accData, borderColor: COL.purple, tension: .35, fill: true,
                          backgroundColor: (c) => { const a = c.chart.chartArea; if (!a) return COL.purple + '22'; const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, COL.purple + '44'); g.addColorStop(1, COL.purple + '04'); return g; },
                          pointRadius: 3, pointBackgroundColor: COL.purple, borderWidth: 2.5 },
                        { label: 'Por reporte', data: fechas.map(f => byFecha[f]), type: 'bar', backgroundColor: COL.amber + 'cc', borderRadius: 5, maxBarThickness: 22 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11, weight: '600' } } }, tooltip: baseTooltip, datalabels: { display: false } },
                    scales: { y: yScale, x: { ...xScale, ticks: { ...xScale.ticks, maxRotation: 45, minRotation: 0, font: { size: 9.5, weight: '600' } } } }
                }
            });
        }

        // 4) Avance (atendido / pendiente con-sin reincidencia)
        const atend = rows.filter(isAtendido).reduce((s, r) => s + (Number(r.cantidad) || 1), 0);
        const pendReinc = rows.filter(r => !isAtendido(r) && r.reincidencia).reduce((s, r) => s + (Number(r.cantidad) || 1), 0);
        const pendSin = rows.filter(r => !isAtendido(r) && !r.reincidencia).reduce((s, r) => s + (Number(r.cantidad) || 1), 0);
        const c4 = document.getElementById('icf-chart-avance');
        if (c4) {
            destroy('fAv');
            _charts.fAv = new Chart(c4, {
                type: 'doughnut',
                data: { labels: ['Atendido', 'Pend. con reincidencia', 'Pend. sin atender'], datasets: [{ data: [atend, pendReinc, pendSin], backgroundColor: [COL.green, COL.amber, COL.red], borderWidth: 0, hoverOffset: 6 }] },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 10, weight: '600' }, padding: 8 } },
                        tooltip: baseTooltip,
                        icCenterText: { display: true, label: 'Total', color: '#0f172a', subColor: '#94a3b8' },
                        datalabels: { color: '#fff', font: { weight: '800', size: 12 }, formatter: (v) => v > 0 ? v : '' }
                    }
                }
            });
        }
    }

    function destroy(key) { try { if (_charts[key]) { _charts[key].destroy(); delete _charts[key]; } } catch (_) {} }
    function destroyAll() { Object.keys(_charts).forEach(destroy); }

    // ─── SELECTOR DE AÑO (vidrios) ───────────────────────────────────
    function populateVidAnios() {
        const sel = document.getElementById('icv-anio-select');
        if (!sel) return;
        const prev = sel.value || 'all';
        const anios = Array.from(new Set(_vidData.map(r => r.anio).filter(v => v != null))).sort((a, b) => b - a);
        sel.innerHTML = '<option value="all">Todos los años</option>' + anios.map(a => `<option value="${a}">${a}</option>`).join('');
        sel.value = (prev === 'all' || anios.map(String).includes(String(prev))) ? prev : 'all';
    }

    // ─── MODAL VIDRIOS ───────────────────────────────────────────────
    function openVidModal(id) {
        const modal = document.getElementById('icv-modal');
        if (!modal) return;
        _editing = { tabla: T_VID, id: id || null };
        const row = id ? _vidData.find(x => String(x.id) === String(id)) : null;
        const setVal = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v == null ? '' : v; };
        const titleEl = document.getElementById('icv-modal-title-txt');
        const saveBtn = document.getElementById('icv-modal-save');
        if (row) {
            if (titleEl) titleEl.textContent = 'Editar Vidrio — ETP';
            if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Actualizar';
            setVal('icv-f-fecha', row.fecha_reporte);
            setVal('icv-f-ubic', row.ubicacion);
            setVal('icv-f-nivel', row.nivel);
            setVal('icv-f-desc', row.descripcion);
            setVal('icv-f-cant', row.cantidad != null ? row.cantidad : 1);
            setVal('icv-f-estatus', row.estatus || 'Pendiente');
            setVal('icv-f-fatencion', row.fecha_atencion);
            setVal('icv-f-entidad', row.entidad_reporta);
            setVal('icv-f-observ', row.observaciones);
        } else {
            if (titleEl) titleEl.textContent = 'Nuevo Vidrio — ETP';
            if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Guardar';
            ['icv-f-ubic','icv-f-nivel','icv-f-desc','icv-f-fatencion','icv-f-observ'].forEach(e => setVal(e, ''));
            setVal('icv-f-fecha', new Date().toISOString().slice(0, 10));
            setVal('icv-f-cant', 1);
            setVal('icv-f-estatus', 'Pendiente');
            setVal('icv-f-entidad', 'Dirección de Administración / Dirección de Operación');
        }
        const msgEl = document.getElementById('icv-modal-msg'); if (msgEl) { msgEl.innerHTML = ''; msgEl.className = ''; }
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    // ─── MODAL FILTRACIONES ──────────────────────────────────────────
    function openFilModal(id) {
        const modal = document.getElementById('icf-modal');
        if (!modal) return;
        _editing = { tabla: T_FIL, id: id || null };
        const row = id ? _filData.find(x => String(x.id) === String(id)) : null;
        const setVal = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v == null ? '' : v; };
        const titleEl = document.getElementById('icf-modal-title-txt');
        const saveBtn = document.getElementById('icf-modal-save');
        if (row) {
            if (titleEl) titleEl.textContent = 'Editar Filtración';
            if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Actualizar';
            setVal('icf-f-fecha', row.fecha_reporte);
            setVal('icf-f-modulo', row.modulo);
            setVal('icf-f-nivel', row.nivel || '29');
            setVal('icf-f-elem', row.elemento_afectado);
            setVal('icf-f-cant', row.cantidad != null ? row.cantidad : 1);
            setVal('icf-f-estatus', row.estatus || 'Pendiente');
            setVal('icf-f-fatencion', row.fecha_atencion);
            setVal('icf-f-entidad', row.entidad_reporta || 'Comunidad aeroportuaria');
            const chk = document.getElementById('icf-f-reinc'); if (chk) chk.checked = !!row.reincidencia;
        } else {
            if (titleEl) titleEl.textContent = 'Nueva Filtración';
            if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Guardar';
            ['icf-f-modulo','icf-f-fatencion'].forEach(e => setVal(e, ''));
            setVal('icf-f-fecha', new Date().toISOString().slice(0, 10));
            setVal('icf-f-nivel', '29');
            setVal('icf-f-elem', 'Panel');
            setVal('icf-f-cant', 1);
            setVal('icf-f-estatus', 'Pendiente');
            setVal('icf-f-entidad', 'Comunidad aeroportuaria');
            const chk = document.getElementById('icf-f-reinc'); if (chk) chk.checked = false;
        }
        const msgEl = document.getElementById('icf-modal-msg'); if (msgEl) { msgEl.innerHTML = ''; msgEl.className = ''; }
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    function daysBetween(a, b) {
        if (!a || !b) return null;
        const d1 = new Date(a), d2 = new Date(b);
        if (isNaN(d1) || isNaN(d2)) return null;
        return Math.max(0, Math.round((d2 - d1) / 86400000));
    }

    async function saveVidrio() {
        const msgEl = document.getElementById('icv-modal-msg');
        const btn = document.getElementById('icv-modal-save');
        try {
            if (!canEdit()) { showMsg(msgEl, 'danger', '<i class="fas fa-lock me-1"></i>No tienes permisos de edición.'); return; }
            const g = (id) => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
            const fecha = g('icv-f-fecha');
            if (!fecha) { showMsg(msgEl, 'warning', '<i class="fas fa-triangle-exclamation me-1"></i>La fecha de reporte es obligatoria.'); return; }
            const fatencion = g('icv-f-fatencion') || null;
            const payload = {
                fecha_reporte: fecha,
                anio: parseInt(fecha.slice(0, 4), 10) || null,
                ubicacion: g('icv-f-ubic') || null,
                nivel: g('icv-f-nivel') || null,
                descripcion: g('icv-f-desc') || null,
                cantidad: parseInt(g('icv-f-cant'), 10) || 1,
                estatus: g('icv-f-estatus') || 'Pendiente',
                fecha_atencion: fatencion,
                dias_atencion: daysBetween(fecha, fatencion),
                entidad_reporta: g('icv-f-entidad') || null,
                observaciones: g('icv-f-observ') || null
            };
            if (btn) btn.disabled = true;
            showMsg(msgEl, 'info', '<i class="fas fa-spinner fa-spin me-1"></i>Guardando…');
            const sb = await getClient();
            if (_editing.id) {
                const { error } = await sb.from(T_VID).update(payload).eq('id', _editing.id);
                if (error) throw error;
            } else {
                payload.no_consecutivo = nextConsecutivo(_vidData, payload.anio);
                payload.uploaded_by = sessionStorage.getItem('user_email') || null;
                const { error } = await sb.from(T_VID).insert(payload);
                if (error) throw error;
            }
            showMsg(msgEl, 'success', '<i class="fas fa-check-circle me-1"></i>Registro guardado.');
            setTimeout(async () => {
                hideModal('icv-modal');
                _editing = { tabla: null, id: null };
                await reloadAll();
            }, 900);
        } catch (err) {
            console.error('[ing-civil] save vidrio', err);
            showMsg(msgEl, 'danger', '<i class="fas fa-triangle-exclamation me-1"></i>' + (err.message || err));
        } finally { if (btn) btn.disabled = false; }
    }

    async function saveFiltracion() {
        const msgEl = document.getElementById('icf-modal-msg');
        const btn = document.getElementById('icf-modal-save');
        try {
            if (!canEdit()) { showMsg(msgEl, 'danger', '<i class="fas fa-lock me-1"></i>No tienes permisos de edición.'); return; }
            const g = (id) => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
            const fecha = g('icf-f-fecha');
            if (!fecha) { showMsg(msgEl, 'warning', '<i class="fas fa-triangle-exclamation me-1"></i>La fecha de reporte es obligatoria.'); return; }
            const payload = {
                fecha_reporte: fecha,
                modulo: g('icf-f-modulo') || null,
                nivel: g('icf-f-nivel') || null,
                tipo_hallazgo: 'Filtración',
                elemento_afectado: g('icf-f-elem') || null,
                cantidad: parseInt(g('icf-f-cant'), 10) || 1,
                estatus: g('icf-f-estatus') || 'Pendiente',
                fecha_atencion: g('icf-f-fatencion') || null,
                entidad_reporta: g('icf-f-entidad') || null,
                reincidencia: !!(document.getElementById('icf-f-reinc') && document.getElementById('icf-f-reinc').checked)
            };
            if (btn) btn.disabled = true;
            showMsg(msgEl, 'info', '<i class="fas fa-spinner fa-spin me-1"></i>Guardando…');
            const sb = await getClient();
            if (_editing.id) {
                const { error } = await sb.from(T_FIL).update(payload).eq('id', _editing.id);
                if (error) throw error;
            } else {
                payload.no_consecutivo = nextConsecutivo(_filData, null);
                payload.uploaded_by = sessionStorage.getItem('user_email') || null;
                const { error } = await sb.from(T_FIL).insert(payload);
                if (error) throw error;
            }
            showMsg(msgEl, 'success', '<i class="fas fa-check-circle me-1"></i>Registro guardado.');
            setTimeout(async () => {
                hideModal('icf-modal');
                _editing = { tabla: null, id: null };
                await reloadAll();
            }, 900);
        } catch (err) {
            console.error('[ing-civil] save filtracion', err);
            showMsg(msgEl, 'danger', '<i class="fas fa-triangle-exclamation me-1"></i>' + (err.message || err));
        } finally { if (btn) btn.disabled = false; }
    }

    function nextConsecutivo(rows, anio) {
        const scope = anio != null ? rows.filter(r => r.anio === anio) : rows;
        return scope.reduce((m, r) => Math.max(m, Number(r.no_consecutivo) || 0), 0) + 1;
    }

    async function deleteRecord(tabla, id) {
        if (!canEdit() || !id) return;
        if (!window.confirm('¿Eliminar este registro?\n\nEsta acción no se puede deshacer.')) return;
        try {
            const sb = await getClient();
            const { error } = await sb.from(tabla).delete().eq('id', id);
            if (error) throw error;
            await reloadAll();
        } catch (err) {
            console.error('[ing-civil] delete', err);
            alert('No se pudo eliminar: ' + (err.message || err));
        }
    }

    function showMsg(el, type, html) { if (!el) return; el.className = 'alert alert-' + type + ' mt-2 py-2'; el.innerHTML = html; }
    function hideModal(id) { try { const m = bootstrap.Modal.getInstance(document.getElementById(id)); if (m) m.hide(); } catch (_) {} }

    // ─── RENDER GLOBAL ───────────────────────────────────────────────
    function renderVidrios() {
        const f = vidFiltered();
        renderVidKpis(f);
        renderVidTable(f);
        renderVidCharts(f);
    }
    function renderFiltraciones() {
        renderFilKpis(_filData);
        renderFilTable(_filData);
        renderFilCharts(_filData);
    }

    async function reloadAll() {
        try {
            setStatus('icv', '<i class="fas fa-spinner fa-spin me-1"></i>Cargando…', 'info');
            setStatus('icf', '<i class="fas fa-spinner fa-spin me-1"></i>Cargando…', 'info');
            [_vidData, _filData] = await Promise.all([loadVidrios(), loadFiltraciones()]);
            populateVidAnios();
            renderVidrios();
            renderFiltraciones();
            setStatus('icv', '');
            setStatus('icf', '');
        } catch (e) {
            console.error('[ing-civil] reload error', e);
            const m = '<i class="fas fa-triangle-exclamation me-1"></i>Error: ' + (e.message || e);
            setStatus('icv', m, 'danger');
            setStatus('icf', m, 'danger');
        }
    }

    // ─── BINDINGS ────────────────────────────────────────────────────
    function wireUi() {
        if (_initOnce) return;
        _initOnce = true;
        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };

        on('icv-anio-select', 'change', renderVidrios);
        on('icv-refresh-btn', 'click', reloadAll);
        on('icf-refresh-btn', 'click', reloadAll);
        on('icv-modal-save', 'click', saveVidrio);
        on('icf-modal-save', 'click', saveFiltracion);

        const addV = document.getElementById('icv-add-btn');
        if (addV) { addV.classList.toggle('d-none', !canEdit()); addV.addEventListener('click', () => openVidModal()); }
        const addF = document.getElementById('icf-add-btn');
        if (addF) { addF.classList.toggle('d-none', !canEdit()); addF.addEventListener('click', () => openFilModal()); }

        // Redibujar charts al cambiar de pestaña (canvas oculto no dimensiona bien)
        const tabFil = document.getElementById('ic-tab-filtraciones');
        if (tabFil) tabFil.addEventListener('shown.bs.tab', () => renderFilCharts(_filData));
        const tabVid = document.getElementById('ic-tab-vidrios');
        if (tabVid) tabVid.addEventListener('shown.bs.tab', renderVidrios);
    }

    // ─── API PÚBLICA ─────────────────────────────────────────────────
    window.initIngenieriaCivil = async function () {
        try {
            wireUi();
            await reloadAll();
        } catch (e) {
            console.error('[ing-civil] init error', e);
        }
    };
    window.ingenieriaCivilReload = reloadAll;

    // Contrato de ciclo de vida del modulo.
    //
    // Lo que de verdad se acumulaba visita tras visita eran las instancias de
    // Chart.js: cada render creaba las suyas y nadie las soltaba al salir de la
    // seccion. Aqui se liberan.
    //
    // Los listeners de los controles NO se retiran a proposito: se registran una
    // sola vez (guardados por initDone / state.bound) sobre nodos que viven
    // dentro de la vista, y la vista se queda cacheada en el DOM. No se duplican
    // al volver a entrar, asi que retirarlos obligaria a volver a cablearlos sin
    // ganar nada.
    window.destroyIngenieriaCivil = function () {
        try {
            Object.keys(_charts || {}).forEach(function (k) {
                try { if (_charts[k]) _charts[k].destroy(); } catch (_) {}
                _charts[k] = null;
            });
        } catch (_) {}
    };
})();
