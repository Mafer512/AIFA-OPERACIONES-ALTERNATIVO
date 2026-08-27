// ===================================================================
//  Gerencia de Generación / Energía (SGE → GGEN)
//  Lee public.ggen_energia_electrica · ggen_energia_termica · ggen_consumo_gas
//  Dibuja KPIs YTD + 3 tablas + 4 gráficos (Chart.js)
//  Permite capturar / actualizar valores mensuales (upsert por año+mes).
//
//  API pública:
//    window.initGgenEnergia()  -> inicializa (showSection hook)
//    window.ggenReload()       -> recarga silenciosa
// ===================================================================
(function () {
    'use strict';

    const MESES_NUM = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const MESES_LBL = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
                       'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const COL = {
        gen: '#16a34a', genDark: '#14532d',
        cfe: '#2563eb', cfeDark: '#1e3a8a',
        trh: '#0891b2', trhDark: '#155e75',
        gas: '#ea580c', gasDark: '#9a3412',
        pct: '#7c3aed'
    };

    // Crea gradiente vertical para fills "pro"
    function vGradient(ctx, chartArea, c1, c2) {
        if (!chartArea) return c1;
        const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
        g.addColorStop(0, c2);
        g.addColorStop(1, c1);
        return g;
    }

    // Plugin: dibuja total + label al centro de doughnut/pie
    const ggenCenterText = {
        id: 'ggenCenterText',
        afterDatasetDraw(chart, _args, opts) {
            if (!opts || !opts.display) return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const cx = (chartArea.left + chartArea.right) / 2;
            const cy = (chartArea.top + chartArea.bottom) / 2;
            const total = chart.data.datasets[0].data.reduce((a, b) => a + (Number(b) || 0), 0);
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = opts.color || '#0f172a';
            ctx.font = '800 1.6rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(opts.formatter ? opts.formatter(total) : String(total), cx, cy - 8);
            ctx.fillStyle = opts.subColor || '#94a3b8';
            ctx.font = '700 .68rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText((opts.label || 'TOTAL').toUpperCase(), cx, cy + 14);
            ctx.restore();
        }
    };
    try { if (typeof Chart !== 'undefined') Chart.register(ggenCenterText); } catch (_) {}

    let _charts = {};
    let _initOnce = false;
    // Ciclo de vida del modulo. Los listeners se registran con esta senal:
    // abortarla en destroy() los retira todos de golpe, sin tener que
    // acordarse de cada removeEventListener uno por uno.
    let _ac = null;
    let _currentAnio = null;

    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') {
            return await window.ensureSupabaseClient();
        }
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
            if (window.appPermisos) return window.appPermisos.puedeEditar('ggen-energia');
            const role = sessionStorage.getItem('user_role') || '';
            if (role === 'admin' || role === 'superadmin') return true;
            const ovr = (window.dataManager && window.dataManager.sectionLevels || {})['ggen-energia'];
            if (ovr === 'read' || ovr === 'none') return false;
            if (ovr === 'capture' || ovr === 'edit') return true;
            return ['editor'].includes(role);
        } catch (_) { return false; }
    }

    function setStatus(msg, type) {
        const el = document.getElementById('ggen-status');
        if (!el) return;
        if (!msg) { el.classList.add('d-none'); el.innerHTML = ''; return; }
        el.classList.remove('d-none', 'alert-info', 'alert-warning', 'alert-danger', 'alert-success');
        el.classList.add('alert-' + (type || 'info'));
        el.innerHTML = msg;
    }

    const fmt = (n, dec = 2) => {
        if (n == null || isNaN(n)) return '—';
        return Number(n).toLocaleString('es-MX', {
            minimumFractionDigits: dec, maximumFractionDigits: dec
        });
    };
    const fmtCompact = (n) => {
        if (n == null || isNaN(n)) return '—';
        if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + ' M';
        if (Math.abs(n) >= 1e3) return (n / 1e3).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' k';
        return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
    };

    // Indexa filas por mes_num para acceso O(1)
    function byMonth(rows) {
        const map = {};
        (rows || []).forEach(r => { map[Number(r.mes_num)] = r; });
        return map;
    }

    /* ---------- Cargar años disponibles ---------- */
    async function loadAniosDisponibles(sb) {
        const { data, error } = await sb
            .from('ggen_energia_electrica')
            .select('anio')
            .order('anio', { ascending: false });
        if (error) throw error;
        const set = new Set((data || []).map(r => r.anio));
        // Asegurar año actual disponible
        set.add(new Date().getFullYear());
        const arr = Array.from(set).sort((a, b) => b - a);
        const sel = document.getElementById('ggen-anio-select');
        if (sel) {
            sel.innerHTML = arr.map(a => `<option value="${a}">${a}</option>`).join('');
            if (_currentAnio && arr.includes(_currentAnio)) {
                sel.value = String(_currentAnio);
            } else {
                _currentAnio = arr[0];
                sel.value = String(_currentAnio);
            }
        }
        return arr;
    }

    /* ---------- Cargar datos del año seleccionado ---------- */
    async function loadDataset(sb, anio) {
        const [elec, term, gas] = await Promise.all([
            sb.from('ggen_energia_electrica').select('*').eq('anio', anio).order('mes_num'),
            sb.from('ggen_energia_termica').select('*').eq('anio', anio).order('mes_num'),
            sb.from('ggen_consumo_gas').select('*').eq('anio', anio).order('mes_num')
        ]);
        if (elec.error) throw elec.error;
        if (term.error) throw term.error;
        if (gas.error)  throw gas.error;
        return { elec: elec.data || [], term: term.data || [], gas: gas.data || [] };
    }

    /* ---------- Render tablas ---------- */
    function renderTables(ds) {
        const eMap = byMonth(ds.elec);
        const tMap = byMonth(ds.term);
        const gMap = byMonth(ds.gas);

        // Recortar al último mes con dato (para no mostrar meses vacíos sobrantes)
        let lastIdx = 0;
        MESES_NUM.forEach(m => {
            if (eMap[m] || tMap[m] || gMap[m]) lastIdx = m;
        });
        const meses = MESES_NUM.slice(0, Math.max(lastIdx, 5));

        // ELÉCTRICA
        const tbElec = document.getElementById('ggen-tbl-elec');
        if (tbElec) {
            let totG = 0, totC = 0;
            const rows = meses.map(m => {
                const r = eMap[m]; const g = r?.generada_kwh || 0; const c = r?.consumo_cfe_kwh || 0;
                totG += Number(g); totC += Number(c);
                return `<tr><td class="fw-semibold">${MESES_LBL[m-1]}</td>
                    <td class="text-end">${r ? fmt(g) : '—'}</td>
                    <td class="text-end">${r ? fmt(c) : '—'}</td></tr>`;
            }).join('');
            tbElec.innerHTML = rows + `<tr class="ggen-total">
                <td>TOTAL</td>
                <td class="text-end">${fmt(totG)}</td>
                <td class="text-end">${fmt(totC)}</td></tr>`;
        }

        // TÉRMICA
        const tbTrh = document.getElementById('ggen-tbl-trh');
        if (tbTrh) {
            let tot = 0;
            const rows = meses.map(m => {
                const r = tMap[m]; const v = r?.trh || 0;
                tot += Number(v);
                return `<tr><td class="fw-semibold">${MESES_LBL[m-1]}</td>
                    <td class="text-end">${r ? fmt(v) : '—'}</td></tr>`;
            }).join('');
            tbTrh.innerHTML = rows + `<tr class="ggen-total"><td>TOTAL</td><td class="text-end">${fmt(tot)}</td></tr>`;
        }

        // GAS
        const tbGas = document.getElementById('ggen-tbl-gas');
        if (tbGas) {
            let tot = 0;
            const rows = meses.map(m => {
                const r = gMap[m]; const v = r?.gigajoules || 0;
                tot += Number(v);
                return `<tr><td class="fw-semibold">${MESES_LBL[m-1]}</td>
                    <td class="text-end">${r ? fmt(v, 4) : '—'}</td></tr>`;
            }).join('');
            tbGas.innerHTML = rows + `<tr class="ggen-total"><td>TOTAL</td><td class="text-end">${fmt(tot, 4)}</td></tr>`;
        }
    }

    /* ---------- Render KPIs ---------- */
    function renderKpis(ds) {
        const sumF = (arr, f) => arr.reduce((a, r) => a + Number(r[f] || 0), 0);
        const totG = sumF(ds.elec, 'generada_kwh');
        const totC = sumF(ds.elec, 'consumo_cfe_kwh');
        const totT = sumF(ds.term, 'trh');
        const totGas = sumF(ds.gas, 'gigajoules');
        const total = totG + totC;
        const pct = total > 0 ? (100 * totG / total) : 0;

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('ggen-kpi-generada', fmtCompact(totG));
        set('ggen-kpi-cfe',      fmtCompact(totC));
        set('ggen-kpi-pct',      fmt(pct, 1) + ' %');
        set('ggen-kpi-trh',      fmtCompact(totT));
        set('ggen-kpi-gas',      fmtCompact(totGas));
    }

    /* ---------- Charts ---------- */
    function destroyCharts() {
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    }

    function renderCharts(ds, anio) {
        if (typeof Chart === 'undefined') return;
        destroyCharts();

        // Defaults globales sutiles para esta sección
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        Chart.defaults.color = '#475569';

        const eMap = byMonth(ds.elec);
        const tMap = byMonth(ds.term);
        const gMap = byMonth(ds.gas);

        // Detectar último mes con dato (cualquier dataset) para no graficar ceros futuros
        let lastIdx = 0;
        MESES_NUM.forEach(m => {
            const hasE = eMap[m] && (Number(eMap[m].generada_kwh) || Number(eMap[m].consumo_cfe_kwh));
            const hasT = tMap[m] && Number(tMap[m].trh);
            const hasG = gMap[m] && Number(gMap[m].gigajoules);
            if (hasE || hasT || hasG) lastIdx = m;
        });
        const cutoff = lastIdx > 0 ? lastIdx : 1; // mínimo 1 mes para no quedar vacío
        const mesesEjes = MESES_NUM.slice(0, cutoff);
        const monthsArr = MESES_SHORT.slice(0, cutoff);
        const elecGen = mesesEjes.map(m => Number(eMap[m]?.generada_kwh || 0));
        const elecCfe = mesesEjes.map(m => Number(eMap[m]?.consumo_cfe_kwh || 0));
        const trhArr  = mesesEjes.map(m => Number(tMap[m]?.trh || 0));
        const gasArr  = mesesEjes.map(m => Number(gMap[m]?.gigajoules || 0));

        const baseTooltip = {
            backgroundColor: 'rgba(15,23,42,.92)',
            titleColor: '#fff', bodyColor: '#e2e8f0',
            titleFont: { weight: '700', size: 13 },
            bodyFont: { size: 12 },
            padding: 12, cornerRadius: 10,
            displayColors: true, boxPadding: 4,
            borderColor: 'rgba(255,255,255,.08)', borderWidth: 1
        };

        // Datalabels compactos sobre la barra/punto (solo si hay valor > 0)
        const dlAboveBar = (color) => ({
            display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
            anchor: 'end', align: 'top', offset: 2, clip: false,
            color: color || '#0f172a',
            font: { weight: '700', size: 10.5 },
            formatter: (v) => fmtCompact(v)
        });
        const dlPillOnPoint = (border, text) => ({
            display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
            anchor: 'end', align: 'top', offset: 8, clip: false,
            color: text || '#0f172a',
            backgroundColor: 'rgba(255,255,255,.96)',
            borderColor: border, borderWidth: 1, borderRadius: 6,
            padding: { top: 2, right: 6, bottom: 2, left: 6 },
            font: { weight: '700', size: 10.5 },
            formatter: (v) => fmtCompact(v)
        });

        const baseAxis = {
            y: {
                beginAtZero: true,
                grace: '12%',
                grid: { color: '#eef2f7', drawBorder: false },
                border: { display: false },
                ticks: { color: '#64748b', font: { size: 11, weight: '600' }, callback: v => fmtCompact(v), maxTicksLimit: 6 }
            },
            x: {
                grid: { display: false, drawBorder: false },
                border: { display: false },
                ticks: { color: '#475569', font: { size: 11, weight: '700' } }
            }
        };

        /* ── 1) Balance Eléctrico (barras agrupadas, gradiente) ── */
        const cEl = document.getElementById('ggen-chart-elec');
        if (cEl) {
            _charts.elec = new Chart(cEl, {
                type: 'bar',
                data: {
                    labels: monthsArr,
                    datasets: [
                        {
                            label: 'Generada', data: elecGen,
                            backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.gen, COL.genDark),
                            borderRadius: 8, borderSkipped: false, barPercentage: .82, categoryPercentage: .72,
                            hoverBackgroundColor: COL.gen
                        },
                        {
                            label: 'Consumo CFE', data: elecCfe,
                            backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.cfe, COL.cfeDark),
                            borderRadius: 8, borderSkipped: false, barPercentage: .82, categoryPercentage: .72,
                            hoverBackgroundColor: COL.cfe
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
                                label: (ctx) => `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y)} MWh`,
                                footer: (items) => {
                                    if (items.length < 2) return '';
                                    const g = items.find(i => i.dataset.label === 'Generada')?.parsed.y || 0;
                                    const c = items.find(i => i.dataset.label === 'Consumo CFE')?.parsed.y || 0;
                                    const tot = g + c; if (!tot) return '';
                                    return `Autogeneración: ${fmt(100*g/tot,1)} %`;
                                }
                            }
                        },
                        ggenCenterText: { display: false },
                        datalabels: dlAboveBar('#0f172a')
                    },
                    scales: baseAxis
                }
            });
        }

        /* ── 2) Mix YTD (doughnut con total al centro) ─────────── */
        const totG = elecGen.reduce((a, b) => a + b, 0);
        const totC = elecCfe.reduce((a, b) => a + b, 0);
        const totalMix = totG + totC;
        const cMix = document.getElementById('ggen-chart-mix');
        if (cMix) {
            _charts.mix = new Chart(cMix, {
                type: 'doughnut',
                data: {
                    labels: ['Autogenerada', 'CFE'],
                    datasets: [{
                        data: [totG, totC],
                        backgroundColor: [COL.gen, COL.cfe],
                        hoverBackgroundColor: [COL.genDark, COL.cfeDark],
                        borderColor: '#fff', borderWidth: 4, hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '68%',
                    animation: { animateRotate: true, animateScale: false, duration: 800 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
                                color: '#0f172a', font: { weight: '700', size: 12 }, padding: 12 }
                        },
                        tooltip: {
                            ...baseTooltip,
                            callbacks: {
                                label: (ctx) => {
                                    const pct = totalMix > 0 ? (100 * ctx.parsed / totalMix) : 0;
                                    return `  ${ctx.label}: ${fmt(ctx.parsed)} MWh  ·  ${fmt(pct,1)}%`;
                                }
                            }
                        },
                        ggenCenterText: {
                            display: true,
                            label: 'Demanda Total',
                            color: '#0f172a', subColor: '#94a3b8',
                            formatter: (v) => fmtCompact(v) + ' MWh'
                        },
                        datalabels: { display: false }
                    }
                }
            });
        }

        /* ── 3) Térmica (línea suave con área degradada + puntos) ── */
        const cTrh = document.getElementById('ggen-chart-trh');
        if (cTrh) {
            _charts.trh = new Chart(cTrh, {
                type: 'line',
                data: {
                    labels: monthsArr,
                    datasets: [{
                        label: 'TRh', data: trhArr,
                        borderColor: COL.trh, borderWidth: 3,
                        backgroundColor: (c) => {
                            const a = c.chart.chartArea;
                            if (!a) return COL.trh + '33';
                            const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
                            g.addColorStop(0, COL.trh + '66');
                            g.addColorStop(1, COL.trh + '08');
                            return g;
                        },
                        fill: true, tension: 0.4,
                        pointRadius: 5, pointHoverRadius: 8,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: COL.trh, pointBorderWidth: 2.5,
                        pointHoverBackgroundColor: COL.trh,
                        pointHoverBorderColor: '#fff'
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
                            callbacks: { label: (ctx) => `  TRh: ${fmt(ctx.parsed.y)}` }
                        },
                        ggenCenterText: { display: false },
                        datalabels: dlPillOnPoint(COL.trh, COL.trhDark)
                    },
                    scales: baseAxis
                }
            });
        }

        /* ── 4) Gas Natural (barras con gradiente y label discreto) ── */
        const cGas = document.getElementById('ggen-chart-gas');
        if (cGas) {
            _charts.gas = new Chart(cGas, {
                type: 'bar',
                data: {
                    labels: monthsArr,
                    datasets: [{
                        label: 'Gigajoules', data: gasArr,
                        backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.gas, COL.gasDark),
                        hoverBackgroundColor: COL.gas,
                        borderRadius: 8, borderSkipped: false,
                        barPercentage: .65, categoryPercentage: .8
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: { duration: 700, easing: 'easeOutQuart' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...baseTooltip,
                            callbacks: { label: (ctx) => `  ${fmt(ctx.parsed.y, 4)} GJ` }
                        },
                        ggenCenterText: { display: false },
                        datalabels: dlAboveBar(COL.gasDark)
                    },
                    scales: baseAxis
                }
            });
        }
    }

    /* ---------- Render principal ---------- */
    async function renderAll() {
        try {
            const sb = await getClient();
            setStatus('<i class="fas fa-spinner fa-spin me-1"></i>Cargando datos…', 'info');
            const anio = Number(document.getElementById('ggen-anio-select')?.value || _currentAnio || new Date().getFullYear());
            _currentAnio = anio;
            const ds = await loadDataset(sb, anio);
            renderKpis(ds);
            renderTables(ds);
            renderCharts(ds, anio);
            setStatus('');
        } catch (e) {
            console.error('[ggen] render error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>Error: ' + (e.message || e), 'danger');
        }
    }

    /* ---------- Modal de captura mensual ---------- */
    async function openUpsertAutoLoad() {
        const anioSel = Number(document.getElementById('ggen-anio-select')?.value || new Date().getFullYear());
        const now = new Date();
        document.getElementById('ggen-up-anio').value = anioSel;
        document.getElementById('ggen-up-mes').value  = String(now.getMonth() + 1);
        await loadMonthIntoForm();
    }

    async function loadMonthIntoForm() {
        const msg = document.getElementById('ggen-up-msg');
        try {
            const sb = await getClient();
            const anio = Number(document.getElementById('ggen-up-anio').value);
            const mes  = Number(document.getElementById('ggen-up-mes').value);
            if (!anio || !mes) return;
            const [e, t, g] = await Promise.all([
                sb.from('ggen_energia_electrica').select('generada_kwh,consumo_cfe_kwh').eq('anio', anio).eq('mes_num', mes).maybeSingle(),
                sb.from('ggen_energia_termica').select('trh').eq('anio', anio).eq('mes_num', mes).maybeSingle(),
                sb.from('ggen_consumo_gas').select('gigajoules').eq('anio', anio).eq('mes_num', mes).maybeSingle()
            ]);
            document.getElementById('ggen-up-generada').value = e.data?.generada_kwh ?? '';
            document.getElementById('ggen-up-cfe').value      = e.data?.consumo_cfe_kwh ?? '';
            document.getElementById('ggen-up-trh').value      = t.data?.trh ?? '';
            document.getElementById('ggen-up-gas').value      = g.data?.gigajoules ?? '';
            if (msg) msg.innerHTML = `<span class="text-muted"><i class="fas fa-info-circle me-1"></i>Valores actuales cargados para ${MESES_LBL[mes-1]} ${anio}.</span>`;
        } catch (err) {
            if (msg) msg.innerHTML = `<span class="text-danger"><i class="fas fa-triangle-exclamation me-1"></i>${err.message || err}</span>`;
        }
    }

    async function saveMonth() {
        const msg = document.getElementById('ggen-up-msg');
        const btn = document.getElementById('ggen-up-save');
        try {
            if (!canEdit()) {
                if (msg) msg.innerHTML = '<span class="text-danger"><i class="fas fa-lock me-1"></i>No tienes permisos de edición.</span>';
                return;
            }
            const sb = await getClient();
            const anio = Number(document.getElementById('ggen-up-anio').value);
            const mes  = Number(document.getElementById('ggen-up-mes').value);
            if (!anio || !mes || mes < 1 || mes > 12) throw new Error('Año/mes inválido');
            const mesNombre = MESES_LBL[mes - 1];

            const gen = Number(document.getElementById('ggen-up-generada').value || 0);
            const cfe = Number(document.getElementById('ggen-up-cfe').value || 0);
            const trh = Number(document.getElementById('ggen-up-trh').value || 0);
            const gas = Number(document.getElementById('ggen-up-gas').value || 0);

            btn.disabled = true;
            if (msg) msg.innerHTML = '<span class="text-muted"><i class="fas fa-spinner fa-spin me-1"></i>Guardando…</span>';

            const ops = [
                sb.from('ggen_energia_electrica').upsert(
                    { anio, mes_num: mes, mes_nombre: mesNombre, generada_kwh: gen, consumo_cfe_kwh: cfe },
                    { onConflict: 'anio,mes_num' }
                ),
                sb.from('ggen_energia_termica').upsert(
                    { anio, mes_num: mes, mes_nombre: mesNombre, trh },
                    { onConflict: 'anio,mes_num' }
                ),
                sb.from('ggen_consumo_gas').upsert(
                    { anio, mes_num: mes, mes_nombre: mesNombre, gigajoules: gas },
                    { onConflict: 'anio,mes_num' }
                )
            ];
            const results = await Promise.all(ops);
            const firstError = results.find(r => r.error)?.error;
            if (firstError) throw firstError;

            if (msg) msg.innerHTML = `<span class="text-success"><i class="fas fa-check-circle me-1"></i>${mesNombre} ${anio} guardado correctamente.</span>`;
            await loadAniosDisponibles(await getClient());
            await renderAll();
        } catch (err) {
            console.error('[ggen] save error', err);
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

        const anioSel = document.getElementById('ggen-anio-select');
        if (anioSel) anioSel.addEventListener('change', renderAll, _ev);

        const refresh = document.getElementById('ggen-refresh-btn');
        if (refresh) refresh.addEventListener('click', renderAll, _ev);

        const btnUp = document.getElementById('ggen-upsert-btn');
        if (btnUp) {
            btnUp.classList.toggle('d-none', !canEdit());
            btnUp.addEventListener('click', openUpsertAutoLoad, _ev);
        }

        const btnLoad = document.getElementById('ggen-up-load');
        if (btnLoad) btnLoad.addEventListener('click', loadMonthIntoForm, _ev);

        const btnSave = document.getElementById('ggen-up-save');
        if (btnSave) btnSave.addEventListener('click', saveMonth, _ev);

        // Recargar valores al cambiar año/mes en el modal
        ['ggen-up-anio', 'ggen-up-mes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', loadMonthIntoForm, _ev);
        });
    }

    /* ---------- API pública ---------- */
    window.initGgenEnergia = async function () {
        try {
            wireUi();
            const sb = await getClient();
            await loadAniosDisponibles(sb);
            await renderAll();
        } catch (e) {
            console.error('[ggen] init error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (e.message || e), 'danger');
        }
    };

    window.ggenReload = renderAll;

    // Contrato de ciclo de vida: liberar todo lo que el modulo abrio.
    // Sin esto, cada entrada a la seccion dejaba sus Chart vivos en memoria
    // y sus listeners colgados del DOM hasta cerrar la pestana.
    window.destroyGgenEnergia = function () {
        try { if (_ac) _ac.abort(); } catch (_) {}
        _ac = null;
        _initOnce = false;
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    };
})();
