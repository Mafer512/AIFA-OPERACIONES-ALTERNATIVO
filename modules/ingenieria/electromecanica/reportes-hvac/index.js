// ===================================================================
//  Reportes de Mantenimiento HVAC (Ing. Electromecanica)
//  Lee la tabla public.reportes_hvac de Supabase y dibuja
//  KPIs + 4 graficas + tabla.
//  API publica:
//    window.initHvac()    -> carga y renderiza (llamado por showSection)
//    window.hvacReload()  -> recarga silenciosa (llamado por js/realtime.js)
// ===================================================================
(function () {
    'use strict';

    var _charts = {};
    var _loading = false;
    var _loadedOnce = false;

    // Registrar plugin de datalabels si está disponible (idempotente)
    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
        try { Chart.register(ChartDataLabels); } catch (_) {}
    }

    // Plugin custom: dibuja el TOTAL en el centro de la dona
    var centerTextPlugin = {
        id: 'hvacCenterText',
        afterDatasetDraw: function (chart, _args, opts) {
            if (!opts || !opts.display) return;
            var ctx = chart.ctx;
            var meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data.length) return;
            var first = meta.data[0];
            var cx = first.x;
            var cy = first.y;
            var total = chart.data.datasets[0].data.reduce(function (a, b) { return a + (b || 0); }, 0);
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = opts.color || '#0f172a';
            ctx.font = '700 2rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(String(total), cx, cy - 10);
            ctx.fillStyle = opts.subColor || '#94a3b8';
            ctx.font = '600 .68rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText((opts.label || 'TOTAL').toUpperCase(), cx, cy + 16);
            ctx.restore();
        }
    };

    var MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Paleta consistente (alineada con las tarjetas)
    var PALETTE = {
        blue:   '#3b82f6',
        green:  '#10b981',
        orange: '#f97316',
        violet: '#8b5cf6',
        red:    '#ef4444',
        teal:   '#14b8a6',
        amber:  '#f59e0b',
        rose:   '#f43f5e',
        sky:    '#0ea5e9',
        lime:   '#84cc16'
    };

    /* --- Cliente Supabase ------------------------------------------ */
    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') {
            return await window.ensureSupabaseClient();
        }
        throw new Error('Cliente de Supabase no disponible');
    }

    /* --- UI helpers ------------------------------------------------- */
    function setStatus(msg, type) {
        var el = document.getElementById('hvac-status');
        if (!el) return;
        if (!msg) { el.classList.add('d-none'); el.innerHTML = ''; return; }
        el.classList.remove('d-none', 'alert-info', 'alert-warning', 'alert-danger', 'alert-success');
        el.classList.add('alert-' + (type || 'info'));
        el.innerHTML = msg;
    }

    function setText(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function norm(v) {
        if (v == null) return '';
        return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function countBy(rows, field) {
        var map = {};
        rows.forEach(function (r) {
            var raw = r[field];
            if (raw == null || String(raw).trim() === '') {
                map['(Sin dato)'] = (map['(Sin dato)'] || 0) + 1;
            } else {
                var key = String(raw).trim();
                map[key] = (map[key] || 0) + 1;
            }
        });
        return map;
    }

    /* --- Carga de datos -------------------------------------------- */
    async function load(silent) {
        if (_loading) return;
        _loading = true;
        if (!silent) setStatus('Cargando reportes...', 'info');
        try {
            var client = await getClient();
            var resp = await client
                .from('reportes_hvac')
                .select('reporte_id,fecha,equipo,modulo,motivo_atencion,mantenimiento,estado')
                .order('fecha', { ascending: false })
                .limit(2000);

            if (resp.error) throw resp.error;
            var rows = resp.data || [];

            var lastSyncEl = document.getElementById('hvac-last-sync');
            if (lastSyncEl) {
                var t = new Date();
                lastSyncEl.textContent = 'Sincronizado: ' +
                    String(t.getHours()).padStart(2, '0') + ':' +
                    String(t.getMinutes()).padStart(2, '0') + ':' +
                    String(t.getSeconds()).padStart(2, '0') +
                    ' (' + rows.length + ' registros)';
            }

            setStatus('', null);
            renderKpis(rows);
            renderEstado(rows);
            renderMantenimiento(rows);
            renderMes(rows);
            renderEquipo(rows);
            renderTable(rows);

            // Forzar resize de Chart.js cuando el canvas finalmente tiene tamano
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    Object.keys(_charts).forEach(function (k) {
                        try { _charts[k].resize(); } catch (_) {}
                    });
                });
            });

            _loadedOnce = true;
        } catch (err) {
            console.error('[HVAC] Error al cargar:', err);
            setStatus('Error al cargar los reportes: ' + (err.message || err), 'danger');
        } finally {
            _loading = false;
        }
    }

    /* --- KPIs (3 tarjetas: total + listas dinamicas) --------------- */
    function renderKpis(rows) {
        var total = rows.length;

        var estadoMap = countBy(rows, 'estado');
        var mantMap   = countBy(rows, 'mantenimiento');

        // Este mes
        var now = new Date();
        var ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        var mes = rows.filter(function (r) {
            return r.fecha && String(r.fecha).slice(0, 7) === ym;
        }).length;

        setText('hvac-kpi-total', total);
        setText('hvac-kpi-mes', mes);

        // Listas dinamicas: muestran exactamente lo que dice la BD,
        // ordenadas de mayor a menor. Mismas claves que las graficas.
        renderCategoryList('hvac-kpi-estado-list', estadoMap, estadoDotColor);
        renderCategoryList('hvac-kpi-mant-list',   mantMap,   mantDotColor);
    }

    function estadoDotColor(label) {
        var n = norm(label);
        if (n.indexOf('inoperativo') !== -1) return '#fca5a5';
        if (n.indexOf('operativo')   !== -1) return '#6ee7b7';
        if (n.indexOf('mantenimiento') !== -1 || n.indexOf('proceso') !== -1) return '#fcd34d';
        return '#bae6fd';
    }

    function mantDotColor(label) {
        var n = norm(label);
        if (n.indexOf('preventivo') !== -1) return '#fed7aa';
        if (n.indexOf('correctivo') !== -1) return '#fde68a';
        return '#e9d5ff';
    }

    function renderCategoryList(elId, map, colorFn) {
        var el = document.getElementById(elId);
        if (!el) return;
        var arr = Object.keys(map).map(function (k) { return { k: k, n: map[k] }; });
        arr.sort(function (a, b) { return b.n - a.n; });
        if (!arr.length) { el.innerHTML = '<div class="hvac-kpi-sub">Sin datos</div>'; return; }
        var total = arr.reduce(function (a, b) { return a + b.n; }, 0);
        el.innerHTML = arr.map(function (x) {
            var pct = total ? Math.round((x.n / total) * 100) : 0;
            return '' +
                '<div class="hvac-kpi-stat" style="--stat-pct:' + pct + '%;">' +
                    '<div class="hvac-kpi-stat-label">' +
                        '<span class="dot" style="background:' + colorFn(x.k) + ';"></span>' +
                        '<span>' + escapeHtml(x.k) + '</span>' +
                    '</div>' +
                    '<div>' +
                        '<span class="hvac-kpi-stat-value">' + x.n + '</span>' +
                        '<span class="hvac-kpi-stat-pct">' + pct + '%</span>' +
                    '</div>' +
                '</div>';
        }).join('');
    }

    /* --- Grafica: Estado (dona) ------------------------------------ */
    function renderEstado(rows) {
        var map = countBy(rows, 'estado');
        var arr = Object.keys(map).map(function (k) { return { k: k, n: map[k] }; });
        arr.sort(function (a, b) { return b.n - a.n; });
        var labels = arr.map(function (x) { return x.k; });
        var data   = arr.map(function (x) { return x.n; });
        var bgColors = labels.map(function (l) {
            var n = norm(l);
            if (n.indexOf('inoperativo') !== -1) return PALETTE.red;
            if (n.indexOf('operativo')   !== -1) return PALETTE.green;
            if (n.indexOf('mantenimiento') !== -1 || n.indexOf('proceso') !== -1) return PALETTE.amber;
            return PALETTE.sky;
        });
        drawDoughnut('hvacEstadoChart', 'estado', labels, data, bgColors);
    }

    /* --- Grafica: Mantenimiento (dona) ----------------------------- */
    function renderMantenimiento(rows) {
        var map = countBy(rows, 'mantenimiento');
        var arr = Object.keys(map).map(function (k) { return { k: k, n: map[k] }; });
        arr.sort(function (a, b) { return b.n - a.n; });
        var labels = arr.map(function (x) { return x.k; });
        var data   = arr.map(function (x) { return x.n; });
        var bgColors = labels.map(function (l) {
            var n = norm(l);
            if (n.indexOf('preventivo') !== -1) return PALETTE.blue;
            if (n.indexOf('correctivo') !== -1) return PALETTE.orange;
            return PALETTE.violet;
        });
        drawDoughnut('hvacMantenimientoChart', 'mantenimiento', labels, data, bgColors);
    }

    /* --- Grafica: por Mes (linea con area) ------------------------- */
    function renderMes(rows) {
        var byMonth = {};
        rows.forEach(function (r) {
            if (!r.fecha) return;
            var key = String(r.fecha).slice(0, 7);
            if (!/^\d{4}-\d{2}$/.test(key)) return;
            byMonth[key] = (byMonth[key] || 0) + 1;
        });
        var keys = Object.keys(byMonth).sort();
        var labels = keys.map(function (k) {
            var parts = k.split('-');
            return MONTHS[parseInt(parts[1], 10) - 1] + ' ' + parts[0].slice(2);
        });
        var data = keys.map(function (k) { return byMonth[k]; });

        if (_charts.mes) { try { _charts.mes.destroy(); } catch (_) {} }
        var ctx = document.getElementById('hvacMesChart');
        if (!ctx) return;
        var c2d = ctx.getContext ? ctx.getContext('2d') : null;
        var gradient = null;
        if (c2d) {
            gradient = c2d.createLinearGradient(0, 0, 0, 280);
            gradient.addColorStop(0, 'rgba(16,185,129,.55)');
            gradient.addColorStop(.6, 'rgba(16,185,129,.18)');
            gradient.addColorStop(1, 'rgba(16,185,129,0)');
        }
        _charts.mes = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Reportes',
                    data: data,
                    borderColor: PALETTE.green,
                    backgroundColor: gradient || 'rgba(16,185,129,.22)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointHoverRadius: 9,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: PALETTE.green,
                    pointBorderWidth: 3,
                    borderWidth: 3.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 28, right: 12, bottom: 4, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1f2937',
                        padding: 12,
                        cornerRadius: 8,
                        titleColor: '#fff',
                        bodyColor: '#e5e7eb',
                        titleFont: { weight: 'bold', size: 13 },
                        bodyFont: { size: 13 }
                    },
                    datalabels: {
                        display: true,
                        align: 'top',
                        anchor: 'end',
                        offset: 6,
                        color: '#065f46',
                        font: {
                            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                            weight: '700',
                            size: 12
                        },
                        backgroundColor: 'rgba(255,255,255,.96)',
                        borderColor: PALETTE.green,
                        borderWidth: 1.5,
                        borderRadius: 8,
                        padding: { top: 3, bottom: 3, left: 8, right: 8 },
                        formatter: function (v) { return v; }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0, color: '#6b7280', font: { size: 12 } },
                        grid: { color: 'rgba(0,0,0,.06)', drawBorder: false }
                    },
                    x: {
                        ticks: { color: '#6b7280', font: { size: 12, weight: '600' } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    /* --- Grafica: Top equipos (barras horizontales) ---------------- */
    function renderEquipo(rows) {
        var map = countBy(rows, 'equipo');
        var arr = Object.keys(map).map(function (k) { return { name: k, n: map[k] }; });
        arr.sort(function (a, b) { return b.n - a.n; });
        arr = arr.slice(0, 8);

        var labels = arr.map(function (x) {
            return x.name.length > 32 ? x.name.slice(0, 30) + '...' : x.name;
        });
        var data = arr.map(function (x) { return x.n; });
        var total = data.reduce(function (a, b) { return a + b; }, 0);

        // Degradado violeta -> sky por ranking
        var palette = [PALETTE.violet, PALETTE.blue, PALETTE.sky, PALETTE.teal,
                       PALETTE.green, PALETTE.lime, PALETTE.amber, PALETTE.orange];
        var bgColors = arr.map(function (_x, i) { return palette[i % palette.length]; });

        if (_charts.equipo) { try { _charts.equipo.destroy(); } catch (_) {} }
        var ctx = document.getElementById('hvacEquipoChart');
        if (!ctx) return;
        _charts.equipo = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Reportes',
                    data: data,
                    backgroundColor: bgColors,
                    borderRadius: 10,
                    borderSkipped: false,
                    barPercentage: 0.85,
                    categoryPercentage: 0.85
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 96, left: 4, top: 4, bottom: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1f2937',
                        padding: 12,
                        cornerRadius: 8,
                        titleColor: '#fff',
                        bodyColor: '#e5e7eb',
                        titleFont: { weight: 'bold', size: 13 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: function (c) {
                                var pct = total ? Math.round((c.parsed.x / total) * 100) : 0;
                                return ' ' + c.parsed.x + ' reportes (' + pct + '%)';
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'end',
                        offset: 6,
                        color: '#0f172a',
                        backgroundColor: 'rgba(255,255,255,.96)',
                        borderColor: function (ctx) {
                            var bg = ctx.dataset.backgroundColor;
                            return Array.isArray(bg) ? bg[ctx.dataIndex] : bg;
                        },
                        borderWidth: 1.5,
                        borderRadius: 8,
                        padding: { top: 3, bottom: 3, left: 8, right: 8 },
                        font: {
                            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                            weight: '700',
                            size: 12
                        },
                        formatter: function (v) {
                            var pct = total ? Math.round((v / total) * 100) : 0;
                            return v + '  ·  ' + pct + '%';
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { precision: 0, color: '#6b7280', font: { size: 12 } },
                        grid: { color: 'rgba(0,0,0,.05)', drawBorder: false }
                    },
                    y: {
                        ticks: { color: '#374151', font: { size: 12, weight: '600' } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    /* --- Dona estilizada (helper) ---------------------------------- */
    function drawDoughnut(canvasId, key, labels, data, bgColors) {
        if (_charts[key]) { try { _charts[key].destroy(); } catch (_) {} }
        var ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (!bgColors) {
            var palette = [PALETTE.blue, PALETTE.green, PALETTE.orange, PALETTE.violet,
                           PALETTE.red, PALETTE.teal, PALETTE.amber, PALETTE.rose];
            bgColors = labels.map(function (_l, i) { return palette[i % palette.length]; });
        }
        var total = data.reduce(function (a, b) { return a + (b || 0); }, 0);
        _charts[key] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors,
                    borderColor: '#fff',
                    borderWidth: 3,
                    hoverOffset: 12,
                    hoverBorderColor: '#fff'
                }]
            },
            plugins: [centerTextPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                layout: { padding: 6 },
                plugins: {
                    hvacCenterText: { display: true, label: 'Total', color: '#111827', subColor: '#9ca3af' },
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            boxHeight: 12,
                            padding: 14,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 12, weight: '600' },
                            color: '#374151'
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1f2937',
                        padding: 12,
                        cornerRadius: 8,
                        titleColor: '#fff',
                        bodyColor: '#e5e7eb',
                        titleFont: { weight: 'bold', size: 13 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: function (ctx) {
                                var pct = total ? Math.round((ctx.parsed / total) * 100) : 0;
                                return ' ' + ctx.label + ': ' + ctx.parsed + ' (' + pct + '%)';
                            }
                        }
                    },
                    datalabels: {
                        display: function (ctx) {
                            // Ocultar etiqueta si el segmento es muy pequeño (< 6%)
                            var v = ctx.dataset.data[ctx.dataIndex];
                            var t = ctx.dataset.data.reduce(function (a, b) { return a + (b || 0); }, 0);
                            return t && (v / t) >= 0.06;
                        },
                        color: '#0f172a',
                        backgroundColor: 'rgba(255,255,255,.96)',
                        borderColor: function (ctx) {
                            var bg = ctx.dataset.backgroundColor;
                            return Array.isArray(bg) ? bg[ctx.dataIndex] : bg;
                        },
                        borderWidth: 1.5,
                        borderRadius: 8,
                        padding: { top: 4, bottom: 4, left: 8, right: 8 },
                        textAlign: 'center',
                        font: {
                            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                            weight: '700',
                            size: 12,
                            lineHeight: 1.15
                        },
                        formatter: function (v, ctx) {
                            var t = ctx.dataset.data.reduce(function (a, b) { return a + (b || 0); }, 0);
                            var pct = t ? Math.round((v / t) * 100) : 0;
                            return v + '  ·  ' + pct + '%';
                        }
                    }
                }
            }
        });
    }

    /* --- Tabla (top 25) -------------------------------------------- */
    function renderTable(rows) {
        var tbody = document.getElementById('hvac-tbody');
        if (!tbody) return;
        var top = rows.slice(0, 25);
        tbody.innerHTML = top.map(function (r) {
            return '<tr>' +
                '<td>' + escapeHtml(r.reporte_id) + '</td>' +
                '<td>' + escapeHtml(r.fecha) + '</td>' +
                '<td>' + escapeHtml(r.equipo) + '</td>' +
                '<td>' + escapeHtml(r.motivo_atencion) + '</td>' +
                '<td>' + escapeHtml(r.mantenimiento) + '</td>' +
                '<td>' + estadoBadge(r.estado) + '</td>' +
                '</tr>';
        }).join('');
    }

    function estadoBadge(v) {
        if (!v) return '<span class="badge bg-secondary">-</span>';
        var n = norm(v);
        var cls = 'bg-secondary';
        if (n.indexOf('inoperativo') !== -1) cls = 'bg-danger';
        else if (n.indexOf('operativo') !== -1) cls = 'bg-success';
        else if (n.indexOf('mantenimiento') !== -1 || n.indexOf('proceso') !== -1) cls = 'bg-warning text-dark';
        return '<span class="badge ' + cls + '">' + escapeHtml(v) + '</span>';
    }

    /* --- API publica ----------------------------------------------- */
    window.initHvac = function () { load(false); };
    window.hvacReload = function () {
        if (!_loadedOnce) return;
        load(true);
    };

    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('hvac-refresh-btn');
        if (btn) btn.addEventListener('click', function () { load(false); });
    });

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
    window.destroyHvac = function () {
        try {
            Object.keys(_charts || {}).forEach(function (k) {
                try { if (_charts[k]) _charts[k].destroy(); } catch (_) {}
                _charts[k] = null;
            });
        } catch (_) {}
    };
})();
