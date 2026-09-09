/**
 * @jest-environment jsdom
 *
 * Modularización de la Subdirección de Seguridad Operacional (SSO).
 *
 * Es la categoría más grande de las cuatro hechas: cuatro submódulos y quince
 * entradas de menú. Trece salieron; dos se quedaron a propósito, y eso también
 * se documenta aquí abajo.
 *
 * Lo que distinguía a esta categoría no era el tamaño sino el acoplamiento.
 * Ninguno de estos módulos tenía forma de enterarse de que su sección se abría,
 * así que cada uno se lo inventó por su cuenta:
 *
 *   • BHS · Manejo de Maletas era un <script> de 1193 líneas DENTRO de
 *     index.html, y envolvía window.showSection con un parche propio para
 *     recargar al entrar;
 *   • BHS · Estadísticas envolvía window.showSection otra vez, por su lado;
 *   • Portal Digital escuchaba clics sobre document Y espiaba la clase
 *     'active' de su sección con un MutationObserver;
 *   • Servicio Médico escuchaba clics sobre document y arrancaba con un
 *     setTimeout de 250 ms "para dar tiempo a dataManager";
 *   • Fauna, Abordadores y Biblioteca colgaban de DOMContentLoaded, evento que
 *     ya no llega cuando el loader inyecta el script.
 *
 * Todos esos rodeos desaparecen: el loader llama a init() al abrir. Estas
 * pruebas fijan que no vuelvan.
 */

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

const indexHtml = leer('index.html');
const scriptJs = leer('script.js');
const loaderJs = leer('core/module-loader.js');
const { registroDeModulos } = require('../test-utils/modulos.js');

const B = 'modules/seguridad-operacional/';

const MODULOS = [
  // GOPA · Ops. Parte Aeronáutica
  { clave: 'analisis-operaciones', base: B + 'parte-aeronautica/analisis-operaciones', init: 'initAnalisisOperaciones', destroy: 'destroyAnalisisOperaciones', viejo: 'js/analisis-operaciones.js' },
  { clave: 'portal-digitalizacion', base: B + 'parte-aeronautica/portal-digital', init: 'initPortalDigital', destroy: 'destroyPortalDigital', viejo: 'js/portal-admin.js' },
  { clave: 'abordadores-mecanicos', base: B + 'parte-aeronautica/abordadores-mecanicos', init: 'initAbordadoresMecanicos', destroy: 'destroyAbordadoresMecanicos', viejo: 'js/abordadores-registro.js' },
  { clave: 'biblioteca', base: B + 'parte-aeronautica/biblioteca', init: 'initBiblioteca', destroy: 'destroyBiblioteca', viejo: null },
  // GOET · Ops. Ed. Terminal
  { clave: 'bhs', base: B + 'ed-terminal/bhs-maletas', init: 'initBhsMaletas', destroy: 'destroyBhsMaletas', viejo: null },
  { clave: 'bhs-estadisticas-equipaje', base: B + 'ed-terminal/bhs-estadisticas', init: 'initBhsBaggageStats', destroy: 'destroyBhsBaggageStats', viejo: 'js/bhs-baggage-stats.js' },
  // GSO · Sgd. Operacional
  { clave: 'fauna', base: B + 'sgd-operacional/fauna', init: 'initFauna', destroy: 'destroyFauna', viejo: 'js/fauna.js' },
  { clave: 'ssei-emergencias', base: B + 'sgd-operacional/ssei-emergencias', init: 'initSseiEmergencias', destroy: 'destroySseiEmergencias', viejo: 'js/ssei-emergencias.js' },
  { clave: 'ssei-derrames', base: B + 'sgd-operacional/ssei-derrames', init: 'initSseiDerrames', destroy: 'destroySseiDerrames', viejo: 'js/ssei-derrames.js' },
  { clave: 'personal-capacitado-prestadores', base: B + 'sgd-operacional/personal-capacitado', init: 'initPersonalCapacitadoPrestadores', destroy: 'destroyPersonalCapacitadoPrestadores', viejo: 'js/personal-capacitado.js' },
  { clave: 'valoraciones-medicas', base: B + 'sgd-operacional/valoraciones-medicas', init: 'initValoracionesMedicas', destroy: 'destroyValoracionesMedicas', viejo: 'js/valoraciones-medicas.js' },
  { clave: 'catalogo-vehiculos', base: B + 'sgd-operacional/catalogo-vehiculos', init: 'initCatalogoVehiculos', destroy: 'destroyCatalogoVehiculos', viejo: 'js/catalogo-vehiculos.js' },
  // GSM · Servicios Médicos
  { clave: 'medicas', base: B + 'servicios-medicos/servicio-medico', init: 'initMedicas', destroy: 'destroyMedicas', viejo: 'js/medicas.js' },
];

