/* ============================================================
 * Terminal de Carga · Capacidad (vista ejecutiva)
 * Datos estáticos provenientes del documento institucional
 * "Capacidad de la Terminal de Carga AIFA" (Gerencia de Carga).
 * Renderiza KPIs (HTML estático) + 2 gráficas Chart.js + chips
 * de aerolíneas.
 *
 * Módulo extraído: el marcado vive en view.html y esto se carga
 * la primera vez que se abre la sección, no al arrancar la página.
 * ========================================================== */
(function () {
    'use strict';

    var AIRLINES = [
        'TSM', 'AeroUnión', 'Air Canada', 'Air France Cargo', 'Amerijet',
        'Awesome Cargo', 'Cargojet', 'Cargolux', 'Cathay Pacific', 'Copa Cargo',
        'DHL Guatemala', 'Emirates', 'Estafeta', 'Lufthansa Cargo', 'MAS de Carga',
        'Qatar', 'Aerolíneas TM', 'Turkish Cargo', 'UPS', 'Air China Cargo',
        'Atlas Air', 'Berry Aviation', 'China Southern Cargo', 'Ethiopian Cargo', 'FedEx',
        'Galistar', 'Kalitta Air', 'Lynden Air Cargo', 'National Air Cargo', 'Silk Way West',
        'Suparna Airlines', 'Ukraine', 'Auniworld Air Cargo', 'USA Jet'
    ];

    // 15 empresas que operan los 18 recintos fiscalizados (carga internacional)
    var RECINTOS = [
        'Insumos Comerciales Especializados', 'Grupo Camili de México', 'World Express Cargo',
        'CCO Almacén Fiscal', 'Azale del Mar de Cortés', 'Uni-Trade Performance',
        'JC & JF Cargo', 'Talma México Servicios Aeroportuarios', 'Terminal Logistics',
        'Admerce', 'MRM Servicios Operativos', 'TMM Almacenadora',
        'ASIMEX', 'AMSLI', 'Interpuerto Multimodal de México'
    ];

    // 13 handlers (servicios en tierra) en la terminal de carga
    var HANDLERS = [
        'AGN Aviation Services, S.A. de C.V.',
        'A&P International Services, S.A.P.I. de C.V.',
        'Eagle Aviation Services, S.A. de C.V.',
        'Formación Personalizada en Vigilancia, S.A. de C.V.',
        'Gate Gourmet & MAASA México, S.A.P.I. de C.V.',
        'Menzies Aviation (México), S.A. de C.V.',
        'Prime Flight Aviation Services, S.A. de C.V.',
        'Private Real Security, S.A. de C.V.',
        'Saltillo Aircraft Maintenance, S.A. de C.V.',
        'Securitas Transport Aviation México, S.A. de C.V.',
        'Servicios Complementarios Aéreos, S.A. de C.V.',
        'Sky Chefs de México, S.A. de C.V.',
        'Teams Aircraft Services, S.A. de C.V.'
    ];

    var charts = {};
    var _resizes = [];   // reajustes diferidos, cancelables al salir

    function destroy(id) {
        if (charts[id]) { try { charts[id].destroy(); } catch (_) {} charts[id] = null; }
    }

    function renderAirlines() {
        var box = document.getElementById('cc-airlines');
        if (!box || box.dataset.rendered === '1') return;
        box.innerHTML = AIRLINES.map(function (name) {
            return '<span class="cc-chip"><i class="fas fa-plane"></i>' + name + '</span>';
        }).join('');
        box.dataset.rendered = '1';
    }

    function renderRecintos() {
        var box = document.getElementById('cc-recintos');
        if (!box || box.dataset.rendered === '1') return;
        box.innerHTML = RECINTOS.map(function (name) {
            return '<div class="col-md-6 col-lg-4">' +
                '<div class="cc-tile">' +
                '<span class="cc-tile-ico"><i class="fas fa-building-shield"></i></span>' +
                '<span class="cc-tile-name">' + name + '</span>' +
                '</div></div>';
        }).join('');
        box.dataset.rendered = '1';
    }

    function renderHandlers() {
        var box = document.getElementById('cc-handlers');
        if (!box || box.dataset.rendered === '1') return;
        box.innerHTML = HANDLERS.map(function (name, i) {
            var idx = name.indexOf(',');
            var main = idx > -1 ? name.slice(0, idx) : name;
            var sub = idx > -1 ? name.slice(idx + 1).trim() : '';
            return '<div class="col-md-6 col-lg-4">' +
                '<div class="cc-handler">' +
                '<span class="cc-handler-num">' + (i + 1) + '</span>' +
                '<span><span class="cc-handler-name">' + main + '</span>' +
                (sub ? '<span class="cc-handler-sub d-block">' + sub + '</span>' : '') +
                '</span>' +
                '</div></div>';
        }).join('');
        box.dataset.rendered = '1';
    }

    function renderDistrib() {
        var el = document.getElementById('cc-chart-distrib');
        if (!el || typeof Chart === 'undefined') return;
        destroy('distrib');
        charts.distrib = new Chart(el.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Carga internacional', 'Carga nacional'],
                datasets: [{
                    data: [705000, 77000],
                    backgroundColor: ['#f97316', '#0ea5e9'],
                    borderColor: '#fff',
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '64%',
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (c) {
                                var t = 782000;
                                var pct = (c.parsed / t * 100).toFixed(1);
                                return ' ' + c.label + ': ' + c.parsed.toLocaleString('es-MX') + ' t (' + pct + '%)';
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'ccCenter',
                afterDraw: function (chart) {
                    var ctx = chart.ctx;
                    var area = chart.chartArea;
                    if (!area) return;
                    var cx = (area.left + area.right) / 2;
                    var cy = (area.top + area.bottom) / 2;
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#0f172a';
                    ctx.font = '800 26px system-ui, sans-serif';
                    ctx.fillText('782,000', cx, cy - 6);
                    ctx.fillStyle = '#64748b';
                    ctx.font = '600 11px system-ui, sans-serif';
                    ctx.fillText('TON / AÑO', cx, cy + 16);
                    ctx.restore();
                }
            }]
        });
    }

    function renderMars() {
        var el = document.getElementById('cc-chart-mars');
        if (!el || typeof Chart === 'undefined') return;
        destroy('mars');
        charts.mars = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Clave “F”', 'Clave “D”'],
                datasets: [{
                    data: [9, 16],
                    backgroundColor: ['#f97316', '#2563eb'],
                    borderRadius: 8,
                    barThickness: 34
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: { callbacks: { label: function (c) { return ' ' + c.parsed.x + ' posiciones'; } } }
                },
                scales: {
                    x: { beginAtZero: true, suggestedMax: 18, ticks: { precision: 0 }, grid: { color: '#eef2f7' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    function renderAll() {
        renderAirlines();
        renderRecintos();
        renderHandlers();
        // Charts need a non-zero canvas; defer for layout then force a resize
        // so the doughnut/bar fill their containers when the section becomes visible.
        requestAnimationFrame(function () {
            renderDistrib();
            renderMars();
            [200, 500, 900].forEach(function (ms) {
                _resizes.push(setTimeout(function () {
                    if (charts.distrib) { try { charts.distrib.resize(); } catch (_) {} }
                    if (charts.mars) { try { charts.mars.resize(); } catch (_) {} }
                }, ms));
            });
        });
    }

    window.initCapacidadCarga = function () {
        var sec = document.getElementById('capacidad-carga-section');
        if (!sec) return;
        renderAll();
    };

    // Contrato de ciclo de vida del módulo.
    //
    // Las dos instancias de Chart.js se creaban en cada visita y nadie las
    // soltaba al salir. Aquí se liberan, junto con los reajustes pendientes:
    // sin cancelarlos, un timer disparado después de cerrar tocaba gráficas
    // que ya no existen.
    //
    // Los chips, recintos y handlers no se retiran: son marcado fijo dentro de
    // la vista, que se queda cacheada, y dataset.rendered evita repetirlo.
    window.destroyCapacidadCarga = function () {
        _resizes.forEach(function (t) { try { clearTimeout(t); } catch (_) {} });
        _resizes = [];
        destroy('distrib');
        destroy('mars');
    };
})();
