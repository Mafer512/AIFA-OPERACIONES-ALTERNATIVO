// ===================================================================
//  GTRANS · Preventivos Programados
//  Lee public.gtrans_equipo_tipo + public.gtrans_preventivo_mensual
//  Renderiza KPIs, 4 gráficos pro, tabla pivote (12 meses × 2)
//  y permite capturar/actualizar todos los equipos para un mes.
//
//  API pública:
//    window.initGtransPreventivos()  -> inicializa (hook showSection)
//    window.gtransPreventivosReload()-> recarga silenciosa
// ===================================================================
(function () {
    'use strict';

    const MESES_NUM   = [1,2,3,4,5,6,7,8,9,10,11,12];
    const MESES_LBL   = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                         'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const COL = {
        prog:  '#2563eb', progDark:  '#1e3a8a',
        exec:  '#16a34a', execDark:  '#14532d',
        meta:  '#7c3aed', metaDark:  '#5b21b6',
        cumpl: '#0891b2', cumplDark: '#155e75',
        gap:   '#e2e8f0'
    };

    // Paleta para "Por tipo de equipo" (hasta 12 colores)
    const PALETTE = ['#2563eb','#16a34a','#ea580c','#7c3aed','#0891b2',
                     '#db2777','#f59e0b','#9333ea','#0ea5e9','#10b981','#f43f5e','#475569'];

    function vGradient(ctx, area, c1, c2) {
        if (!area) return c1;
        const g = ctx.createLinearGradient(0, area.bottom, 0, area.top);
        g.addColorStop(0, c2); g.addColorStop(1, c1); return g;
    }

    // Plugin: número grande + label al centro del doughnut
    const gprevCenterText = {
        id: 'gprevCenterText',
        afterDatasetDraw(chart, _args, opts) {
            if (!opts || !opts.display) return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const cx = (chartArea.left + chartArea.right) / 2;
            const cy = (chartArea.top + chartArea.bottom) / 2;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = opts.color || '#0f172a';
            ctx.font = '800 1.75rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(opts.value || '—', cx, cy - 12);
            ctx.fillStyle = opts.subColor || '#64748b';
            ctx.font = '700 .7rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText((opts.label || '').toUpperCase(), cx, cy + 10);
            if (opts.sub2) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '600 .68rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.fillText(opts.sub2, cx, cy + 28);
            }
            ctx.restore();
        }
    };
    try { if (typeof Chart !== 'undefined') Chart.register(gprevCenterText); } catch (_) {}

    let _charts = {};
    let _initOnce = false;
    // Ciclo de vida del modulo. Los listeners se registran con esta senal:
    // abortarla en destroy() los retira todos de golpe, sin tener que
    // acordarse de cada removeEventListener uno por uno.
    let _ac = null;
    let _currentAnio = null;
    let _equipos = []; // catálogo cacheado

    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') return await window.ensureSupabaseClient();
        throw new Error('Cliente de Supabase no disponible');
    }

    // Permiso de escritura. La decision vive en el nucleo compartido
    // (core/permissions.js): un solo sitio para toda la aplicacion, en vez de
    // una copia de esta misma logica dentro de cada modulo.
    //
    // El respaldo de abajo conserva el comportamiento exacto que tenia este
    // modulo por si el nucleo no estuviera cargado -- abrir el modulo suelto,
    // una prueba aislada -- para que la extraccion no cambie nada.
    //
    // Esto decide que se VE. Lo que se puede ESCRIBIR lo decide la RLS de
    // Supabase, del lado del servidor, y no depende de esta funcion.
    function canEdit() {
        try {
            if (window.appPermisos) return window.appPermisos.puedeEditar('gtrans-preventivos');
            const role = sessionStorage.getItem('user_role') || '';
            if (role === 'admin' || role === 'superadmin') return true;
            const ovr = (window.dataManager && window.dataManager.sectionLevels || {})['gtrans-preventivos'];
            if (ovr === 'read' || ovr === 'none') return false;
            if (ovr === 'capture' || ovr === 'edit') return true;
            return ['editor'].includes(role);
        } catch (_) { return false; }
    }

    function setStatus(msg, type) {
        const el = document.getElementById('gprev-status');
        if (!el) return;
        if (!msg) { el.classList.add('d-none'); el.innerHTML = ''; return; }
        el.classList.remove('d-none','alert-info','alert-warning','alert-danger','alert-success');
        el.classList.add('alert-' + (type || 'info'));
        el.innerHTML = msg;
    }

    const fmtInt = (n) => (n == null || isNaN(n)) ? '—'
        : Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    const fmtPct = (n, d = 2) => (n == null || isNaN(n)) ? '—'
        : Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';

    /* ---------- Cargar catálogo de equipos ---------- */
    async function loadEquipos(sb) {
        const { data, error } = await sb
            .from('gtrans_equipo_tipo')
            .select('id,codigo,nombre,orden,activo')
            .eq('activo', true)
            .order('orden');
        if (error) throw error;
        _equipos = data || [];
        return _equipos;
    }

    /* ---------- Años disponibles ---------- */
    async function loadAniosDisponibles(sb) {
        const { data, error } = await sb
            .from('gtrans_preventivo_mensual')
            .select('anio')
            .order('anio', { ascending: false });
        if (error) throw error;
        const set = new Set((data || []).map(r => r.anio));
        set.add(new Date().getFullYear());
        const arr = Array.from(set).sort((a,b) => b - a);
        const sel = document.getElementById('gprev-anio-select');
        if (sel) {
            sel.innerHTML = arr.map(a => `<option value="${a}">${a}</option>`).join('');
            if (_currentAnio && arr.includes(_currentAnio)) sel.value = String(_currentAnio);
            else { _currentAnio = arr[0]; sel.value = String(_currentAnio); }
        }
        return arr;
    }

    /* ---------- Dataset del año ---------- */
    async function loadDataset(sb, anio) {
        const { data, error } = await sb
            .from('gtrans_preventivo_mensual')
            .select('equipo_id,mes_num,programado,ejecutado')
            .eq('anio', anio);
        if (error) throw error;
        // Index: matrix[equipo_id][mes_num] = { p, e }
        const matrix = {};
        _equipos.forEach(eq => { matrix[eq.id] = {}; });
        (data || []).forEach(r => {
            if (!matrix[r.equipo_id]) matrix[r.equipo_id] = {};
            matrix[r.equipo_id][r.mes_num] = {
                p: Number(r.programado) || 0,
                e: Number(r.ejecutado)  || 0
            };
        });
        return matrix;
    }

    /* ---------- Cálculos agregados ---------- */
    function aggregate(matrix) {
        const totMesProg = MESES_NUM.map(() => 0);
        const totMesExec = MESES_NUM.map(() => 0);
        const totEqProg  = {}; const totEqExec = {};
        _equipos.forEach(eq => { totEqProg[eq.id] = 0; totEqExec[eq.id] = 0; });

        let totProg = 0, totExec = 0;
        _equipos.forEach(eq => {
            MESES_NUM.forEach((m, i) => {
                const c = matrix[eq.id]?.[m] || { p: 0, e: 0 };
                totMesProg[i] += c.p; totMesExec[i] += c.e;
                totEqProg[eq.id] += c.p; totEqExec[eq.id] += c.e;
                totProg += c.p; totExec += c.e;
            });
        });
        const pctMesEjec = MESES_NUM.map((_, i) =>
            totProg > 0 ? Math.round(10000 * totMesExec[i] / totProg) / 100 : 0);
        const pctMesProg = MESES_NUM.map((_, i) =>
            totProg > 0 ? Math.round(10000 * totMesProg[i] / totProg) / 100 : 0);
        const pctCumplMes = MESES_NUM.map((_, i) =>
            totMesProg[i] > 0 ? Math.round(1000 * totMesExec[i] / totMesProg[i]) / 10 : null);

        return { totMesProg, totMesExec, totEqProg, totEqExec, totProg, totExec, pctMesEjec, pctMesProg, pctCumplMes };
    }

    /* ---------- KPIs ---------- */
    function renderKpis(agg) {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('gprev-kpi-prog', fmtInt(agg.totProg));
        set('gprev-kpi-exec', fmtInt(agg.totExec));
        set('gprev-kpi-av',   agg.totProg > 0 ? fmtPct(100 * agg.totExec / agg.totProg, 2) : '—');
        const cumplValid = agg.pctCumplMes.filter(v => v != null);
        const cumplAvg   = cumplValid.length ? cumplValid.reduce((a,b)=>a+b,0) / cumplValid.length : null;
        set('gprev-kpi-cu',   cumplAvg == null ? '—' : fmtPct(cumplAvg, 1));
        const eqConPlan = _equipos.filter(eq => (agg.totEqProg[eq.id] || 0) > 0).length;
        set('gprev-kpi-eq',   `${eqConPlan} / ${_equipos.length}`);
    }

    /* ---------- Tabla pivote ---------- */
    function renderTable(matrix, agg) {
        const thead = document.getElementById('gprev-thead');
        const tbody = document.getElementById('gprev-tbody');
        if (!thead || !tbody) return;

        // ── Cabeceras (2 filas) ──
        const headRow1 = [`<th class="gp-eq-h" rowspan="2">EQUIPO</th>`];
        MESES_NUM.forEach(m => {
            headRow1.push(`<th class="gp-mes-h" colspan="2">${MESES_LBL[m-1]}</th>`);
        });
        const headRow2 = [];
        MESES_NUM.forEach(() => {
            headRow2.push(`<th class="gp-sub-prog">Programado</th><th class="gp-sub-exec">Ejecutado</th>`);
        });
        thead.innerHTML = `<tr>${headRow1.join('')}</tr><tr>${headRow2.join('')}</tr>`;

        // ── Filas por equipo ──
        const equipoRows = _equipos.map(eq => {
            const cells = MESES_NUM.map(m => {
                const c = matrix[eq.id]?.[m] || { p: 0, e: 0 };
                const tdP = c.p > 0 ? `<td class="gp-cell-prog">${fmtInt(c.p)}</td>` : `<td class="gp-z">0</td>`;
                const tdE = c.e > 0 ? `<td class="gp-cell-exec">${fmtInt(c.e)}</td>` : `<td class="gp-z">0</td>`;
                return tdP + tdE;
            }).join('');
            return `<tr><td class="gp-eq-c">${eq.nombre}</td>${cells}</tr>`;
        }).join('');

        // ── Total de Equipos ──
        const totCells = MESES_NUM.map((m, i) => {
            const p = agg.totMesProg[i], e = agg.totMesExec[i];
            return `<td>${fmtInt(p)}</td><td>${fmtInt(e)}</td>`;
        }).join('');
        const totalRow = `<tr class="gp-total"><td class="gp-eq-c">Total de Equipos</td>${totCells}</tr>`;

        // ── Porcentaje (sobre programado anual) ──
        const pctCells = MESES_NUM.map((m, i) => {
            const p = agg.pctMesProg[i], e = agg.pctMesEjec[i];
            return `<td>${p ? fmtPct(p, 2) : '0 %'}</td><td>${e ? fmtPct(e, 2) : '0 %'}</td>`;
        }).join('');
        const pctRow = `<tr class="gp-pct"><td class="gp-eq-c">Porcentaje (vs programa anual)</td>${pctCells}</tr>`;

        tbody.innerHTML = equipoRows + totalRow + pctRow;

        // ── Avance final ──
        const elAv = document.getElementById('gprev-avance-final');
        if (elAv) elAv.textContent = agg.totProg > 0
            ? fmtPct(100 * agg.totExec / agg.totProg, 2)
            : '—';
    }

    /* ---------- Charts ---------- */
    function destroyCharts() {
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    }

    function renderCharts(matrix, agg, anio) {
        if (typeof Chart === 'undefined') return;
        destroyCharts();

        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        Chart.defaults.color = '#475569';

        const baseTooltip = {
            backgroundColor: 'rgba(15,23,42,.92)',
            titleColor: '#fff', bodyColor: '#e2e8f0',
            titleFont: { weight: '700', size: 13 }, bodyFont: { size: 12 },
            padding: 12, cornerRadius: 10,
            displayColors: true, boxPadding: 4,
            borderColor: 'rgba(255,255,255,.08)', borderWidth: 1
        };
        const dlAboveBar = (color) => ({
            display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
            anchor: 'end', align: 'top', offset: 2, clip: false,
            color: color || '#0f172a',
            font: { weight: '700', size: 10.5 },
            formatter: (v) => fmtInt(v)
        });
        const baseAxis = {
            y: {
                beginAtZero: true, grace: '14%',
                grid: { color: '#eef2f7', drawBorder: false },
                border: { display: false },
                ticks: { color: '#64748b', font: { size: 11, weight: '600' }, callback: v => fmtInt(v), maxTicksLimit: 6 }
            },
            x: {
                grid: { display: false, drawBorder: false },
                border: { display: false },
                ticks: { color: '#475569', font: { size: 11, weight: '700' } }
            }
        };

        /* ── 1) Programado vs Ejecutado por mes ── */
        const cMes = document.getElementById('gprev-chart-mes');
        if (cMes) {
            _charts.mes = new Chart(cMes, {
                type: 'bar',
                data: {
                    labels: MESES_SHORT,
                    datasets: [
                        {
                            label: 'Programado', data: agg.totMesProg,
                            backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.prog, COL.progDark),
                            borderRadius: 8, borderSkipped: false, barPercentage: .85, categoryPercentage: .74,
                            hoverBackgroundColor: COL.prog
                        },
                        {
                            label: 'Ejecutado', data: agg.totMesExec,
                            backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.exec, COL.execDark),
                            borderRadius: 8, borderSkipped: false, barPercentage: .85, categoryPercentage: .74,
                            hoverBackgroundColor: COL.exec
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    animation: { duration: 700, easing: 'easeOutQuart' },
                    plugins: {
                        legend: {
                            position: 'top', align: 'end',
                            labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'rectRounded',
                                color: '#0f172a', font: { weight: '700', size: 12 }, padding: 14 }
                        },
                        tooltip: {
                            ...baseTooltip,
                            callbacks: {
                                title: (items) => items[0].label + ' · ' + anio,
                                label: (ctx) => `  ${ctx.dataset.label}: ${fmtInt(ctx.parsed.y)} mant.`,
                                footer: (items) => {
                                    const p = items.find(i => i.dataset.label === 'Programado')?.parsed.y || 0;
                                    const e = items.find(i => i.dataset.label === 'Ejecutado')?.parsed.y  || 0;
                                    if (!p) return '';
                                    return `Cumplimiento: ${fmtPct(100*e/p, 1)}`;
                                }
                            }
                        },
                        gprevCenterText: { display: false },
                        datalabels: dlAboveBar('#0f172a')
                    },
                    scales: baseAxis
                }
            });
        }

        /* ── 2) Avance Anual (doughnut) ── */
        const restante = Math.max(0, agg.totProg - agg.totExec);
        const cAv = document.getElementById('gprev-chart-avance');
        if (cAv) {
            _charts.avance = new Chart(cAv, {
                type: 'doughnut',
                data: {
                    labels: ['Ejecutado', 'Pendiente'],
                    datasets: [{
                        data: agg.totProg > 0 ? [agg.totExec, restante] : [0, 1],
                        backgroundColor: agg.totProg > 0 ? [COL.exec, COL.gap] : ['#e2e8f0','#e2e8f0'],
                        hoverBackgroundColor: agg.totProg > 0 ? [COL.execDark, '#cbd5e1'] : ['#cbd5e1','#cbd5e1'],
                        borderColor: '#fff', borderWidth: 4, hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '70%',
                    animation: { animateRotate: true, animateScale: false, duration: 800 },
                    plugins: {
                        legend: agg.totProg > 0 ? {
                            position: 'bottom',
                            labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
                                color: '#0f172a', font: { weight: '700', size: 12 }, padding: 12 }
                        } : { display: false },
                        tooltip: agg.totProg > 0 ? {
                            ...baseTooltip,
                            callbacks: { label: (ctx) => `  ${ctx.label}: ${fmtInt(ctx.parsed)} mant.` }
                        } : { enabled: false },
                        gprevCenterText: {
                            display: true,
                            value: agg.totProg > 0 ? fmtPct(100 * agg.totExec / agg.totProg, 2) : '—',
                            label: agg.totProg > 0 ? 'Avance anual' : 'Sin plan',
                            sub2:  agg.totProg > 0 ? `${fmtInt(agg.totExec)} / ${fmtInt(agg.totProg)}` : 'capturar plan',
                            color: COL.metaDark, subColor: '#64748b'
                        },
                        datalabels: { display: false }
                    }
                }
            });
        }

        /* ── 3) Programa por tipo de equipo (doughnut por equipo) ── */
        const equiposConPlan = _equipos.filter(eq => (agg.totEqProg[eq.id] || 0) > 0);
        const cEq = document.getElementById('gprev-chart-equipo');
        if (cEq) {
            _charts.equipo = new Chart(cEq, {
                type: 'doughnut',
                data: {
                    labels: equiposConPlan.length ? equiposConPlan.map(eq => eq.nombre) : ['Sin datos'],
                    datasets: [{
                        data: equiposConPlan.length
                            ? equiposConPlan.map(eq => agg.totEqProg[eq.id])
                            : [1],
                        backgroundColor: equiposConPlan.length
                            ? equiposConPlan.map((_, i) => PALETTE[i % PALETTE.length])
                            : ['#e2e8f0'],
                        borderColor: '#fff', borderWidth: 3, hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '58%',
                    animation: { animateRotate: true, duration: 800 },
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
                                color: '#0f172a', font: { weight: '600', size: 11 }, padding: 8 }
                        },
                        tooltip: {
                            ...baseTooltip,
                            callbacks: {
                                label: (ctx) => {
                                    if (!equiposConPlan.length) return '';
                                    const eq = equiposConPlan[ctx.dataIndex];
                                    const p = agg.totEqProg[eq.id] || 0;
                                    const e = agg.totEqExec[eq.id] || 0;
                                    const pct = p > 0 ? (100*e/p) : 0;
                                    return `  ${fmtInt(p)} programados · ${fmtInt(e)} ejecutados (${fmtPct(pct,1)})`;
                                }
                            }
                        },
                        gprevCenterText: {
                            display: true,
                            value: fmtInt(agg.totProg),
                            label: 'Programa anual',
                            color: '#0f172a', subColor: '#64748b'
                        },
                        datalabels: { display: false }
                    }
                }
            });
        }

        /* ── 4) Cumplimiento mensual % ── */
        // Recortar al último mes con ejecución real (evita mostrar 0% en meses futuros)
        let lastExecIdx = 0;
        MESES_NUM.forEach((m, i) => { if (agg.totMesExec[i] > 0) lastExecIdx = m; });
        const cuCutoff  = Math.max(lastExecIdx, 1);
        const cuLabels  = MESES_SHORT.slice(0, cuCutoff);
        const cuData    = agg.pctCumplMes.slice(0, cuCutoff).map(v => v == null ? 0 : v);
        const cuPctRef  = agg.pctCumplMes.slice(0, cuCutoff);

        const cCu = document.getElementById('gprev-chart-cumpl');
        if (cCu) {
            _charts.cumpl = new Chart(cCu, {
                type: 'line',
                data: {
                    labels: cuLabels,
                    datasets: [{
                        label: 'Cumplimiento', data: cuData,
                        borderColor: COL.cumpl, borderWidth: 3,
                        backgroundColor: (c) => {
                            const a = c.chart.chartArea;
                            if (!a) return COL.cumpl + '33';
                            const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
                            g.addColorStop(0, COL.cumpl + '66'); g.addColorStop(1, COL.cumpl + '08');
                            return g;
                        },
                        fill: true, tension: 0.4,
                        pointRadius: (ctx) => cuPctRef[ctx.dataIndex] == null ? 0 : 5,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: COL.cumpl, pointBorderWidth: 2.5,
                        spanGaps: true
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    animation: { duration: 700, easing: 'easeOutQuart' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...baseTooltip,
                            callbacks: {
                                label: (ctx) => {
                                    const v = cuPctRef[ctx.dataIndex];
                                    if (v == null) return '  Sin programa este mes';
                                    return `  Cumplimiento: ${fmtPct(v, 1)}`;
                                }
                            }
                        },
                        gprevCenterText: { display: false },
                        datalabels: {
                            display: (ctx) => cuPctRef[ctx.dataIndex] != null,
                            anchor: 'end', align: 'top', offset: 8, clip: false,
                            color: COL.cumplDark,
                            backgroundColor: 'rgba(255,255,255,.96)',
                            borderColor: COL.cumpl, borderWidth: 1, borderRadius: 6,
                            padding: { top: 2, right: 6, bottom: 2, left: 6 },
                            font: { weight: '700', size: 10.5 },
                            formatter: (v) => fmtInt(v) + ' %'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true, suggestedMax: 100, grace: '14%',
                            grid: { color: '#eef2f7', drawBorder: false },
                            border: { display: false },
                            ticks: { color: '#64748b', font: { size: 11, weight: '600' }, callback: v => v + '%', maxTicksLimit: 6 }
                        },
                        x: baseAxis.x
                    }
                }
            });
        }
    }

    /* ---------- Render principal ---------- */
    async function renderAll() {
        try {
            const sb = await getClient();
            setStatus('<i class="fas fa-spinner fa-spin me-1"></i>Cargando datos…', 'info');
            if (!_equipos.length) await loadEquipos(sb);
            const anio = Number(document.getElementById('gprev-anio-select')?.value || _currentAnio || new Date().getFullYear());
            _currentAnio = anio;
            const matrix = await loadDataset(sb, anio);
            const agg = aggregate(matrix);
            renderKpis(agg);
            renderTable(matrix, agg);
            renderCharts(matrix, agg, anio);
            setStatus('');
        } catch (e) {
            console.error('[gprev] render error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>Error: ' + (e.message || e), 'danger');
        }
    }

    /* ---------- Modal: pinta los renglones para los 8 equipos ---------- */
    function paintCaptureRows() {
        const cont = document.getElementById('gprev-up-rows');
        if (!cont) return;
        cont.innerHTML = _equipos.map(eq => `
            <div class="gp-cap-row" data-equipo="${eq.id}">
                <label title="${eq.nombre}">${eq.nombre}</label>
                <input type="number" class="form-control form-control-sm" data-field="p" min="0" step="1" value="0">
                <input type="number" class="form-control form-control-sm" data-field="e" min="0" step="1" value="0">
            </div>
        `).join('');
    }

    async function openUpsertAutoLoad() {
        const anioSel = Number(document.getElementById('gprev-anio-select')?.value || new Date().getFullYear());
        const now = new Date();
        document.getElementById('gprev-up-anio').value = anioSel;
        document.getElementById('gprev-up-mes').value  = String(now.getMonth() + 1);
        if (!_equipos.length) await loadEquipos(await getClient());
        paintCaptureRows();
        await loadMonthIntoForm();
    }

    async function loadMonthIntoForm() {
        const msg = document.getElementById('gprev-up-msg');
        try {
            const sb = await getClient();
            const anio = Number(document.getElementById('gprev-up-anio').value);
            const mes  = Number(document.getElementById('gprev-up-mes').value);
            if (!anio || !mes) return;
            if (!_equipos.length) await loadEquipos(sb);
            if (!document.querySelector('#gprev-up-rows .gp-cap-row')) paintCaptureRows();

            const { data, error } = await sb
                .from('gtrans_preventivo_mensual')
                .select('equipo_id,programado,ejecutado')
                .eq('anio', anio).eq('mes_num', mes);
            if (error) throw error;
            const byEq = {};
            (data || []).forEach(r => { byEq[r.equipo_id] = r; });

            document.querySelectorAll('#gprev-up-rows .gp-cap-row').forEach(row => {
                const eid = Number(row.getAttribute('data-equipo'));
                const r = byEq[eid];
                row.querySelector('input[data-field="p"]').value = r ? (r.programado ?? 0) : 0;
                row.querySelector('input[data-field="e"]').value = r ? (r.ejecutado  ?? 0) : 0;
            });
            if (msg) msg.innerHTML = `<span class="text-muted"><i class="fas fa-info-circle me-1"></i>Valores actuales cargados para ${MESES_LBL[mes-1]} ${anio}.</span>`;
        } catch (err) {
            if (msg) msg.innerHTML = `<span class="text-danger"><i class="fas fa-triangle-exclamation me-1"></i>${err.message || err}</span>`;
        }
    }

    async function saveMonth() {
        const msg = document.getElementById('gprev-up-msg');
        const btn = document.getElementById('gprev-up-save');
        try {
            if (!canEdit()) {
                if (msg) msg.innerHTML = '<span class="text-danger"><i class="fas fa-lock me-1"></i>No tienes permisos de edición.</span>';
                return;
            }
            const sb = await getClient();
            const anio = Number(document.getElementById('gprev-up-anio').value);
            const mes  = Number(document.getElementById('gprev-up-mes').value);
            if (!anio || !mes || mes < 1 || mes > 12) throw new Error('Año/mes inválido');
            const mesNombre = MESES_LBL[mes - 1];

            const payload = [];
            document.querySelectorAll('#gprev-up-rows .gp-cap-row').forEach(row => {
                const eid = Number(row.getAttribute('data-equipo'));
                const p = Math.max(0, Number(row.querySelector('input[data-field="p"]').value || 0));
                const e = Math.max(0, Number(row.querySelector('input[data-field="e"]').value || 0));
                payload.push({
                    anio, mes_num: mes, mes_nombre: mesNombre,
                    equipo_id: eid, programado: p, ejecutado: e
                });
            });

            btn.disabled = true;
            if (msg) msg.innerHTML = '<span class="text-muted"><i class="fas fa-spinner fa-spin me-1"></i>Guardando…</span>';

            const { error } = await sb
                .from('gtrans_preventivo_mensual')
                .upsert(payload, { onConflict: 'anio,mes_num,equipo_id' });
            if (error) throw error;

            if (msg) msg.innerHTML = `<span class="text-success"><i class="fas fa-check-circle me-1"></i>${mesNombre} ${anio} guardado correctamente (${payload.length} equipos).</span>`;
            await loadAniosDisponibles(sb);
            await renderAll();
        } catch (err) {
            console.error('[gprev] save error', err);
            if (msg) msg.innerHTML = `<span class="text-danger"><i class="fas fa-triangle-exclamation me-1"></i>${err.message || err}</span>`;
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ---------- Bindings (idempotente) ---------- */
    function wireUi() {
        if (_initOnce) return;
        _initOnce = true;
        _ac = new AbortController();
        const _ev = { signal: _ac.signal };

        const anioSel = document.getElementById('gprev-anio-select');
        if (anioSel) anioSel.addEventListener('change', renderAll, _ev);

        const refresh = document.getElementById('gprev-refresh-btn');
        if (refresh) refresh.addEventListener('click', renderAll, _ev);

        const btnUp = document.getElementById('gprev-upsert-btn');
        if (btnUp) {
            btnUp.classList.toggle('d-none', !canEdit());
            btnUp.addEventListener('click', openUpsertAutoLoad, _ev);
        }

        const btnLoad = document.getElementById('gprev-up-load');
        if (btnLoad) btnLoad.addEventListener('click', loadMonthIntoForm, _ev);

        const btnSave = document.getElementById('gprev-up-save');
        if (btnSave) btnSave.addEventListener('click', saveMonth, _ev);

        ['gprev-up-anio', 'gprev-up-mes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', loadMonthIntoForm, _ev);
        });
    }

    /* ---------- API pública ---------- */
    window.initGtransPreventivos = async function () {
        try {
            wireUi();
            const sb = await getClient();
            await loadEquipos(sb);
            await loadAniosDisponibles(sb);
            await renderAll();
        } catch (e) {
            console.error('[gprev] init error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (e.message || e), 'danger');
        }
    };

    window.gtransPreventivosReload = renderAll;

    // Contrato de ciclo de vida: liberar todo lo que el modulo abrio.
    // Sin esto, cada entrada a la seccion dejaba sus Chart vivos en memoria
    // y sus listeners colgados del DOM hasta cerrar la pestana.
    window.destroyGtransPreventivos = function () {
        try { if (_ac) _ac.abort(); } catch (_) {}
        _ac = null;
        _initOnce = false;
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    };
})();
