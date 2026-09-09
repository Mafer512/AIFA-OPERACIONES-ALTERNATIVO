(function () {
    'use strict';

    const ROOT_ID = 'bhs-baggage-stats-root';
    const SECTION_KEY = 'bhs-estadisticas-equipaje';
    const CAP_TABLE = 'bhs_system_capacities';
    const STATS_TABLE = 'bhs_baggage_statistics';
    const MONTHS = [
        { num: 1, label: 'ENE.' },
        { num: 2, label: 'FEB.' },
        { num: 3, label: 'MAR.' },
        { num: 4, label: 'ABR.' },
        { num: 5, label: 'MAY.' },
        { num: 6, label: 'JUN' },
        { num: 7, label: 'JUL.' },
        { num: 8, label: 'AGO.' },
        { num: 9, label: 'SEP.' },
        { num: 10, label: 'OCT.' },
        { num: 11, label: 'NOV.' },
        { num: 12, label: 'DIC.' }
    ];
    const MONTH_MAP = MONTHS.reduce(function (acc, item) {
        acc[item.label] = item.num;
        acc[item.num] = item.label;
        return acc;
    }, {});
    const MONTH_NAMES = {
        1: 'enero',
        2: 'febrero',
        3: 'marzo',
        4: 'abril',
        5: 'mayo',
        6: 'junio',
        7: 'julio',
        8: 'agosto',
        9: 'septiembre',
        10: 'octubre',
        11: 'noviembre',
        12: 'diciembre'
    };
    const AIRLINES = [
        { key: 'am', code: 'AM', name: 'Aeromexico', label: 'Aeromexico (AM)', shortLabel: 'AM', color: '#2563EB', logo: 'images/airlines/logo_aeromexico.png' },
        { key: 'y4', code: 'Y4', name: 'Volaris', label: 'Volaris (Y4)', shortLabel: 'Y4', color: '#D946EF', logo: 'images/airlines/logo_volaris.png' },
        { key: 'vb', code: 'VB', name: 'Viva Aerobus', label: 'Viva Aerobus (VB)', shortLabel: 'VB', color: '#16A34A', logo: 'images/airlines/logo_viva.png' },
        { key: 'cm_dm', code: 'DM', name: 'Arajet', label: 'Arajet (DM)', shortLabel: 'DM', color: '#7C3AED', logo: 'images/airlines/logo_arajet.png' },
        { key: 'zv', code: 'ZV', name: 'Aerus', label: 'Aerus (ZV)', shortLabel: 'ZV', color: '#111827', logo: 'images/airlines/logo_aerus.png' }
    ];
    const KIND_LABELS = {
        monthly: 'Mensual',
        annual_summary: 'Resumen anual',
        rolling_summary: 'Periodo acumulado',
        summary: 'Resumen'
    };
    const OP_LABELS = {
        SALIDA: 'Equipajes de Salida',
        LLEGADA: 'Equipajes de Llegada'
    };
    const CAPACITY_FALLBACK = {
        SALIDA: { max_per_hour: 5269, max_per_day: 126456, max_per_month: 3793680, max_per_year: 46156440 },
        LLEGADA: { max_per_hour: 4389, max_per_day: 105336, max_per_month: 3160080, max_per_year: 38447640 }
    };

    const MONTHLY_SEED = {
        SALIDA: [
            [2022, 'MAR.', 260, 1231, 423, 0, 0],
            [2022, 'ABR.', 1093, 3064, 1054, 0, 0],
            [2022, 'MAY.', 768, 3396, 988, 0, 0],
            [2022, 'JUN', 715, 2907, 1083, 0, 0],
            [2022, 'JUL.', 1017, 3709, 1276, 0, 0],
            [2022, 'AGO.', 1486, 5395, 1590, 0, 0],
            [2022, 'SEP.', 2929, 8433, 2114, 111, 0],
            [2022, 'OCT.', 10972, 10674, 2313, 925, 0],
            [2022, 'NOV.', 14986, 10610, 2912, 991, 0],
            [2022, 'DIC.', 15096, 11650, 6899, 1221, 0],
            [2023, 'ENE.', 11749, 10037, 6704, 1059, 0],
            [2023, 'FEB.', 1112, 8628, 4908, 913, 0],
            [2023, 'MAR.', 15225, 11142, 3978, 1172, 0],
            [2023, 'ABR.', 4257, 36, 1511, 11, 0],
            [2023, 'MAY.', 13481, 154, 6456, 39, 0],
            [2023, 'JUN', 11478, 314, 7732, 43, 0],
            [2023, 'JUL.', 11023, 294, 6552, 28, 0],
            [2023, 'AGO.', 16343, 554, 9165, 9, 0],
            [2023, 'SEP.', 15254, 393, 9312, 25, 0],
            [2023, 'OCT.', 18085, 10707, 9210, 996, 0],
            [2023, 'NOV.', 18185, 11101, 8913, 1352, 0],
            [2023, 'DIC.', 22973, 12403, 17422, 1303, 0],
            [2024, 'ENE.', 18137, 12068, 23670, 829, 0],
            [2024, 'FEB.', 16220, 10539, 23075, 859, 0],
            [2024, 'MAR.', 20143, 12484, 30612, 1108, 0],
            [2024, 'ABR.', 13081, 10822, 27806, 581, 0],
            [2024, 'MAY.', 18957, 13439, 39393, 882, 0],
            [2024, 'JUN', 17717, 16425, 42135, 928, 0],
            [2024, 'JUL.', 12001, 10260, 25467, 674, 0],
            [2024, 'AGO.', 21668, 21843, 46746, 1058, 0],
            [2024, 'SEP.', 18552, 17295, 41822, 939, 0],
            [2024, 'OCT.', 18869, 20521, 49720, 1051, 0],
            [2024, 'NOV.', 23361, 21445, 53896, 1350, 0],
            [2024, 'DIC.', 27569, 21966, 67622, 1699, 0],
            [2025, 'ENE.', 23442, 14915, 61000, 548, 0],
            [2025, 'FEB.', 20193, 9228, 49167, 0, 0],
            [2026, 'MAR.', 8533, 17702, 77314, 1051, 11],
            [2026, 'ABR.', 8482, 17193, 80161, 1350, 8],
            [2026, 'MAY.', 7667, 16410, 85300, 1699, 6],
            [2026, 'JUN', null, null, null, null, null],
            [2026, 'JUL.', null, null, null, null, null],
            [2026, 'AGO.', null, null, null, null, null],
            [2026, 'SEP.', null, null, null, null, null],
            [2026, 'OCT.', null, null, null, null, null],
            [2026, 'NOV.', null, null, null, null, null],
            [2026, 'DIC.', null, null, null, null, null]
        ],
        LLEGADA: [
            [2022, 'MAR.', 46, 1, 147, 0, 0],
            [2022, 'ABR.', 1100, 0, 1056, 0, 0],
            [2022, 'MAY.', 420, 0, 850, 0, 0],
            [2022, 'JUN', 132, 0, 1021, 0, 0],
            [2022, 'JUL.', 108, 0, 1290, 0, 0],
            [2022, 'AGO.', 629, 0, 1540, 0, 0],
            [2022, 'SEP.', 2541, 18, 2121, 9, 0],
            [2022, 'OCT.', 9531, 114, 2242, 23, 0],
            [2022, 'NOV.', 13110, 229, 2890, 85, 0],
            [2022, 'DIC.', 13459, 213, 5433, 69, 0],
            [2023, 'ENE.', 11675, 259, 4391, 105, 0],
            [2023, 'FEB.', 10213, 157, 2694, 47, 0],
            [2023, 'MAR.', 13303, 570, 3339, 37, 0],
            [2023, 'ABR.', 13481, 154, 6456, 39, 0],
            [2023, 'MAY.', 11478, 314, 7732, 43, 0],
            [2023, 'JUN', 11023, 294, 6552, 28, 0],
            [2023, 'JUL.', 16343, 554, 9165, 9, 0],
            [2023, 'AGO.', 15254, 393, 9312, 25, 0],
            [2023, 'SEP.', 9471, 36, 7358, 15, 0],
            [2023, 'OCT.', 14825, 176, 8896, 1, 0],
            [2023, 'NOV.', 15124, 164, 9662, 0, 0],
            [2023, 'DIC.', 17387, 263, 17586, 0, 0],
            [2024, 'ENE.', 18012, 233, 20534, 55, 0],
            [2024, 'FEB.', 13780, 241, 19772, 0, 0],
            [2024, 'MAR.', 16041, 269, 27424, 4, 0],
            [2024, 'ABR.', 12307, 788, 27568, 2, 0],
            [2024, 'MAY.', 16670, 1211, 37958, 0, 0],
            [2024, 'JUN', 15677, 1370, 40368, 0, 0],
            [2024, 'JUL.', 20509, 1273, 45968, 3, 0],
            [2024, 'AGO.', 20150, 1183, 48612, 3, 0],
            [2024, 'SEP.', 17761, 922, 41002, 0, 0],
            [2024, 'OCT.', 18706, 1736, 45263, 0, 0],
            [2024, 'NOV.', 21806, 1378, 48993, 2, 0],
            [2024, 'DIC.', 26494, 565, 61648, 0, 0],
            [2025, 'ENE.', 24174, 165, 50766, 0, 0],
            [2025, 'FEB.', 18570, 252, 41560, 0, 0],
            [2026, 'MAR.', 8396, 369, 70519, 548, 4],
            [2026, 'ABR.', 9177, 281, 80157, 645, 6],
            [2026, 'MAY.', 8916, 529, 84575, 462, 4],
            [2026, 'JUN', null, null, null, null, null],
            [2026, 'JUL.', null, null, null, null, null],
            [2026, 'AGO.', null, null, null, null, null],
            [2026, 'SEP.', null, null, null, null, null],
            [2026, 'OCT.', null, null, null, null, null],
            [2026, 'NOV.', null, null, null, null, null],
            [2026, 'DIC.', null, null, null, null, null]
        ]
    };
    const SUMMARY_SEED = [
        { operation_type: 'SALIDA', record_kind: 'annual_summary', anio: 2022, am: 49322, y4: 61069, vb: 20652, cm_dm: 3248, zv: 0, reported_total: 134291, reported_utilization_pct: 0.29 },
        { operation_type: 'LLEGADA', record_kind: 'annual_summary', anio: 2022, am: 41076, y4: 575, vb: 18590, cm_dm: 186, zv: 0, reported_total: 60427, reported_utilization_pct: 0.16 },
        { operation_type: 'SALIDA', record_kind: 'annual_summary', anio: 2023, am: 159165, y4: 65763, vb: 91863, cm_dm: 6950, zv: 0, reported_total: 323741, reported_utilization_pct: 0.70 },
        { operation_type: 'LLEGADA', record_kind: 'annual_summary', anio: 2023, am: 159577, y4: 3334, vb: 93143, cm_dm: 349, zv: 0, reported_total: 256403, reported_utilization_pct: 0.67 },
        { operation_type: 'SALIDA', record_kind: 'annual_summary', anio: 2024, am: 226275, y4: 189107, vb: 471964, cm_dm: 11958, zv: 0, reported_total: 899304, reported_utilization_pct: 1.95 },
        { operation_type: 'LLEGADA', record_kind: 'annual_summary', anio: 2024, am: 217913, y4: 11169, vb: 465110, cm_dm: 69, zv: 0, reported_total: 694261, reported_utilization_pct: 1.81 },
        { operation_type: 'SALIDA', record_kind: 'summary', anio: null, am: 43635, y4: 24143, vb: 110167, cm_dm: 548, zv: 108, reported_total: 178601 },
        { operation_type: 'LLEGADA', record_kind: 'summary', anio: null, am: 42744, y4: 417, vb: 92326, cm_dm: 0, zv: 58, reported_total: 135545 },
        { operation_type: 'SALIDA', record_kind: 'rolling_summary', anio: null, mes: null, period_label: 'MAR 2025 A FEB. 2026', reported_total: 1114570 },
        { operation_type: 'LLEGADA', record_kind: 'rolling_summary', anio: null, mes: null, period_label: 'MAR 2025 A FEB. 2026', reported_total: 890127 },
        { operation_type: 'SALIDA', record_kind: 'annual_summary', anio: 2025, am: null, y4: null, vb: null, cm_dm: null, zv: null, reported_total: 1293171, reported_utilization_pct: 2.80 },
        { operation_type: 'LLEGADA', record_kind: 'annual_summary', anio: 2025, am: null, y4: null, vb: null, cm_dm: null, zv: null, reported_total: 1025672, reported_utilization_pct: 2.67 }
    ];

    const state = {
        initialized: false,
        bound: false,
        loaded: false,
        activated: false,
        dbReady: false,
        seedAttempted: false,
        rootRendered: false,
        editingSnapshot: null,
        pendingDuplicateId: null,
        capacities: CAPACITY_FALLBACK,
        rows: [],
        charts: {},
        sortField: 'period',
        sortDir: 'desc',
        currentTab: 'SALIDA',
        editingId: null
    };

    function buildSeedRows() {
        var rows = [];
        var order = 1;

        Object.keys(MONTHLY_SEED).forEach(function (operationType) {
            MONTHLY_SEED[operationType].forEach(function (entry) {
                rows.push(normalizeRow({
                    id: 'seed-' + operationType + '-' + entry[0] + '-' + MONTH_MAP[entry[1]],
                    source_key: 'seed-' + operationType + '-' + entry[0] + '-' + MONTH_MAP[entry[1]],
                    source_order: order++,
                    operation_type: operationType,
                    record_kind: 'monthly',
                    anio: entry[0],
                    mes: entry[1],
                    mes_num: MONTH_MAP[entry[1]],
                    period_label: null,
                    am: entry[2],
                    y4: entry[3],
                    vb: entry[4],
                    cm_dm: entry[5],
                    zv: entry[6],
                    reported_total: null,
                    reported_utilization_pct: null,
                    is_seed: true
                }));
            });
        });

        SUMMARY_SEED.forEach(function (entry, index) {
            rows.push(normalizeRow(Object.assign({
                id: 'seed-summary-' + index,
                source_key: 'seed-summary-' + index,
                source_order: order++,
                mes_num: entry.mes ? MONTH_MAP[entry.mes] : null,
                is_seed: true
            }, entry)));
        });

        return rows;
    }

    function ensureStyles() {
        if (document.getElementById('bhs-baggage-stats-styles')) return;
        var style = document.createElement('style');
        style.id = 'bhs-baggage-stats-styles';
        style.textContent = [
            '#' + ROOT_ID + '{padding:20px;}',
            '#' + ROOT_ID + ' .bhs-stats-shell{border:1px solid #dbe7f3;border-radius:22px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);box-shadow:0 20px 45px rgba(15,23,42,.08);overflow:hidden;}',
            '#' + ROOT_ID + ' .bhs-stats-head{padding:22px 24px;background:linear-gradient(135deg,#0f2444 0%,#1e40af 60%,#3b82f6 100%);color:#fff;position:relative;overflow:hidden;}',
            '#' + ROOT_ID + ' .bhs-stats-head:after{content:"";position:absolute;right:-40px;top:-40px;width:180px;height:180px;background:radial-gradient(circle,rgba(255,255,255,.22),transparent 70%);}',
            '#' + ROOT_ID + ' .bhs-stats-head .badge{background:rgba(255,255,255,.16)!important;color:#fff;border:1px solid rgba(255,255,255,.18);}',
            '#' + ROOT_ID + ' .bhs-stats-body{padding:22px;}',
            '#' + ROOT_ID + ' .bhs-stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}',
            '#' + ROOT_ID + ' .bhs-stats-totals-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}',
            '#' + ROOT_ID + ' .bhs-stats-kpi{border:1px solid #e2e8f0;border-radius:18px;background:#fff;padding:16px 18px;box-shadow:0 8px 18px rgba(15,23,42,.04);min-height:118px;}',
            '#' + ROOT_ID + ' .bhs-stats-kpi-label{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;}',
            '#' + ROOT_ID + ' .bhs-stats-kpi-value{font-size:1.75rem;font-weight:800;color:#0f172a;line-height:1.05;margin-top:10px;}',
            '#' + ROOT_ID + ' .bhs-stats-kpi-sub{font-size:.79rem;color:#64748b;margin-top:8px;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-grid{display:grid;grid-template-columns:repeat(5,minmax(190px,1fr));gap:12px;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-card{border:1px solid #e2e8f0;border-left:5px solid var(--airline-color,#64748b);border-radius:16px;background:#fff;padding:14px;box-shadow:0 8px 18px rgba(15,23,42,.04);min-width:0;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-card.is-selected{box-shadow:0 0 0 2px color-mix(in srgb,var(--airline-color,#2563eb) 34%,transparent),0 12px 24px rgba(15,23,42,.08);}',
            '#' + ROOT_ID + ' .bhs-stats-airline-head{display:flex;align-items:center;gap:10px;min-width:0;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-logo{width:54px;height:38px;object-fit:contain;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;padding:5px;flex:0 0 auto;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-name{font-weight:850;color:#0f172a;line-height:1.15;white-space:normal;overflow-wrap:anywhere;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-code{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;margin-top:5px;background:color-mix(in srgb,var(--airline-color,#64748b) 12%,white);color:var(--airline-color,#475569);font-size:.7rem;font-weight:850;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-metric{border-radius:12px;background:#f8fafc;padding:8px;min-width:0;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-metric span{display:block;font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#64748b;}',
            '#' + ROOT_ID + ' .bhs-stats-airline-metric strong{display:block;font-size:.92rem;color:#0f172a;margin-top:3px;overflow-wrap:anywhere;}',
            '#' + ROOT_ID + ' .bhs-stats-panel{border:1px solid #e2e8f0;border-radius:18px;background:#fff;box-shadow:0 8px 18px rgba(15,23,42,.04);}',
            '#' + ROOT_ID + ' .bhs-stats-panel-header{padding:16px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
            '#' + ROOT_ID + ' .bhs-stats-panel-body{padding:18px;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-panel{grid-column:span 1;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-card{border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;padding:12px;min-height:102px;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-title{font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-value{font-size:1.15rem;font-weight:850;color:#0f172a;line-height:1.1;margin-top:8px;word-break:break-word;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-desc{font-size:.74rem;color:#64748b;margin-top:7px;}',
            '#' + ROOT_ID + ' .bhs-stats-delta{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 7px;font-size:.68rem;font-weight:800;margin-top:7px;}',
            '#' + ROOT_ID + ' .bhs-stats-delta--up{background:#ecfdf5;color:#047857;}',
            '#' + ROOT_ID + ' .bhs-stats-delta--down{background:#fef2f2;color:#b91c1c;}',
            '#' + ROOT_ID + ' .bhs-stats-delta--flat{background:#eef2ff;color:#4338ca;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-trend{height:170px;margin-top:14px;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-trend canvas{width:100% !important;height:100% !important;}',
            '#' + ROOT_ID + ' .bhs-stats-filter-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;}',
            '#' + ROOT_ID + ' .bhs-stats-chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}',
            '#' + ROOT_ID + ' .bhs-stats-chart-panel--monthly .bhs-stats-panel-body{padding:18px 18px 12px;}',
            '#' + ROOT_ID + ' .bhs-stats-chart-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;}',
            '#' + ROOT_ID + ' .bhs-stats-chart-hint{font-size:.72rem;color:#64748b;}',
            '#' + ROOT_ID + ' .bhs-stats-chart-scroll{overflow-x:auto;overflow-y:hidden;padding-bottom:8px;}',
            '#' + ROOT_ID + ' .bhs-stats-chart-stage{position:relative;min-width:980px;height:320px;}',
            '#' + ROOT_ID + ' .bhs-stats-chart-stage canvas{width:100% !important;height:100% !important;}',
            '#' + ROOT_ID + ' .bhs-stats-table th{white-space:nowrap;font-size:.76rem;letter-spacing:.03em;text-transform:uppercase;color:#475569;}',
            '#' + ROOT_ID + ' .bhs-stats-table td{vertical-align:middle;}',
            '#' + ROOT_ID + ' .bhs-stats-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:.72rem;font-weight:700;}',
            '#' + ROOT_ID + ' .bhs-stats-chip--salida{background:#fff7ed;color:#c2410c;}',
            '#' + ROOT_ID + ' .bhs-stats-chip--llegada{background:#eff6ff;color:#1d4ed8;}',
            '#' + ROOT_ID + ' .bhs-stats-summary-row td{background:#f8fafc;font-weight:700;}',
            '#' + ROOT_ID + ' .bhs-stats-readonly td{background:#fcfcfd;}',
            '#' + ROOT_ID + ' .bhs-stats-actions{display:flex;gap:6px;justify-content:center;}',
            '#' + ROOT_ID + ' .bhs-stats-tabs{display:flex;gap:8px;flex-wrap:wrap;}',
            '#' + ROOT_ID + ' .bhs-stats-tab{border:none;border-radius:999px;padding:8px 14px;font-size:.8rem;font-weight:700;background:#e2e8f0;color:#475569;}',
            '#' + ROOT_ID + ' .bhs-stats-tab.active[data-op="SALIDA"]{background:linear-gradient(135deg,#fb923c,#ea580c);color:#fff;}',
            '#' + ROOT_ID + ' .bhs-stats-tab.active[data-op="LLEGADA"]{background:linear-gradient(135deg,#60a5fa,#2563eb);color:#fff;}',
            '#' + ROOT_ID + ' .bhs-stats-inline-total{font-size:1.05rem;font-weight:800;color:#0f172a;}',
            '#' + ROOT_ID + ' .bhs-stats-muted{color:#64748b;}',
            '#' + ROOT_ID + ' .bhs-stats-empty{padding:28px 16px;text-align:center;color:#64748b;}',
            '@media (max-width: 1399px){#' + ROOT_ID + ' .bhs-stats-airline-grid{grid-template-columns:repeat(3,minmax(190px,1fr));}}',
            '@media (max-width: 1199px){#' + ROOT_ID + ' .bhs-stats-grid,#' + ROOT_ID + ' .bhs-stats-totals-grid{grid-template-columns:repeat(2,minmax(0,1fr));}#' + ROOT_ID + ' .bhs-stats-filter-grid{grid-template-columns:repeat(3,minmax(0,1fr));}#' + ROOT_ID + ' .bhs-stats-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));}#' + ROOT_ID + ' .bhs-stats-airline-grid{grid-template-columns:repeat(2,minmax(190px,1fr));}}',
            '@media (max-width: 767px){#' + ROOT_ID + ' .bhs-stats-grid,#' + ROOT_ID + ' .bhs-stats-totals-grid,#' + ROOT_ID + ' .bhs-stats-chart-grid,#' + ROOT_ID + ' .bhs-stats-filter-grid,#' + ROOT_ID + ' .bhs-stats-summary-grid,#' + ROOT_ID + ' .bhs-stats-airline-grid{grid-template-columns:1fr;}#' + ROOT_ID + ' .bhs-stats-head{padding:18px;}#' + ROOT_ID + ' .bhs-stats-body{padding:16px;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function renderShell() {
        var root = document.getElementById(ROOT_ID);
        if (!root || state.rootRendered) return;
        root.innerHTML = [
            '<div class="bhs-stats-shell">',
            '  <div class="bhs-stats-head">',
            '    <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap position-relative" style="z-index:1;">',
            '      <div>',
            '        <div class="small text-uppercase fw-semibold" style="letter-spacing:.12em;opacity:.82;">Nuevo módulo integrado</div>',
            '        <h3 class="mb-1" style="font-weight:800;">Estadísticas de Equipaje del BHS</h3>',
            '        <div style="opacity:.82;font-size:.9rem;">Dashboard histórico, captura mensual, análisis comparativo y reportes del sistema BHS.</div>',
            '      </div>',
            '      <div class="d-flex gap-2 flex-wrap align-items-center">',
            '        <button type="button" class="badge rounded-pill px-3 py-2 border-0" id="bhs-stats-capacity-open"><i class="fas fa-database me-1"></i>Catalogo de capacidades</button>',
            '        <span class="badge rounded-pill px-3 py-2"><i class="fas fa-chart-column me-1"></i>Importación histórica Excel</span>',
            '      </div>',
            '    </div>',
            '  </div>',
            '  <div class="bhs-stats-body">',
            '    <div id="bhs-stats-status" class="alert alert-info d-none mb-3"></div>',
            '    <div class="modal fade" id="bhs-stats-duplicate-modal" tabindex="-1" aria-hidden="true">',
            '      <div class="modal-dialog modal-dialog-centered">',
            '        <div class="modal-content border-0 shadow-lg">',
            '          <div class="modal-header">',
            '            <h5 class="modal-title">Registro existente</h5>',
            '            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>',
            '          </div>',
            '          <div class="modal-body">',
            '            <p class="mb-0" id="bhs-stats-duplicate-message"></p>',
            '          </div>',
            '          <div class="modal-footer">',
            '            <button type="button" class="btn btn-outline-secondary" id="bhs-stats-duplicate-cancel" data-bs-dismiss="modal">Cancelar</button>',
            '            <button type="button" class="btn btn-primary" id="bhs-stats-duplicate-open">Abrir en modo edición</button>',
            '          </div>',
            '        </div>',
            '      </div>',
            '    </div>',
            '    <div class="modal fade" id="bhs-stats-capacity-modal" tabindex="-1" aria-hidden="true">',
            '      <div class="modal-dialog modal-dialog-centered modal-lg">',
            '        <div class="modal-content border-0 shadow-lg">',
            '          <div class="modal-header">',
            '            <div><h5 class="modal-title mb-0">Catalogo de capacidades</h5><div class="small text-muted">Valores internos usados para calcular utilizacion.</div></div>',
            '            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>',
            '          </div>',
            '          <div class="modal-body">',
            '            <div class="table-responsive">',
            '              <table class="table table-sm align-middle mb-0">',
            '                <thead class="table-light"><tr><th>Operacion</th><th>Hora</th><th>Dia</th><th>Mes</th><th>Ano</th></tr></thead>',
            '                <tbody id="bhs-stats-capacity-body"></tbody>',
            '              </table>',
            '            </div>',
            '          </div>',
            '        </div>',
            '      </div>',
            '    </div>',
            '    <div class="bhs-stats-panel mb-4">',
            '      <div class="bhs-stats-panel-header">',
            '        <div>',
            '          <div class="fw-bold">Filtros y reportes</div>',
            '          <div class="small text-muted">Combina Año, Mes, Tipo de operación y Aerolínea para actualizar todas las vistas.</div>',
            '        </div>',
            '        <div class="d-flex gap-2 flex-wrap">',
            '          <button type="button" class="btn btn-sm btn-outline-success" id="bhs-stats-export-xlsx"><i class="fas fa-file-excel me-1"></i>Excel</button>',
            '          <button type="button" class="btn btn-sm btn-outline-danger" id="bhs-stats-export-pdf"><i class="fas fa-file-pdf me-1"></i>PDF</button>',
            '          <button type="button" class="btn btn-sm btn-outline-secondary" id="bhs-stats-print"><i class="fas fa-print me-1"></i>Imprimir</button>',
            '        </div>',
            '      </div>',
            '      <div class="bhs-stats-panel-body">',
            '        <div class="bhs-stats-filter-grid mb-3">',
            '          <div><label class="form-label small fw-semibold">Año</label><select id="bhs-stats-filter-year" class="form-select form-select-sm"><option value="">Todos</option></select></div>',
            '          <div><label class="form-label small fw-semibold">Mes</label><select id="bhs-stats-filter-month" class="form-select form-select-sm"><option value="">Todos</option></select></div>',
            '          <div><label class="form-label small fw-semibold">Tipo de operación</label><select id="bhs-stats-filter-operation" class="form-select form-select-sm"><option value="">Todos</option><option value="SALIDA">Salida</option><option value="LLEGADA">Llegada</option></select></div>',
            '          <div><label class="form-label small fw-semibold">Aerolínea</label><select id="bhs-stats-filter-airline" class="form-select form-select-sm"><option value="">Todas</option></select></div>',
            '          <div><label class="form-label small fw-semibold">Búsqueda</label><input id="bhs-stats-search" class="form-control form-control-sm" type="search" placeholder="Año, mes o periodo"></div>',
            '        </div>',
            '        <div class="d-flex justify-content-end"><button type="button" class="btn btn-sm btn-outline-secondary" id="bhs-stats-clear-filters"><i class="fas fa-rotate-left me-1"></i>Limpiar filtros</button></div>',
            '      </div>',
            '    </div>',
            '    <div class="bhs-stats-totals-grid mb-4">',
            '      <div class="bhs-stats-kpi"><div class="bhs-stats-kpi-label">Total de salida</div><div class="bhs-stats-kpi-value" id="bhs-stats-kpi-salida">—</div><div class="bhs-stats-kpi-sub" id="bhs-stats-kpi-salida-sub">Utilización mensual —</div></div>',
            '      <div class="bhs-stats-kpi"><div class="bhs-stats-kpi-label">Total de llegada</div><div class="bhs-stats-kpi-value" id="bhs-stats-kpi-llegada">—</div><div class="bhs-stats-kpi-sub" id="bhs-stats-kpi-llegada-sub">Utilización mensual —</div></div>',
            '      <div class="bhs-stats-kpi"><div class="bhs-stats-kpi-label">Total general</div><div class="bhs-stats-kpi-value" id="bhs-stats-kpi-general">—</div><div class="bhs-stats-kpi-sub" id="bhs-stats-kpi-general-sub">Promedio mensual —</div></div>',
            '    </div>',
            '    <div class="bhs-stats-panel mb-4">',
            '      <div class="bhs-stats-panel-header"><div><div class="fw-bold">Resumen por aerolínea</div><div class="small text-muted">Totales por compañía calculados con los filtros activos.</div></div></div>',
            '      <div class="bhs-stats-panel-body">',
            '        <div class="bhs-stats-airline-grid" id="bhs-stats-airline-summary"></div>',
            '      </div>',
            '    </div>',
            '    <div class="bhs-stats-chart-grid mb-4">',
            '      <div class="bhs-stats-panel bhs-stats-chart-panel--monthly"><div class="bhs-stats-panel-header"><div><div class="fw-bold">Equipajes por mes</div><div class="small text-muted">Serie mensual filtrada por operación.</div></div></div><div class="bhs-stats-panel-body"><div class="bhs-stats-chart-toolbar"><div class="bhs-stats-chart-hint"><i class="fas fa-arrows-left-right-to-line me-1"></i>Usa rueda del mouse o gesto táctil para zoom horizontal. Arrastra para desplazarte dentro del periodo.</div><button type="button" class="btn btn-sm btn-outline-secondary" id="bhs-stats-reset-zoom"><i class="fas fa-magnifying-glass-minus me-1"></i>Restablecer zoom</button></div><div class="bhs-stats-chart-scroll"><div class="bhs-stats-chart-stage" id="bhs-stats-chart-monthly-stage"><canvas id="bhs-stats-chart-monthly"></canvas></div></div></div></div>',
            '      <div class="bhs-stats-panel"><div class="bhs-stats-panel-header"><div><div class="fw-bold">Equipajes por año</div><div class="small text-muted">Totales anuales a partir de registros mensuales.</div></div></div><div class="bhs-stats-panel-body"><canvas id="bhs-stats-chart-yearly" height="220"></canvas></div></div>',
            '      <div class="bhs-stats-panel"><div class="bhs-stats-panel-header"><div><div class="fw-bold">Comparativo anual</div><div class="small text-muted">Salida vs Llegada por año.</div></div></div><div class="bhs-stats-panel-body"><canvas id="bhs-stats-chart-annual-compare" height="220"></canvas></div></div>',
            '      <div class="bhs-stats-panel"><div class="bhs-stats-panel-header"><div><div class="fw-bold">Distribución por aerolínea</div><div class="small text-muted">Participación acumulada del periodo filtrado.</div></div></div><div class="bhs-stats-panel-body"><canvas id="bhs-stats-chart-airline" height="220"></canvas></div></div>',
            '      <div class="bhs-stats-panel"><div class="bhs-stats-panel-header"><div><div class="fw-bold">Salida vs Llegada</div><div class="small text-muted">Comparativo total del periodo filtrado.</div></div></div><div class="bhs-stats-panel-body"><canvas id="bhs-stats-chart-operation" height="220"></canvas></div></div>',
            '      <div class="bhs-stats-panel"><div class="bhs-stats-panel-header"><div><div class="fw-bold">Tendencia histórica</div><div class="small text-muted">Evolución mensual consolidada del BHS.</div></div></div><div class="bhs-stats-panel-body"><canvas id="bhs-stats-chart-trend" height="220"></canvas></div></div>',
            '    </div>',
            '    <div class="bhs-stats-chart-grid mb-4">',
            '      <div class="bhs-stats-panel">',
            '        <div class="bhs-stats-panel-header"><div><div class="fw-bold">Captura y edición mensual</div><div class="small text-muted">Altas, actualizaciones y validación de duplicados por Año + Mes + Operación.</div></div></div>',
            '        <div class="bhs-stats-panel-body">',
            '          <form id="bhs-stats-form" novalidate>',
            '            <input type="hidden" id="bhs-stats-edit-id">',
            '            <div class="row g-3">',
            '              <div class="col-md-4"><label class="form-label small fw-semibold">Tipo de operación</label><select id="bhs-stats-form-operation" class="form-select form-select-sm" required><option value="">Selecciona</option><option value="SALIDA">Salida</option><option value="LLEGADA">Llegada</option></select></div>',
            '              <div class="col-md-4"><label class="form-label small fw-semibold">Año</label><input id="bhs-stats-form-year" type="number" min="2022" step="1" class="form-control form-control-sm" required></div>',
            '              <div class="col-md-4"><label class="form-label small fw-semibold">Mes</label><select id="bhs-stats-form-month" class="form-select form-select-sm" required><option value="">Selecciona</option>' + MONTHS.map(function (m) { return '<option value="' + m.label + '">' + m.label + '</option>'; }).join('') + '</select></div>',
            '              <div class="col-md-4"><label class="form-label small fw-semibold">AM</label><input id="bhs-stats-form-am" type="number" min="0" step="1" class="form-control form-control-sm bhs-stats-qty"></div>',
            '              <div class="col-md-4"><label class="form-label small fw-semibold">Y4</label><input id="bhs-stats-form-y4" type="number" min="0" step="1" class="form-control form-control-sm bhs-stats-qty"></div>',
            '              <div class="col-md-4"><label class="form-label small fw-semibold">VB</label><input id="bhs-stats-form-vb" type="number" min="0" step="1" class="form-control form-control-sm bhs-stats-qty"></div>',
            '              <div class="col-md-6"><label class="form-label small fw-semibold">DM</label><input id="bhs-stats-form-cm-dm" type="number" min="0" step="1" class="form-control form-control-sm bhs-stats-qty"></div>',
            '              <div class="col-md-6"><label class="form-label small fw-semibold">ZV</label><input id="bhs-stats-form-zv" type="number" min="0" step="1" class="form-control form-control-sm bhs-stats-qty"></div>',
            '              <div class="col-12"><div class="alert alert-light border d-flex align-items-center justify-content-between mb-0"><span class="small fw-semibold text-muted">Total calculado automáticamente</span><span id="bhs-stats-form-total" class="bhs-stats-inline-total">0</span></div></div>',
            '            </div>',
            '            <div class="d-flex gap-2 flex-wrap mt-3">',
            '              <button type="submit" class="btn btn-primary btn-sm" id="bhs-stats-save"><i class="fas fa-floppy-disk me-1"></i>Guardar registro</button>',
            '              <button type="button" class="btn btn-outline-secondary btn-sm" id="bhs-stats-cancel-edit"><i class="fas fa-ban me-1"></i>Cancelar edición</button>',
            '            </div>',
            '          </form>',
            '        </div>',
            '      </div>',
            '      <div class="bhs-stats-panel bhs-stats-summary-panel">',
            '        <div class="bhs-stats-panel-header"><div><div class="fw-bold">Resumen del periodo seleccionado</div><div class="small text-muted">Indicadores dinamicos conforme a los filtros activos.</div></div></div>',
            '        <div class="bhs-stats-panel-body">',
            '          <div class="bhs-stats-summary-grid" id="bhs-stats-period-summary"></div>',
            '          <div class="bhs-stats-summary-trend"><canvas id="bhs-stats-chart-summary-trend"></canvas></div>',
            '        </div>',
            '      </div>',
            '    </div>',
            '    <div class="bhs-stats-panel">',
            '      <div class="bhs-stats-panel-header">',
            '        <div><div class="fw-bold">Histórico y control de registros</div><div class="small text-muted">El sistema conserva filas mensuales y también los resúmenes del archivo fuente sin modificar el módulo BHS existente.</div></div>',
            '        <div class="bhs-stats-tabs">',
            '          <button type="button" class="bhs-stats-tab active" data-op="SALIDA" id="bhs-stats-tab-salida">Salidas</button>',
            '          <button type="button" class="bhs-stats-tab" data-op="LLEGADA" id="bhs-stats-tab-llegada">Llegadas</button>',
            '        </div>',
            '      </div>',
            '      <div class="bhs-stats-panel-body">',
            '        <div class="table-responsive">',
            '          <table class="table table-hover align-middle bhs-stats-table mb-0">',
            '            <thead class="table-light">',
            '              <tr>',
            '                <th><button class="btn btn-link btn-sm p-0 text-decoration-none" data-sort="anio">Año</button></th>',
            '                <th><button class="btn btn-link btn-sm p-0 text-decoration-none" data-sort="mes_num">Mes / Periodo</button></th>',
            '                <th>AM</th><th>Y4</th><th>VB</th><th>DM</th><th>ZV</th>',
            '                <th>Total</th><th>Utilización</th><th>Tipo</th><th>Acciones</th>',
            '              </tr>',
            '            </thead>',
            '            <tbody id="bhs-stats-table-body"></tbody>',
            '          </table>',
            '        </div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
        state.rootRendered = true;
    }

    function setStatus(message, type) {
        var el = document.getElementById('bhs-stats-status');
        if (!el) return;
        if (!message) {
            el.className = 'alert alert-info d-none mb-3';
            el.innerHTML = '';
            return;
        }
        el.className = 'alert alert-' + (type || 'info') + ' mb-3';
        el.innerHTML = message;
    }

    function fmtNumber(value) {
        if (value == null || value === '') return '—';
        return Number(value).toLocaleString('es-MX');
    }

    function fmtPercent(value) {
        if (value == null || isNaN(value)) return '—';
        return Number(value).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + '%';
    }

    function normalizeOperationType(value) {
        return String(value || '').trim().toUpperCase();
    }

    function normalizeMonthNum(value) {
        if (value == null || value === '') return null;
        if (typeof value === 'number') return value >= 1 && value <= 12 ? value : null;
        var trimmed = String(value).trim().toUpperCase();
        if (/^\d+$/.test(trimmed)) {
            var asNumber = Number(trimmed);
            return asNumber >= 1 && asNumber <= 12 ? asNumber : null;
        }
        return MONTH_MAP[trimmed] || null;
    }

    function isMonthlyRowPlaceholder(row) {
        if (!row || row.record_kind !== 'monthly') return false;
        return sumFields(row) === 0;
    }

    function findPersistedMonthlyRow(operationType, year, monthNum) {
        var op = normalizeOperationType(operationType);
        var yr = Number(year);
        var mn = normalizeMonthNum(monthNum);
        return state.rows.find(function (row) {
            return row.record_kind === 'monthly' &&
                normalizeOperationType(row.operation_type) === op &&
                Number(row.anio) === yr &&
                normalizeMonthNum(row.mes_num != null ? row.mes_num : row.mes) === mn;
        }) || null;
    }

    function clearEditState() {
        state.editingId = null;
        state.editingSnapshot = null;
        setSaveButtonState(false);
    }

    function syncEditStateWithSelectedPeriod() {
        if (!state.editingId || !state.editingSnapshot) return;
        var currentOp = normalizeOperationType(document.getElementById('bhs-stats-form-operation').value);
        var currentYear = Number(document.getElementById('bhs-stats-form-year').value);
        var currentMonth = normalizeMonthNum(document.getElementById('bhs-stats-form-month').value);
        if (currentOp !== state.editingSnapshot.operation_type ||
            currentYear !== state.editingSnapshot.anio ||
            currentMonth !== state.editingSnapshot.mes_num) {
            clearEditState();
        }
    }

    function buildDuplicateMessage(operationType, year, monthNum) {
        var opLabel = normalizeOperationType(operationType) === 'LLEGADA' ? 'Llegada' : 'Salida';
        var monthLabel = MONTH_NAMES[monthNum] || MONTH_MAP[monthNum] || 'periodo';
        return 'Ya existe un registro con informacion para ' + opLabel + ', ' + monthLabel + ' de ' + year + '. Deseas abrirlo en modo edicion?';
    }

    function showDuplicateModal(row, operationType, year, monthNum) {
        state.pendingDuplicateId = row ? row.id : null;
        var message = document.getElementById('bhs-stats-duplicate-message');
        if (message) message.textContent = buildDuplicateMessage(operationType, year, monthNum);
        if (window.bootstrap && window.bootstrap.Modal) {
            var modalEl = document.getElementById('bhs-stats-duplicate-modal');
            if (!modalEl) return;
            window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    }

    function hideDuplicateModal() {
        state.pendingDuplicateId = null;
        if (window.bootstrap && window.bootstrap.Modal) {
            var modalEl = document.getElementById('bhs-stats-duplicate-modal');
            if (!modalEl) return;
            window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        }
    }

    function sumFields(row) {
        return AIRLINES.reduce(function (acc, airline) {
            return acc + (Number(row[airline.key]) || 0);
        }, 0);
    }

    function normalizeRow(row) {
        var normalized = Object.assign({}, row);
        normalized.operation_type = normalized.operation_type || normalized.side;
        normalized.record_kind = normalized.record_kind || 'monthly';
        normalized.total_equipajes = Number(normalized.total_equipajes != null ? normalized.total_equipajes : sumFields(normalized)) || 0;
        normalized.reported_total = normalized.reported_total == null ? null : Number(normalized.reported_total);
        normalized.reported_utilization_pct = normalized.reported_utilization_pct == null ? null : Number(normalized.reported_utilization_pct);
        normalized.source_order = Number(normalized.source_order || 0);
        normalized.mes_num = normalized.mes_num == null && normalized.mes ? MONTH_MAP[normalized.mes] : normalized.mes_num;
        return normalized;
    }

    function getMonthlyRows(rows, includeZero) {
        return (rows || []).filter(function (row) {
            if (row.record_kind !== 'monthly') return false;
            if (includeZero) return true;
            return sumFields(row) > 0;
        });
    }

    function getDisplayedTotal(row) {
        if (row.record_kind === 'monthly') return row.total_equipajes;
        return row.reported_total != null ? row.reported_total : row.total_equipajes;
    }

    function getRowUtilization(row) {
        if (row.record_kind !== 'monthly') {
            return row.reported_utilization_pct;
        }
        var cap = state.capacities[row.operation_type];
        if (!cap || !cap.max_per_month) return null;
        return row.total_equipajes > 0 ? (row.total_equipajes / cap.max_per_month) * 100 : 0;
    }

    async function getClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof window.ensureSupabaseClient === 'function') return window.ensureSupabaseClient();
        throw new Error('Cliente Supabase no disponible');
    }

    function canEdit() {
        if (!state.dbReady) return false;
        try {
            var role = sessionStorage.getItem('user_role') || '';
            if (role === 'admin' || role === 'superadmin') return true;
            var level = (window.dataManager && window.dataManager.sectionLevels || {}).bhs;
            if (level === 'read' || level === 'none') return false;
            if (level === 'capture' || level === 'edit') return true;
            return ['editor', 'gso'].indexOf(role) >= 0;
        } catch (_) {
            return false;
        }
    }

    function canDelete() {
        if (!state.dbReady) return false;
        try {
            var role = sessionStorage.getItem('user_role') || '';
            if (role === 'admin' || role === 'superadmin') return true;
            return (window.dataManager && window.dataManager.sectionLevels || {}).bhs === 'edit';
        } catch (_) {
            return false;
        }
    }

    async function loadCapacities() {
        try {
            var sb = await getClient();
            var response = await sb.from(CAP_TABLE).select('*');
            if (response.error) throw response.error;
            var map = Object.assign({}, CAPACITY_FALLBACK);
            (response.data || []).forEach(function (row) {
                map[row.operation_type] = {
                    max_per_hour: Number(row.max_per_hour) || 0,
                    max_per_day: Number(row.max_per_day) || 0,
                    max_per_month: Number(row.max_per_month) || 0,
                    max_per_year: Number(row.max_per_year) || 0
                };
            });
            state.capacities = map;
        } catch (error) {
            state.capacities = CAPACITY_FALLBACK;
            setStatus(
                'No fue posible leer el catálogo <code>' + CAP_TABLE + '</code>. Se usan capacidades de respaldo mientras se aplica el script <code>db/create_bhs_baggage_statistics.sql</code>.',
                'warning'
            );
        }
    }

    async function ensureSeedData() {
        if (state.seedAttempted) return;
        state.seedAttempted = true;
        var sb;
        try {
            sb = await getClient();
        } catch (error) {
            state.dbReady = false;
            state.rows = buildSeedRows();
            setStatus('Supabase no está disponible. El módulo se muestra en modo local de solo lectura.', 'warning');
            return;
        }

        try {
            var countRes = await sb.from(STATS_TABLE).select('id', { count: 'exact', head: true });
            if (countRes.error) throw countRes.error;
            state.dbReady = true;
            if ((countRes.count || 0) > 0) return;

            var payload = buildSeedRows().map(function (row) {
                return {
                    source_key: row.source_key,
                    source_order: row.source_order,
                    operation_type: row.operation_type,
                    record_kind: row.record_kind,
                    anio: row.anio,
                    mes: row.mes,
                    mes_num: row.mes_num,
                    period_label: row.period_label || null,
                    am: row.am,
                    y4: row.y4,
                    vb: row.vb,
                    cm_dm: row.cm_dm,
                    zv: row.zv,
                    reported_total: row.reported_total,
                    reported_utilization_pct: row.reported_utilization_pct,
                    is_seed: true,
                    created_by: 'system-seed',
                    updated_by: 'system-seed'
                };
            });

            for (var i = 0; i < payload.length; i += 50) {
                var batch = payload.slice(i, i + 50);
                var insertRes = await sb.from(STATS_TABLE).upsert(batch, { onConflict: 'source_key' });
                if (insertRes.error) throw insertRes.error;
            }
        } catch (error) {
            state.dbReady = false;
            state.rows = buildSeedRows();
            setStatus(
                'La tabla <code>' + STATS_TABLE + '</code> aún no está disponible o no permitió la semilla automática. Se muestran los datos históricos en modo local. Aplica primero <code>db/create_bhs_baggage_statistics.sql</code> para habilitar la persistencia.',
                'warning'
            );
        }
    }

    async function loadRows() {
        if (!state.dbReady) {
            state.rows = buildSeedRows();
            return;
        }
        var sb = await getClient();
        var response = await sb.from(STATS_TABLE).select('*').order('source_order', { ascending: true });
        if (response.error) throw response.error;
        state.rows = (response.data || []).map(normalizeRow);
    }

    function fillFilters(rows) {
        var years = Array.from(new Set(rows.filter(function (row) {
            return row.record_kind === 'monthly' && row.anio != null;
        }).map(function (row) { return row.anio; }))).sort(function (a, b) { return b - a; });

        var yearSelect = document.getElementById('bhs-stats-filter-year');
        var monthSelect = document.getElementById('bhs-stats-filter-month');
        var airlineSelect = document.getElementById('bhs-stats-filter-airline');

        if (yearSelect) {
            var yearValue = yearSelect.value;
            yearSelect.innerHTML = '<option value="">Todos</option>' + years.map(function (year) {
                return '<option value="' + year + '">' + year + '</option>';
            }).join('');
            if (years.indexOf(Number(yearValue)) >= 0) yearSelect.value = yearValue;
        }

        if (monthSelect) {
            var monthValue = monthSelect.value;
            monthSelect.innerHTML = '<option value="">Todos</option>' + MONTHS.map(function (month) {
                return '<option value="' + month.label + '">' + month.label + '</option>';
            }).join('');
            monthSelect.value = monthValue || '';
        }

        if (airlineSelect) {
            var airlineValue = airlineSelect.value;
            airlineSelect.innerHTML = '<option value="">Todas</option>' + AIRLINES.map(function (airline) {
                return '<option value="' + airline.key + '">' + airline.label + '</option>';
            }).join('');
            airlineSelect.value = airlineValue || '';
        }
    }

    function getFilters() {
        return {
            year: document.getElementById('bhs-stats-filter-year') ? document.getElementById('bhs-stats-filter-year').value : '',
            month: document.getElementById('bhs-stats-filter-month') ? document.getElementById('bhs-stats-filter-month').value : '',
            operation: document.getElementById('bhs-stats-filter-operation') ? document.getElementById('bhs-stats-filter-operation').value : '',
            airline: document.getElementById('bhs-stats-filter-airline') ? document.getElementById('bhs-stats-filter-airline').value : '',
            search: (document.getElementById('bhs-stats-search') ? document.getElementById('bhs-stats-search').value : '').trim().toLowerCase()
        };
    }

    function applyFilters(rows, filters) {
        return rows.filter(function (row) {
            if (filters.operation && row.operation_type !== filters.operation) return false;
            if (filters.year) {
                if (String(row.anio || '') !== filters.year) return false;
            }
            if (filters.month) {
                if ((row.mes || '') !== filters.month) return false;
            }
            if (filters.airline) {
                if (!(Number(row[filters.airline]) > 0)) return false;
            }
            if (filters.search) {
                var haystack = [
                    row.anio,
                    row.mes,
                    row.period_label,
                    row.operation_type,
                    KIND_LABELS[row.record_kind],
                    row.reported_total
                ].join(' ').toLowerCase();
                if (haystack.indexOf(filters.search) === -1) return false;
            }
            return true;
        });
    }

    function comparePeriods(a, b) {
        var ay = a.anio == null ? Number.MIN_SAFE_INTEGER : Number(a.anio);
        var by = b.anio == null ? Number.MIN_SAFE_INTEGER : Number(b.anio);
        var am = a.mes_num == null ? 0 : Number(a.mes_num);
        var bm = b.mes_num == null ? 0 : Number(b.mes_num);
        if (ay !== by) return ay - by;
        if (am !== bm) return am - bm;
        return (Number(a.source_order) || 0) - (Number(b.source_order) || 0);
    }

    function sortRows(rows) {
        var field = state.sortField;
        var dir = state.sortDir === 'asc' ? 1 : -1;
        return rows.slice().sort(function (a, b) {
            if (field === 'period' || field === 'anio' || field === 'mes_num') {
                return comparePeriods(a, b) * dir;
            }
            var av = a[field];
            var bv = b[field];
            if (field === 'anio' || field === 'mes_num' || field === 'source_order') {
                av = av == null ? Number.MAX_SAFE_INTEGER : Number(av);
                bv = bv == null ? Number.MAX_SAFE_INTEGER : Number(bv);
            } else {
                av = String(av == null ? '' : av).toLowerCase();
                bv = String(bv == null ? '' : bv).toLowerCase();
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
    }

    function getMonthlyAggregation(rows, descending) {
        var map = {};
        getMonthlyRows(rows, false).forEach(function (row) {
            var key = row.anio + '-' + String(row.mes_num).padStart(2, '0');
            if (!map[key]) {
                map[key] = {
                    key: key,
                    anio: row.anio,
                    mes_num: row.mes_num,
                    label: (row.mes || MONTH_MAP[row.mes_num] || '—') + ' ' + row.anio,
                    SALIDA: 0,
                    LLEGADA: 0,
                    total: 0
                };
            }
            map[key][row.operation_type] += row.total_equipajes;
            map[key].total += row.total_equipajes;
        });
        return Object.values(map).sort(function (a, b) {
            var result = a.key.localeCompare(b.key);
            return descending ? -result : result;
        });
    }

    function getYearlyAggregation(rows) {
        var map = {};
        var monthlyRows = getMonthlyRows(rows, false);
        var annualSummaryRows = (rows || []).filter(function (row) {
            return row.record_kind === 'annual_summary' &&
                row.anio != null &&
                row.reported_total != null;
        });

        monthlyRows.forEach(function (row) {
            if (!map[row.anio]) {
                map[row.anio] = { year: row.anio, SALIDA: 0, LLEGADA: 0, total: 0 };
            }
            map[row.anio][row.operation_type] += row.total_equipajes;
            map[row.anio].total += row.total_equipajes;
        });

        annualSummaryRows.forEach(function (row) {
            if (!map[row.anio]) {
                map[row.anio] = { year: row.anio, SALIDA: 0, LLEGADA: 0, total: 0 };
            }
            map[row.anio][row.operation_type] = Number(row.reported_total) || 0;
            map[row.anio].total = (map[row.anio].SALIDA || 0) + (map[row.anio].LLEGADA || 0);
        });

        return Object.values(map).sort(function (a, b) { return a.year - b.year; });
    }

    function getCalendarYearlyAggregation(rows) {
        var map = {};

        getMonthlyRows(rows, false).forEach(function (row) {
            if (!map[row.anio]) {
                map[row.anio] = { year: row.anio, SALIDA: 0, LLEGADA: 0, total: 0 };
            }
            map[row.anio][row.operation_type] += row.total_equipajes;
            map[row.anio].total += row.total_equipajes;
        });

        return Object.values(map).sort(function (a, b) { return a.year - b.year; });
    }

    function getAirlineTotals(rows) {
        return AIRLINES.map(function (airline) {
            return {
                key: airline.key,
                label: airline.label,
                shortLabel: airline.shortLabel,
                color: airline.color,
                code: airline.code,
                total: getMonthlyRows(rows, false).reduce(function (acc, row) {
                    return acc + (Number(row[airline.key]) || 0);
                }, 0)
            };
        }).filter(function (item) { return item.total > 0; });
    }

    function getComparison(filters) {
        var baseRows = state.rows.filter(function (row) {
            if (row.record_kind !== 'monthly') return false;
            if (filters.operation && row.operation_type !== filters.operation) return false;
            if (filters.airline && !(Number(row[filters.airline]) > 0)) return false;
            return sumFields(row) > 0;
        });
        var currentRows = applyFilters(baseRows, filters);
        var currentAgg = getMonthlyAggregation(currentRows);
        if (!currentAgg.length) return null;
        var baseAgg = getMonthlyAggregation(baseRows);
        var currentKeys = currentAgg.map(function (item) { return item.key; }).sort();
        var windowSize = currentKeys.length;
        var firstIndex = baseAgg.findIndex(function (item) { return item.key === currentKeys[0]; });
        if (firstIndex <= 0) return null;
        var previousSlice = baseAgg.slice(Math.max(0, firstIndex - windowSize), firstIndex);
        if (!previousSlice.length) return null;
        var currentTotal = currentAgg.reduce(function (acc, item) { return acc + item.total; }, 0);
        var previousTotal = previousSlice.reduce(function (acc, item) { return acc + item.total; }, 0);
        return {
            currentTotal: currentTotal,
            previousTotal: previousTotal,
            delta: currentTotal - previousTotal,
            percent: previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null
        };
    }

    function getDaysInMonth(year, monthNum) {
        if (!year || !monthNum) return null;
        return new Date(Number(year), Number(monthNum), 0).getDate();
    }

    function getDeltaBadge(delta, percent) {
        if (delta == null || percent == null || isNaN(percent)) {
            return '<span class="bhs-stats-delta bhs-stats-delta--flat">Sin comparativo</span>';
        }
        var css = delta > 0 ? 'bhs-stats-delta--up' : delta < 0 ? 'bhs-stats-delta--down' : 'bhs-stats-delta--flat';
        var icon = delta > 0 ? 'fa-arrow-trend-up' : delta < 0 ? 'fa-arrow-trend-down' : 'fa-minus';
        var sign = delta > 0 ? '+' : '';
        return '<span class="bhs-stats-delta ' + css + '"><i class="fas ' + icon + '"></i>' + sign + fmtPercent(percent) + '</span>';
    }

    function buildSummaryCard(title, value, desc, deltaHtml) {
        return '<div class="bhs-stats-summary-card">' +
            '<div class="bhs-stats-summary-title">' + title + '</div>' +
            '<div class="bhs-stats-summary-value">' + value + '</div>' +
            '<div class="bhs-stats-summary-desc">' + desc + '</div>' +
            (deltaHtml || '') +
            '</div>';
    }

    function renderPeriodSummary(filteredRows, filters) {
        var container = document.getElementById('bhs-stats-period-summary');
        if (!container) return;

        var monthly = getMonthlyRows(filteredRows, false);
        var salidaRows = monthly.filter(function (row) { return row.operation_type === 'SALIDA'; });
        var llegadaRows = monthly.filter(function (row) { return row.operation_type === 'LLEGADA'; });
        var salidaTotal = salidaRows.reduce(function (acc, row) { return acc + row.total_equipajes; }, 0);
        var llegadaTotal = llegadaRows.reduce(function (acc, row) { return acc + row.total_equipajes; }, 0);
        var totalGeneral = salidaTotal + llegadaTotal;
        var distinctMonths = new Set(monthly.map(function (row) {
            return row.anio + '-' + row.mes_num;
        })).size;
        var salidaPct = salidaRows.length ? (salidaTotal / (state.capacities.SALIDA.max_per_month * salidaRows.length)) * 100 : 0;
        var llegadaPct = llegadaRows.length ? (llegadaTotal / (state.capacities.LLEGADA.max_per_month * llegadaRows.length)) * 100 : 0;
        var comparison = getComparison(filters);
        var monthlyAgg = getMonthlyAggregation(filteredRows);
        var peakMonth = monthlyAgg.slice().sort(function (a, b) { return b.total - a.total; })[0] || null;
        var airlineTotals = getAirlineTotals(filteredRows).sort(function (a, b) { return b.total - a.total; });
        var topAirline = airlineTotals[0] || null;
        var days = filters.year && filters.month ? getDaysInMonth(filters.year, normalizeMonthNum(filters.month)) : null;
        var averageValue = days ? totalGeneral / days : (distinctMonths ? totalGeneral / distinctMonths : 0);
        var averageLabel = days ? 'Promedio diario del mes filtrado.' : 'Promedio mensual del rango filtrado.';
        var deltaHtml = comparison ? getDeltaBadge(comparison.delta, comparison.percent) : getDeltaBadge(null, null);

        container.innerHTML = [
            buildSummaryCard('Salida', fmtNumber(salidaTotal), 'Total de equipajes de salida.', deltaHtml),
            buildSummaryCard('Llegada', fmtNumber(llegadaTotal), 'Total de equipajes de llegada.'),
            buildSummaryCard('Total general', fmtNumber(totalGeneral), 'Equipajes acumulados del filtro.'),
            buildSummaryCard('Uso salidas', fmtPercent(salidaPct), 'Capacidad maxima mensual aplicada.'),
            buildSummaryCard('Uso llegadas', fmtPercent(llegadaPct), 'Capacidad maxima mensual aplicada.'),
            buildSummaryCard('Variacion previa', comparison ? fmtNumber(comparison.delta) : 'N/D', 'Contra el periodo anterior comparable.', deltaHtml),
            buildSummaryCard('Mes mayor', peakMonth ? peakMonth.label : 'N/D', peakMonth ? fmtNumber(peakMonth.total) + ' equipajes' : 'Sin registros para el filtro.'),
            buildSummaryCard('Aerolínea lider', topAirline ? topAirline.shortLabel : 'N/D', topAirline ? topAirline.label + ' · ' + fmtNumber(topAirline.total) : 'Sin participacion disponible.'),
            buildSummaryCard(days ? 'Promedio diario' : 'Promedio mensual', fmtNumber(Math.round(averageValue || 0)), averageLabel)
        ].join('');
    }

    function renderAirlineSummary(filteredRows, filters) {
        var container = document.getElementById('bhs-stats-airline-summary');
        if (!container) return;

        var monthly = getMonthlyRows(filteredRows, false);
        var totalFiltered = monthly.reduce(function (acc, row) {
            return acc + row.total_equipajes;
        }, 0);
        var visibleAirlines = filters.airline
            ? AIRLINES.filter(function (airline) { return airline.key === filters.airline; })
            : AIRLINES;

        container.innerHTML = visibleAirlines.map(function (airline) {
            var salida = monthly.filter(function (row) {
                return row.operation_type === 'SALIDA';
            }).reduce(function (acc, row) {
                return acc + (Number(row[airline.key]) || 0);
            }, 0);
            var llegada = monthly.filter(function (row) {
                return row.operation_type === 'LLEGADA';
            }).reduce(function (acc, row) {
                return acc + (Number(row[airline.key]) || 0);
            }, 0);
            var total = salida + llegada;
            var share = totalFiltered > 0 ? (total / totalFiltered) * 100 : 0;
            var selectedClass = filters.airline === airline.key ? ' is-selected' : '';

            return '<div class="bhs-stats-airline-card' + selectedClass + '" style="--airline-color:' + airline.color + '">' +
                '<div class="bhs-stats-airline-head">' +
                '<img class="bhs-stats-airline-logo" src="' + airline.logo + '" alt="' + airline.name + '" onerror="this.style.display=&quot;none&quot;">' +
                '<div><div class="bhs-stats-airline-name">' + airline.name + '</div><span class="bhs-stats-airline-code">' + airline.code + '</span></div>' +
                '</div>' +
                '<div class="bhs-stats-airline-metrics">' +
                '<div class="bhs-stats-airline-metric"><span>Salida</span><strong>' + fmtNumber(salida) + '</strong></div>' +
                '<div class="bhs-stats-airline-metric"><span>Llegada</span><strong>' + fmtNumber(llegada) + '</strong></div>' +
                '<div class="bhs-stats-airline-metric"><span>Total</span><strong>' + fmtNumber(total) + '</strong></div>' +
                '<div class="bhs-stats-airline-metric"><span>Participacion</span><strong>' + fmtPercent(share) + '</strong></div>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderCapacities() {
        var tbody = document.getElementById('bhs-stats-capacity-body');
        if (!tbody) return;
        tbody.innerHTML = ['SALIDA', 'LLEGADA'].map(function (op) {
            var cap = state.capacities[op] || CAPACITY_FALLBACK[op];
            return '<tr>' +
                '<td><span class="bhs-stats-chip ' + (op === 'SALIDA' ? 'bhs-stats-chip--salida' : 'bhs-stats-chip--llegada') + '">' + OP_LABELS[op] + '</span></td>' +
                '<td>' + fmtNumber(cap.max_per_hour) + '</td>' +
                '<td>' + fmtNumber(cap.max_per_day) + '</td>' +
                '<td>' + fmtNumber(cap.max_per_month) + '</td>' +
                '<td>' + fmtNumber(cap.max_per_year) + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderKpis(filteredRows, filters) {
        var monthly = getMonthlyRows(filteredRows, false);
        var salidaRows = monthly.filter(function (row) { return row.operation_type === 'SALIDA'; });
        var llegadaRows = monthly.filter(function (row) { return row.operation_type === 'LLEGADA'; });
        var salidaTotal = salidaRows.reduce(function (acc, row) { return acc + row.total_equipajes; }, 0);
        var llegadaTotal = llegadaRows.reduce(function (acc, row) { return acc + row.total_equipajes; }, 0);
        var totalGeneral = salidaTotal + llegadaTotal;
        var distinctMonths = new Set(monthly.map(function (row) {
            return row.anio + '-' + row.mes_num;
        })).size;
        var avgMonthly = distinctMonths > 0 ? totalGeneral / distinctMonths : 0;
        var salidaPct = salidaRows.length ? (salidaTotal / (state.capacities.SALIDA.max_per_month * salidaRows.length)) * 100 : 0;
        var llegadaPct = llegadaRows.length ? (llegadaTotal / (state.capacities.LLEGADA.max_per_month * llegadaRows.length)) * 100 : 0;

        setText('bhs-stats-kpi-salida', fmtNumber(salidaTotal));
        setText('bhs-stats-kpi-llegada', fmtNumber(llegadaTotal));
        setText('bhs-stats-kpi-general', fmtNumber(totalGeneral));
        setText('bhs-stats-kpi-salida-sub', 'Utilización mensual ' + fmtPercent(salidaPct));
        setText('bhs-stats-kpi-llegada-sub', 'Utilización mensual ' + fmtPercent(llegadaPct));
        setText('bhs-stats-kpi-general-sub', 'Promedio mensual ' + fmtNumber(Math.round(avgMonthly || 0)));
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function buildTableRows(rows) {
        var filtered = rows.filter(function (row) { return row.operation_type === state.currentTab; });
        var tbody = document.getElementById('bhs-stats-table-body');
        if (!tbody) return;
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="11" class="bhs-stats-empty">No hay registros para los filtros actuales.</td></tr>';
            return;
        }

        var html = sortRows(filtered).map(function (row) {
            var isReadonly = row.record_kind !== 'monthly';
            var css = isReadonly ? 'bhs-stats-readonly' : '';
            if (row.record_kind !== 'monthly') css += ' bhs-stats-summary-row';
            var actions = '';
            if (!isReadonly && canEdit()) {
                actions += '<button type="button" class="btn btn-sm btn-outline-primary bhs-stats-edit" data-id="' + row.id + '"><i class="fas fa-pen"></i></button>';
            }
            if (!isReadonly && canDelete()) {
                actions += '<button type="button" class="btn btn-sm btn-outline-danger bhs-stats-delete" data-id="' + row.id + '"><i class="fas fa-trash"></i></button>';
            }
            if (!actions) actions = '<span class="text-muted small">—</span>';

            return '<tr class="' + css.trim() + '">' +
                '<td>' + (row.anio != null ? row.anio : '—') + '</td>' +
                '<td>' + (row.period_label || row.mes || '—') + '</td>' +
                '<td>' + fmtNumber(row.am) + '</td>' +
                '<td>' + fmtNumber(row.y4) + '</td>' +
                '<td>' + fmtNumber(row.vb) + '</td>' +
                '<td>' + fmtNumber(row.cm_dm) + '</td>' +
                '<td>' + fmtNumber(row.zv) + '</td>' +
                '<td class="fw-bold">' + fmtNumber(getDisplayedTotal(row)) + '</td>' +
                '<td>' + fmtPercent(getRowUtilization(row)) + '</td>' +
                '<td><span class="badge text-bg-light">' + (KIND_LABELS[row.record_kind] || row.record_kind) + '</span></td>' +
                '<td><div class="bhs-stats-actions">' + actions + '</div></td>' +
                '</tr>';
        }).join('');
        tbody.innerHTML = html;
    }

    function destroyCharts() {
        Object.keys(state.charts).forEach(function (key) {
            try {
                state.charts[key].destroy();
            } catch (_) {}
        });
        state.charts = {};
    }

    function renderCharts(filteredRows) {
        if (typeof Chart === 'undefined') return;
        destroyCharts();

        var monthlyAgg = getMonthlyAggregation(filteredRows);
        var monthlyChartAgg = getMonthlyAggregation(filteredRows, true);
        var yearlyAgg = getYearlyAggregation(filteredRows);
        var annualCompareAgg = getCalendarYearlyAggregation(filteredRows);
        var airlineTotals = getAirlineTotals(filteredRows);
        var salidaTotal = monthlyAgg.reduce(function (acc, item) { return acc + item.SALIDA; }, 0);
        var llegadaTotal = monthlyAgg.reduce(function (acc, item) { return acc + item.LLEGADA; }, 0);
        var filters = getFilters();
        var monthlyStage = document.getElementById('bhs-stats-chart-monthly-stage');
        if (monthlyStage) {
            monthlyStage.style.minWidth = Math.max(980, monthlyChartAgg.length * 62) + 'px';
        }

        var monthlyMeta = monthlyChartAgg.map(function (item, index) {
            var prev = monthlyChartAgg[index + 1] || null;
            return {
                label: item.label,
                anio: item.anio,
                mes: MONTH_MAP[item.mes_num] || item.label,
                prevSalida: prev ? prev.SALIDA : null,
                prevLlegada: prev ? prev.LLEGADA : null
            };
        });

        state.charts.monthly = makeChart('bhs-stats-chart-monthly', 'bar', {
            labels: monthlyChartAgg.map(function (item) { return item.label; }),
            datasets: [
                { label: 'Salida', data: monthlyChartAgg.map(function (item) { return item.SALIDA; }), backgroundColor: 'rgba(234,88,12,.78)', borderColor: '#ea580c', borderWidth: 1.2, borderRadius: 8, categoryPercentage: 0.62, barPercentage: 0.82, maxBarThickness: 26 },
                { label: 'Llegada', data: monthlyChartAgg.map(function (item) { return item.LLEGADA; }), backgroundColor: 'rgba(37,99,235,.78)', borderColor: '#2563eb', borderWidth: 1.2, borderRadius: 8, categoryPercentage: 0.62, barPercentage: 0.82, maxBarThickness: 26 }
            ]
        }, {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                datalabels: { display: false },
                legend: {
                    position: 'top',
                    labels: {
                        color: '#475569',
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 12,
                        padding: 14
                    }
                },
                tooltip: {
                    enabled: true,
                    displayColors: true,
                    backgroundColor: 'rgba(15,23,42,.96)',
                    titleColor: '#ffffff',
                    bodyColor: '#e5eefb',
                    footerColor: '#cbd5e1',
                    borderColor: 'rgba(148,163,184,.3)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 12,
                    callbacks: {
                        title: function (items) {
                            var item = items && items[0];
                            if (!item) return '';
                            var meta = monthlyMeta[item.dataIndex];
                            return (meta ? meta.mes : '') + ' ' + (meta ? meta.anio : '');
                        },
                        beforeBody: function (items) {
                            var item = items && items[0];
                            if (!item) return [];
                            var op = item.dataset && item.dataset.label ? item.dataset.label : '';
                            var airlineText = filters.airline
                                ? ('Aerol\u00ednea: ' + (((AIRLINES.find(function (a) { return a.key === filters.airline; }) || {}).label) || filters.airline.toUpperCase()))
                                : 'Aerolínea: Todas';
                            return [
                                'Año: ' + monthlyMeta[item.dataIndex].anio,
                                'Mes: ' + monthlyMeta[item.dataIndex].mes,
                                'Tipo de operación: ' + op,
                                airlineText
                            ];
                        },
                        label: function (context) {
                            return 'Cantidad exacta: ' + fmtNumber(context.raw);
                        },
                        footer: function (items) {
                            var item = items && items[0];
                            if (!item) return '';
                            var meta = monthlyMeta[item.dataIndex];
                            var current = Number(item.raw) || 0;
                            var previous = item.datasetIndex === 0 ? meta.prevSalida : meta.prevLlegada;
                            if (previous == null || previous === 0) return 'Variación vs periodo anterior: N/D';
                            var change = ((current - previous) / previous) * 100;
                            return 'Variación vs periodo anterior: ' + (change >= 0 ? '+' : '') + fmtPercent(change);
                        }
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: null
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        drag: {
                            enabled: true,
                            backgroundColor: 'rgba(37,99,235,.08)',
                            borderColor: 'rgba(37,99,235,.35)',
                            borderWidth: 1
                        },
                        mode: 'x'
                    },
                    limits: {
                        x: { min: 0, max: Math.max(0, monthlyChartAgg.length - 1), minRange: 3 }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#64748b',
                        font: { size: 11, weight: '600' },
                        callback: function (value) { return fmtNumber(value); }
                    },
                    grid: {
                        color: 'rgba(148,163,184,.18)',
                        drawBorder: false
                    }
                },
                x: {
                    offset: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11, weight: '600' },
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: false,
                        callback: function (value, index) {
                            var total = monthlyChartAgg.length || 1;
                            var maxLabels = window.innerWidth < 768 ? 6 : window.innerWidth < 1200 ? 9 : 14;
                            var step = Math.max(1, Math.ceil(total / maxLabels));
                            return index % step === 0 ? this.getLabelForValue(value) : '';
                        }
                    }
                }
            }
        });

        state.charts.yearly = makeChart('bhs-stats-chart-yearly', 'bar', {
            labels: yearlyAgg.map(function (item) { return item.year; }),
            datasets: [{ label: 'Total anual', data: yearlyAgg.map(function (item) { return item.total; }), backgroundColor: 'rgba(15,118,110,.72)', borderColor: '#0f766e', borderWidth: 1, borderRadius: 8 }]
        }, { responsive: true, maintainAspectRatio: false });

        state.charts.annualCompare = makeChart('bhs-stats-chart-annual-compare', 'bar', {
            labels: annualCompareAgg.map(function (item) { return item.year; }),
            datasets: [
                { label: 'Salida', data: annualCompareAgg.map(function (item) { return item.SALIDA; }), backgroundColor: 'rgba(234,88,12,.72)', borderColor: '#ea580c', borderWidth: 1, borderRadius: 8 },
                { label: 'Llegada', data: annualCompareAgg.map(function (item) { return item.LLEGADA; }), backgroundColor: 'rgba(37,99,235,.72)', borderColor: '#2563eb', borderWidth: 1, borderRadius: 8 }
            ]
        }, { responsive: true, maintainAspectRatio: false });

        state.charts.airline = makeChart('bhs-stats-chart-airline', 'doughnut', {
            labels: airlineTotals.map(function (item) { return item.label; }),
            datasets: [{
                data: airlineTotals.map(function (item) { return item.total; }),
                backgroundColor: airlineTotals.map(function (item) { return item.color; }),
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverOffset: 10,
                spacing: 2
            }]
        }, {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: 12
            },
            plugins: {
                datalabels: {
                    display: false
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#475569',
                        boxWidth: 14,
                        boxHeight: 14,
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    displayColors: true,
                    backgroundColor: 'rgba(15,23,42,.96)',
                    titleColor: '#ffffff',
                    bodyColor: '#e5eefb',
                    footerColor: '#cbd5e1',
                    borderColor: 'rgba(148,163,184,.3)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 12,
                    callbacks: {
                        title: function (items) {
                            var item = items && items[0];
                            return item ? item.label : '';
                        },
                        label: function (context) {
                            return 'Cantidad exacta: ' + fmtNumber(context.raw);
                        },
                        footer: function (items) {
                            var item = items && items[0];
                            if (!item || !item.dataset) return '';
                            var total = item.dataset.data.reduce(function (acc, value) {
                                return acc + (Number(value) || 0);
                            }, 0);
                            var raw = Number(item.raw) || 0;
                            var pct = total > 0 ? (raw / total) * 100 : 0;
                            return 'Participaci\u00f3n: ' + fmtPercent(pct);
                        }
                    }
                }
            }
        });

        state.charts.operation = makeChart('bhs-stats-chart-operation', 'bar', {
            labels: ['Salida', 'Llegada'],
            datasets: [{ label: 'Total', data: [salidaTotal, llegadaTotal], backgroundColor: ['rgba(234,88,12,.72)', 'rgba(37,99,235,.72)'], borderColor: ['#ea580c', '#2563eb'], borderWidth: 1, borderRadius: 10 }]
        }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } });

        state.charts.trend = makeChart('bhs-stats-chart-trend', 'line', {
            labels: monthlyAgg.map(function (item) { return item.label; }),
            datasets: [{ label: 'Tendencia total', data: monthlyAgg.map(function (item) { return item.total; }), borderColor: '#0f172a', backgroundColor: 'rgba(15,23,42,.12)', fill: true, tension: 0.28, pointRadius: 3, pointBackgroundColor: '#0f172a' }]
        }, { responsive: true, maintainAspectRatio: false });

        state.charts.summaryTrend = makeChart('bhs-stats-chart-summary-trend', 'line', {
            labels: monthlyAgg.map(function (item) { return item.label; }),
            datasets: [{
                label: 'Total',
                data: monthlyAgg.map(function (item) { return item.total; }),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37,99,235,.12)',
                fill: true,
                tension: 0.32,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: 2
            }]
        }, {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                datalabels: { display: false },
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    callbacks: {
                        title: function (items) {
                            return items && items[0] ? items[0].label : '';
                        },
                        label: function (context) {
                            return 'Total: ' + fmtNumber(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, display: false, grid: { display: false } },
                x: { display: false, grid: { display: false } }
            },
            elements: {
                line: { borderJoinStyle: 'round' }
            }
        });
    }

    function makeChart(id, type, data, extraOptions) {
        var canvas = document.getElementById(id);
        if (!canvas) return null;
        return new Chart(canvas, {
            type: type,
            data: data,
            options: Object.assign({
                plugins: {
                    datalabels: { display: false },
                    legend: { labels: { color: '#475569' } },
                    tooltip: {
                        displayColors: true,
                        callbacks: {
                            label: function (context) {
                                return (context.dataset.label ? context.dataset.label + ': ' : '') + fmtNumber(context.raw);
                            }
                        }
                    }
                },
                scales: type === 'doughnut' ? {} : {
                    y: { beginAtZero: true, ticks: { color: '#64748b' } },
                    x: { ticks: { color: '#64748b' } }
                }
            }, extraOptions || {})
        });
    }

    function updateFormTotal() {
        var total = 0;
        ['am', 'y4', 'vb', 'cm-dm', 'zv'].forEach(function (key) {
            var input = document.getElementById('bhs-stats-form-' + key);
            if (input && input.value !== '') total += Number(input.value) || 0;
        });
        setText('bhs-stats-form-total', fmtNumber(total));
    }

    function setSaveButtonState(isSaving) {
        var saveBtn = document.getElementById('bhs-stats-save');
        if (!saveBtn) return;
        saveBtn.disabled = isSaving || !canEdit();
        saveBtn.innerHTML = isSaving
            ? '<i class="fas fa-spinner fa-spin me-1"></i>Guardando...'
            : '<i class="fas fa-floppy-disk me-1"></i>' + (state.editingId ? 'Actualizar registro' : 'Guardar registro');
    }

    function resetForm() {
        state.editingId = null;
        state.editingSnapshot = null;
        var form = document.getElementById('bhs-stats-form');
        if (form) form.reset();
        var yearInput = document.getElementById('bhs-stats-form-year');
        if (yearInput) yearInput.value = new Date().getFullYear();
        updateFormTotal();
        setSaveButtonState(false);
    }

    function updateAccessState() {
        var editable = canEdit();
        var ids = [
            'bhs-stats-form-operation',
            'bhs-stats-form-year',
            'bhs-stats-form-month',
            'bhs-stats-form-am',
            'bhs-stats-form-y4',
            'bhs-stats-form-vb',
            'bhs-stats-form-cm-dm',
            'bhs-stats-form-zv',
            'bhs-stats-save'
        ];
        ids.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = !editable;
        });
        setSaveButtonState(false);
    }

    function findRowById(id) {
        return state.rows.find(function (row) { return String(row.id) === String(id); });
    }

    function loadRowIntoForm(id) {
        var row = findRowById(id);
        if (!row) return;
        state.editingId = row.id;
        state.editingSnapshot = {
            operation_type: normalizeOperationType(row.operation_type),
            anio: Number(row.anio),
            mes_num: normalizeMonthNum(row.mes_num != null ? row.mes_num : row.mes)
        };
        document.getElementById('bhs-stats-form-operation').value = row.operation_type || '';
        document.getElementById('bhs-stats-form-year').value = row.anio || '';
        document.getElementById('bhs-stats-form-month').value = row.mes || '';
        document.getElementById('bhs-stats-form-am').value = row.am == null ? '' : row.am;
        document.getElementById('bhs-stats-form-y4').value = row.y4 == null ? '' : row.y4;
        document.getElementById('bhs-stats-form-vb').value = row.vb == null ? '' : row.vb;
        document.getElementById('bhs-stats-form-cm-dm').value = row.cm_dm == null ? '' : row.cm_dm;
        document.getElementById('bhs-stats-form-zv').value = row.zv == null ? '' : row.zv;
        updateFormTotal();
        setSaveButtonState(false);
        var formPanel = document.getElementById(ROOT_ID);
        if (formPanel) formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function saveForm(event) {
        event.preventDefault();
        if (!canEdit()) {
            setStatus('No tienes permisos para capturar o editar registros en este módulo.', 'warning');
            return;
        }

        syncEditStateWithSelectedPeriod();

        var operationType = normalizeOperationType(document.getElementById('bhs-stats-form-operation').value);
        var year = Number(document.getElementById('bhs-stats-form-year').value);
        var month = document.getElementById('bhs-stats-form-month').value;
        var monthNum = normalizeMonthNum(month);
        var payload = {
            operation_type: operationType,
            record_kind: 'monthly',
            anio: year,
            mes: month,
            mes_num: monthNum,
            period_label: null,
            am: nullableNumber('bhs-stats-form-am'),
            y4: nullableNumber('bhs-stats-form-y4'),
            vb: nullableNumber('bhs-stats-form-vb'),
            cm_dm: nullableNumber('bhs-stats-form-cm-dm'),
            zv: nullableNumber('bhs-stats-form-zv')
        };

        if (!operationType || !year || !month) {
            setStatus('Completa Tipo de operación, Año y Mes.', 'warning');
            return;
        }
        if (Object.keys(payload).some(function (key) {
            return ['am', 'y4', 'vb', 'cm_dm', 'zv'].indexOf(key) >= 0 && payload[key] != null && payload[key] < 0;
        })) {
            setStatus('No se permiten valores negativos.', 'warning');
            return;
        }

        var duplicate = state.rows.find(function (row) {
            return row.record_kind === 'monthly' &&
                row.operation_type === payload.operation_type &&
                row.anio === payload.anio &&
                row.mes_num === payload.mes_num &&
                String(row.id) !== String(state.editingId || '');
        });
        if (duplicate) {
            setStatus('Ya existe un registro para la combinación Año + Mes + Tipo de operación.', 'warning');
            return;
        }

        var sb = await getClient();
        var dbPayload = Object.assign({}, payload, {
            updated_at: new Date().toISOString(),
            updated_by: sessionStorage.getItem('user_role') || 'authenticated'
        });

        var response;
        if (state.editingId) {
            response = await sb.from(STATS_TABLE).update(dbPayload).eq('id', state.editingId);
        } else {
            dbPayload.source_key = 'manual-' + payload.operation_type + '-' + payload.anio + '-' + payload.mes_num + '-' + Date.now();
            dbPayload.source_order = (state.rows.reduce(function (max, row) { return Math.max(max, Number(row.source_order) || 0); }, 0) || 0) + 1;
            dbPayload.created_by = sessionStorage.getItem('user_role') || 'authenticated';
            response = await sb.from(STATS_TABLE).insert(dbPayload);
        }
        if (response.error) {
            setStatus('No se pudo guardar el registro: ' + response.error.message, 'danger');
            return;
        }

        resetForm();
        await refresh();
        setStatus('Registro guardado correctamente.', 'success');
    }

    async function saveFormPatched(event) {
        event.preventDefault();
        if (!canEdit()) {
            setStatus('No tienes permisos para capturar o editar registros en este modulo.', 'warning');
            return;
        }

        syncEditStateWithSelectedPeriod();

        var operationType = normalizeOperationType(document.getElementById('bhs-stats-form-operation').value);
        var year = Number(document.getElementById('bhs-stats-form-year').value);
        var month = document.getElementById('bhs-stats-form-month').value;
        var monthNum = normalizeMonthNum(month);
        var payload = {
            operation_type: operationType,
            record_kind: 'monthly',
            anio: year,
            mes: month,
            mes_num: monthNum,
            period_label: null,
            am: nullableNumber('bhs-stats-form-am'),
            y4: nullableNumber('bhs-stats-form-y4'),
            vb: nullableNumber('bhs-stats-form-vb'),
            cm_dm: nullableNumber('bhs-stats-form-cm-dm'),
            zv: nullableNumber('bhs-stats-form-zv')
        };

        if (!operationType || !year || !month) {
            setStatus('Completa Tipo de operacion, Ano y Mes.', 'warning');
            return;
        }
        if (!Number.isInteger(year) || year < 2022) {
            setStatus('El campo Ano debe ser un numero entero valido.', 'warning');
            return;
        }
        if (!payload.mes_num) {
            setStatus('Selecciona un mes valido.', 'warning');
            return;
        }
        if (Object.keys(payload).some(function (key) {
            return ['am', 'y4', 'vb', 'cm_dm', 'zv'].indexOf(key) >= 0 &&
                payload[key] != null &&
                (!Number.isInteger(payload[key]) || payload[key] < 0);
        })) {
            setStatus('Las cantidades por aerolinea deben ser numeros enteros iguales o mayores que cero.', 'warning');
            return;
        }

        setSaveButtonState(true);
        var existingRow = findPersistedMonthlyRow(payload.operation_type, payload.anio, payload.mes_num);
        var placeholderRow = existingRow && isMonthlyRowPlaceholder(existingRow) ? existingRow : null;
        var realExistingRow = existingRow && !isMonthlyRowPlaceholder(existingRow) ? existingRow : null;
        var targetId = state.editingId || (placeholderRow ? placeholderRow.id : null);
        var isEditing = Boolean(targetId);

        if (realExistingRow && String(realExistingRow.id) !== String(state.editingId || '')) {
            setSaveButtonState(false);
            setStatus(buildDuplicateMessage(payload.operation_type, payload.anio, payload.mes_num), 'warning');
            showDuplicateModal(realExistingRow, payload.operation_type, payload.anio, payload.mes_num);
            return;
        }

        try {
            var sb = await getClient();
            var actor = sessionStorage.getItem('user_role') || 'authenticated';
            var dbPayload = Object.assign({}, payload, {
                is_seed: false,
                updated_at: new Date().toISOString(),
                updated_by: actor
            });

            var response;
            if (isEditing) {
                response = await sb
                    .from(STATS_TABLE)
                    .update(dbPayload)
                    .eq('id', targetId)
                    .select('*')
                    .single();
            } else {
                dbPayload.source_key = 'manual-' + payload.operation_type + '-' + payload.anio + '-' + payload.mes_num + '-' + Date.now();
                dbPayload.source_order = (state.rows.reduce(function (max, row) {
                    return Math.max(max, Number(row.source_order) || 0);
                }, 0) || 0) + 1;
                dbPayload.created_by = actor;
                response = await sb
                    .from(STATS_TABLE)
                    .insert([dbPayload])
                    .select('*')
                    .single();
            }

            if (response.error) throw response.error;
            if (!response.data || !response.data.id) {
                throw new Error('La base de datos no devolvio el registro guardado.');
            }

            resetForm();
            await refresh();
            setStatus(realExistingRow || placeholderRow ? 'Registro actualizado correctamente.' : 'Registro guardado correctamente.', 'success');
        } catch (error) {
            var message = error && (error.message || error.details || error.hint || error.code)
                ? (error.message || error.details || error.hint || error.code)
                : String(error || 'Error desconocido');
            setStatus('No se pudo guardar el registro: ' + message, 'danger');
        } finally {
            setSaveButtonState(false);
        }
    }

    function nullableNumber(id) {
        var value = document.getElementById(id).value;
        if (value === '') return null;
        return Number(value);
    }

    async function deleteRow(id) {
        if (!canDelete()) {
            setStatus('No tienes permisos para eliminar registros.', 'warning');
            return;
        }
        var row = findRowById(id);
        if (!row || row.record_kind !== 'monthly') return;
        if (!window.confirm('¿Eliminar el registro de ' + (row.mes || '—') + ' ' + row.anio + ' (' + row.operation_type + ')?')) return;

        var sb = await getClient();
        var response = await sb.from(STATS_TABLE).delete().eq('id', id);
        if (response.error) {
            setStatus('No se pudo eliminar el registro: ' + response.error.message, 'danger');
            return;
        }
        await refresh();
        setStatus('Registro eliminado.', 'success');
    }

    function exportExcel(rows) {
        if (typeof XLSX === 'undefined') {
            setStatus('La librería XLSX no está disponible en esta sesión.', 'warning');
            return;
        }
        var workbook = XLSX.utils.book_new();
        ['SALIDA', 'LLEGADA'].forEach(function (op) {
            var opRows = rows.filter(function (row) { return row.operation_type === op; }).map(function (row) {
                return {
                    'Tipo de operación': op,
                    'Año': row.anio,
                    'Mes / Periodo': row.period_label || row.mes || '',
                    'Tipo de registro': KIND_LABELS[row.record_kind] || row.record_kind,
                    'AM': row.am,
                    'Y4': row.y4,
                    'VB': row.vb,
                    'DM': row.cm_dm,
                    'ZV': row.zv,
                    'Total': getDisplayedTotal(row),
                    'Utilización %': getRowUtilization(row)
                };
            });
            var sheet = XLSX.utils.json_to_sheet(opRows);
            XLSX.utils.book_append_sheet(workbook, sheet, op === 'SALIDA' ? 'Salidas' : 'Llegadas');
        });
        XLSX.writeFile(workbook, 'bhs_estadisticas_equipaje.xlsx');
    }

    function exportPdf() {
        var root = document.getElementById(ROOT_ID);
        if (!root || typeof html2pdf === 'undefined') {
            setStatus('No fue posible generar PDF en esta sesión.', 'warning');
            return;
        }
        html2pdf().set({
            margin: 8,
            filename: 'bhs_estadisticas_equipaje.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        }).from(root).save();
    }

    function printModule() {
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        var printWindow = window.open('', '_blank', 'width=1400,height=900');
        if (!printWindow) return;
        printWindow.document.write('<html><head><title>Estadísticas de Equipaje del BHS</title>');
        printWindow.document.write('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">');
        printWindow.document.write('<style>body{padding:20px;font-family:Segoe UI,Arial,sans-serif}table{font-size:12px}canvas{max-width:100%}</style>');
        printWindow.document.write('</head><body>' + root.innerHTML + '</body></html>');
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    function setActiveTab(op) {
        state.currentTab = op;
        ['SALIDA', 'LLEGADA'].forEach(function (code) {
            var button = document.getElementById(code === 'SALIDA' ? 'bhs-stats-tab-salida' : 'bhs-stats-tab-llegada');
            if (button) button.classList.toggle('active', code === op);
        });
        renderView();
    }

    function renderView() {
        var filters = getFilters();
        var filteredRows = applyFilters(state.rows, filters);
        renderCapacities();
        renderKpis(filteredRows, filters);
        renderAirlineSummary(filteredRows, filters);
        renderPeriodSummary(filteredRows, filters);
        buildTableRows(filteredRows);
        renderCharts(filteredRows);
        updateFormTotal();
    }

    async function refresh() {
        try {
            await loadCapacities();
            await ensureSeedData();
            await loadRows();
            fillFilters(state.rows);
            updateAccessState();
            renderView();
            state.loaded = true;
        } catch (error) {
            state.rows = buildSeedRows();
            fillFilters(state.rows);
            updateAccessState();
            renderView();
            setStatus('El módulo cargó con datos locales por un problema de conexión: ' + (error.message || error), 'warning');
        }
    }

    function isSectionVisible() {
        var section = document.getElementById(SECTION_KEY + '-section');
        if (!section) return false;
        return section.classList.contains('active') || section.offsetParent !== null;
    }

    function bindEvents() {
        if (state.bound) return;
        state.bound = true;

        ['bhs-stats-filter-year', 'bhs-stats-filter-month', 'bhs-stats-filter-operation', 'bhs-stats-filter-airline', 'bhs-stats-search'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', renderView);
            if (el && el.tagName === 'SELECT') el.addEventListener('change', renderView);
        });

        var clearButton = document.getElementById('bhs-stats-clear-filters');
        if (clearButton) clearButton.addEventListener('click', function () {
            ['bhs-stats-filter-year', 'bhs-stats-filter-month', 'bhs-stats-filter-operation', 'bhs-stats-filter-airline', 'bhs-stats-search'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.value = '';
            });
            renderView();
        });

        var form = document.getElementById('bhs-stats-form');
        if (form) form.addEventListener('submit', saveFormPatched);

        document.querySelectorAll('.bhs-stats-qty').forEach(function (input) {
            input.addEventListener('input', updateFormTotal);
        });

        ['bhs-stats-form-operation', 'bhs-stats-form-year', 'bhs-stats-form-month'].forEach(function (id) {
            var field = document.getElementById(id);
            if (field) field.addEventListener('change', syncEditStateWithSelectedPeriod);
            if (field && field.tagName === 'INPUT') field.addEventListener('input', syncEditStateWithSelectedPeriod);
        });

        var cancelEdit = document.getElementById('bhs-stats-cancel-edit');
        if (cancelEdit) cancelEdit.addEventListener('click', function () {
            resetForm();
            setStatus('', 'info');
        });

        var duplicateOpen = document.getElementById('bhs-stats-duplicate-open');
        if (duplicateOpen) duplicateOpen.addEventListener('click', function () {
            if (state.pendingDuplicateId) {
                loadRowIntoForm(state.pendingDuplicateId);
            }
            hideDuplicateModal();
        });

        var duplicateCancel = document.getElementById('bhs-stats-duplicate-cancel');
        if (duplicateCancel) duplicateCancel.addEventListener('click', hideDuplicateModal);

        var capacityOpen = document.getElementById('bhs-stats-capacity-open');
        if (capacityOpen) capacityOpen.addEventListener('click', function () {
            renderCapacities();
            if (window.bootstrap && window.bootstrap.Modal) {
                var modalEl = document.getElementById('bhs-stats-capacity-modal');
                if (modalEl) window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
        });

        var exportXlsx = document.getElementById('bhs-stats-export-xlsx');
        if (exportXlsx) exportXlsx.addEventListener('click', function () {
            exportExcel(applyFilters(state.rows, getFilters()));
        });

        var exportPdfBtn = document.getElementById('bhs-stats-export-pdf');
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPdf);

        var printBtn = document.getElementById('bhs-stats-print');
        if (printBtn) printBtn.addEventListener('click', printModule);

        var resetZoomBtn = document.getElementById('bhs-stats-reset-zoom');
        if (resetZoomBtn) {
            resetZoomBtn.addEventListener('click', function () {
                if (state.charts.monthly && typeof state.charts.monthly.resetZoom === 'function') {
                    state.charts.monthly.resetZoom();
                }
            });
        }

        var tabSalida = document.getElementById('bhs-stats-tab-salida');
        if (tabSalida) tabSalida.addEventListener('click', function () { setActiveTab('SALIDA'); });
        var tabLlegada = document.getElementById('bhs-stats-tab-llegada');
        if (tabLlegada) tabLlegada.addEventListener('click', function () { setActiveTab('LLEGADA'); });

        document.getElementById(ROOT_ID).addEventListener('click', function (event) {
            var sortButton = event.target.closest('[data-sort]');
            if (sortButton) {
                var field = sortButton.getAttribute('data-sort');
                if (state.sortField === field) {
                    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortField = field;
                    state.sortDir = (field === 'anio' || field === 'mes_num' || field === 'period') ? 'desc' : 'asc';
                }
                renderView();
                return;
            }

            var editBtn = event.target.closest('.bhs-stats-edit');
            if (editBtn) {
                loadRowIntoForm(editBtn.getAttribute('data-id'));
                return;
            }

            var deleteBtn = event.target.closest('.bhs-stats-delete');
            if (deleteBtn) {
                deleteRow(deleteBtn.getAttribute('data-id'));
            }
        });
    }

    function init() {
        if (state.initialized) return;
        var root = document.getElementById(ROOT_ID);
        if (!root) return;
        state.initialized = true;
        ensureStyles();
        renderShell();
        bindEvents();
        resetForm();
    }

    async function activateModule() {
        init();
        if (!isSectionVisible()) return;
        await refresh();
        state.activated = true;
    }

    // Antes esto arrancaba en DOMContentLoaded y, para enterarse de que
    // alguien entraba a la seccion, envolvia window.showSection con un parche
    // propio. Las dos vias desaparecen: el loader trae el codigo al abrir el
    // modulo y llama a init(). activateModule() ya llama al init interno.
    window.initBhsBaggageStats = activateModule;

    // Al salir se sueltan las graficas; los datos ya cargados se conservan,
    // que para recargarlos esta el boton de refrescar de la propia vista.
    window.destroyBhsBaggageStats = function () {
        try { destroyCharts(); } catch (_) {}
        state.activated = false;   // volver a entrar vuelve a pintar
    };
})();
