'use strict';

(function(){
  const ATENCIONES_URL = 'data/atenciones_medicas.json';
  const TIPO_URL = 'data/tipo_atencion_medica.json';
  const COMP_URL = 'data/atenciones_medicas_año.json';
  // Actualizado a Capitalized según solicitud (antes MAYÚSCULAS)
  const MONTH_ORDER = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const ATENCIONES_KEYS = ['aifa', 'otra_empresa', 'pasajeros', 'visitantes'];
  const ATENCIONES_LABELS = {
    aifa: 'AIFA',
    otra_empresa: 'Otra Empresa',
    pasajeros: 'Pasajeros',
    visitantes: 'Visitantes'
  };
  const ATENCIONES_COLORS = {
    aifa: ['#34d399', '#0f766e'],
    otra_empresa: ['#a5b4fc', '#4f46e5'],
    pasajeros: ['#93c5fd', '#1d4ed8'],
    visitantes: ['#cbd5e1', '#475569']
  };
  const TIPO_COLORS = {
    traslado: ['#60a5fa', '#1d4ed8'],
    ambulatorio: ['#fbbf24', '#d97706']
  };
  const COMP_COLORS = ['#0284c7', '#ec4899', '#22c55e', '#f97316', '#8b5cf6', '#facc15'];
  
  // Normalization helper for months
  const normalizeMonth = (m) => {
      if (!m) return '';
      const s = String(m).trim();
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  };

  const MONTH_TITLE_MAP = MONTH_ORDER.reduce((acc, month) => {
    acc[normalizeMonth(month)] = month; 
    // Also map UPPERCASE if needed for fallback
    acc[month.toUpperCase()] = month;
    return acc;
  }, {});

  const MONTH_ABBR_MAP = MONTH_ORDER.reduce((acc, month) => {
    const norm = normalizeMonth(month);
    acc[norm] = norm.substring(0, 3) + '.'; // Ene.
    return acc;
  }, {});

  let rawAtenciones = [];
  let rawTipo = [];
  let rawComp = [];
  const compByYear = new Map();
  let atencionesChart = null;
  let tipoChart = null;
  let compChart = null;
  let atencionesYear = 'all';
  let tipoYear = 'all';
  let compActiveYears = new Set();
  let pendingAtenciones = false;
  let pendingTipo = false;
  let pendingComp = false;
  let eventsBound = false;
  let currentViewportMode = getViewportMode();

  function parseValue(value){
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function escapeHtml(value){
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value){
    return Number.isFinite(value) ? value.toLocaleString('es-MX') : '—';
  }

  function formatMonthTitle(month){
    if (!month) return '';
    return MONTH_TITLE_MAP[month] || (String(month).charAt(0).toUpperCase() + String(month).slice(1).toLowerCase());
  }

  function getMonthAbbr(month){
    if (!month) return '';
    const key = String(month).trim().toUpperCase();
    if (MONTH_ABBR_MAP[key]) return MONTH_ABBR_MAP[key];
    const value = String(month);
    return value.charAt(0).toUpperCase() + value.slice(1, 3).toLowerCase();
  }

  function isCompactViewport(){
    if (typeof window === 'undefined') return false;
    if (typeof window.matchMedia === 'function'){
      return window.matchMedia('(max-width: 640px)').matches;
    }
    return window.innerWidth <= 640;
  }

  function getViewportMode(){
    return isCompactViewport() ? 'compact' : 'default';
  }

  function createGradient(top, bottom){
    return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: top },
      { offset: 1, color: bottom }
    ]);
  }

  function formatLabel(item){
    const monthLabel = getMonthAbbr(item.mes);
    const yearLabel = item.anio ? String(item.anio) : '';
    return yearLabel ? `${monthLabel}\n${yearLabel}` : monthLabel;
  }

  function sortRecords(list){
    return [...list].sort((a, b) => {
      if (a.anio !== b.anio) return a.anio - b.anio;
      
      const idxA = MONTH_ORDER.findIndex(m => normalizeMonth(m) === normalizeMonth(a.mes));
      const idxB = MONTH_ORDER.findIndex(m => normalizeMonth(m) === normalizeMonth(b.mes));
      
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }

  function uniqueYears(list){
    return Array.from(new Set(list.map((item) => item.anio))).sort((a, b) => a - b);
  }

  function populateYearOptions(selectId, years){
    const select = document.getElementById(selectId);
    if (!select || select.dataset.populated === 'true') return;
    const fragment = document.createDocumentFragment();
    years.forEach((year) => {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = year;
      fragment.appendChild(option);
    });
    select.appendChild(fragment);
    select.dataset.populated = 'true';
  }

  function prepareCompIndex(){
    compByYear.clear();
    rawComp.forEach((item) => {
      const year = Number(item.anio);
      if (!Number.isFinite(year)) return;
      const value = parseValue(item.total);
      if (!compByYear.has(year)) {
        compByYear.set(year, {});
      }
      // Normalize key to ensure it matches MONTH_ORDER
      compByYear.get(year)[normalizeMonth(item.mes)] = value;
    });
  }

  function getActiveCompYears(){
    return Array.from(compActiveYears)
      .map((year) => Number(year))
      .filter((year) => Number.isFinite(year))
      .sort((a, b) => a - b);
  }

  function populateCompYears(years){
    const container = document.getElementById('medicas-comp-years');
    if (!container) return;
    const sorted = [...years].sort((a, b) => a - b);
    container.innerHTML = '';

    sorted.forEach((year) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'form-check form-check-inline m-0';

      const checkboxId = `medicas-comp-year-${year}`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'form-check-input';
      input.id = checkboxId;
      input.value = String(year);
      input.checked = true;

      const label = document.createElement('label');
      label.className = 'form-check-label small fw-semibold';
      label.htmlFor = checkboxId;
      const yearMonths = compByYear.get(year) || {};
      const yearTotal = Object.values(yearMonths)
        .reduce((acc, val) => acc + (Number.isFinite(val) ? val : 0), 0);
      label.textContent = `${year} (${yearTotal.toLocaleString('es-MX')})`;

      wrapper.appendChild(input);
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    });

    const syncActiveYears = () => {
      const inputs = container.querySelectorAll('input[type="checkbox"]');
      compActiveYears = new Set();
      inputs.forEach((input) => {
        if (input.checked) compActiveYears.add(input.value);
      });
      renderComp();
    };

    container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', syncActiveYears);
    });

    const selectAllBtn = document.getElementById('medicas-comp-select-all');
    if (selectAllBtn && !selectAllBtn.dataset.bound){
      selectAllBtn.dataset.bound = 'true';
      selectAllBtn.addEventListener('click', () => {
        container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = true;
        });
        syncActiveYears();
      });
    }

    const selectNoneBtn = document.getElementById('medicas-comp-select-none');
    if (selectNoneBtn && !selectNoneBtn.dataset.bound){
      selectNoneBtn.dataset.bound = 'true';
      selectNoneBtn.addEventListener('click', () => {
        container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = false;
        });
        syncActiveYears();
      });
    }

    compActiveYears = new Set(sorted.map((year) => String(year)));
    syncActiveYears();
  }

  function buildAtencionesDataset(year){
    const filtered = rawAtenciones.filter((item) => year === 'all' ? true : item.anio === Number(year));
    return sortRecords(filtered).map((item) => {
      const aifa = parseValue(item.aifa);
      const otra = parseValue(item.otra_empresa);
      const pax = parseValue(item.pasajeros);
      const visitors = parseValue(item.visitantes);
      const providedTotal = parseValue(item.total);
      const fallbackTotal = [aifa, otra, pax, visitors].reduce((sum, val) => sum + (Number.isFinite(val) ? val : 0), 0);
      return {
        mes: item.mes,
        anio: item.anio,
        aifa,
        otra_empresa: otra,
        pasajeros: pax,
        visitantes: visitors,
        total: Number.isFinite(providedTotal) ? providedTotal : fallbackTotal
      };
    });
  }

  function updateAtencionesSummary(dataset){
    const summaryEl = document.getElementById('medicas-atenciones-resumen');
    if (!summaryEl) return;
    if (!dataset.length){
      summaryEl.textContent = 'Sin datos disponibles';
      return;
    }
    const total = dataset.reduce((sum, item) => sum + (item.total || 0), 0);
    const peak = dataset.reduce((acc, item) => {
      if ((item.total || 0) > acc.value){
        const monthTitle = formatMonthTitle(item.mes);
        return { value: item.total || 0, label: `${monthTitle} ${item.anio}` };
      }
      return acc;
    }, { value: -Infinity, label: '' });
    const totalText = total.toLocaleString('es-MX');
    if (peak.value > 0){
      summaryEl.textContent = `Total periodo: ${totalText} | Pico: ${peak.label} (${peak.value.toLocaleString('es-MX')})`;
    } else {
      summaryEl.textContent = `Total periodo: ${totalText}`;
    }
  }

  function buildAtencionesOption(dataset){
    const labels = dataset.map(formatLabel);
    const totals = dataset.map((item) => item.total || 0);
    const needsZoom = labels.length > 18;
    const zoomEnd = needsZoom ? Math.min(100, Math.round((18 / labels.length) * 100)) : 100;
    const compact = isCompactViewport();
    const legendTop = compact ? (needsZoom ? 66 : 54) : (needsZoom ? 54 : 40);
    const legendFontSize = compact ? 11 : 12;
    const gridTop = compact ? (needsZoom ? 108 : 92) : (needsZoom ? 94 : 80);
    const gridBottom = compact ? (needsZoom ? 70 : 56) : (needsZoom ? 70 : 40);
    const gridLeft = compact ? 40 : 48;
    const gridRight = compact ? 20 : 24;
    const axisFontSize = compact ? 11 : 12;
    const axisLineHeight = compact ? 16 : 18;
    const axisMargin = compact ? 14 : 18;
    const labelDistance = compact ? 6 : 10;
    const labelPadding = compact ? [2, 6] : [3, 8];
    const labelFontSize = compact ? 11 : 12;

    const series = ATENCIONES_KEYS.map((key) => {
      const [top, bottom] = ATENCIONES_COLORS[key];
      return {
        name: ATENCIONES_LABELS[key],
        type: 'bar',
        stack: 'atenciones',
        barGap: '12%',
        barCategoryGap: '32%',
        itemStyle: { color: createGradient(top, bottom), borderRadius: 2 },
        emphasis: { focus: 'series' },
        data: dataset.map((item) => {
          const value = item[key];
          return Number.isFinite(value) ? value : null;
        })
      };
    });

    series.push({
      name: 'Total',
      type: 'bar',
      stack: 'overlay',
      data: totals,
      barGap: '-100%',
      itemStyle: { color: 'transparent' },
      label: {
        show: true,
        position: 'top',
        distance: labelDistance,
        fontWeight: 700,
        color: '#0f172a',
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 8,
        padding: labelPadding,
        fontSize: labelFontSize,
        formatter: (params) => (Number(params.value) || 0).toLocaleString('es-MX')
      },
      tooltip: { show: false },
      emphasis: { disabled: true },
      z: 10
    });

    return {
      title: {
        text: 'Atenciones médicas en el AIFA',
        subtext: dataset.length ? (atencionesYear === 'all' ? 'Periodo 2022-2025' : `Año ${atencionesYear}`) : 'Sin registros',
        left: 'center',
        top: 6,
        itemGap: 4,
        textStyle: { fontWeight: 800, color: '#0f172a', fontSize: 18 },
        subtextStyle: { color: '#475569', fontSize: 12 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const header = `${params[0].axisValueLabel.replace('\n', ' ')}<br>`;
          const lines = params.filter((entry) => entry.seriesName !== 'Total').map((entry) => {
            const value = Number(entry.value);
            if (!Number.isFinite(value)) return '';
            return `${entry.marker} ${entry.seriesName}: ${value.toLocaleString('es-MX')}`;
          }).filter(Boolean);
          const total = totals[idx] || 0;
          lines.push(`<strong>Total: ${total.toLocaleString('es-MX')}</strong>`);
          return header + lines.join('<br>');
        }
      },
      legend: {
        top: legendTop,
        left: 'center',
        itemGap: 20,
        textStyle: { color: '#334155', fontSize: legendFontSize },
        selected: { Total: false }
      },
      grid: { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom },
      dataZoom: needsZoom ? [
        { type: 'slider', bottom: 16, height: compact ? 18 : 20, start: 0, end: zoomEnd },
        { type: 'inside', start: 0, end: zoomEnd }
      ] : [],
      xAxis: {
        type: 'category',
        data: labels,
        axisTick: { alignWithLabel: true },
        axisLabel: {
          interval: 0,
          color: '#475569',
          fontSize: axisFontSize,
          lineHeight: axisLineHeight,
          margin: axisMargin
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#475569', fontSize: compact ? 11 : 12 },
        splitLine: { lineStyle: { color: 'rgba(15,23,42,0.08)' } }
      },
      series
    };
  }

  function ensureAtencionesChart(){
    const el = document.getElementById('medicasAtencionesChart');
    if (!el || !window.echarts) return null;
    if (!atencionesChart){
      atencionesChart = echarts.init(el, null, { renderer: 'canvas' });
    }
    return atencionesChart;
  }

  function renderAtenciones(){
    const pane = document.getElementById('medicas-atenciones-pane');
    if (!pane){
      pendingAtenciones = false;
      return;
    }
    if (!pane.classList.contains('active')){
      pendingAtenciones = true;
      return;
    }
    const dataset = buildAtencionesDataset(atencionesYear);
    updateAtencionesSummary(dataset);
    renderAtencionesTable(dataset);
    const instance = ensureAtencionesChart();
    if (!instance) return;
    const option = buildAtencionesOption(dataset);
    instance.setOption(option, true);
    instance.resize();
    currentViewportMode = getViewportMode();
    pendingAtenciones = false;
  }

  function buildTipoDataset(year){
    const filtered = rawTipo.filter((item) => year === 'all' ? true : item.anio === Number(year));
    return sortRecords(filtered).map((item) => {
      const traslado = parseValue(item.traslado) ?? 0;
      const ambulatorio = parseValue(item.ambulatorio) ?? 0;
      const providedTotal = parseValue(item.total);
      const total = Number.isFinite(providedTotal) ? providedTotal : traslado + ambulatorio;
      const share = total > 0 ? (traslado / total) * 100 : null;
      return {
        mes: item.mes,
        anio: item.anio,
        traslado,
        ambulatorio,
        total,
        share
      };
    });
  }

  function updateTipoSummary(dataset){
    const summaryEl = document.getElementById('medicas-tipo-resumen');
    if (!summaryEl) return;
    if (!dataset.length){
      summaryEl.textContent = 'Sin datos disponibles';
      return;
    }
    const totals = dataset.reduce((acc, item) => {
      acc.traslado += item.traslado || 0;
      acc.ambulatorio += item.ambulatorio || 0;
      return acc;
    }, { traslado: 0, ambulatorio: 0 });
    const overall = totals.traslado + totals.ambulatorio;
    const share = overall > 0 ? (totals.traslado / overall) * 100 : 0;
    const hotspot = dataset.reduce((acc, item) => {
      if ((item.share || 0) > acc.value){
        const monthTitle = formatMonthTitle(item.mes);
        return { value: item.share || 0, label: `${monthTitle} ${item.anio}` };
      }
      return acc;
    }, { value: -1, label: '' });
    const trasladoText = totals.traslado.toLocaleString('es-MX');
    const ambulatorioText = totals.ambulatorio.toLocaleString('es-MX');
    const shareText = share.toFixed(1);
    if (hotspot.value >= 0){
      summaryEl.textContent = `Traslados: ${trasladoText} | Ambulatorios: ${ambulatorioText} | % traslados: ${shareText}% | Pico de proporción: ${hotspot.label} (${hotspot.value.toFixed(1)}%)`;
    } else {
      summaryEl.textContent = `Traslados: ${trasladoText} | Ambulatorios: ${ambulatorioText} | % traslados: ${shareText}%`;
    }
  }

  function buildTipoOption(dataset){
    const labels = dataset.map(formatLabel);
    const needsZoom = labels.length > 18;
    const zoomEnd = needsZoom ? Math.min(100, Math.round((18 / labels.length) * 100)) : 100;
    
    // Calculate raw counts and percentages for tooltip
    const trasladoCounts = dataset.map(d => d.traslado || 0);
    const ambulCounts = dataset.map(d => d.ambulatorio || 0);
    const shareValues = dataset.map(d => d.share || 0);
    
    // Keep percent calculations for tooltip display
    const trasladoPercents = dataset.map((item) => {
      if (!Number.isFinite(item.total) || item.total <= 0) return 0;
      return Number(((item.traslado || 0) / item.total * 100).toFixed(2));
    });
    const ambulatorioPercents = dataset.map((item, idx) => {
      const trasladoPct = trasladoPercents[idx];
      if (!Number.isFinite(item.total) || item.total <= 0) return 0;
      return Number((100 - trasladoPct).toFixed(2));
    });

    const compact = isCompactViewport();
    const legendTop = compact ? (needsZoom ? 66 : 54) : (needsZoom ? 54 : 40);
    const legendFontSize = compact ? 11 : 12;
    const gridTop = compact ? (needsZoom ? 108 : 92) : (needsZoom ? 94 : 80);
    const gridBottom = compact ? (needsZoom ? 70 : 56) : (needsZoom ? 70 : 40);
    const gridLeft = compact ? 44 : 52;
    const gridRight = compact ? 40 : 48;
    const axisFontSize = compact ? 11 : 12;
    const axisLineHeight = compact ? 16 : 18;
    const axisMargin = compact ? 14 : 18;
    const symbolSize = compact ? 5 : 6;

    return {
      title: {
        text: 'Tipo de atención médica',
        subtext: dataset.length ? (tipoYear === 'all' ? 'Periodo 2022-2025' : `Año ${tipoYear}`) : 'Sin registros',
        left: 'center',
        top: 6,
        itemGap: 4,
        textStyle: { fontWeight: 800, color: '#0f172a', fontSize: 18 },
        subtextStyle: { color: '#475569', fontSize: 12 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const header = `${params[0].axisValueLabel.replace('\n', ' ')}<br>`;
          const row = dataset[idx] || {};
          
          const trasladoLine = `${params.find((entry) => entry.seriesName === 'Traslado')?.marker || ''} Traslado: <strong>${(row.traslado || 0).toLocaleString('es-MX')}</strong> (${trasladoPercents[idx]}%)`;
          const ambLine = `${params.find((entry) => entry.seriesName === 'Ambulatorio')?.marker || ''} Ambulatorio: <strong>${(row.ambulatorio || 0).toLocaleString('es-MX')}</strong> (${ambulatorioPercents[idx]}%)`;
          
          const lines = [trasladoLine, ambLine];
          const share = shareValues[idx];
          if (Number.isFinite(share)){
            lines.push(`<span style="display:inline-block;margin-right:4px;width:10px;height:10px;border-radius:50%;background:#2563eb;"></span>% Traslados: <strong>${share.toFixed(1)}%</strong>`);
          }
          const total = (row.total || 0).toLocaleString('es-MX');
          lines.push(`<strong>Total: ${total}</strong>`);
          return header + lines.join('<br>');
        }
      },
      legend: {
        top: legendTop,
        left: 'center',
        itemGap: 20,
        textStyle: { color: '#334155', fontSize: legendFontSize }
      },
      grid: { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom },
      dataZoom: needsZoom ? [
        { type: 'slider', bottom: 16, height: compact ? 18 : 20, start: 0, end: zoomEnd },
        { type: 'inside', start: 0, end: zoomEnd }
      ] : [],
      xAxis: {
        type: 'category',
        data: labels,
        axisTick: { alignWithLabel: true },
        axisLabel: {
          interval: 0,
          color: '#475569',
          fontSize: axisFontSize,
          lineHeight: axisLineHeight,
          margin: axisMargin
        }
      },
      yAxis: [
        {
          type: 'value',
          name: 'Atenciones',
          position: 'left',
          axisLabel: { color: '#475569', fontSize: compact ? 11 : 12 },
          splitLine: { lineStyle: { color: 'rgba(15,23,42,0.08)' } }
        },
        {
          type: 'value',
          name: '% Traslado',
          min: 0,
          max: 100,
          position: 'right',
          axisLabel: { formatter: '{value}%', color: '#2563eb', fontSize: compact ? 11 : 12 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: 'Traslado',
          type: 'bar',
          stack: 'total',
          barMinHeight: 15, // Force visible height approx 15px
          barGap: '12%',
          barCategoryGap: '32%',
          itemStyle: { color: createGradient(TIPO_COLORS.traslado[0], TIPO_COLORS.traslado[1]), borderRadius: 2 },
          emphasis: { focus: 'series' },
          label: {
            show: true,
            position: 'inside', // Put number inside the expanded bar
            color: '#fff',
            fontSize: 10,
            formatter: (params) => params.value > 0 ? params.value : '' // Validate >0
          },
          data: trasladoCounts
        },
        {
          name: 'Ambulatorio',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: createGradient(TIPO_COLORS.ambulatorio[0], TIPO_COLORS.ambulatorio[1]), borderRadius: 2 },
          emphasis: { focus: 'series' },
          data: ambulCounts
        },
        {
          name: '% Traslado',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: symbolSize,
          lineStyle: { width: 3, color: '#2563eb' },
          itemStyle: { color: '#2563eb' },
          data: shareValues.map((value) => Number.isFinite(value) ? Number(value.toFixed(2)) : null)
        }
      ]
    };
  }

  function updateCompSummary(activeYears){
    const summaryEl = document.getElementById('medicas-comp-resumen');
    if (!summaryEl) return;
    if (!activeYears.length){
      summaryEl.textContent = 'Selecciona al menos un año para comparar.';
      return;
    }

    let totalAccum = 0;
    let best = { value: Number.NEGATIVE_INFINITY, month: '', year: '' };

    activeYears.forEach((year) => {
      const yearData = compByYear.get(year);
      if (!yearData) return;
      MONTH_ORDER.forEach((month) => {
        const val = yearData[month];
        if (Number.isFinite(val)){
          totalAccum += val;
          if (val > best.value){
            best = { value: val, month, year };
          }
        }
      });
    });

    const totalText = totalAccum.toLocaleString('es-MX');
    if (Number.isFinite(best.value) && best.value >= 0){
      const monthLabel = formatMonthTitle(best.month);
      summaryEl.textContent = `Total comparado: ${totalText} | Pico: ${monthLabel} ${best.year} (${best.value.toLocaleString('es-MX')})`;
    } else {
      summaryEl.textContent = `Total comparado: ${totalText} | Sin registros destacados`;
    }
  }

  function buildCompOption(activeYears){
    const labels = [...MONTH_ORDER];
    const hasSelection = activeYears.length > 0;
    const compact = isCompactViewport();
    const legendTop = compact ? 54 : 40;
    const legendFontSize = compact ? 11 : 12;
    const gridTop = compact ? 82 : 90;
    const gridBottom = compact ? 52 : 48;
    const gridLeft = compact ? 44 : 52;
    const gridRight = compact ? 20 : 28;
    const axisFontSize = compact ? 11 : 12;
    const axisMargin = compact ? 12 : 16;
    const symbolSize = compact ? 5 : 6;

    const series = hasSelection ? activeYears.map((year, index) => {
      const yearData = compByYear.get(year) || {};
      const data = labels.map((month) => {
        const value = yearData[month];
        if (Number.isFinite(value)) return value;
        return value === 0 ? 0 : null;
      });
      const color = COMP_COLORS[index % COMP_COLORS.length];
      return {
        name: String(year),
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize,
        lineStyle: { width: 3, color },
        itemStyle: { color },
        areaStyle: { opacity: 0.12, color },
        data
      };
    }) : [];

    return {
      title: {
        text: 'Atenciones médicas (comparación mensual)',
        subtext: hasSelection ? 'Totales mensuales por año' : 'Selecciona al menos un año',
        left: 'center',
        top: 6,
        itemGap: 4,
        textStyle: { fontWeight: 800, color: '#0f172a', fontSize: 18 },
        subtextStyle: { color: '#475569', fontSize: 12 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const month = formatMonthTitle(params[0].axisValue || '');
          const header = `<strong>${month}</strong>`;
          const lines = params.map((entry) => {
            const value = Number(entry.value);
            if (Number.isFinite(value)){
              return `${entry.marker} ${entry.seriesName}: ${value.toLocaleString('es-MX')}`;
            }
            return `${entry.marker} ${entry.seriesName}: Sin dato`;
          });
          return `${header}<br>${lines.join('<br>')}`;
        }
      },
      legend: {
        top: legendTop,
        left: 'center',
        itemGap: 20,
        textStyle: { color: '#334155', fontSize: legendFontSize },
        data: activeYears.map((year) => String(year))
      },
      grid: { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom },
      xAxis: {
        type: 'category',
        data: labels,
        axisTick: { alignWithLabel: true },
        axisLabel: {
          interval: 0,
          color: '#475569',
          fontSize: axisFontSize,
          margin: axisMargin,
          formatter: (value) => (value ? getMonthAbbr(value) : value)
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#475569', fontSize: compact ? 11 : 12 },
        splitLine: { lineStyle: { color: 'rgba(15,23,42,0.08)' } }
      },
      series
    };
  }

  function ensureCompChart(){
    const el = document.getElementById('medicasCompChart');
    if (!el || !window.echarts) return null;
    if (!compChart){
      compChart = echarts.init(el, null, { renderer: 'canvas' });
    }
    return compChart;
  }

  function renderComp(){
    const pane = document.getElementById('medicas-comp-pane');
    if (!pane){
      pendingComp = false;
      return;
    }
    if (!pane.classList.contains('active')){
      pendingComp = true;
      return;
    }
    if (!pane.offsetParent && pane.offsetWidth === 0 && pane.offsetHeight === 0){
      pendingComp = true;
      return;
    }
    const activeYears = getActiveCompYears();
    updateCompSummary(activeYears);
    renderCompTable(activeYears);
    const instance = ensureCompChart();
    if (!instance) return;
    const option = buildCompOption(activeYears);
    instance.setOption(option, true);
    instance.resize();
    currentViewportMode = getViewportMode();
    pendingComp = false;
  }

  function ensureTipoChart(){
    const el = document.getElementById('medicasTipoChart');
    if (!el || !window.echarts) return null;
    if (!tipoChart){
      tipoChart = echarts.init(el, null, { renderer: 'canvas' });
    }
    return tipoChart;
  }

  function renderTipo(){
    const pane = document.getElementById('medicas-tipo-pane');
    if (!pane){
      pendingTipo = false;
      return;
    }
    if (!pane.classList.contains('active')){
      pendingTipo = true;
      return;
    }
    const dataset = buildTipoDataset(tipoYear);
    updateTipoSummary(dataset);
    renderTipoTable(dataset);
    const instance = ensureTipoChart();
    if (!instance) return;
    const option = buildTipoOption(dataset);
    instance.setOption(option, true);
    instance.resize();
    currentViewportMode = getViewportMode();
    pendingTipo = false;
  }

  function renderAtencionesTable(dataset){
    const container = document.getElementById('medicas-atenciones-table');
    if (!container) return;
    if (!dataset.length){
      container.innerHTML = '<div class="text-muted small">Sin datos disponibles para el periodo seleccionado.</div>';
      return;
    }
    
    // 7 columns
    const colWidth = '14.28%'; 
    
    const rows = dataset.map((item) => {
      const month = escapeHtml(formatMonthTitle(item.mes));
      const year = escapeHtml(String(item.anio || ''));
      return `
        <tr>
          <th scope="row" class="text-center">${month}</th>
          <td class="text-center">${year}</td>
          <td class="text-center">${formatNumber(item.aifa)}</td>
          <td class="text-center">${formatNumber(item.otra_empresa)}</td>
          <td class="text-center">${formatNumber(item.pasajeros)}</td>
          <td class="text-center">${formatNumber(item.visitantes)}</td>
          <td class="text-center fw-semibold">${formatNumber(item.total)}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="medicas-table-container">
        <table class="table table-hover table-sm align-middle mb-0 table-fixed" id="medicas-atenciones-inner-table">
          <thead class="table-light">
            <tr>
              <th scope="col" class="text-center" style="width:${colWidth}">Mes</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Año</th>
              <th scope="col" class="text-center" style="width:${colWidth}">AIFA</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Otra empresa</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Pasajeros</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Visitantes</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Total</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="0" onkeyup="window.medicasTableFilter('medicas-atenciones-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="1" onkeyup="window.medicasTableFilter('medicas-atenciones-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="2" onkeyup="window.medicasTableFilter('medicas-atenciones-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="3" onkeyup="window.medicasTableFilter('medicas-atenciones-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="4" onkeyup="window.medicasTableFilter('medicas-atenciones-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="5" onkeyup="window.medicasTableFilter('medicas-atenciones-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="6" onkeyup="window.medicasTableFilter('medicas-atenciones-inner-table')"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderTipoTable(dataset){
    const container = document.getElementById('medicas-tipo-table');
    if (!container) return;
    if (!dataset.length){
      container.innerHTML = '<div class="text-muted small">Sin datos disponibles para el periodo seleccionado.</div>';
      return;
    }
    
    // 6 columns
    const colWidth = '16.66%';

    const rows = dataset.map((item) => {
      const month = escapeHtml(formatMonthTitle(item.mes));
      const year = escapeHtml(String(item.anio || ''));
      const shareText = Number.isFinite(item.share) ? `${(item.share || 0).toFixed(1)}%` : '—';
      return `
        <tr>
          <th scope="row" class="text-center">${month}</th>
          <td class="text-center">${year}</td>
          <td class="text-center">${formatNumber(item.traslado)}</td>
          <td class="text-center">${formatNumber(item.ambulatorio)}</td>
          <td class="text-center fw-semibold">${formatNumber(item.total)}</td>
          <td class="text-center">${escapeHtml(shareText)}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="medicas-table-container">
        <table class="table table-hover table-sm align-middle mb-0 table-fixed" id="medicas-tipo-inner-table">
          <thead class="table-light">
            <tr>
              <th scope="col" class="text-center" style="width:${colWidth}">Mes</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Año</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Traslado</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Ambulatorio</th>
              <th scope="col" class="text-center" style="width:${colWidth}">Total</th>
              <th scope="col" class="text-center" style="width:${colWidth}">% Traslado</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="0" onkeyup="window.medicasTableFilter('medicas-tipo-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="1" onkeyup="window.medicasTableFilter('medicas-tipo-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="2" onkeyup="window.medicasTableFilter('medicas-tipo-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="3" onkeyup="window.medicasTableFilter('medicas-tipo-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="4" onkeyup="window.medicasTableFilter('medicas-tipo-inner-table')"></th>
              <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="5" onkeyup="window.medicasTableFilter('medicas-tipo-inner-table')"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderCompTable(activeYears){
    const container = document.getElementById('medicas-comp-table');
    if (!container) return;
    if (!compByYear.size){
      container.innerHTML = '<div class="text-muted small">Sin datos disponibles para comparar.</div>';
      return;
    }
    const years = (Array.isArray(activeYears) && activeYears.length
      ? activeYears
      : Array.from(compByYear.keys())).filter((year) => compByYear.has(year)).sort((a, b) => a - b);
    if (!years.length){
      container.innerHTML = '<div class="text-muted small">Selecciona al menos un año para visualizar la tabla comparativa.</div>';
      return;
    }

    // 14 columns: Year + 12 Months + Total
    const colWidth = '7.14%'; 

    const headerMonths = MONTH_ORDER.map(m => `<th scope="col" class="text-center" style="width:${colWidth}">${escapeHtml(m.substring(0,3))}</th>`).join('');
    
    // Filter Inputs - one for Year, one for each Month, one for Total
    const filterInputs = MONTH_ORDER.map((_, i) => `<th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="${i+1}" onkeyup="window.medicasTableFilter('medicas-comp-inner-table')"></th>`).join('');

    const bodyRows = years.map((year) => {
      const bucket = compByYear.get(year) || {};
      const cells = MONTH_ORDER.map((month) => {
        const value = bucket[month];
        return `<td class="text-center">${Number.isFinite(value) ? formatNumber(value) : '-'}</td>`; 
      }).join('');
      
      const sum = MONTH_ORDER.reduce((acc, month) => {
        const value = bucket[month];
        return acc + (Number.isFinite(value) ? value : 0);
      }, 0);

      return `<tr>
        <th scope="row" class="text-center">${escapeHtml(String(year))}</th>
        ${cells}
        <td class="text-center fw-bold">${formatNumber(sum)}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover table-sm align-middle mb-0 table-bordered table-fixed" id="medicas-comp-inner-table">
          <thead class="table-light">
            <tr>
              <th scope="col" class="text-center" style="width:${colWidth}">Año</th>
              ${headerMonths}
              <th scope="col" class="text-center" style="width:${colWidth}">Total</th>
            </tr>
            <tr class="filter-row">
               <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="0" onkeyup="window.medicasTableFilter('medicas-comp-inner-table')"></th>
               ${filterInputs}
               <th><input type="text" class="form-control form-control-sm text-center" placeholder="Buscar..." data-col-index="13" onkeyup="window.medicasTableFilter('medicas-comp-inner-table')"></th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
  }

  // Generic filter function
  window.medicasTableFilter = function(tableId) {
      const table = document.getElementById(tableId);
      if (!table) return;
      
      const inputs = table.querySelectorAll('.filter-row input');
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      const rows = tbody.querySelectorAll('tr');

      rows.forEach(row => {
          let show = true;
          const cells = row.cells;

          inputs.forEach(input => {
              if (!show) return;
              const term = input.value.toLowerCase().trim();
              if (!term) return;

              const colIndex = parseInt(input.getAttribute('data-col-index'));
              // Check bounds
              if (isNaN(colIndex) || colIndex >= cells.length) return;

              let cellText = cells[colIndex].textContent.toLowerCase();
              if (cellText.indexOf(term) === -1) {
                  show = false;
              }
          });

          row.style.display = show ? '' : 'none';
      });
  };

  async function loadJSON(url){
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload) ? payload.filter((item) => item && item.mes && item.anio) : [];
    } catch (error) {
      console.error(`No se pudo cargar ${url}`, error);
      return [];
    }
  }

  // Use DataManager to fetch data from Supabase
  async function loadDataFromDB() {
    try {
        if (!window.dataManager) return { atenciones: [], tipos: [], comp: [] };
        
        // 1. Atenciones Mensuales
        const atenciones = await window.dataManager.getMedicalAttentions();
        const mappedAtenciones = atenciones.map(a => ({
            anio: a.year,
            mes: a.month, 
            aifa: a.aifa_personnel, 
            otra_empresa: a.other_companies,
            pasajeros: a.passengers,
            visitantes: a.visitors, 
            total: a.total
        }));

        // 2. Tipos de Atencion
        const tipos = await window.dataManager.getMedicalTypes();
        const mappedTipos = tipos.map(t => ({
            anio: t.year,
            mes: t.month,
            traslado: t.traslado,
            ambulatorio: t.ambulatorio,
            total: t.total
        }));

        // 3. Comparativa (derived from Atenciones if not exists in DB separately, or we can use the same data)
        // Historically "atenciones_medicas_año.json" matched structure of "atenciones_medicas.json"
        // So we can reuse mappedAtenciones for rawComp
        
        return { 
            atenciones: mappedAtenciones.filter(i => i.anio && i.mes), 
            tipos: mappedTipos.filter(i => i.anio && i.mes),
            comp: mappedAtenciones.filter(i => i.anio && i.mes)
        };

    } catch (e) {
        console.error("Error loading medical data from DB:", e);
        return { atenciones: [], tipos: [], comp: [] };
    }
  }

  function bindEvents(){
    if (eventsBound) return;
    eventsBound = true;

    const atencionesSelect = document.getElementById('medicas-atenciones-year');
    if (atencionesSelect){
      atencionesSelect.addEventListener('change', (event) => {
        atencionesYear = event.target.value || 'all';
        renderAtenciones();
      });
    }

    const tipoSelect = document.getElementById('medicas-tipo-year');
    if (tipoSelect){
      tipoSelect.addEventListener('change', (event) => {
        tipoYear = event.target.value || 'all';
        renderTipo();
      });
    }

    const tabs = document.getElementById('medicasTabs');
    if (tabs){
      tabs.addEventListener('shown.bs.tab', (event) => {
        const targetId = event?.target?.id;
        if (targetId === 'medicas-atenciones-tab' || pendingAtenciones){
          setTimeout(() => renderAtenciones(), 60);
        }
        if (targetId === 'medicas-tipo-tab' || pendingTipo){
          setTimeout(() => renderTipo(), 60);
        }
        if (targetId === 'medicas-comp-tab' || pendingComp){
          setTimeout(() => renderComp(), 60);
        }
      });
    }

    // Antes habia aqui un listener de clic sobre document que buscaba la
    // entrada del menu: existia porque nadie garantizaba que se avisara al
    // modulo cuando la seccion se mostraba. Ahora lo hace initMedicas().

    window.addEventListener('resize', () => {
      const newMode = getViewportMode();
      const modeChanged = newMode !== currentViewportMode;

      const atencionesPane = document.getElementById('medicas-atenciones-pane');
      const tipoPane = document.getElementById('medicas-tipo-pane');
      const compPane = document.getElementById('medicas-comp-pane');

      if (atencionesChart){
        if (modeChanged && atencionesPane?.classList.contains('active')){
          renderAtenciones();
        } else {
          atencionesChart.resize();
          if (modeChanged) pendingAtenciones = true;
        }
      }

      if (tipoChart){
        if (modeChanged && tipoPane?.classList.contains('active')){
          renderTipo();
        } else {
          tipoChart.resize();
          if (modeChanged) pendingTipo = true;
        }
      }

      if (compChart){
        if (modeChanged && compPane?.classList.contains('active')){
          renderComp();
        } else {
          compChart.resize();
          if (modeChanged) pendingComp = true;
        }
      }

      if (modeChanged){
        currentViewportMode = newMode;
      }
    });

    // Listen for data updates to refresh visualizations
    window.addEventListener('data-updated', (e) => {
        const table = e.detail && e.detail.table;
        if (table === 'medical_attentions' || table === 'medical_types') {
            console.log('Reloading medical visualisations from DB...');
            init(true);
        }
    });
  }

  async function init(forceReload = false){
    try {
        if (rawAtenciones.length === 0 || forceReload) {
            
            // 1. Try DB
            let result = await loadDataFromDB();
            
            // 2. Fallback to JSON if DB returned empty data (safety net)
            if (result.atenciones.length === 0 && !forceReload) {
                 const [d1, d2, d3] = await Promise.all([
                    loadJSON(ATENCIONES_URL),
                    loadJSON(TIPO_URL),
                    loadJSON(COMP_URL)
                 ]);
                 rawAtenciones = d1;
                 rawTipo = d2;
                 rawComp = d3;
            } else {
                 rawAtenciones = result.atenciones;
                 rawTipo = result.tipos;
                 rawComp = result.comp;
            }

            populateYearOptions('medicas-atenciones-year', uniqueYears(rawAtenciones));
            populateYearOptions('medicas-tipo-year', uniqueYears(rawTipo));

            prepareCompIndex();
            
            // Populate checkboxes for comparison years
            const years = Array.from(compByYear.keys()).sort((a,b)=>a-b);
            populateCompYears(years);
            
            // Default select all if first load or logic requires
            compActiveYears = new Set(years.map(String));
        }

        bindEvents();
        renderAtenciones();
        renderTipo();
        renderComp(); // Ensure comparison tab also renders

    } catch (e) {
        console.error("Error initializing Medical module:", e);
    }
  }

  /* ============================================================
   *  Contrato de ciclo de vida del modulo.
   *
   *  Antes se encendia solo al cargar la pagina: DOMContentLoaded si
   *  llegaba a tiempo, y si no un setTimeout de 250 ms "para dar tiempo a
   *  dataManager". Las dos vias sobran: el modulo se abre por accion del
   *  usuario, mucho despues de que dataManager este listo.
   * ========================================================== */
  window.initMedicas = function () {
    init().catch((e) => console.error('[medicas] init:', e && e.message));
    // Las graficas de ECharts miden mal cuando su contenedor estaba oculto,
    // asi que en cada entrada se repinta lo que quedara pendiente.
    setTimeout(() => {
      try {
        if (pendingAtenciones) renderAtenciones();
        if (pendingTipo) renderTipo();
        if (pendingComp) renderComp();
      } catch (_) {}
    }, 120);
  };

  // Al salir se sueltan las tres instancias de ECharts. Ponerlas a null
  // ademas deja el listener de resize en un no-op mientras la seccion esta
  // cerrada, porque todas sus ramas empiezan por "if (xChart)".
  window.destroyMedicas = function () {
    [atencionesChart, compChart, tipoChart].forEach((c) => {
      try { if (c && typeof c.dispose === 'function') c.dispose(); } catch (_) {}
    });
    atencionesChart = null;
    compChart = null;
    tipoChart = null;
  };
})();
