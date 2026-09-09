/**
 * @jest-environment node
 *
 * Ningún id se puede repetir en index.html.
 *
 * getElementById devuelve SIEMPRE el primero que aparece en el documento. Si
 * dos secciones distintas usan el mismo id, el código de la segunda manipula en
 * silencio el elemento de la primera: no falla, no avisa, simplemente actúa
 * sobre la pantalla equivocada.
 *
 * Fue exactamente lo que pasó con "ops-filter-year": lo tenían a la vez el
 * selector de año de Análisis de Operaciones y el del modal de filtros de
 * Resumen General. El código de Resumen General hacía
 *
 *     opsFilterYear.classList.toggle('d-none', modo !== 'monthly');
 *
 * sobre el selector de la OTRA sección. Resultado: en Resumen General el
 * selector de año de la vista mensual no aparecía nunca —seguía con su d-none
 * original, que nadie le quitaba— mientras el de Análisis de Operaciones se
 * escondía solo al cambiar de modo en una pantalla que no era la suya.
 */

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const { htmlCompleto, registroDeModulos } = require('../test-utils/modulos.js');

// Con los módulos extraídos, index.html a secas ya no es la página: sus
// secciones son contenedores vacíos que se rellenan al abrirlas. Y como el
// loader deja la vista puesta en el DOM después de la primera visita, dos
// módulos ya abiertos conviven ahí. Un id repetido ENTRE VISTAS es tan dañino
// como uno repetido dentro del shell, así que se comprueba el documento
// compuesto: el shell más las vistas de todos los módulos.
function idsDe(archivo) {
  const html = archivo === 'index.html'
    ? htmlCompleto()
    : fs.readFileSync(path.join(raiz, archivo), 'utf8');
  const cuenta = new Map();
  for (const m of html.matchAll(/\sid="([^"{}$]+)"/g)) {
    cuenta.set(m[1], (cuenta.get(m[1]) || 0) + 1);
  }
  return cuenta;
}

function duplicados(archivo) {
  return [...idsDe(archivo)].filter(([, n]) => n > 1).map(([id, n]) => `${id} (x${n})`);
}

describe('index.html', () => {
  test('no repite ningún id', () => {
    expect(duplicados('index.html')).toEqual([]);
  });

  test('cada selector de año es el de su propia sección', () => {
    const html = htmlCompleto();
    expect(html).toContain('id="aops-filter-year"');   // Análisis de Operaciones
    expect(html).toContain('id="ops-filter-year"');    // modal de Resumen General
  });

  test('Análisis de Operaciones consulta el suyo, no el de Resumen General', () => {
    // Se pregunta al registro del loader dónde vive el módulo en vez de fijar
    // la ruta aquí: si se mueve otra vez, esto le sigue.
    const base = registroDeModulos().get('analisis-operaciones');
    const js = fs.readFileSync(path.join(raiz, base, 'index.js'), 'utf8');
    expect(js).toContain("getElementById('aops-filter-year')");
    expect(js).not.toContain("getElementById('ops-filter-year')");
  });

  test('Resumen General sigue consultando el del modal', () => {
    const js = fs.readFileSync(path.join(raiz, 'script.js'), 'utf8');
    expect(js).toContain("getElementById('ops-filter-year')");
  });
});

describe('las demás páginas tampoco', () => {
  const paginas = ['portal.html', 'parking.html', 'fids-display.html', 'colaborador-registro.html'];
  test.each(paginas.filter((p) => fs.existsSync(path.join(raiz, p))))('%s no repite ids', (p) => {
    expect(duplicados(p)).toEqual([]);
  });
});
