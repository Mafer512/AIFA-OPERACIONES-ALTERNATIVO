/**
 * Pasada de tableta, y las rejillas rígidas de los módulos en teléfono.
 *
 * La pasada móvil anterior se detuvo a propósito en 575.98 px. Entre ese ancho
 * y los 991.98 px a los que se repliega el menú lateral no había casi nada, así
 * que las rejillas pensadas para escritorio —cuatro, cinco y siete columnas— se
 * quedaban con tarjetas de dos dedos de ancho en una tableta.
 *
 * Aquí se fija lo que cubren los apartados 9 y 10 de style.css, y sobre todo
 * dos cosas que se descubrieron escribiéndolos:
 *
 *   · Una regla cuyo selector no existe en el marcado es peor que no tenerla:
 *     hace creer que algo está cubierto cuando no lo está. La primera versión
 *     de esta pasada colgaba el desplazamiento de los calendarios de cuatro
 *     contenedores (.vac-cal, .ca-wrap…) que no existen en ninguna vista.
 *
 *   · Los calendarios NO pueden desplazarse de lado: no tienen un contenedor
 *     propio con overflow-x. Darles un min-width mayor que la pantalla, con el
 *     recorte que ya lleva .main-content, los habría dejado cortados y sin
 *     manera de llegar al resto del mes.
 */

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(raiz, 'style.css'), 'utf8').replace(/\r\n/g, '\n');
const { registroDeModulos } = require('../test-utils/modulos.js');

/** El texto de un apartado numerado de la pasada, hasta el siguiente. */
function apartado(numero) {
  const desde = css.indexOf('── ' + numero + '.');
  if (desde < 0) throw new Error('No se encontró el apartado ' + numero);
  const hasta = css.indexOf('── ' + (numero + 1) + '.', desde);
  const fin = css.indexOf('══════', desde);
  const corte = [hasta, fin].filter((n) => n > desde).sort((a, b) => a - b)[0];
  return css.slice(desde, corte === undefined ? css.length : corte);
}

/** Todo el marcado del que dispone la aplicación: shell, vistas y lo que inyecta el JS. */
function marcadoCompleto() {
  let todo = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  for (const [, base] of registroDeModulos()) {
    const dir = path.join(raiz, base);
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.html') || f.endsWith('.js')) todo += fs.readFileSync(path.join(dir, f), 'utf8');
    }
  }
  return todo + fs.readFileSync(path.join(raiz, 'script.js'), 'utf8');
}

/**
 * Las clases que un bloque de CSS pretende alcanzar.
 *
 * Se descartan los comentarios y el contenido de :not(...): una negación nombra
 * a propósito algo que puede no estar —`:not(.modal-fullscreen)` excluye una
 * clase de Bootstrap que esta aplicación quizá nunca use—, así que exigir que
 * exista sería exigir lo contrario de lo que la regla dice.
 */
function clasesDe(bloque) {
  const fuera = bloque
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/:not\([^)]*\)/g, '');
  return [...new Set([...fuera.matchAll(/\.([a-z][a-z0-9-]{2,})/g)].map((m) => m[1]))];
}

