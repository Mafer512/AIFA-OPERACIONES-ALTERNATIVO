/**
 * @jest-environment jsdom
 *
 * Modularización de la Dirección de Operación (DO) — la quinta y última.
 *
 * Tres submódulos y cuatro categorías, pero el peso estaba en una sola:
 * Colaboradores era la sección más grande de la aplicación con diferencia.
 *
 *   · 964 K y 13782 líneas dentro de index.html,
 *   · un <style> de casi 2900 líneas,
 *   · cuatro <script src> metidos DENTRO de la sección —que inyectados con
 *     innerHTML habrían quedado inertes—,
 *   · y un <script> incrustado de 8566 líneas que corría en cada carga.
 *
 * Además hacía una "precarga silenciosa" a los 1500 ms que se traía la
 * plantilla entera de la base, la abriera alguien o no.
 *
 * Esta categoría cierra dos cosas que venían arrastrándose:
 *
 *   1. Los parches a window.showSection. Había cuatro en el proyecto —BHS
 *      Maletas, BHS Estadísticas, Colaboradores y Agenda—, cada uno envolviendo
 *      la función del anterior para enterarse de las entradas a su sección. Con
 *      esta ronda no queda ninguno.
 *
 *   2. La primera extracción de código de DENTRO de script.js. Hasta ahora
 *      siempre se movían archivos enteros; la gestión de permisos de Agenda era
 *      un IIFE cerrado al final del monolito y salió como permisos.js.
 */

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

const indexHtml = leer('index.html');
const scriptJs = leer('script.js');
const loaderJs = leer('core/module-loader.js');
const { registroDeModulos, htmlCompleto } = require('../test-utils/modulos.js');

const B = 'modules/operacion/';

const MODULOS = [
  { clave: 'colaboradores', base: B + 'coord-auditoria/colaboradores', init: 'initColaboradores', destroy: 'destroyColaboradores', sub: 'Coord. Auditoría' },
  { clave: 'coord-auditoria', base: B + 'coord-auditoria/vehiculos', init: 'initVehiculos', destroy: 'destroyVehiculos', sub: 'Coord. Auditoría' },
  { clave: 'muebles-bienes', base: B + 'coord-auditoria/muebles-bienes', init: 'initMueblesBienes', destroy: 'destroyMueblesBienes', sub: 'Coord. Auditoría' },
  { clave: 'agenda', base: B + 'gpyc/agenda-comites', init: 'initAgendaComites', destroy: 'destroyAgendaComites', sub: 'GPyC' },
];

describe('las cuatro categorías salieron del shell', () => {
  test.each(MODULOS)('$clave queda como contenedor vacío', ({ clave }) => {
    expect(indexHtml).toMatch(
      new RegExp('<div id="' + clave + '-section" class="content-section[^"]*" data-modulo="' + clave + '"></div>')
    );
  });

  test.each(MODULOS)('$clave expone init y destroy', ({ base, init, destroy }) => {
    const codigo = leer(path.join(base, 'index.js'));
    expect(codigo).toContain('window.' + init);
    expect(codigo).toContain('window.' + destroy);
  });

  test('ninguno de los cuatro conserva su hook en el router', () => {
    MODULOS.forEach(({ clave }) => {
      expect(scriptJs).not.toContain("targetKey === '" + clave + "'");
    });
  });

  test('los archivos viejos ya no están en js/', () => {
    [
      'js/vehiculos.js', 'js/muebles-bienes.js', 'js/agenda.js', 'js/agenda-assistant.js',
      'js/colaboradores-directory-policy.js', 'js/employee-photo-upload.js',
      'js/employee-document-upload.js', 'js/colab-visor-imagenes.js',
    ].forEach((p) => {
      expect(fs.existsSync(path.join(raiz, p))).toBe(false);
      // Se busca la etiqueta, no la palabra: los comentarios que explican de
      // dónde salió cada módulo deben poder nombrar la ruta antigua.
      expect(indexHtml).not.toContain('<script src="' + p);
    });
  });
});

