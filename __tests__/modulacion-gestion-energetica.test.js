/**
 * @jest-environment jsdom
 *
 * Modularización de Gestión Energética (SGE).
 *
 * Los tres módulos —Generación · Energía, Transformación · Mantenimientos B.T.
 * y Transformación · Preventivos Programados— salieron de index.html y de los
 * <script> del pie a /modules/gestion-energetica, y ahora se cargan solo al
 * abrirlos.
 *
 * Estas pruebas documentan el comportamiento que la extracción NO debe cambiar
 * y las garantías nuevas que trae:
 *
 *   • el shell ya no carga su HTML ni su código;
 *   • las claves de sección siguen siendo las mismas (URL y favoritos válidos);
 *   • sin permiso no se descarga la vista, no se evalúa el código y no se
 *     consulta un dato;
 *   • cada módulo se apaga al salir y no deja Chart ni listeners vivos;
 *   • un fallo de un módulo se queda dentro del módulo;
 *   • entrar y salir varias veces no duplica nada.
 */

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

const indexHtml = leer('index.html');
const scriptJs = leer('script.js');
const loaderJs = leer('core/module-loader.js');
const permisosJs = leer('core/permissions.js');

const MODULOS = [
  {
    clave: 'ggen-energia',
    base: 'modules/gestion-energetica/generacion/energia-generacion',
    init: 'initGgenEnergia',
    destroy: 'destroyGgenEnergia',
    tablas: ['ggen_energia_electrica', 'ggen_energia_termica', 'ggen_consumo_gas'],
  },
  {
    clave: 'gtrans-energia',
    base: 'modules/gestion-energetica/transformacion/mantenimientos-bt',
    init: 'initGtransEnergia',
    destroy: 'destroyGtransEnergia',
    tablas: ['gtrans_mantenimientos_bt', 'gtrans_meta_anual'],
  },
  {
    clave: 'gtrans-preventivos',
    base: 'modules/gestion-energetica/transformacion/preventivos-programados',
    init: 'initGtransPreventivos',
    destroy: 'destroyGtransPreventivos',
    tablas: ['gtrans_preventivo_mensual', 'gtrans_equipo_tipo'],
  },
];

describe('el shell ya no carga estos módulos', () => {
  test.each(MODULOS)('index.html no trae el <script> de $clave', ({ base }) => {
    // Antes: <script src="js/ggen-energia.js"> en el pie, descargado siempre.
    expect(indexHtml).not.toContain(`js/${path.basename(base)}.js`);
    expect(indexHtml).not.toContain(`${base}/index.js`);
  });

  test.each(MODULOS)('index.html deja solo el contenedor vacío de $clave', ({ clave }) => {
    expect(indexHtml).toContain(`<div id="${clave}-section" class="content-section" data-modulo="${clave}"></div>`);
  });

  test('los antiguos scripts de Gestión Energética ya no existen en js/', () => {
    ['js/ggen-energia.js', 'js/gtrans-energia.js', 'js/gtrans-preventivos.js']
      .forEach(p => expect(fs.existsSync(path.join(raiz, p))).toBe(false));
  });

  test('el HTML de las tres secciones salió de index.html', () => {
    // Un identificador de dentro de cada vista que ya no debe estar en el shell.
    ['ggen-kpi-generada', 'gtrans-kpi-real', 'gtrans-anio-select']
      .forEach(id => expect(indexHtml).not.toContain(`id="${id}"`));
  });

  test('el shell sí carga el núcleo compartido', () => {
    expect(indexHtml).toContain('core/permissions.js');
    expect(indexHtml).toContain('core/module-loader.js');
  });
});

describe('los archivos del módulo están donde dice el registro', () => {
  test.each(MODULOS)('$clave tiene vista y código', ({ base }) => {
    expect(fs.existsSync(path.join(raiz, base, 'view.html'))).toBe(true);
    expect(fs.existsSync(path.join(raiz, base, 'index.js'))).toBe(true);
  });

  test.each(MODULOS)('la vista de $clave no se envuelve a sí misma en la sección', ({ base }) => {
    // El <div> de sección vive en el shell; la vista es solo su contenido. Si
    // la vista trajera su propio contenedor, quedarían dos anidados y el CSS de
    // .content-section se aplicaría dos veces.
    const vista = leer(path.join(base, 'view.html'));
    expect(vista).not.toContain('class="content-section"');
  });

  test.each(MODULOS)('$clave conserva sus mismas tablas', ({ base, tablas }) => {
    const codigo = leer(path.join(base, 'index.js'));
    tablas.forEach(t => expect(codigo).toContain(`'${t}'`));
  });
});