describe('las trece categorías salieron del shell', () => {
  test.each(MODULOS)('index.html deja solo el contenedor vacío de $clave', ({ clave }) => {
    expect(indexHtml).toMatch(
      new RegExp('<div id="' + clave + '-section" class="content-section[^"]*" data-modulo="' + clave + '"></div>')
    );
  });

  test.each(MODULOS.filter((m) => m.viejo))('$clave: su archivo ya no está en js/ ni se pide', ({ viejo }) => {
    expect(fs.existsSync(path.join(raiz, viejo))).toBe(false);
    expect(indexHtml).not.toContain(viejo);
  });

  test.each(MODULOS)('$clave tiene vista y código donde dice el registro', ({ base }) => {
    expect(fs.existsSync(path.join(raiz, base, 'view.html'))).toBe(true);
    expect(fs.existsSync(path.join(raiz, base, 'index.js'))).toBe(true);
  });

  test('el submódulo GSO entero salió: seis categorías', () => {
    const gso = MODULOS.filter((m) => m.base.includes('sgd-operacional'));
    expect(gso).toHaveLength(6);
    gso.forEach(({ clave }) => expect(registroDeModulos().has(clave)).toBe(true));
  });
});

describe('nadie vuelve a envolver window.showSection', () => {
  // Dos módulos parcheaban el router para enterarse de las entradas a su
  // sección. Envolver una función ajena es frágil por partida doble: depende
  // del orden de carga y del siguiente que quiera hacer lo mismo.
  test('BHS · Manejo de Maletas ya no parchea el router', () => {
    const codigo = leer(B + 'ed-terminal/bhs-maletas/index.js');
    expect(codigo).not.toContain('__bhsAutoLatestPatched');
    expect(codigo).not.toContain('window.showSection =');
    expect(codigo).toContain('window.initBhsMaletas');
  });

  test('BHS · Estadísticas tampoco', () => {
    const codigo = leer(B + 'ed-terminal/bhs-estadisticas/index.js');
    expect(codigo).not.toContain('__bhsStatsPatched');
    expect(codigo).not.toContain('window.showSection =');
  });

  test('el <script> de 1193 líneas ya no vive en index.html', () => {
    // Se analizaba y ejecutaba en CADA carga de la página.
    expect(indexHtml).not.toContain('bhsAutoLoadLatest');
    expect(indexHtml).not.toContain('_bhsChart');
    expect(leer(B + 'ed-terminal/bhs-maletas/index.js')).toContain('bhsAutoLoadLatest');
  });
});

describe('se acabaron los rodeos para adivinar que la sección se abrió', () => {
  test('Portal Digital ya no escucha clics sobre document ni espía la clase active', () => {
    const codigo = leer(B + 'parte-aeronautica/portal-digital/index.js');
    expect(codigo).not.toContain('[data-section="portal-digitalizacion"]');
    // Se busca el constructo, no la palabra: el comentario que explica por qué
    // se quitó el observador debe poder nombrarlo.
    expect(codigo).not.toContain('new MutationObserver(');
    expect(codigo).toContain('window.initPortalDigital');
  });

  test('Servicio Médico ya no escucha clics sobre document ni arranca con un temporizador', () => {
    const codigo = leer(B + 'servicios-medicos/servicio-medico/index.js');
    expect(codigo).not.toContain('[data-section="medicas"]');
    expect(codigo).not.toContain('Small delay to let dataManager init');
  });

  test.each([
    ['fauna', 'sgd-operacional/fauna'],
    ['abordadores-mecanicos', 'parte-aeronautica/abordadores-mecanicos'],
    ['biblioteca', 'parte-aeronautica/biblioteca'],
    ['bhs', 'ed-terminal/bhs-maletas'],
    ['medicas', 'servicios-medicos/servicio-medico'],
  ])('%s ya no cuelga de DOMContentLoaded', (_clave, sub) => {
    // El loader inyecta el <script> mucho después de que ese evento pasara: lo
    // que colgara de él no se ejecutaría nunca, y el módulo quedaría muerto.
    expect(leer(B + sub + '/index.js')).not.toContain("addEventListener('DOMContentLoaded'");
  });

  test('ningún hook de estas secciones sobrevive en el router', () => {
    MODULOS.forEach(({ clave }) => {
      expect(scriptJs).not.toContain("section === '" + clave + "'");
    });
  });

  test('el aviso de Análisis de Operaciones se conserva, solo cambia quién lo da', () => {
    // js/demoras-upload.js también escucha 'analisis-operaciones:visible'. Si
    // el módulo llamara a su init() a secas en vez de disparar el evento, ese
    // otro archivo dejaría de enterarse sin que nadie lo notara.
    expect(scriptJs).not.toContain("new Event('analisis-operaciones:visible')");
    expect(leer(B + 'parte-aeronautica/analisis-operaciones/index.js'))
      .toContain("dispatchEvent(new Event('analisis-operaciones:visible'))");
    expect(leer('js/demoras-upload.js')).toContain('analisis-operaciones:visible');
  });
});

