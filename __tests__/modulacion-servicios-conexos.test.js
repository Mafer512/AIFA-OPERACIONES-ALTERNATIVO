/**
 * @jest-environment jsdom
 *
 * Modularización de Servicios Conexos (SSC).
 *
 * Los tres módulos —Aviación General · Terminal FBO, Carga · Capacidad y
 * Combustibles · Combustible de Aviación— salieron a /modules/servicios-conexos
 * y ahora se cargan sólo al abrirlos.
 *
 * Esta categoría no se parecía a las dos anteriores. Allí cada módulo era un
 * archivo .js suelto que bastaba mover; aquí lo que pesaba estaba incrustado:
 *
 *   • FBO tenía 280 líneas de <style> y un <script> dentro de index.html, que
 *     corría al cargar la página y dejaba dos IntersectionObserver puestos
 *     aunque nadie abriera la sección;
 *   • Combustibles no tenía HTML: se inyectaba a sí mismo desde un template
 *     literal del JS, y pedía su hoja de estilos con un <link> del shell;
 *   • Capacidad de Carga se re-renderizaba desde un listener de clic global
 *     sobre document, porque nadie garantizaba que su init() se llamara.
 *
 * Las tres cosas desaparecen aquí, y estas pruebas las fijan.
 *
 * El último bloque no es de Servicios Conexos: recorre las NUEVE claves del
 * registro. Las garantías del loader valen para cualquier módulo, y sin esto
 * Ingeniería se habría quedado sin comprobar.
 */

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

const indexHtml = leer('index.html');
const scriptJs = leer('script.js');
const loaderJs = leer('core/module-loader.js');
const { registroDeModulos } = require('../test-utils/modulos.js');

const MODULOS = [
  {
    clave: 'aviacion-general-fbo',
    base: 'modules/servicios-conexos/aviacion-general/terminal-fbo',
    init: 'initAviacionGeneralFbo',
    destroy: 'destroyAviacionGeneralFbo',
    scriptViejo: null,                  // no tenía archivo: vivía dentro de index.html
  },
  {
    clave: 'capacidad-carga',
    base: 'modules/servicios-conexos/carga/terminal-capacidad',
    init: 'initCapacidadCarga',
    destroy: 'destroyCapacidadCarga',
    scriptViejo: 'js/capacidad-carga.js',
  },
  {
    clave: 'combustibles',
    base: 'modules/servicios-conexos/combustibles/combustible-aviacion',
    init: 'initCombustibles',
    destroy: 'destroyCombustibles',
    scriptViejo: 'js/combustibles/combustibles.js',
  },
];

describe('el shell ya no carga estos módulos', () => {
  test.each(MODULOS)('index.html deja solo el contenedor vacío de $clave', ({ clave }) => {
    expect(indexHtml).toContain(`<div id="${clave}-section" class="content-section" data-modulo="${clave}"></div>`);
  });

  test('index.html no pide ninguno de los archivos viejos', () => {
    ['js/capacidad-carga.js', 'js/combustibles/combustibles.js', 'js/combustibles/combustibles.css']
      .forEach(p => expect(indexHtml).not.toContain(p));
  });

  test('los archivos viejos ya no existen en js/', () => {
    ['js/capacidad-carga.js', 'js/combustibles/combustibles.js', 'js/combustibles/combustibles.css']
      .forEach(p => expect(fs.existsSync(path.join(raiz, p))).toBe(false));
  });

  test('quitar el <script> de Capacidad no se llevó por delante al vecino', () => {
    // Los dos venían pegados en la MISMA línea del pie:
    //   <script src="js/catalogo-vehiculos.js?v=2"></script>    <script src="js/capacidad-carga.js?v=4"></script>
    // Un recorte por líneas se habría llevado los dos sin decir nada.
    //
    // El vecino, catalogo-vehiculos, tambien salio despues -- pero por la
    // puerta: como modulo registrado, no por un recorte descuidado. Eso es
    // lo que se comprueba ahora, porque su <script> ya no debe existir.
    expect(registroDeModulos().has('catalogo-vehiculos')).toBe(true);
    expect(indexHtml).not.toContain('js/catalogo-vehiculos.js');
  });
});

