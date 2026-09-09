/**
 * @jest-environment node
 *
 * Prueba de humo de la página entera.
 *
 * Carga index.html de verdad con sus 84 archivos de JavaScript, la arranca, y
 * después recorre TODAS las entradas del menú comprobando que cada una abre su
 * sección y la sub-pestaña que pide.
 *
 * Cubre dos cosas que ninguna prueba unitaria puede cubrir:
 *
 *   · que ningún archivo reviente al cargar ni al arrancar la página —un error
 *     en cualquiera de ellos deja la aplicación a medias sin avisar—;
 *
 *   · el bug reportado de navegación: al entrar a Resumen General reaparecía
 *     Comparativa Histórica, porque se restauraba la última pestaña usada antes
 *     de hacer caso al clic. Aquí se reproduce el camino exacto.
 *
 * Las librerías que vienen de CDN se sustituyen por dobles, porque jsdom no
 * descarga nada de la red. bootstrap.Tab sí se implementa de verdad: sin él no
 * habría forma de comprobar qué pestaña queda abierta.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const raiz = path.resolve(__dirname, '..');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let win;
let errores;
let avisos;

beforeAll(async () => {
  errores = [];
  avisos = [];

  // Los modulos extraidos traen su marcado en view.html y solo llega al DOM al
  // abrirlos. Aqui se compone la pagina como queda en runtime; mas abajo se le
  // da al loader un fetch de disco y los marcadores de script ya cargados, para
  // que su camino perezoso corra de verdad dentro de jsdom.
  const dom = new JSDOM(require('../test-utils/modulos.js').htmlCompleto(), {
    url: 'http://localhost:3000/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  win = dom.window;

  win.addEventListener('error', (e) => errores.push('window.onerror: ' + ((e.error && e.error.stack) || e.message)));
  win.onunhandledrejection = (e) => errores.push('promesa sin capturar: ' + e.reason);

  const noop = () => {};
  const doble = new Proxy(function () {}, {
    get: () => doble,
    apply: () => doble,
    construct: () => doble,
  });

  // bootstrap.Tab de verdad: mueve las clases 'active' como lo hace bootstrap.
  const Tab = {
    getOrCreateInstance(el) {
      return {
        show() {
          const destino = el.getAttribute('data-bs-target') || el.getAttribute('href');
          const pane = destino && win.document.querySelector(destino);
          const grupo = el.closest('.nav, .nav-tabs, .nav-pills') || win.document;
          grupo.querySelectorAll('[data-bs-toggle="tab"], [data-bs-toggle="pill"]').forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          el.classList.add('active');
          el.setAttribute('aria-selected', 'true');
          if (pane && pane.parentElement) {
            pane.parentElement.querySelectorAll(':scope > .tab-pane')
              .forEach((p) => p.classList.remove('active', 'show'));
            pane.classList.add('active', 'show');
          }
          el.dispatchEvent(new win.Event('shown.bs.tab', { bubbles: true }));
        },
      };
    },
  };

  win.fetch = () => Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve({}),
  });

  const consulta = new Proxy({}, {
    get: (t, p) => (p === 'then'
      ? (res) => Promise.resolve({ data: [], error: null }).then(res)
      : () => consulta),
  });
  const cliente = {
    from: () => consulta,
    rpc: () => consulta,
    channel: () => ({
      on() { return this; },
      subscribe() { return this; },
      send: () => Promise.resolve(),
      track: () => Promise.resolve(),
      untrack: () => Promise.resolve(),
      presenceState: () => ({}),
      unsubscribe: () => Promise.resolve(),
    }),
    removeChannel: noop,
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: {}, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ error: null }),
      }),
    },
  };

  Object.assign(win, {
    supabase: { createClient: () => cliente },
    bootstrap: { Modal: doble, Tooltip: doble, Tab, Dropdown: doble, Offcanvas: doble, Collapse: doble, Popover: doble, Toast: doble },
    Chart: doble,
    XLSX: {
      read: () => ({ SheetNames: [], Sheets: {} }),
      utils: { sheet_to_json: () => [], json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: noop, aoa_to_sheet: () => ({}), encode_cell: () => 'A1', decode_range: () => ({ s: {}, e: {} }) },
      writeFile: noop,
      write: () => '',
    },
    html2canvas: () => Promise.resolve({ toDataURL: () => '' }),
    jspdf: { jsPDF: doble },
    jsPDF: doble,
    L: doble,
    Tesseract: { createWorker: () => Promise.resolve(doble) },
    pdfjsLib: { getDocument: () => ({ promise: Promise.resolve(doble) }), GlobalWorkerOptions: {} },
    Papa: { parse: () => ({ data: [], errors: [] }), unparse: () => '' },
    QRCode: doble,
    ApexCharts: doble,
    ExcelJS: { Workbook: doble },
    saveAs: noop,
    $: doble,
    jQuery: doble,
    moment: doble,
    Swal: doble,
    Sortable: doble,
    JSZip: doble,
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    matchMedia: () => ({ matches: false, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop }),
    scrollTo: noop,
    print: noop,
    open: () => null,
  });
  win.HTMLCanvasElement.prototype.getContext = () => doble;
  win.HTMLElement.prototype.scrollIntoView = noop;

  // jsdom no trae stack de video: play/pause/load llaman a notImplemented(),
  // que escupe un error por la consola virtual sin lanzar, asi que ni el
  // try/catch del modulo lo silencia. La vista de Aviacion General pausa sus
  // clips al cerrarse, y esa llamada legitima ensuciaba la corrida entera.
  // Se dobla el reproductor: aqui no se comprueba que el video suene.
  win.HTMLMediaElement.prototype.play = () => Promise.resolve();
  win.HTMLMediaElement.prototype.pause = noop;
  win.HTMLMediaElement.prototype.load = noop;
  win.console.error = (...a) => errores.push('console.error: ' + a.map(String).join(' '));
  win.console.warn = (...a) => avisos.push(a.map(String).join(' '));
  win.console.log = noop;

  // Los archivos del ARRANQUE, en el mismo orden en que los pide el shell.
  // Aqui se lee index.html crudo a proposito, no el documento compuesto: lo que
  // se quiere enumerar es lo que el navegador descarga al abrir la pagina. El
  // codigo de los modulos se evalua aparte, unas lineas mas abajo.
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const archivos = ['script.js'];
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const ruta = m[1].split('?')[0];
    if (ruta.startsWith('http') || ruta.startsWith('//') || ruta === 'script.js') continue;
    if (fs.existsSync(path.join(raiz, ruta))) archivos.push(ruta);
  }

  // El shell ya no los referencia: los carga el loader. Se evaluan aqui para
  // que el modulo exista cuando el loader llame a su init().
  const modulosJs = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) recorrer(rel);
      else if (e.name.endsWith('.js')) modulosJs.push(rel);
    }
  })('modules');
  archivos.push(...modulosJs);

  for (const f of archivos) {
    try {
      win.eval(fs.readFileSync(path.join(raiz, f), 'utf8'));
    } catch (e) {
      errores.push('AL CARGAR ' + f + ': ' + ((e && e.stack) || e));
    }
  }

  // El loader pide la vista con fetch y luego inyecta un <script>. jsdom no
  // resuelve ninguna de las dos por su cuenta: se le sirve la vista desde disco
  // y se dejan puestos los marcadores que el propio loader usa para no volver a
  // cargar un script ya presente.
  // Solo las vistas de los modulos: el resto de la aplicacion tambien usa fetch
  // (data/*.json, etc.) y quedarse con TODAS las peticiones convertia sus fallos
  // normales en errores de esta prueba.
  const fetchOriginal = win.fetch;
  win.fetch = (url, opciones) => {
    const ruta = String(url).split('?')[0];
    if (!/^modules\/.+\/view\.html$/.test(ruta)) {
      return fetchOriginal ? fetchOriginal.call(win, url, opciones) : Promise.reject(new Error('sin red'));
    }
    const abs = path.join(raiz, ruta);
    const hay = fs.existsSync(abs);
    return Promise.resolve({
      ok: hay,
      status: hay ? 200 : 404,
      text: () => Promise.resolve(hay ? fs.readFileSync(abs, 'utf8') : ''),
    });
  };
  for (const f of modulosJs) {
    const marca = win.document.createElement('script');
    marca.dataset.moduloSrc = f + '?v=1';
    win.document.body.appendChild(marca);
  }

  // Sesion iniciada, que es el estado en el que se usa el menu.
  //
  // Los modulos extraidos validan la sesion ANTES de mostrarse: sin user_role,
  // el loader deniega el acceso y vacia el contenedor, que es justo lo que debe
  // hacer. Navegar el menu sin haber entrado no es un estado real de la
  // aplicacion, y darlo por bueno haria pasar la prueba ocultando esa garantia.
  // La denegacion se comprueba aparte, en modulacion-gestion-energetica.
  try { win.sessionStorage.setItem('user_role', 'admin'); } catch (_) {}

  try {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
    win.dispatchEvent(new win.Event('load'));
  } catch (e) {
    errores.push('AL ARRANCAR: ' + ((e && e.stack) || e));
  }

  await esperar(2500);
}, 120000);

const abrir = async (a) => {
  a.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await esperar(90);
};

describe('la página carga entera', () => {
  test('los 84 archivos de JavaScript se cargan y arrancan sin un solo error', () => {
    expect(errores).toEqual([]);
  });

  test('el menú lateral tiene entradas', () => {
    expect(win.document.querySelectorAll('a.menu-item[data-section]').length).toBeGreaterThan(30);
  });
});

describe('cada entrada del menú abre lo que dice', () => {
  test('todas, sin excepción', async () => {
    const fallos = [];
    for (const a of win.document.querySelectorAll('a.menu-item[data-section]')) {
      const seccion = a.dataset.section;
      const subTab = (a.dataset.subTab || '').trim();
      const nombre = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) || seccion;

      await abrir(a);

      const sec = win.document.getElementById(seccion)
        || win.document.getElementById(seccion + '-section');
      if (sec && sec.classList.contains('d-none')) {
        fallos.push(`${nombre} [${seccion}]: la sección quedó oculta`);
      }
      if (subTab) {
        const boton = win.document.getElementById(subTab);
        if (!boton) fallos.push(`${nombre}: data-sub-tab="${subTab}" no existe`);
        else if (!boton.classList.contains('active')) {
          fallos.push(`${nombre}: pidió "${subTab}" y no quedó abierta`);
        }
      }
    }
    expect(fallos).toEqual([]);
  }, 120000);
});

describe('el bug de navegación reportado', () => {
  test('venir de Comparativa Histórica no impide entrar a Resumen General', async () => {
    const comparativa = win.document.querySelector('a.menu-item[data-sub-tab="comparativa-yoy-tab"]');
    const resumen = win.document.querySelector('a.menu-item[data-sub-tab="ops-resumen-tab"]');
    expect(comparativa).not.toBeNull();
    expect(resumen).not.toBeNull();

    await abrir(comparativa);
    await esperar(80);
    expect(win.document.getElementById('comparativa-yoy-tab').classList.contains('active')).toBe(true);

    // El clic deliberado manda sobre la pestaña recordada.
    await abrir(resumen);
    await esperar(80);
    expect(win.document.getElementById('ops-resumen-tab').classList.contains('active')).toBe(true);
  }, 30000);

  test('y volver a Comparativa Histórica sigue funcionando', async () => {
    const comparativa = win.document.querySelector('a.menu-item[data-sub-tab="comparativa-yoy-tab"]');
    await abrir(comparativa);
    await esperar(80);
    expect(win.document.getElementById('comparativa-yoy-tab').classList.contains('active')).toBe(true);
  }, 30000);
});

/*
 * Esta prueba NO corre con `npm test`: tarda ~50 s y la aplicación deja
 * temporizadores vivos, así que jest necesita --forceExit para terminar.
 * Se ejecuta aparte:
 *
 *     npm run test:pagina
 */