describe('ciclo de vida: qué suelta cada uno al salir', () => {
  test.each(MODULOS)('$clave expone init y destroy', ({ base, init, destroy }) => {
    const codigo = leer(path.join(base, 'index.js'));
    expect(codigo).toContain('window.' + init);
    expect(codigo).toContain('window.' + destroy);
  });

  test.each([
    ['ssei-emergencias', 'sgd-operacional/ssei-emergencias'],
    ['ssei-derrames', 'sgd-operacional/ssei-derrames'],
    ['personal-capacitado', 'sgd-operacional/personal-capacitado'],
    ['valoraciones-medicas', 'sgd-operacional/valoraciones-medicas'],
    ['catalogo-vehiculos', 'sgd-operacional/catalogo-vehiculos'],
  ])('%s libera sus gráficas con destroyCharts()', (_n, sub) => {
    const codigo = leer(B + sub + '/index.js');
    const cuerpo = codigo.slice(codigo.indexOf('window.destroy'));
    expect(cuerpo).toContain('destroyCharts()');
  });

  test('Fauna suelta las instancias de ECharts de sus DOS tableros', () => {
    // Fauna son dos IIFE en un mismo archivo, cada uno con su propio state.
    const codigo = leer(B + 'sgd-operacional/fauna/index.js');
    expect(codigo).toContain('window.__faunaPrincipal');
    expect(codigo).toContain('window.__faunaRescate');
    const cuerpo = codigo.slice(codigo.indexOf('window.destroyFauna'));
    expect(cuerpo).toContain('__faunaPrincipal.apagar()');
    expect(cuerpo).toContain('__faunaRescate.apagar()');
  });

  test('Fauna carga una vez y en las visitas siguientes solo repinta', () => {
    // Antes: DOMContentLoaded cargaba, y 'fauna:visible' repintaba. Se conserva.
    const cuerpo = leer(B + 'sgd-operacional/fauna/index.js');
    const init = cuerpo.slice(cuerpo.indexOf('window.initFauna'));
    expect(init).toContain('if (!_cargado)');
    expect(init).toContain("dispatchEvent(new Event('fauna:visible'))");
  });

  test('Servicio Médico suelta sus tres instancias de ECharts y las pone a null', () => {
    const codigo = leer(B + 'servicios-medicos/servicio-medico/index.js');
    const cuerpo = codigo.slice(codigo.indexOf('window.destroyMedicas'));
    expect(cuerpo).toContain('dispose()');
    // Ponerlas a null deja el listener de resize en un no-op mientras la
    // sección está cerrada: todas sus ramas empiezan por "if (xChart)".
    expect(cuerpo).toContain('atencionesChart = null');
    expect(cuerpo).toContain('compChart = null');
    expect(cuerpo).toContain('tipoChart = null');
  });

  test('BHS · Manejo de Maletas suelta las gráficas colgadas de sus canvas', () => {
    const codigo = leer(B + 'ed-terminal/bhs-maletas/index.js');
    const cuerpo = codigo.slice(codigo.indexOf('window.destroyBhsMaletas'));
    expect(cuerpo).toContain('_bhsChart.destroy()');
  });

  test('Análisis de Operaciones suelta su registro de Chart.js', () => {
    const codigo = leer(B + 'parte-aeronautica/analisis-operaciones/index.js');
    const cuerpo = codigo.slice(codigo.indexOf('window.destroyAnalisisOperaciones'));
    expect(cuerpo).toContain('_chartInstances');
    expect(cuerpo).toContain('.destroy()');
  });
});