describe('Colaboradores: la sección más grande de la aplicación', () => {
  const js = () => leer(B + 'coord-auditoria/colaboradores/index.js');
  const vista = () => leer(B + 'coord-auditoria/colaboradores/view.html');

  test('el <script> de 8566 líneas ya no vive en index.html', () => {
    // Se analizaba y ejecutaba en CADA carga de la página.
    expect(indexHtml).not.toContain('_colabBootstrap');
    expect(indexHtml).not.toContain('colabRenderDashboard');
    expect(js()).toContain('colabRenderDashboard');
  });

  test('el <style> de casi 2900 líneas se fue con su vista', () => {
    expect(indexHtml).not.toContain('#colaboradores-section .ctbl');
    expect(vista()).toContain('<style>');
  });

  test('la impresión de la ficha sigue encontrando el <style> dentro de la sección', () => {
    // colabPrepareFichaForPrint lee sectionEl.querySelector('style') para copiar
    // el CSS al documento que manda a la impresora. El <style> viaja dentro de
    // la vista, así que sigue estando donde ese código lo busca.
    expect(js()).toContain("sectionEl.querySelector('style')");
    const compuesto = htmlCompleto();
    const i = compuesto.indexOf('id="colaboradores-section"');
    const j = compuesto.indexOf('<style>', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  test('los cuatro <script src> que estaban dentro de la sección son extras del módulo', () => {
    // Inyectados con innerHTML no se habrían ejecutado nunca: el navegador no
    // corre los <script> que llegan por esa vía. Tienen que pasar por el loader.
    const entrada = loaderJs.slice(loaderJs.indexOf("'colaboradores': {"));
    ['directory-policy.js', 'foto-upload.js', 'documento-upload.js', 'visor-imagenes.js']
      .forEach((f) => {
        expect(entrada.slice(0, 400)).toContain(f);
        expect(fs.existsSync(path.join(raiz, B + 'coord-auditoria/colaboradores', f))).toBe(true);
      });
    expect(vista()).not.toContain('<script');
  });

  test('se acabó la precarga a ciegas de 1500 ms', () => {
    // Si la sección no estaba visible —lo normal— programaba una carga que se
    // traía la plantilla entera de la base, la fuera a abrir alguien o no.
    expect(js()).not.toContain('colabCargarTodos().catch(() => {}), 1500');
    const init = js().slice(js().indexOf('window.initColaboradores'));
    expect(init).toContain('colabRenderDashboard()');
  });

  test('destroy suelta las cuatro gráficas del panel', () => {
    const cuerpo = js().slice(js().indexOf('window.destroyColaboradores'));
    ['cd-chart-dir', 'cd-chart-subdir', 'cd-chart-ger', 'cd-chart-nivel']
      .forEach((id) => expect(cuerpo).toContain(id));
    expect(cuerpo).toContain('Chart.getChart');
  });
});

describe('Muebles y Bienes deja de inventarse su propio hueco', () => {
  const js = () => leer(B + 'coord-auditoria/muebles-bienes/index.js');

  test('el contenedor lo pone el shell, no el JS', () => {
    // Antes lo creaba con insertAdjacentHTML colgándose del padre de la sección
    // de Vehículos: el marcado sólo existía si el archivo se había evaluado, y
    // por eso el archivo tenía que evaluarse siempre.
    expect(js()).not.toContain("insertAdjacentHTML('beforeend', `\n        <div id=\"muebles-bienes-section\"");
    expect(indexHtml).toContain('id="muebles-bienes-section" class="content-section container-fluid" data-modulo="muebles-bienes"');
  });

  test('la plantilla es ahora una vista', () => {
    expect(leer(B + 'coord-auditoria/muebles-bienes/view.html')).toContain('id="mb-family-tabs"');
  });

  test('ensureUI se protege de repetirse', () => {
    // load() la llama en cada carga de datos. Antes eso era inofensivo porque su
    // primera línea comprobaba si ya existía el nodo que ella misma creaba; ahora
    // el contenedor lo pone el shell, así que sin guarda propia apilaría un juego
    // de modales en <body> por cada recarga.
    const codigo = js();
    const i = codigo.indexOf('function ensureUI()');
    const cuerpo = codigo.slice(i, i + 900);
    expect(cuerpo).toContain('if (_uiLista) return;');
    expect(cuerpo).toContain('_uiLista = true;');
  });
});

describe('Agenda: el primer trozo de código sacado de dentro de script.js', () => {
  test('la gestión de permisos ya no está en el monolito', () => {
    // Eran 1088 líneas: un IIFE cerrado al final de script.js que se evaluaba en
    // cada carga de la página.
    expect(scriptJs).not.toContain('window.agInitSection = function');
    expect(leer(B + 'gpyc/agenda-comites/permisos.js')).toContain('window.agInitSection = function');
  });

  test('script.js deja constancia de adónde se fue', () => {
    // Quien vaya a buscarlo ahí debe encontrar el rastro, no un hueco.
    expect(scriptJs).toContain('modules/operacion/gpyc/agenda-comites/permisos.js');
  });

  test('permisos.js y el asistente son extras declarados, en orden', () => {
    // permisos.js define agInitSection, que initAgendaComites llama: tiene que
    // haberse evaluado antes.
    const entrada = loaderJs.slice(loaderJs.indexOf("'agenda': {"));
    expect(entrada.slice(0, 300)).toContain("extras: ['permisos.js', 'asistente.js']");
    ['permisos.js', 'asistente.js'].forEach((f) =>
      expect(fs.existsSync(path.join(raiz, B + 'gpyc/agenda-comites', f))).toBe(true));
  });

  test('el permiso se lee del núcleo de sesión, no se reinventa', () => {
    // Lee el rol para decidir qué botones se ven. Eso NO es una barrera: la
    // protección real son las políticas RLS del servidor.
    const permisos = leer(B + 'gpyc/agenda-comites/permisos.js');
    expect(permisos).toContain("sessionStorage.getItem('user_role')");
    expect(permisos).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(permisos).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
});

describe('se acabaron los parches a window.showSection', () => {
  // Había cuatro en el proyecto, cada uno envolviendo la función del anterior
  // para enterarse de las entradas a su sección. Dependían del orden de carga y
  // del siguiente que quisiera hacer lo mismo.
  test('ningún archivo del proyecto vuelve a envolver el router', () => {
    const sospechosos = [];
    (function recorrer(dir) {
      for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
        const rel = dir + '/' + e.name;
        if (e.name === 'node_modules' || e.name === '.git') continue;
        if (e.isDirectory()) { recorrer(rel); continue; }
        if (!e.name.endsWith('.js')) continue;
        if (leer(rel).includes('window.showSection = function')) sospechosos.push(rel);
      }
    })('js');
    ['modules', 'core'].forEach((d) => {
      (function recorrer(dir) {
        for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
          const rel = dir + '/' + e.name;
          if (e.isDirectory()) { recorrer(rel); continue; }
          if (!e.name.endsWith('.js')) continue;
          if (leer(rel).includes('window.showSection = function')) sospechosos.push(rel);
        }
      })(d);
    });
    expect(sospechosos).toEqual([]);
  });

  test('tampoco quedan sus marcas', () => {
    const marcas = ['__bhsAutoLatestPatched', '__bhsStatsPatched', '_colabPatched', '_agPatched'];
    marcas.forEach((m) => expect(indexHtml).not.toContain(m));
    marcas.forEach((m) => expect(scriptJs).not.toContain(m));
  });
});

// ─── El ciclo de vida, ejecutado de verdad ──────────────────────────────────
describe('abrir y cerrar Colaboradores, ejecutando el loader', () => {
  const VERSION = 'v=1';
  const BASE = B + 'coord-auditoria/colaboradores';

  let init, destroy;

  beforeEach(() => {
    document.body.innerHTML = '<div id="colaboradores-section" class="content-section"></div>';
    try { window.sessionStorage.clear(); } catch (_) {}
    window.sessionStorage.setItem('user_role', 'admin');

    window.fetch = () => Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve('<p id="vista-de-colaboradores"></p>'),
    });

    // El loader no reinyecta un <script> ya marcado: se dejan puestas las marcas
    // del principal y de sus cuatro extras para que su promesa resuelva sin red.
    ['index.js', 'directory-policy.js', 'foto-upload.js', 'documento-upload.js', 'visor-imagenes.js']
      .forEach((f) => {
        const marca = document.createElement('script');
        marca.dataset.moduloSrc = BASE + '/' + f + '?' + VERSION;
        document.body.appendChild(marca);
      });

    init = jest.fn();
    destroy = jest.fn();
    window.initColaboradores = init;
    window.destroyColaboradores = destroy;

    delete window.moduleLoader;
    delete window.appPermisos;
    window.eval(leer('core/permissions.js'));
    window.eval(leer('core/module-loader.js'));
  });

  test('abrir inyecta la vista y llama a init() una sola vez', async () => {
    window.moduleLoader.navegar('colaboradores');
    await new Promise((r) => setTimeout(r, 0));

    expect(document.getElementById('vista-de-colaboradores')).not.toBeNull();
    expect(init).toHaveBeenCalledTimes(1);
  });

  test('salir hacia Conciliación —que no es modular— llama a destroy()', async () => {
    window.moduleLoader.navegar('colaboradores');
    await new Promise((r) => setTimeout(r, 0));

    expect(window.moduleLoader.navegar('conciliacion')).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(window.moduleLoader.activo()).toBe('');
  });

  test('sin sesión no se descarga nada de la sección más pesada', () => {
    const pedidas = [];
    window.sessionStorage.clear();
    window.fetch = (url) => { pedidas.push(String(url)); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') }); };
    delete window.moduleLoader;
    delete window.appPermisos;
    window.eval(leer('core/permissions.js'));
    window.eval(leer('core/module-loader.js'));

    window.moduleLoader.abrir('colaboradores');

    expect(pedidas).toEqual([]);
    expect(document.getElementById('colaboradores-section').textContent)
      .toContain('Acceso no autorizado');
  });
});

describe('el registro y el shell siguen diciendo lo mismo', () => {
  test('cada módulo registrado tiene su contenedor, y al revés', () => {
    const contenedores = [...indexHtml.matchAll(/data-modulo="([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(contenedores.sort()).toEqual([...registroDeModulos().keys()].sort());
  });

  test('las cinco categorías están representadas', () => {
    const raices = new Set([...registroDeModulos().values()].map((b) => b.split('/')[1]));
    expect([...raices].sort()).toEqual([
      'gestion-energetica', 'ingenieria', 'operacion', 'seguridad-operacional', 'servicios-conexos',
    ]);
  });
});