describe('compatibilidad: nada de fuera cambió de nombre', () => {
  test.each(MODULOS)('$clave conserva su clave de sección', ({ clave }) => {
    // Las URL, los hashes y los favoritos existentes dependen de esta clave.
    expect(indexHtml).toContain(`data-section="${clave}"`);
    expect(loaderJs).toContain(`'${clave}'`);
  });

  test.each(MODULOS)('$clave sigue exponiendo su init global', ({ base, init }) => {
    expect(leer(path.join(base, 'index.js'))).toContain(`window.${init} =`);
  });

  test('el router llama al loader en cada navegación, no solo en estas secciones', () => {
    // navegar() abre si el destino es un módulo y CIERRA el anterior si no lo
    // es. Con un `if (registrado(...))` delante, salir hacia una sección del
    // monolito dejaría el módulo vivo.
    expect(scriptJs).toContain('window.moduleLoader.navegar(targetKey)');
  });

  test('desaparecieron los tres setTimeout(200) que adivinaban el layout', () => {
    expect(scriptJs).not.toContain('window.initGgenEnergia();');
    expect(scriptJs).not.toContain('window.initGtransEnergia();');
    expect(scriptJs).not.toContain('window.initGtransPreventivos();');
  });
});

describe('ciclo de vida: init() y destroy()', () => {
  test.each(MODULOS)('$clave expone destroy()', ({ base, destroy }) => {
    expect(leer(path.join(base, 'index.js'))).toContain(`window.${destroy} = function ()`);
  });

  test.each(MODULOS)('destroy() de $clave libera charts, listeners y permite re-inicializar', ({ base, destroy }) => {
    const codigo = leer(path.join(base, 'index.js'));
    const i = codigo.indexOf(`window.${destroy} = function ()`);
    const cuerpo = codigo.slice(i, i + 500);
    expect(cuerpo).toContain('_ac.abort()');        // listeners
    expect(cuerpo).toContain('c.destroy()');        // Chart.js
    expect(cuerpo).toContain('_initOnce = false');  // volver a entrar re-cablea
  });

  test.each(MODULOS)('todos los listeners de $clave van atados a la señal', ({ base }) => {
    const codigo = leer(path.join(base, 'index.js'));
    const total = (codigo.match(/\.addEventListener\(/g) || []).length;
    const atados = (codigo.match(/\.addEventListener\([^)]*, _ev\)/g) || []).length;
    // Uno suelto basta para que quede colgado del DOM tras salir del módulo.
    expect(atados).toBe(total);
  });

  test('el loader cierra el módulo anterior antes de abrir otro', () => {
    expect(loaderJs).toContain('if (activo && activo !== clave) cerrar(activo);');
  });
});

describe('seguridad', () => {
  test('el permiso se comprueba antes de descargar la vista o el código', () => {
    const i = loaderJs.indexOf('function abrir(clave)');
    const cuerpo = loaderJs.slice(i, loaderJs.indexOf('function cerrar', i));
    const permiso = cuerpo.indexOf('puedeVer(clave)');
    const carga = cuerpo.indexOf('preparar(clave)');
    expect(permiso).toBeGreaterThan(-1);
    expect(carga).toBeGreaterThan(-1);
    // Si se cargara primero, un usuario sin acceso ya habría bajado la vista y
    // ejecutado el código del módulo antes de que nadie le dijera que no.
    expect(permiso).toBeLessThan(carga);
  });

  test('ningún módulo implementa su propia autenticación', () => {
    MODULOS.forEach(({ base }) => {
      const codigo = leer(path.join(base, 'index.js'));
      expect(codigo).toContain('window.appPermisos.puedeEditar');
    });
  });

  test('ningún módulo crea su propio cliente de Supabase', () => {
    MODULOS.forEach(({ base }) => {
      const codigo = leer(path.join(base, 'index.js'));
      expect(codigo).toContain('ensureSupabaseClient');
      expect(codigo).not.toContain('createClient(');
    });
  });

  test('el núcleo no contiene claves ni secretos', () => {
    [loaderJs, permisosJs].forEach(codigo => {
      expect(codigo).not.toMatch(/service_role|SERVICE_ROLE/);
      expect(codigo).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);   // un JWT incrustado
    });
  });

  test('el aviso de error no interpreta HTML', () => {
    // El mensaje puede venir de una respuesta del servidor; pintarlo con
    // innerHTML sería una inyección con pasos de más.
    const i = loaderJs.indexOf('function pintarAviso');
    const cuerpo = loaderJs.slice(i, loaderJs.indexOf('function cargarVista', i));
    expect(cuerpo).toContain('p.textContent = detalle');
    expect(cuerpo).not.toContain('innerHTML = detalle');
  });

  test('el permiso de vista distingue sesión, rol y override por módulo', () => {
    expect(permisosJs).toContain('function puedeVer(clave)');
    expect(permisosJs).toContain('if (!haySesion()) return false;');
  });
});