describe('lo que NO se extrajo, y por qué', () => {
  // Esto no es una laguna: es una decisión, y conviene que quede escrita donde
  // se vea al tocar el módulo, no solo en un mensaje de chat.

  test('Conciliación sigue en el shell: su lógica vive dentro de script.js', () => {
    // Son ~400 funciones _conci* en script.js, mas cinco bloques de arranque
    // que cablean sus nodos. Sacar la vista sin mover todo eso dejaria esos
    // bloques buscando elementos que aun no existen, y el modulo muerto.
    // Moverlo es un refactor del monolito, no un cambio de carpeta -- y toca
    // justo la parte mas critica y mas recientemente estabilizada.
    expect(indexHtml).toContain('<div id="conciliacion-section"');
    expect(indexHtml).not.toContain('data-modulo="conciliacion"');
    expect(scriptJs).toContain("section === 'conciliacion'");
    expect(registroDeModulos().has('conciliacion')).toBe(false);
  });

  test('Resumen General sigue en el shell: es la pantalla de entrada', () => {
    // operaciones-totales es la seccion con class="content-section active": la
    // que se ve al abrir la aplicacion. Diferir su carga no la haria mas
    // rapida, la haria mas lenta, porque habria que ir a buscarla antes de
    // pintar nada.
    expect(indexHtml).toMatch(/<div id="operaciones-totales-section" class="content-section active"/);
    expect(registroDeModulos().has('operaciones-totales')).toBe(false);
  });
});

// ─── El ciclo de vida, ejecutado de verdad ──────────────────────────────────
describe('abrir y cerrar un módulo de la subdirección, ejecutando el loader', () => {
  const VERSION = 'v=1';
  const BASE = B + 'sgd-operacional/catalogo-vehiculos';

  let init, destroy;

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="catalogo-vehiculos-section" class="content-section"></div>' +
      '<div id="fauna-section" class="content-section"></div>';

    try { window.sessionStorage.clear(); } catch (_) {}
    window.sessionStorage.setItem('user_role', 'admin');

    window.fetch = () => Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve('<p id="vista-de-catalogo"></p>'),
    });

    const marca = document.createElement('script');
    marca.dataset.moduloSrc = BASE + '/index.js?' + VERSION;
    document.body.appendChild(marca);

    init = jest.fn();
    destroy = jest.fn();
    window.initCatalogoVehiculos = init;
    window.destroyCatalogoVehiculos = destroy;

    delete window.moduleLoader;
    delete window.appPermisos;
    window.eval(leer('core/permissions.js'));
    window.eval(leer('core/module-loader.js'));
  });

  test('abrir inyecta la vista y llama a init()', async () => {
    window.moduleLoader.navegar('catalogo-vehiculos');
    await new Promise((r) => setTimeout(r, 0));

    expect(document.getElementById('vista-de-catalogo')).not.toBeNull();
    expect(init).toHaveBeenCalledTimes(1);
  });

  test('salir hacia Conciliación —que no es modular— llama a destroy()', async () => {
    window.moduleLoader.navegar('catalogo-vehiculos');
    await new Promise((r) => setTimeout(r, 0));

    expect(window.moduleLoader.navegar('conciliacion')).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(window.moduleLoader.activo()).toBe('');
  });

  test('sin sesión no se descarga la vista', () => {
    const pedidas = [];
    window.sessionStorage.clear();
    window.fetch = (url) => { pedidas.push(String(url)); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') }); };
    delete window.moduleLoader;
    delete window.appPermisos;
    window.eval(leer('core/permissions.js'));
    window.eval(leer('core/module-loader.js'));

    window.moduleLoader.abrir('fauna');

    expect(pedidas).toEqual([]);
    expect(document.getElementById('fauna-section').textContent).toContain('Acceso no autorizado');
  });

  test('Análisis de Operaciones declara su extra, y el extra existe', () => {
    // filtros.js era el <script> incrustado que cableaba los botones de filtro.
    const entrada = loaderJs.slice(loaderJs.indexOf("'analisis-operaciones': {"));
    expect(entrada.slice(0, 300)).toContain("extras: ['filtros.js']");
    expect(fs.existsSync(path.join(raiz, B + 'parte-aeronautica/analisis-operaciones/filtros.js'))).toBe(true);
  });
});