describe('la banda de tableta está cubierta', () => {
  const nueve = apartado(9);

  test('el apartado 9 abre justo donde acaba la pasada de teléfono', () => {
    // Sin el min-width, estas reglas pisarían la pasada de teléfono, que está
    // más afinada y va antes en la hoja.
    expect(nueve).toContain('@media (min-width: 576px) and (max-width: 991.98px)');
  });

  test('las rejillas de cuatro y cinco columnas se reducen, no se aplanan', () => {
    // En una tableta caben dos o tres columnas: dejarlas en una desperdicia
    // media pantalla, que es el defecto contrario al que se venía a corregir.
    expect(nueve).toMatch(/hidra-statgrid[\s\S]{0,200}repeat\(2/);
    expect(nueve).toMatch(/hidra-scada-grid[\s\S]{0,120}repeat\(3/);
  });

  test('las gráficas se miden contra la ventana, no en píxeles de escritorio', () => {
    expect(nueve).toMatch(/chart-host[\s\S]{0,300}clamp\(/);
    expect(nueve).toContain('vh');
  });
});

describe('las rejillas rígidas en teléfono', () => {
  const diez = apartado(10);

  test('el apartado 10 vive en la banda de teléfono', () => {
    expect(diez).toContain('@media (max-width: 575.98px)');
  });

  test('los indicadores se pliegan a dos columnas', () => {
    expect(diez).toMatch(/bhs-cap-metrics[\s\S]{0,200}repeat\(2/);
  });

  test('los calendarios conservan sus siete días', () => {
    // Un mes con tres columnas no es un mes. Ninguna regla de este apartado
    // debe redefinir las columnas de un calendario.
    const CALENDARIOS = ['hidra-daygrid', 'vac-days-grid', 'ca-grid', 'ccal-grid', 'vac-dow-row'];
    for (const c of CALENDARIOS) {
      const i = diez.indexOf('.' + c);
      expect(i).toBeGreaterThan(-1);
      const regla = diez.slice(i, diez.indexOf('}', i));
      expect(regla).not.toContain('grid-template-columns');
    }
  });

  test('y no se les fuerza a ser más anchos que la pantalla', () => {
    // No tienen contenedor propio con overflow-x: un min-width mayor que el
    // ancho útil los dejaría cortados, sin manera de ver el resto del mes.
    const i = diez.indexOf('.content-section .hidra-daygrid,');
    const bloque = diez.slice(i, diez.indexOf('}', i));
    expect(bloque).not.toContain('min-width: 4');
    expect(bloque).not.toContain('min-width: 5');
  });
});

describe('ninguna regla nueva apunta a algo que no existe', () => {
  // Esta es la comprobación que atrapó cuatro contenedores inventados en la
  // primera versión de la pasada. Una regla huérfana no falla ni avisa: deja
  // creer que el caso está cubierto.
  const marcado = marcadoCompleto();

  test.each([9, 10])('cada clase del apartado %i aparece en el marcado', (n) => {
    const huerfanas = clasesDe(apartado(n)).filter((c) => {
      const re = new RegExp('["\'\\s.]' + c.replace(/-/g, '\\-') + '["\'\\s;:,{)]');
      return !re.test(marcado);
    });
    expect(huerfanas).toEqual([]);
  });
});

describe('los módulos no traen rejillas rígidas sin adaptar', () => {
  // Guardia para lo que venga: si mañana un módulo nuevo llega con una rejilla
  // de cuatro columnas fijas y nadie la adapta, esto lo dice.
  const pasada = css.slice(css.indexOf('PASADA MÓVIL'));

  /** Rejillas de 3+ columnas fijas declaradas FUERA de una @media. */
  function rejillasRigidas(estilos) {
    let fuera = '';
    let prof = 0, dentro = false;
    for (let i = 0; i < estilos.length; i++) {
      if (estilos.startsWith('@media', i)) { dentro = true; prof = 0; }
      const c = estilos[i];
      if (dentro) {
        if (c === '{') prof++;
        if (c === '}') { prof--; if (prof === 0) dentro = false; }
        continue;
      }
      fuera += c;
    }
    const salida = [];
    for (const [, sel, cuerpo] of fuera.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const g = cuerpo.match(/grid-template-columns\s*:\s*([^;]+)/);
      if (!g || /auto-fit|auto-fill/.test(g[1])) continue;
      const cols = Number((g[1].match(/repeat\(\s*([0-9]+)/) || [])[1]);
      if (cols >= 3) salida.push({ sel: sel.trim().replace(/\s+/g, ' '), cols });
    }
    return salida;
  }

  const modulos = [...registroDeModulos()];
  const marcado = marcadoCompleto();

  const seUsa = (clase) =>
    new RegExp('["\'\\s]' + clase.replace(/-/g, '\\-') + '["\'\\s]').test(marcado);

  test.each(modulos)('%s tiene atendida cada rejilla rígida de su vista', (clave, base) => {
    const vista = fs.readFileSync(path.join(raiz, base, 'view.html'), 'utf8');
    const estilos = [...vista.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    if (!estilos) return;

    const sinAtender = rejillasRigidas(estilos).filter(({ sel }) => {
      const clases = (sel.match(/\.([a-z][a-z0-9-]+)/g) || []).map((c) => c.slice(1));
      if (!clases.length) return false;

      // Una regla cuyas clases no aparecen en ningún marcado es letra muerta:
      // no hay nada que adaptar. Le pasa a .colab-grid en Colaboradores, que se
      // quedó en la hoja cuando el marcado que la usaba dejó de existir.
      if (!clases.some(seUsa)) return false;

      return !clases.some((c) => pasada.includes(c));
    });

    expect(sinAtender.map((r) => r.cols + ' col: ' + r.sel)).toEqual([]);
  });
});
