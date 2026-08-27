// ===================================================================
//  Gerencia de Transformación · Mantenimientos B.T. (SGE → GTRANS)
//  Lee public.gtrans_mantenimientos_bt + public.gtrans_meta_anual
//  Dibuja KPIs YTD + 2 tablas + 4 gráficos (Chart.js)
//  Permite capturar / actualizar valores mensuales y meta anual.
//
//  API pública:
//    window.initGtransEnergia()  -> inicializa (hook showSection)
//    window.gtransReload()       -> recarga silenciosa
// ===================================================================
(function () {
    'use strict';

    const MESES_NUM   = [1,2,3,4,5,6,7,8,9,10,11,12];
    const MESES_LBL   = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                         'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const COL = {
        real:  '#16a34a', realDark:  '#14532d',
        prog:  '#2563eb', progDark:  '#1e3a8a',
        corr:  '#ea580c', corrDark:  '#9a3412',
        meta:  '#7c3aed', metaDark:  '#5b21b6',
        cumpl: '#0891b2', cumplDark: '#155e75',
        gap:   '#e2e8f0'
    };

    function vGradient(ctx, area, c1, c2) {
        if (!area) return c1;
        const g = ctx.createLinearGradient(0, area.bottom, 0, area.top);
        g.addColorStop(0, c2); g.addColorStop(1, c1); return g;
    }

    // Plugin: número grande + label al centro del doughnut
    const gtransCenterText = {
        id: 'gtransCenterText',
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
    try { if (typeof Chart !== 'undefined') Chart.register(gtransCenterText); } catch (_) {}

    let _charts = {};
    let _initOnce = false;
    // Ciclo de vida del modulo. Los listeners se registran con esta senal:
    // abortarla en destroy() los retira todos de golpe, sin tener que
    // acordarse de cada removeEventListener uno por uno.
    let _ac = null;
    let _currentAnio = null;

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
            if (window.appPermisos) return window.appPermisos.puedeEditar('gtrans-energia');
            const role = sessionStorage.getItem('user_role') || '';
            if (role === 'admin' || role === 'superadmin') return true;
            const ovr = (window.dataManager && window.dataManager.sectionLevels || {})['gtrans-energia'];
            if (ovr === 'read' || ovr === 'none') return false;
            if (ovr === 'capture' || ovr === 'edit') return true;
            return ['editor'].includes(role);
        } catch (_) { return false; }
    }

    function setStatus(msg, type) {
        const el = document.getElementById('gtrans-status');
        if (!el) return;
        if (!msg) { el.classList.add('d-none'); el.innerHTML = ''; return; }
        el.classList.remove('d-none','alert-info','alert-warning','alert-danger','alert-success');
        el.classList.add('alert-' + (type || 'info'));
        el.innerHTML = msg;
    }

    const fmtInt = (n) => (n == null || isNaN(n)) ? '—'
        : Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    const fmtPct = (n, d = 1) => (n == null || isNaN(n)) ? '—'
        : Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';

    function byMonth(rows) {
        const map = {};
        (rows || []).forEach(r => { map[Number(r.mes_num)] = r; });
        return map;
    }

    /* ---------- Cargar años disponibles ---------- */
    async function loadAniosDisponibles(sb) {
        const [{ data: aBT }, { data: aMeta }] = await Promise.all([
            sb.from('gtrans_mantenimientos_bt').select('anio').order('anio', { ascending: false }),
            sb.from('gtrans_meta_anual').select('anio').order('anio', { ascending: false })
        ]);
        const set = new Set();
        (aBT || []).forEach(r => set.add(r.anio));
        (aMeta || []).forEach(r => set.add(r.anio));
        set.add(new Date().getFullYear());
        const arr = Array.from(set).sort((a,b) => b - a);
        const sel = document.getElementById('gtrans-anio-select');
        if (sel) {
            sel.innerHTML = arr.map(a => `<option value="${a}">${a}</option>`).join('');
            if (_currentAnio && arr.includes(_currentAnio)) sel.value = String(_currentAnio);
            else { _currentAnio = arr[0]; sel.value = String(_currentAnio); }
        }
        return arr;
    }

    /* ---------- Cargar dataset del año ---------- */
    async function loadDataset(sb, anio) {
        const [bt, meta] = await Promise.all([
            sb.from('gtrans_mantenimientos_bt').select('*').eq('anio', anio).order('mes_num'),
            sb.from('gtrans_meta_anual').select('*').eq('anio', anio).maybeSingle()
        ]);
        if (bt.error) throw bt.error;
        if (meta.error && meta.error.code !== 'PGRST116') throw meta.error;
        return {
            bt: bt.data || [],
            meta: meta.data || null
        };
    }

    /* ---------- Tablas ---------- */
    function renderTables(ds) {
        const map = byMonth(ds.bt);

        // último mes con dato (para no mostrar meses vacíos sobrantes)
        let lastIdx = 0;
        MESES_NUM.forEach(m => {
            const r = map[m];
            if (r && ((Number(r.preventivos_realizados) || 0) + (Number(r.preventivos_programados) || 0) + (Number(r.correctivos_luminarias) || 0)) > 0) {
                lastIdx = m;
            }
        });
        const meses = MESES_NUM.slice(0, Math.max(lastIdx, 5));

        // Tabla principal
        const tbBT = document.getElementById('gtrans-tbl-bt');
        if (tbBT) {
            let totR = 0, totP = 0, totL = 0;
            const rows = meses.map(m => {
                const r = map[m];
                const rr = r ? Number(r.preventivos_realizados)  || 0 : null;
                const pp = r ? Number(r.preventivos_programados) || 0 : null;
                const ll = r ? Number(r.correctivos_luminarias)  || 0 : null;
                if (r) { totR += rr; totP += pp; totL += ll; }
                return `<tr>
                    <td class="gx-mes">${MESES_LBL[m-1]}</td>
                    <td>${r ? fmtInt(rr) : '—'}</td>
                    <td>${r ? fmtInt(pp) : '—'}</td>
                    <td>${r ? fmtInt(ll) : '—'}</td>
                </tr>`;
            }).join('');
            tbBT.innerHTML = rows + `<tr class="gx-total">
                <td>TOTAL</td>
                <td>${fmtInt(totR)}</td>
                <td>${fmtInt(totP)}</td>
                <td>${fmtInt(totL)}</td>
            </tr>`;
        }

        // Tabla resumen (Realizados / Programados YTD)
        const tbRes = document.getElementById('gtrans-tbl-resumen');
        if (tbRes) {
            const totR = ds.bt.reduce((a, r) => a + (Number(r.preventivos_realizados) || 0), 0);
            const totP = ds.bt.reduce((a, r) => a + (Number(r.preventivos_programados) || 0), 0);
            tbRes.innerHTML = `<tr class="gx-total"><td>${fmtInt(totR)}</td><td>${fmtInt(totP)}</td></tr>`;
        }

        // Mini card de avance vs meta
        const totR = ds.bt.reduce((a, r) => a + (Number(r.preventivos_realizados) || 0), 0);
        const metaAnual = Number(ds.meta?.preventivos_anual_meta || 0);
        const pct = metaAnual > 0 ? (100 * totR / metaAnual) : null;
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set('gtrans-mini-real', fmtInt(totR));
        set('gtrans-mini-meta', metaAnual ? fmtInt(metaAnual) : '—');
        set('gtrans-mini-pct',  pct == null ? '—' : fmtPct(pct, 2));
        const bar = document.getElementById('gtrans-mini-bar');
        if (bar) bar.style.width = Math.min(100, Math.max(0, pct || 0)) + '%';

        // Rango cubierto
        if (lastIdx > 0) set('gtrans-mini-rango', `Enero – ${MESES_LBL[lastIdx-1].charAt(0) + MESES_LBL[lastIdx-1].slice(1).toLowerCase()}`);
        else set('gtrans-mini-rango', '—');
    }

    /* ---------- KPIs ---------- */
    function renderKpis(ds) {
        const totR = ds.bt.reduce((a, r) => a + (Number(r.preventivos_realizados) || 0), 0);
        const totP = ds.bt.reduce((a, r) => a + (Number(r.preventivos_programados) || 0), 0);
        const totL = ds.bt.reduce((a, r) => a + (Number(r.correctivos_luminarias)  || 0), 0);
        const metaAnual = Number(ds.meta?.preventivos_anual_meta || 0);
        const pctAv = metaAnual > 0 ? (100 * totR / metaAnual) : null;
        const pctCu = totP > 0 ? (100 * totR / totP) : null;

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('gtrans-kpi-real',   fmtInt(totR));
        set('gtrans-kpi-prog',   fmtInt(totP));
        set('gtrans-kpi-avance', pctAv == null ? '—' : fmtPct(pctAv, 2));
        set('gtrans-kpi-meta-txt', metaAnual ? `Meta anual: ${fmtInt(metaAnual)} preventivos` : 'Sin meta capturada');
        set('gtrans-kpi-cumpl',  pctCu == null ? '—' : fmtPct(pctCu, 1));
        set('gtrans-kpi-lum',    fmtInt(totL));
    }

    /* ---------- Charts ---------- */
    function destroyCharts() {
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    }

    function renderCharts(ds, anio) {
        if (typeof Chart === 'undefined') return;
        destroyCharts();

        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        Chart.defaults.color = '#475569';

        const map = byMonth(ds.bt);

        let lastIdx = 0;
        MESES_NUM.forEach(m => {
            const r = map[m];
            if (r && ((Number(r.preventivos_realizados) || 0) + (Number(r.preventivos_programados) || 0) + (Number(r.correctivos_luminarias) || 0)) > 0) {
                lastIdx = m;
            }
        });
        const cutoff = lastIdx > 0 ? lastIdx : 1;
        const mesesEjes = MESES_NUM.slice(0, cutoff);
        const monthsArr = MESES_SHORT.slice(0, cutoff);
        const arrReal = mesesEjes.map(m => Number(map[m]?.preventivos_realizados  || 0));
        const arrProg = mesesEjes.map(m => Number(map[m]?.preventivos_programados || 0));
        const arrLum  = mesesEjes.map(m => Number(map[m]?.correctivos_luminarias  || 0));
        const arrPct  = mesesEjes.map(m => {
            const p = Number(map[m]?.preventivos_programados || 0);
            const r = Number(map[m]?.preventivos_realizados  || 0);
            return p > 0 ? Math.round(1000 * r / p) / 10 : 0;
        });

        const baseTooltip = {
            backgroundColor: 'rgba(15,23,42,.92)',
            titleColor: '#fff', bodyColor: '#e2e8f0',
            titleFont: { weight: '700', size: 13 },
            bodyFont:  { size: 12 },
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
        const dlPillOnPoint = (border, text, suffix) => ({
            display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
            anchor: 'end', align: 'top', offset: 8, clip: false,
            color: text || '#0f172a',
            backgroundColor: 'rgba(255,255,255,.96)',
            borderColor: border, borderWidth: 1, borderRadius: 6,
            padding: { top: 2, right: 6, bottom: 2, left: 6 },
            font: { weight: '700', size: 10.5 },
            formatter: (v) => fmtInt(v) + (suffix || '')
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

        /* ── 1) Preventivos: Realizados vs Programados ── */
        const cPrev = document.getElementById('gtrans-chart-prev');
        if (cPrev) {
            _charts.prev = new Chart(cPrev, {
                type: 'bar',
                data: {
                    labels: monthsArr,
                    datasets: [
                        {
                            label: 'Realizados', data: arrReal,
                            backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.real, COL.realDark),
                            borderRadius: 8, borderSkipped: false, barPercentage: .82, categoryPercentage: .72,
                            hoverBackgroundColor: COL.real
                        },
                        {
                            label: 'Programados', data: arrProg,
                            backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.prog, COL.progDark),
                            borderRadius: 8, borderSkipped: false, barPercentage: .82, categoryPercentage: .72,
                            hoverBackgroundColor: COL.prog
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
                                    if (items.length < 2) return '';
                                    const r = items.find(i => i.dataset.label === 'Realizados')?.parsed.y || 0;
                                    const p = items.find(i => i.dataset.label === 'Programados')?.parsed.y || 0;
                                    if (!p) return '';
                                    return `Cumplimiento: ${fmtPct(100*r/p, 1)}`;
                                }
                            }
                        },
                        gtransCenterText: { display: false },
                        datalabels: dlAboveBar('#0f172a')
                    },
                    scales: baseAxis
                }
            });
        }

        /* ── 2) Avance Anual vs Meta (doughnut) ── */
        const totR = arrReal.reduce((a,b) => a + b, 0);
        const metaAnual = Number(ds.meta?.preventivos_anual_meta || 0);
        const restante  = Math.max(0, metaAnual - totR);
        const pctAvance = metaAnual > 0 ? (100 * totR / metaAnual) : 0;
        const cAv = document.getElementById('gtrans-chart-avance');
        if (cAv) {
            _charts.avance = new Chart(cAv, {
                type: 'doughnut',
                data: {
                    labels: ['Realizados', 'Por ejecutar'],
                    datasets: [{
                        data: metaAnual > 0 ? [totR, restante] : [0, 1],
                        backgroundColor: metaAnual > 0 ? [COL.real, COL.gap] : ['#e2e8f0', '#e2e8f0'],
                        hoverBackgroundColor: metaAnual > 0 ? [COL.realDark, '#cbd5e1'] : ['#cbd5e1','#cbd5e1'],
                        borderColor: '#fff', borderWidth: 4, hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '70%',
                    animation: { animateRotate: true, animateScale: false, duration: 800 },
                    plugins: {
                        legend: metaAnual > 0 ? {
                            position: 'bottom',
                            labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
                                color: '#0f172a', font: { weight: '700', size: 12 }, padding: 12 }
                        } : { display: false },
                        tooltip: metaAnual > 0 ? {
                            ...baseTooltip,
                            callbacks: { label: (ctx) => `  ${ctx.label}: ${fmtInt(ctx.parsed)} mant.` }
                        } : { enabled: false },
                        gtransCenterText: {
                            display: true,
                            value: metaAnual > 0 ? fmtPct(pctAvance, 1) : '—',
                            label: metaAnual > 0 ? 'Avance anual' : 'Sin meta',
                            sub2:  metaAnual > 0 ? `${fmtInt(totR)} / ${fmtInt(metaAnual)}` : 'capturar meta',
                            color: COL.metaDark, subColor: '#64748b'
                        },
                        datalabels: { display: false }
                    }
                }
            });
        }

        /* ── 3) Luminarias Reemplazadas (barras) ── */
        const cLum = document.getElementById('gtrans-chart-lum');
        if (cLum) {
            _charts.lum = new Chart(cLum, {
                type: 'bar',
                data: {
                    labels: monthsArr,
                    datasets: [{
                        label: 'Luminarias', data: arrLum,
                        backgroundColor: (c) => vGradient(c.chart.ctx, c.chart.chartArea, COL.corr, COL.corrDark),
                        hoverBackgroundColor: COL.corr,
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
                            callbacks: { label: (ctx) => `  ${fmtInt(ctx.parsed.y)} luminarias` }
                        },
                        gtransCenterText: { display: false },
                        datalabels: dlAboveBar(COL.corrDark)
                    },
                    scales: baseAxis
                }
            });
        }

        /* ── 4) Cumplimiento mensual % (línea suave con pills) ── */
        const cCu = document.getElementById('gtrans-chart-cumpl');
        if (cCu) {
            _charts.cumpl = new Chart(cCu, {
                type: 'line',
                data: {
                    labels: monthsArr,
                    datasets: [{
                        label: 'Cumplimiento', data: arrPct,
                        borderColor: COL.cumpl, borderWidth: 3,
                        backgroundColor: (c) => {
                            const a = c.chart.chartArea;
                            if (!a) return COL.cumpl + '33';
                            const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
                            g.addColorStop(0, COL.cumpl + '66'); g.addColorStop(1, COL.cumpl + '08');
                            return g;
                        },
                        fill: true, tension: 0.4,
                        pointRadius: 5, pointHoverRadius: 8,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: COL.cumpl, pointBorderWidth: 2.5,
                        pointHoverBackgroundColor: COL.cumpl,
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
                            callbacks: { label: (ctx) => `  Cumplimiento: ${fmtPct(ctx.parsed.y, 1)}` }
                        },
                        gtransCenterText: { display: false },
                        datalabels: {
                            display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
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
            const anio = Number(document.getElementById('gtrans-anio-select')?.value || _currentAnio || new Date().getFullYear());
            _currentAnio = anio;
            const ds = await loadDataset(sb, anio);
            renderKpis(ds);
            renderTables(ds);
            renderCharts(ds, anio);
            setStatus('');
        } catch (e) {
            console.error('[gtrans] render error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>Error: ' + (e.message || e), 'danger');
        }
    }

    /* ---------- Modal de captura mensual ---------- */
    async function openUpsertAutoLoad() {
        const anioSel = Number(document.getElementById('gtrans-anio-select')?.value || new Date().getFullYear());
        const now = new Date();
        document.getElementById('gtrans-up-anio').value = anioSel;
        document.getElementById('gtrans-up-mes').value  = String(now.getMonth() + 1);
        await loadMonthIntoForm();
    }

    async function loadMonthIntoForm() {
        const msg = document.getElementById('gtrans-up-msg');
        try {
            const sb = await getClient();
            const anio = Number(document.getElementById('gtrans-up-anio').value);
            const mes  = Number(document.getElementById('gtrans-up-mes').value);
            if (!anio || !mes) return;
            const [bt, meta] = await Promise.all([
                sb.from('gtrans_mantenimientos_bt')
                  .select('preventivos_realizados,preventivos_programados,correctivos_luminarias')
                  .eq('anio', anio).eq('mes_num', mes).maybeSingle(),
                sb.from('gtrans_meta_anual')
                  .select('preventivos_anual_meta')
                  .eq('anio', anio).maybeSingle()
            ]);
            document.getElementById('gtrans-up-real').value = bt.data?.preventivos_realizados  ?? '';
            document.getElementById('gtrans-up-prog').value = bt.data?.preventivos_programados ?? '';
            document.getElementById('gtrans-up-lum').value  = bt.data?.correctivos_luminarias  ?? '';
            document.getElementById('gtrans-up-meta').value = meta.data?.preventivos_anual_meta ?? '';
            if (msg) msg.innerHTML = `<span class="text-muted"><i class="fas fa-info-circle me-1"></i>Valores actuales cargados para ${MESES_LBL[mes-1]} ${anio}.</span>`;
        } catch (err) {
            if (msg) msg.innerHTML = `<span class="text-danger"><i class="fas fa-triangle-exclamation me-1"></i>${err.message || err}</span>`;
        }
    }

    async function saveMonth() {
        const msg = document.getElementById('gtrans-up-msg');
        const btn = document.getElementById('gtrans-up-save');
        try {
            if (!canEdit()) {
                if (msg) msg.innerHTML = '<span class="text-danger"><i class="fas fa-lock me-1"></i>No tienes permisos de edición.</span>';
                return;
            }
            const sb = await getClient();
            const anio = Number(document.getElementById('gtrans-up-anio').value);
            const mes  = Number(document.getElementById('gtrans-up-mes').value);
            if (!anio || !mes || mes < 1 || mes > 12) throw new Error('Año/mes inválido');
            const mesNombre = MESES_LBL[mes - 1];

            const real = Number(document.getElementById('gtrans-up-real').value || 0);
            const prog = Number(document.getElementById('gtrans-up-prog').value || 0);
            const lum  = Number(document.getElementById('gtrans-up-lum').value  || 0);
            const metaRaw = document.getElementById('gtrans-up-meta').value;
            const meta = metaRaw === '' ? null : Number(metaRaw);

            btn.disabled = true;
            if (msg) msg.innerHTML = '<span class="text-muted"><i class="fas fa-spinner fa-spin me-1"></i>Guardando…</span>';

            const ops = [
                sb.from('gtrans_mantenimientos_bt').upsert(
                    {
                        anio, mes_num: mes, mes_nombre: mesNombre,
                        preventivos_realizados:  real,
                        preventivos_programados: prog,
                        correctivos_luminarias:  lum
                    },
                    { onConflict: 'anio,mes_num' }
                )
            ];
            if (meta != null && !isNaN(meta) && meta >= 0) {
                ops.push(
                    sb.from('gtrans_meta_anual').upsert(
                        { anio, preventivos_anual_meta: meta },
                        { onConflict: 'anio' }
                    )
                );
            }
            const results = await Promise.all(ops);
            const firstError = results.find(r => r.error)?.error;
            if (firstError) throw firstError;

            if (msg) msg.innerHTML = `<span class="text-success"><i class="fas fa-check-circle me-1"></i>${mesNombre} ${anio} guardado correctamente.</span>`;
            await loadAniosDisponibles(await getClient());
            await renderAll();
        } catch (err) {
            console.error('[gtrans] save error', err);
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

        const anioSel = document.getElementById('gtrans-anio-select');
        if (anioSel) anioSel.addEventListener('change', renderAll, _ev);

        const refresh = document.getElementById('gtrans-refresh-btn');
        if (refresh) refresh.addEventListener('click', renderAll, _ev);

        const btnUp = document.getElementById('gtrans-upsert-btn');
        if (btnUp) {
            btnUp.classList.toggle('d-none', !canEdit());
            btnUp.addEventListener('click', openUpsertAutoLoad, _ev);
        }

        const btnLoad = document.getElementById('gtrans-up-load');
        if (btnLoad) btnLoad.addEventListener('click', loadMonthIntoForm, _ev);

        const btnSave = document.getElementById('gtrans-up-save');
        if (btnSave) btnSave.addEventListener('click', saveMonth, _ev);

        ['gtrans-up-anio', 'gtrans-up-mes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', loadMonthIntoForm, _ev);
        });
    }

    /* ---------- API pública ---------- */
    window.initGtransEnergia = async function () {
        try {
            wireUi();
            const sb = await getClient();
            await loadAniosDisponibles(sb);
            await renderAll();
        } catch (e) {
            console.error('[gtrans] init error', e);
            setStatus('<i class="fas fa-triangle-exclamation me-1"></i>' + (e.message || e), 'danger');
        }
    };

    window.gtransReload = renderAll;

    // Contrato de ciclo de vida: liberar todo lo que el modulo abrio.
    // Sin esto, cada entrada a la seccion dejaba sus Chart vivos en memoria
    // y sus listeners colgados del DOM hasta cerrar la pestana.
    window.destroyGtransEnergia = function () {
        try { if (_ac) _ac.abort(); } catch (_) {}
        _ac = null;
        _initOnce = false;
        Object.values(_charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        _charts = {};
    };
})();