describe('aislamiento de fallos', () => {
  test('un fallo al cargar deja aviso con reintento y no propaga', () => {
    // Se mira el cuerpo de abrir(), que es donde vive el .catch de la carga.
    const i = loaderJs.indexOf('function abrir(clave)');
    const cuerpo = loaderJs.slice(i, loaderJs.indexOf('function cerrar', i));
    expect(cuerpo).toContain('.catch(');
    expect(cuerpo).toContain('pintarAviso(');
  });

  test('un destroy() que revienta no rompe la navegación', () => {
    const i = loaderJs.indexOf('function cerrar(clave)');
    // Hasta el final real de la funcion, no a tantos caracteres: un comentario
    // nuevo dentro no debe hacer fallar la prueba.
    const cuerpo = loaderJs.slice(i, loaderJs.indexOf('\n    }', i));
    // cerrar() apaga el principal y sus extras; cada uno con su propio try, para
    // que un destroy roto no impida apagar los demas ni corte la navegacion.
    expect(cuerpo).toContain('try { fn(); } catch');
  });

  test('un fallo no se queda cacheado: el reintento vuelve a descargar', () => {
    expect(loaderJs).toContain('cargados.delete(clave)');
  });

  test('el registro de errores no imprime tokens ni datos del usuario', () => {
    const i = loaderJs.indexOf('function registrarFallo');
    const cuerpo = loaderJs.slice(i, i + 300);
    expect(cuerpo).toContain('error.message');
    expect(cuerpo).not.toContain('JSON.stringify');
  });
});

describe('sin duplicados al entrar y salir varias veces', () => {
  test('el script del módulo se inyecta una sola vez', () => {
    expect(loaderJs).toContain('script[data-modulo-src="');
  });

  test('la promesa de carga se reutiliza en vez de relanzarse', () => {
    expect(loaderJs).toContain('if (cargados.has(clave)) return cargados.get(clave);');
  });

  test.each(MODULOS)('$clave sigue teniendo su guarda de cableado idempotente', ({ base }) => {
    const codigo = leer(path.join(base, 'index.js'));
    expect(codigo).toContain('if (_initOnce) return;');
  });
});

// ─── El gate de sesión, ejercitado de verdad ────────────────────────────────
//
// Lo anterior comprueba el CÓDIGO del loader. Esto lo ejecuta.
//
// Salió de un fallo real: la prueba que recorre el menú navegaba sin sesión, el
// loader denegaba el acceso y vaciaba el contenedor —correctamente— y como esa
// ruta no registra console.error, el síntoma era "el botón de la pestaña no
// existe" sin ninguna pista de por qué. Queda fijado para que no vuelva a
// perderse ese comportamiento ni a diagnosticarse a ciegas.
describe('denegar el acceso, ejecutando el loader', () => {
  const cargarLoader = (rol) => {
    document.body.innerHTML = '<div id="ggen-energia-section" class="content-section">contenido previo</div>';
    try { window.sessionStorage.clear(); } catch (_) {}
    if (rol) window.sessionStorage.setItem('user_role', rol);

    const pedidas = [];
    window.fetch = (url) => {
      pedidas.push(String(url));
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<p id="vista-cargada"></p>') });
    };
    delete window.moduleLoader;
    delete window.appPermisos;
    window.eval(permisosJs);
    window.eval(loaderJs);
    return pedidas;
  };

  test('sin sesión no se descarga la vista ni se evalúa el código', () => {
    const pedidas = cargarLoader(null);
    window.moduleLoader.abrir('ggen-energia');

    expect(pedidas).toEqual([]);                       // ni una sola petición
    const cont = document.getElementById('ggen-energia-section');
    expect(cont.textContent).toContain('Acceso no autorizado');
    expect(cont.textContent).not.toContain('contenido previo');
  });

  test('sin sesión no se ofrece reintentar: reintentar no arregla un permiso', () => {
    cargarLoader(null);
    window.moduleLoader.abrir('ggen-energia');
    expect(document.querySelector('#ggen-energia-section button')).toBeNull();
  });

  test('con sesión sí se pide la vista', async () => {
    const pedidas = cargarLoader('admin');
    window.moduleLoader.abrir('ggen-energia');
    await Promise.resolve();

    expect(pedidas.some(u => u.includes('generacion/energia-generacion/view.html'))).toBe(true);
  });

  test('la clave que no es de un módulo se deja pasar al router de siempre', () => {
    cargarLoader('admin');
    expect(window.moduleLoader.abrir('conciliacion')).toBe(false);
    expect(window.moduleLoader.registrado('conciliacion')).toBe(false);
  });
});