describe('lo que estaba incrustado en index.html salió de ahí', () => {
  test('el <script> de FBO ya no corre al cargar la página', () => {
    // Registraba dos IntersectionObserver y ponía a reproducir video en cada
    // arranque, abriera alguien la sección o no.
    expect(indexHtml).not.toContain("sec.dataset.agfInit");
    expect(indexHtml).not.toContain('agf-clip-seg');
  });

  test('el <style> de FBO se fue con su vista', () => {
    expect(indexHtml).not.toContain('.agf-hero-video');
    expect(leer('modules/servicios-conexos/aviacion-general/terminal-fbo/view.html'))
      .toContain('.agf-hero-video');
  });

  test('el marcado de FBO, con su modal de video, vive ahora en la vista', () => {
    const vista = leer('modules/servicios-conexos/aviacion-general/terminal-fbo/view.html');
    ['agfVideoModal', 'agfFullVideo'].forEach(id => {
      expect(indexHtml).not.toContain(`id="${id}"`);
      expect(vista).toContain(`id="${id}"`);
    });
  });

  test('el <style> de Capacidad se fue con su vista', () => {
    expect(indexHtml).not.toContain('id="cc-airlines"');
    const vista = leer('modules/servicios-conexos/carga/terminal-capacidad/view.html');
    expect(vista).toContain('id="cc-airlines"');
    expect(vista).toContain('<style>');
  });
});

describe('Combustibles deja de inyectarse a sí mismo', () => {
  const js = () => leer('modules/servicios-conexos/combustibles/combustible-aviacion/index.js');
  const vista = () => leer('modules/servicios-conexos/combustibles/combustible-aviacion/view.html');

  test('la plantilla ya no es un template literal dentro del JS', () => {
    expect(js()).not.toContain('host.innerHTML = `');
  });

  test('el marcado está en la vista', () => {
    ['comb-chart-main', 'comb-edit-tbody', 'comb-status-badge', 'comb-tabbtn-dash']
      .forEach(id => expect(vista()).toContain(`id="${id}"`));
  });

  test('la hoja de estilos viaja dentro de la vista, no como <link> del shell', () => {
    // Un <link> se descarga siempre; dentro de la vista sólo llega al abrir.
    expect(vista()).toContain('<style>');
    expect(vista()).toContain('#combustibles-section .comb-kpi-card');
  });

  test('ensureTemplate ya no pinta: sólo cablea, y una sola vez', () => {
    const codigo = js();
    const i = codigo.indexOf('function ensureTemplate()');
    const cuerpo = codigo.slice(i, codigo.indexOf('\n    }', i));
    expect(cuerpo).toContain('bind()');
    expect(cuerpo).toContain("host.dataset.ready !== '1'");
  });
});

describe('compatibilidad: nada de fuera cambió de nombre', () => {
  test.each(MODULOS)('$clave conserva su clave de sección', ({ clave }) => {
    // De esta clave dependen las URL, los hashes y los favoritos existentes.
    expect(indexHtml).toContain(`data-section="${clave}"`);
    expect(loaderJs).toContain(`'${clave}'`);
  });

  test.each(MODULOS)('$clave expone su init global', ({ base, init }) => {
    expect(leer(path.join(base, 'index.js'))).toContain(`window.${init} =`);
  });

  test('el router ya no avisa por su cuenta a estos dos módulos', () => {
    // 'combustibles:visible' era la forma de despertar a un script que ya
    // estaba cargado; el setTimeout(200) de Capacidad corría contra el layout
    // para que Chart.js encontrara el canvas ya medido. El loader llama a
    // init() cuando la vista está de verdad en el DOM, así que sobran los dos.
    expect(scriptJs).not.toContain('combustibles:visible');
    expect(scriptJs).not.toContain('window.initCapacidadCarga();');
  });

  test('Capacidad ya no se re-renderiza desde un listener global sobre document', () => {
    const codigo = leer('modules/servicios-conexos/carga/terminal-capacidad/index.js');
    expect(codigo).not.toContain('[data-section="capacidad-carga"]');
  });
});

describe('ciclo de vida: lo que cada módulo suelta al salir', () => {
  test.each(MODULOS)('$clave expone destroy()', ({ base, destroy }) => {
    expect(leer(path.join(base, 'index.js'))).toContain(`window.${destroy} = function ()`);
  });

  test('FBO desconecta sus observadores y pausa el video', () => {
    // Aquí no hay Chart.js que liberar: lo que quedaba trabajando con la
    // sección ya oculta eran los dos IntersectionObserver y los <video>.
    const codigo = leer('modules/servicios-conexos/aviacion-general/terminal-fbo/index.js');
    const cuerpo = codigo.slice(codigo.indexOf('window.destroyAviacionGeneralFbo'));
    expect(cuerpo).toContain('desobservar()');
    expect(cuerpo).toContain('v.pause()');
    expect(codigo).toContain('_io.disconnect()');
    expect(codigo).toContain('_co.disconnect()');
  });

  test('Capacidad libera sus dos gráficas y cancela los reajustes pendientes', () => {
    const codigo = leer('modules/servicios-conexos/carga/terminal-capacidad/index.js');
    const cuerpo = codigo.slice(codigo.indexOf('window.destroyCapacidadCarga'));
    expect(cuerpo).toContain("destroy('distrib')");
    expect(cuerpo).toContain("destroy('mars')");
    // Los resize van a 200, 500 y 900 ms. Si alguien sale antes, esos timers
    // despiertan apuntando a gráficas que ya no existen.
    expect(cuerpo).toContain('clearTimeout');
  });

  test('Combustibles libera su gráfica y conserva los datos ya cargados', () => {
    const codigo = leer('modules/servicios-conexos/combustibles/combustible-aviacion/index.js');
    const cuerpo = codigo.slice(codigo.indexOf('window.destroyCombustibles'));
    expect(cuerpo).toContain('destroyChart()');
    // Volver a entrar no debe reconsultar Supabase: para eso está loadAll(true),
    // que es lo que hace el botón de refrescar.
    expect(cuerpo).not.toContain('state.loaded = false');
    expect(cuerpo).not.toContain('state.rows = []');
  });
});

