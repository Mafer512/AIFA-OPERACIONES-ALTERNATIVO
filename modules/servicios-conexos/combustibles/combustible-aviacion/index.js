/* ============================================================
 *  SSC · Servicios Conexos · Combustibles
 *  "Concentrado de litros de combustible de aviación suministrado"
 *
 *  Módulo autocontenido (programación modular):
 *    - Inyecta su propia plantilla en #combustibles-section.
 *    - Lee/gestiona public.combustible_aviacion (Supabase).
 *    - Dashboard: KPIs + gráfica (líneas multi-año ↔ histograma
 *      continuo) + tabla concentrado por año (litros y promedio
 *      diario derivado).
 *    - Editor (solo isAdmin): capturar / editar litros por mes/año.
 *
 *  Módulo extraído: el marcado y los estilos viven en view.html y
 *  esto se carga la primera vez que se abre la sección. Lo enciende
 *  initCombustibles(), llamado por el loader.
 * ============================================================ */
;(function () {
    'use strict';

    const TBL = 'combustible_aviacion';

    const MES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const MES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                       'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    // Paleta por año (consistente con las gráficas de referencia)
    const YEAR_COLORS = {
        2022: '#15803d', 2023: '#1e3a8a', 2024: '#ea580c',
        2025: '#0ea5e9', 2026: '#a21caf',
    };
    const FALLBACK_COLORS = ['#0e7490','#7c3aed','#dc2626','#0891b2','#65a30d','#db2777'];

    const state = {
        rows: [],          // [{ id, anio, mes, litros, observaciones }]
        byYearMonth: new Map(), // 'anio-mes' -> row
        years: [],
        activeYears: new Set(), // años visibles en la gráfica
        loaded: false,
        loading: false,
        chartMode: 'lineas', // 'lineas' | 'histograma'
        tableYear: null,
        editYear: null,
        editRows: [],      // [{ mes, litros, _orig, _dirty }]
    };

    const charts = { main: null };
    let initDone = false;

    // ─── Helpers ───────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const fmt = (n) => {
        if (n === null || n === undefined || isNaN(n)) return '0';
        return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    };
    const fmtCompact = (n) => {
        const v = Number(n) || 0;
        const abs = Math.abs(v);
        if (abs >= 1e6) return (v / 1e6).toFixed(abs >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
        if (abs >= 1e3) return (v / 1e3).toFixed(abs >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
        return Math.round(v).toString();
    };
    function toNum(v) {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        const n = parseFloat(String(v).replace(/[\s,]/g, ''));
        return isFinite(n) ? n : 0;
    }
    function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
    function colorForYear(y, idx) { return YEAR_COLORS[y] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]; }
    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') return await window.ensureSupabaseClient();
        return null;
    }
    function isAdmin() { return !!(window.dataManager && window.dataManager.isAdmin); }

    function setStatus(text, kind) {
        const el = $('comb-status-badge'); if (!el) return;
        el.textContent = text;
        const cls = ({ ok:'bg-success', warn:'bg-warning text-dark', err:'bg-danger', info:'bg-info text-dark', mute:'bg-secondary' }[kind]) || 'bg-secondary';
        el.className = 'badge ' + cls;
    }

    // ─── Plantilla ─────────────────────────────────────────────
    // La plantilla ya no se inyecta desde aquí: vive en view.html y el loader
    // la deja puesta antes de evaluar este archivo. Lo único que queda es
    // cablear los controles, una sola vez.
    function ensureTemplate() {
        const host = $('combustibles-section');
        if (!host) return false;
        if (host.dataset.ready !== '1') {
            host.dataset.ready = '1';
            bind();
        }
        return true;
    }

    // ─── Carga ─────────────────────────────────────────────────
    async function loadAll(force) {
        if (state.loading) return;
        if (state.loaded && !force) return;
        state.loading = true;
        setStatus('Cargando…', 'info');
        try {
            const client = await getClient();
            if (!client) throw new Error('Supabase no disponible');
            const { data, error } = await client
                .from(TBL)
                .select('id, anio, mes, litros, observaciones')
                .order('anio', { ascending: true })
                .order('mes', { ascending: true });
            if (error) throw error;
            state.rows = (data || []).map(r => ({
                id: r.id, anio: Number(r.anio), mes: Number(r.mes),
                litros: toNum(r.litros), observaciones: r.observaciones || '',
            }));
            indexRows();
            state.loaded = true;
            setStatus(`${state.rows.length} registros · ${state.years.length} años`, 'ok');
        } catch (err) {
            console.error('[combustibles] loadAll error:', err);
            setStatus('Error al cargar', 'err');
        } finally {
            state.loading = false;
        }
    }

    function indexRows() {
        state.byYearMonth = new Map();
        const ySet = new Set();
        for (const r of state.rows) {
            ySet.add(r.anio);
            state.byYearMonth.set(`${r.anio}-${r.mes}`, r);
        }
        state.years = [...ySet].sort((a, b) => a - b);
        if (!state.years.length) state.years.push(new Date().getFullYear());
        // Activa por defecto todos los años; conserva selección previa para los que sigan existiendo.
        if (!state.activeYears.size) {
            state.activeYears = new Set(state.years);
        } else {
            state.activeYears = new Set(state.years.filter(y => state.activeYears.has(y)));
            if (!state.activeYears.size) state.activeYears = new Set(state.years);
        }
        if (!state.years.includes(state.tableYear)) state.tableYear = state.years[state.years.length - 1];
        if (!state.years.includes(state.editYear)) state.editYear = state.years[state.years.length - 1];
    }

    // ─── Agregaciones ──────────────────────────────────────────
    function litros(year, month) {
        const r = state.byYearMonth.get(`${year}-${month}`);
        return r ? r.litros : 0;
    }
    function hasData(year, month) { return state.byYearMonth.has(`${year}-${month}`); }
    function yearTotal(year) {
        let t = 0; for (let m = 1; m <= 12; m++) t += litros(year, m); return t;
    }
    function grandTotal() {
        return state.rows.reduce((a, r) => a + r.litros, 0);
    }
    function lastRecorded() {
        let best = null;
        for (const r of state.rows) {
            if (!best || r.anio > best.anio || (r.anio === best.anio && r.mes > best.mes)) best = r;
        }
        return best;
    }

    // ─── KPIs ──────────────────────────────────────────────────
    function renderKpis() {
        $('comb-kpi-total').textContent = fmt(grandTotal());
        const curYear = state.years[state.years.length - 1];
        $('comb-kpi-anio').textContent = fmtCompact(yearTotal(curYear));
        $('comb-kpi-anio-label').textContent = `litros · ${curYear}`;
        const last = lastRecorded();
        if (last) {
            $('comb-kpi-mes').textContent = fmtCompact(last.litros);
            $('comb-kpi-mes-label').textContent = `${MES_LARGO[last.mes - 1]} ${last.anio}`;
            const dias = daysInMonth(last.anio, last.mes);
            $('comb-kpi-prom').textContent = fmt(Math.round(last.litros / dias));
        } else {
            $('comb-kpi-mes').textContent = '—';
            $('comb-kpi-mes-label').textContent = '—';
            $('comb-kpi-prom').textContent = '—';
        }
    }

    // ─── Gráfica ───────────────────────────────────────────────
    function destroyChart() {
        if (charts.main) { try { charts.main.destroy(); } catch (_) {} charts.main = null; }
    }

    function renderChart() {
        const canvas = $('comb-chart-main'); if (!canvas || !window.Chart) return;
        renderYearToggles();
        destroyChart();
        const titleEl = $('comb-chart-title-text');
        if (state.chartMode === 'lineas') {
            if (titleEl) titleEl.textContent = 'Combustible de aviación suministrado (por año)';
            renderLineChart(canvas);
        } else {
            if (titleEl) titleEl.textContent = 'Suministro continuo de combustible (desde inicio de operación)';
            renderHistogram(canvas);
        }
    }

    function renderYearToggles() {
        const host = $('comb-year-toggles'); if (!host) return;
        host.innerHTML = '<span class="comb-toggles-label">Años:</span>' + state.years.map((y, idx) => {
            const color = colorForYear(y, idx);
            const on = state.activeYears.has(y);
            return `<label class="comb-year-switch" style="--comb-yc:${color}">
                <input type="checkbox" class="comb-year-chk" data-year="${y}" ${on ? 'checked' : ''}>
                <span class="comb-year-track"></span>
                <span class="comb-year-name">${y}</span>
            </label>`;
        }).join('');
        host.querySelectorAll('.comb-year-chk').forEach(chk => {
            chk.addEventListener('change', () => {
                const y = Number(chk.dataset.year);
                if (chk.checked) state.activeYears.add(y); else state.activeYears.delete(y);
                renderChart();
            });
        });
    }

    function renderLineChart(canvas) {
        const years = state.years.filter(y => state.activeYears.has(y));
        const datasets = years.map((y) => {
            const idx = state.years.indexOf(y);
            const color = colorForYear(y, idx);
            const data = MES_CORTO.map((_, i) => hasData(y, i + 1) ? litros(y, i + 1) : null);
            return {
                label: String(y), data, borderColor: color, backgroundColor: color,
                borderWidth: 2.5, tension: 0.3, spanGaps: false,
                pointRadius: 2.5, pointHoverRadius: 5,
            };
        });
        charts.main = new Chart(canvas, {
            type: 'line',
            data: { labels: MES_LARGO, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)} L` } },
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: (v) => fmtCompact(v) }, title: { display: true, text: 'Litros suministrados' } },
                },
            },
        });
    }

    function renderHistogram(canvas) {
        const labels = [], data = [], pointColors = [], boundaries = [];
        state.years.forEach((y, yi) => {
            if (!state.activeYears.has(y)) return;
            for (let m = 1; m <= 12; m++) {
                if (!hasData(y, m)) continue;
                labels.push(`${MES_CORTO[m - 1]} ${String(y).slice(2)}`);
                data.push(litros(y, m));
                pointColors.push(colorForYear(y, yi));
                if (m === 1 && labels.length > 1) boundaries.push(labels.length - 1);
            }
        });
        const yearLinePlugin = {
            id: 'combYearSeparators',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                if (!chartArea) return;
                ctx.save();
                ctx.strokeStyle = 'rgba(22,163,74,.55)';
                ctx.lineWidth = 1.5;
                boundaries.forEach(bi => {
                    const x = scales.x.getPixelForValue(bi) - (scales.x.getPixelForValue(1) - scales.x.getPixelForValue(0)) / 2;
                    ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
                });
                ctx.restore();
            },
        };
        charts.main = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Litros suministrados', data,
                    borderColor: '#1d4ed8', backgroundColor: 'rgba(29,78,216,.08)',
                    borderWidth: 2, fill: true, tension: 0.15,
                    pointRadius: 3, pointHoverRadius: 5,
                    pointBackgroundColor: pointColors, pointBorderColor: pointColors,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: { callbacks: { label: (c) => `${fmt(c.parsed.y)} L` } },
                },
                scales: {
                    x: { ticks: { maxRotation: 90, minRotation: 60, autoSkip: true, maxTicksLimit: 24 } },
                    y: { beginAtZero: true, ticks: { callback: (v) => fmtCompact(v) }, title: { display: true, text: 'Litros suministrados' } },
                },
            },
            plugins: [yearLinePlugin],
        });
    }

    // ─── Tabla concentrado ─────────────────────────────────────
    function renderTable() {
        const table = $('comb-table'); if (!table) return;
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        const tfoot = table.querySelector('tfoot');
        const years = state.years;

        let h1 = '<tr><th rowspan="2" class="comb-mes">MES</th>';
        years.forEach(y => { h1 += `<th colspan="2">AÑO ${y}</th>`; });
        h1 += '</tr><tr>';
        years.forEach(() => { h1 += '<th>Litros</th><th>Promedio diario</th>'; });
        h1 += '</tr>';
        thead.innerHTML = h1;

        let body = '';
        for (let m = 1; m <= 12; m++) {
            body += `<tr><td class="comb-mes">${MES_LARGO[m - 1]}</td>`;
            years.forEach(y => {
                if (hasData(y, m)) {
                    const l = litros(y, m);
                    const prom = Math.round(l / daysInMonth(y, m));
                    body += `<td>${fmt(l)}</td><td class="comb-prom">${fmt(prom)}</td>`;
                } else {
                    body += `<td class="text-muted">—</td><td class="text-muted comb-prom">—</td>`;
                }
            });
            body += '</tr>';
        }
        tbody.innerHTML = body;

        let foot = '<tr><td class="comb-mes">SUBTOTAL</td>';
        years.forEach(y => { foot += `<td>${fmt(yearTotal(y))}</td><td></td>`; });
        foot += '</tr>';
        tfoot.innerHTML = foot;

        $('comb-total-acum').textContent = `${fmt(grandTotal())} litros`;
    }

    function renderDashboard() {
        renderKpis();
        renderChart();
        renderTable();
    }

    // ─── Editor (admin) ────────────────────────────────────────
    function populateEditYears() {
        const sel = $('comb-edit-year'); if (!sel) return;
        const nextYear = new Date().getFullYear() + 1;
        const all = new Set(state.years);
        for (let y = state.years[0] || nextYear; y <= nextYear; y++) all.add(y);
        const list = [...all].sort((a, b) => b - a);
        sel.innerHTML = list.map(y => `<option value="${y}">${y}</option>`).join('');
        sel.value = String(state.editYear || list[0]);
    }

    function loadEditor() {
        const sel = $('comb-edit-year');
        state.editYear = Number(sel?.value) || new Date().getFullYear();
        state.editRows = MES_LARGO.map((_, i) => {
            const m = i + 1;
            const has = hasData(state.editYear, m);
            const val = has ? litros(state.editYear, m) : '';
            return { mes: m, litros: val, _orig: has ? String(val) : '', _dirty: false };
        });
        renderEditor();
    }

    function renderEditor() {
        const tbody = $('comb-edit-tbody'); if (!tbody) return;
        tbody.innerHTML = state.editRows.map(r => {
            const dias = daysInMonth(state.editYear, r.mes);
            const prom = (r.litros === '' || r.litros === null) ? '' : Math.round(Number(r.litros) / dias);
            return `<tr data-mes="${r.mes}">
                <td class="comb-mes fw-semibold">${MES_LARGO[r.mes - 1]}</td>
                <td><input type="number" step="1" min="0" class="form-control form-control-sm comb-input-lit"
                       value="${r.litros === '' ? '' : r.litros}" placeholder="0"></td>
                <td class="text-end comb-prom comb-prom-cell">${prom === '' ? '—' : fmt(prom)}</td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('tr[data-mes]').forEach(tr => {
            const mes = Number(tr.dataset.mes);
            const row = state.editRows.find(r => r.mes === mes); if (!row) return;
            const inp = tr.querySelector('.comb-input-lit');
            const promCell = tr.querySelector('.comb-prom-cell');
            inp.addEventListener('input', () => {
                row.litros = inp.value === '' ? '' : Number(inp.value);
                row._dirty = String(row.litros) !== row._orig;
                inp.classList.toggle('comb-changed', row._dirty);
                const dias = daysInMonth(state.editYear, mes);
                promCell.textContent = (row.litros === '' || isNaN(Number(row.litros)))
                    ? '—' : fmt(Math.round(Number(row.litros) / dias));
                recalcEditorTotals();
            });
        });
        recalcEditorTotals();
    }

    function recalcEditorTotals() {
        let total = 0, meses = 0;
        for (const r of state.editRows) {
            if (r.litros === '' || r.litros === null) continue;
            const v = Number(r.litros);
            if (!isFinite(v) || v < 0) continue;
            total += v; meses++;
        }
        $('comb-edit-total').textContent = fmt(total);
        $('comb-edit-meses').textContent = meses;
    }

    async function saveEditor() {
        if (!isAdmin()) { alert('No tienes permisos para editar.'); return; }
        const dirty = state.editRows.filter(r => r._dirty);
        if (!dirty.length) { setStatus('Sin cambios por guardar', 'mute'); return; }
        const btn = $('comb-edit-save');
        btn?.setAttribute('disabled', 'disabled');
        setStatus('Guardando…', 'info');
        try {
            const client = await getClient();
            if (!client) throw new Error('Supabase no disponible');
            const toUpsert = [];
            const toDelete = [];
            for (const r of dirty) {
                if (r.litros === '' || r.litros === null) {
                    if (hasData(state.editYear, r.mes)) toDelete.push(r.mes);
                } else {
                    toUpsert.push({ anio: state.editYear, mes: r.mes, litros: Number(r.litros) });
                }
            }
            if (toUpsert.length) {
                const { error } = await client.from(TBL).upsert(toUpsert, { onConflict: 'anio,mes' });
                if (error) throw error;
            }
            for (const mes of toDelete) {
                const { error } = await client.from(TBL).delete().eq('anio', state.editYear).eq('mes', mes);
                if (error) throw error;
            }
            await loadAll(true);
            loadEditor();
            renderDashboard();
            setStatus('Cambios guardados', 'ok');
        } catch (err) {
            console.error('[combustibles] saveEditor error:', err);
            setStatus('Error al guardar', 'err');
            alert('No se pudo guardar: ' + (err?.message || err));
        } finally {
            btn?.removeAttribute('disabled');
        }
    }

    // ─── Eventos ───────────────────────────────────────────────
    function bind() {
        document.querySelectorAll('#combustibles-section .comb-seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode === state.chartMode) return;
                state.chartMode = mode;
                document.querySelectorAll('#combustibles-section .comb-seg-btn')
                    .forEach(b => b.classList.toggle('active', b === btn));
                renderChart();
            });
        });
        $('comb-btn-refresh')?.addEventListener('click', async () => {
            await loadAll(true);
            populateEditYears();
            renderDashboard();
        });
        $('comb-edit-load')?.addEventListener('click', loadEditor);
        $('comb-edit-save')?.addEventListener('click', saveEditor);
    }

    // ─── Init ──────────────────────────────────────────────────
    async function init() {
        if (!ensureTemplate()) return;
        initDone = true;
        await loadAll(false);
        populateEditYears();
        loadEditor();
        renderDashboard();
    }

    window.initCombustibles = function () {
        init().catch(e => console.error('[combustibles] init error', e));
    };

    // Contrato de ciclo de vida del módulo.
    //
    // La gráfica se reconstruye en cada render y nadie la soltaba al salir de
    // la sección. Aquí se libera.
    //
    // Los datos ya cargados (state.rows) se conservan a propósito: volver a
    // entrar no debe reconsultar Supabase. Para forzarlo está loadAll(true),
    // que es lo que hace el botón de refrescar.
    //
    // Los listeners de los controles NO se retiran: bind() corre una sola vez
    // sobre nodos que viven dentro de la vista, y la vista se queda cacheada.
    window.destroyCombustibles = function () {
        destroyChart();
    };

    window.combustiblesModule = { init, loadAll, renderDashboard, state };
})();