describe('seguridad', () => {
  test('Combustibles sigue usando el cliente compartido de Supabase', () => {
    const codigo = leer('modules/servicios-conexos/combustibles/combustible-aviacion/index.js');
    expect(codigo).toContain('ensureSupabaseClient');
    expect(codigo).not.toContain('createClient(');
  });

  test('ningún módulo de la categoría lleva claves ni tokens', () => {
    MODULOS.forEach(({ base }) => {
      const codigo = leer(path.join(base, 'index.js'));
      expect(codigo).not.toMatch(/service_role|SERVICE_ROLE/);
      expect(codigo).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);   // un JWT incrustado
    });
  });

  test('los dos módulos de contenido fijo no consultan la base', () => {
    // FBO y Capacidad muestran cifras del documento institucional, escritas en
    // el propio módulo. No piden nada, así que tampoco hay permiso que aplicar
    // más allá del puedeVer() del loader.
    ['modules/servicios-conexos/aviacion-general/terminal-fbo',
     'modules/servicios-conexos/carga/terminal-capacidad'].forEach(base => {
      const codigo = leer(path.join(base, 'index.js'));
      expect(codigo).not.toContain('supabase');
      expect(codigo).not.toContain('.from(');
    });
  });

  test('el editor de Combustibles conserva EXACTAMENTE la condición que tenía', () => {
    // Deliberado: sigue siendo window.dataManager.isAdmin y no se cambió por
    // appPermisos.puedeEditar('combustibles'), porque NO son equivalentes.
    //
    //   dataManager.isAdmin -> admin, superadmin, editor, capturista,
    //                          control_fauna, servicio_medico
    //   puedeEditar(clave)  -> admin, superadmin, editor y overrides de sección
    //
    // Cambiarlo le quitaría el editor a los capturistas. Eso es una decisión
    // de permisos, no de modularización, y no se toma al pasar el módulo de
    // sitio. Si algún día se unifica, que sea a propósito y con esta prueba
    // delante. La barrera real, en cualquier caso, es la RLS.
    const codigo = leer('modules/servicios-conexos/combustibles/combustible-aviacion/index.js');
    expect(codigo).toContain('function isAdmin() { return !!(window.dataManager && window.dataManager.isAdmin); }');
  });
});

// ─── Todo el registro, no sólo esta categoría ───────────────────────────────
describe('invariantes que valen para todos los módulos extraídos', () => {
  const registro = [...registroDeModulos()].map(([clave, base]) => ({ clave, base }));

  test('el registro y el shell dicen lo mismo', () => {
    // Antes esto fijaba un numero, y habia que corregirlo en cada categoria
    // nueva. Lo que de verdad importa no es cuantos son, sino que el registro
    // del loader y los contenedores de index.html no se desincronicen: un
    // modulo registrado sin contenedor no abre, y un contenedor sin entrada en
    // el registro se queda vacio para siempre.
    const contenedores = [...indexHtml.matchAll(/data-modulo="([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(contenedores.sort()).toEqual(registro.map((r) => r.clave).sort());
  });

  test.each(registro)('$clave tiene vista y código donde dice el registro', ({ base }) => {
    expect(fs.existsSync(path.join(raiz, base, 'view.html'))).toBe(true);
    expect(fs.existsSync(path.join(raiz, base, 'index.js'))).toBe(true);
  });

  test.each(registro)('el shell deja $clave como contenedor vacío', ({ clave }) => {
    // Algunos contenedores llevan clases extra que la sección ya tenía —
    // Muebles y Bienes es container-fluid, Resumen General era active—, así que
    // se comprueba la forma, no una cadena literal: mismo id, clase
    // content-section, data-modulo con su clave, y vacío.
    expect(indexHtml).toMatch(
      new RegExp('<div id="' + clave + '-section" class="content-section[^"]*" data-modulo="' + clave + '"></div>')
    );
  });

  test.each(registro)('la vista de $clave no se envuelve a sí misma en la sección', ({ base }) => {
    // El <div> de sección lo pone el shell; la vista es sólo su contenido. Si
    // la vista trajera su propio contenedor quedarían dos anidados y el CSS de
    // .content-section se aplicaría dos veces.
    expect(leer(path.join(base, 'view.html'))).not.toContain('class="content-section"');
  });

  test.each(registro)('$clave declara init y destroy, y los dos existen en el código', ({ clave, base }) => {
    const entrada = loaderJs.slice(loaderJs.indexOf(`'${clave}': {`));
    const init = entrada.match(/init:\s*'([^']+)'/)[1];
    const destroy = entrada.match(/destroy:\s*'([^']+)'/)[1];
    const codigo = leer(path.join(base, 'index.js'));
    expect(codigo).toContain(`window.${init} =`);
    expect(codigo).toContain(`window.${destroy} =`);
  });

  test('ninguna sección modular quedó con un hook suelto en el router', () => {
    // El loader es el único que enciende un módulo. Un `if (section === ...)`
    // superviviente lo llamaría por segundo camino, en otro momento y sin
    // garantía de que la vista esté puesta.
    registro.forEach(({ clave }) => {
      expect(scriptJs).not.toContain(`section === '${clave}'`);
    });
  });
});

// ─── El ciclo de vida, ejecutado de verdad ──────────────────────────────────
//
// Lo de arriba lee código. Esto lo corre: se evalúa el loader real dentro de
// jsdom y se comprueba que abrir un módulo llama a su init() y que salir hacia
// otra sección llama a su destroy(). Ese cierre es la diferencia entre liberar
// las gráficas y acumularlas toda la jornada.
describe('abrir y cerrar, ejecutando el loader', () => {
  const VERSION = 'v=1';
  const BASE = 'modules/servicios-conexos/carga/terminal-capacidad';

  let init, destroy;

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="capacidad-carga-section" class="content-section"></div>' +
      '<div id="combustibles-section" class="content-section"></div>';

    try { window.sessionStorage.clear(); } catch (_) {}
    window.sessionStorage.setItem('user_role', 'admin');

    window.fetch = () => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<p id="vista-de-capacidad"></p>'),
    });

    // El loader no vuelve a inyectar un <script> que ya esté marcado. Se deja
    // puesta la marca para que su promesa resuelva sin red, igual que hace la
    // prueba de humo de la página.
    const marca = document.createElement('script');
    marca.dataset.moduloSrc = BASE + '/index.js?' + VERSION;
    document.body.appendChild(marca);

    init = jest.fn();
    destroy = jest.fn();
    window.initCapacidadCarga = init;
    window.destroyCapacidadCarga = destroy;

    delete window.moduleLoader;
    delete window.appPermisos;
    window.eval(leer('core/permissions.js'));
    window.eval(leer('core/module-loader.js'));
  });

  test('abrir el módulo inyecta su vista y llama a init()', async () => {
    window.moduleLoader.navegar('capacidad-carga');
    await new Promise((r) => setTimeout(r, 0));

    expect(document.getElementById('vista-de-capacidad')).not.toBeNull();
    expect(init).toHaveBeenCalledTimes(1);
    expect(window.moduleLoader.activo()).toBe('capacidad-carga');
  });

  test('salir hacia una sección del monolito llama a destroy()', async () => {
    window.moduleLoader.navegar('capacidad-carga');
    await new Promise((r) => setTimeout(r, 0));

    // 'itinerario' no es modular: navegar() devuelve false, pero antes cierra.
    expect(window.moduleLoader.navegar('itinerario')).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(window.moduleLoader.activo()).toBe('');
  });

  test('un destroy() que revienta no impide seguir navegando', async () => {
    window.destroyCapacidadCarga = () => { throw new Error('revienta'); };
    window.moduleLoader.navegar('capacidad-carga');
    await new Promise((r) => setTimeout(r, 0));

    expect(() => window.moduleLoader.navegar('itinerario')).not.toThrow();
    expect(window.moduleLoader.activo()).toBe('');
  });

  test('sin sesión no se pide la vista de un módulo de Servicios Conexos', () => {
    const pedidas = [];
    window.sessionStorage.clear();
    window.fetch = (url) => { pedidas.push(String(url)); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') }); };
    delete window.moduleLoader;
    delete window.appPermisos;
    window.eval(leer('core/permissions.js'));
    window.eval(leer('core/module-loader.js'));

    window.moduleLoader.abrir('combustibles');

    expect(pedidas).toEqual([]);
    expect(document.getElementById('combustibles-section').textContent)
      .toContain('Acceso no autorizado');
  });
});
