'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

// MathLive's LaTeX-to-ASCII converter runs without creating a math field.
globalThis.HTMLElement = class {};
globalThis.MathLive = require('../vendor/mathlive/mathlive.min.js');
const { convertLatexToAsciiMath } = globalThis.MathLive;
for (const script of ['i18n', 'parser', 'expression', 'latex', 'mathfield', 'graph-geometry', 'graph', 'project-file']) {
  require('../js/' + script + '.js');
}
const { math, expr, latex, mathfield, Graph, geometry, i18n, projectFile } = globalThis.Plotsy;
const prepare = (...input) => expr.prepare(input.map((raw, id) => ({ id, raw })));

test('project text round-trips expression options, escapes, and graph settings', () => {
  const project = {
    viewport: { x: -0.25, y: 1e-8, scale: 64 },
    settings: { grid: false, minorGrid: false, axes: false, labels: false, angleMode: 'deg' },
    expressions: [{
      raw: 'a_1 = 1\n"中文"',
      latex: '\\sqrt{2}',
      color: '#2563eb',
      name: 'a_1',
      nameKind: 'parameter',
      hidden: true,
      bounds: { min: '-π', max: '3π' },
      slider: { min: -3, max: 3, step: 0.25 }
    }, { raw: '' }]
  };
  const text = projectFile.encode(project);
  assert.equal(projectFile.extension, '.psy');
  assert.deepEqual(projectFile.decode('\uFEFF' + text.replaceAll('\n', '\r\n'), 100), project);
  assert.deepEqual(projectFile.decode('plotsy 1\n', 100), { settings: {}, expressions: [] });
});

test('project reader rejects malformed records and enforces the expression limit', () => {
  assert.throws(() => projectFile.decode('plotsy 2\n', 100), /版本/u);
  for (const bad of ['unknown x', 'latex "x" "y"', 'color #123', 'slider 0 Infinity 1', 'bounds "x"y', 'latex "\\q"']) {
    assert.throws(() => projectFile.decode('plotsy 1\nexpr "x"\n' + bad, 100), /第 3 行/u);
  }
  assert.throws(() => projectFile.decode('plotsy 1\nexpr "x"\n  hidden\n  hidden\n', 100), /第 4 行/u);
  assert.throws(() => projectFile.decode('plotsy 1\nexpr "x"\nexpr "y"\n', 1), /超过上限/u);
});

test('MathLive restrictions reach the Cartesian plot compiler', () => {
  const input = 'y=x^2\\left\\{0<x<2\\right\\}';
  const raw = mathfield.toInternal(input, convertLatexToAsciiMath(input));
  const { drawables: [curve, region, line, , namedCall] } = prepare(
    raw, 'x^2+y^2<4{y>=0}', 'x=2{-1<y<1}', 'f(x)=x{x>1}', 'y=f(x)+1'
  );
  assert.equal(curve.fn(1), 1);
  assert.ok(Number.isNaN(curve.fn(2)));
  assert.equal(region.fn(0, 1), -3);
  assert.ok(Number.isNaN(region.fn(0, -1)));
  assert.equal(line.fn(2, 0), 0);
  assert.ok(Number.isNaN(line.fn(2, 2)));
  assert.equal(namedCall.fn(2), 3);
  assert.ok(Number.isNaN(namedCall.fn(0)));
  assert.match(latex.toLatex(expr.analyze('f(x)=x{x>1}')), /^f\(x\)\s*=/u);
});

test('loaded parentheses pair within math groups and preserve the expression', () => {
  const source = '\\biggl(\\frac{3}{1.2}x)^2+(3y-(\\frac{3}{1.2}x^2)^{(\\frac{1}{3})})^2=9';
  const paired = latex.pairSavedParentheses(source);
  assert.equal(paired.broken, false);
  assert.equal(
    paired.latex,
    '\\left(\\frac{3}{1.2}x\\right)^2+\\left(3y-\\left(\\frac{3}{1.2}x^2\\right)^{\\left(\\frac{1}{3}\\right)}\\right)^2=9'
  );
  assert.equal(convertLatexToAsciiMath(paired.latex), convertLatexToAsciiMath(source));
  assert.deepEqual(latex.pairSavedParentheses(paired.latex), paired);
  for (const literal of ['\\text{Use (plain text)}', '\\frac{(x+1}{2)}', '\\bigl(x\\bigr)', '\\left|x\\right|']) {
    assert.deepEqual(latex.pairSavedParentheses(literal), { latex: literal, broken: false });
  }
  assert.equal(latex.pairSavedParentheses('\\left(\\frac{3}{1.2}x\\right.)^2').broken, true);
  assert.equal(latex.pairSavedParentheses('\\left(\\frac{3}{1.2}x)^2\\right)').broken, true);
});

test('free slider variables and dependencies work in any order', () => {
  assert.deepEqual(prepare('y=mx+b').results[0].missingVariables, ['m', 'b']);
  const { scope, drawables: [line] } = prepare(
    'a=b+1', 'b=c+1', 'c=d+1', 'd=e_1+1', 'e_1=f+1', 'f=g+1', 'g=h+1', 'h=i+1', 'i=j+1', 'j=1', 'y=ax'
  );
  assert.equal(scope.a, 10);
  assert.equal(line.fn(3), 30);
  assert.equal(Object.keys(prepare('a=b', 'b=a').scope).length, 0);
  const input = latex.toLatex(expr.analyze('a_ab=0.005'));
  assert.equal(expr.analyze(mathfield.toInternal(input, convertLatexToAsciiMath(input))).name, 'a_ab');
});

test('conditional and low-amplitude curves are not misclassified as constants', () => {
  const input = latex.toLatex(expr.analyze('if(x>100,x,0)'));
  const condition = mathfield.toInternal(input, convertLatexToAsciiMath(input));
  const { results, drawables } = prepare(condition, 'sin(x)*1e-12', '2+2', 'diff(5,x)');
  assert.equal(drawables.length, 2);
  assert.equal(drawables[0].fn(101), 101);
  assert.equal(results[2].value, 4);
  assert.equal(results[3].value, 0);
});

test('calculus respects local indices and rejects unsafe integer bounds', () => {
  assert.equal(math.evaluate('sum(i+sum(i,i,1,2),i,1,2)'), 9);
  assert.equal(math.evaluate('sum(sum(i*j,j,1,2),i,1,2)'), 9);
  assert.ok(Number.isNaN(math.evaluate('sum(i,i,1e20,1e20)')));
  const { drawables } = prepare('f(x)=sum(i*x,i,1,3)', 'i=10', 'y=f(i)');
  assert.equal(drawables.at(-1).fn(0), 60);
});

test('named derivatives work and duplicate functions report errors', () => {
  const { drawables } = prepare('f(x)=x^3', "y=f'(x)");
  assert.equal(drawables[1].fn(2), 12);
  assert.equal(prepare('f(x)=x', 'f(x)=x+1', 'y=f(x)').drawables.length, 0);
  assert.match(latex.astToLatex(math.parse("zeta'(x)")), /^\\zeta'/u);
});

test('erf and erfc parse, retain the complementary tail, and support symbolic derivatives', () => {
  const evaluate = (source) => math.compile(math.parse(source))();
  assert.equal(evaluate('erf(0)'), 0);
  assert.equal(evaluate('erfc(0)'), 1);
  assert.ok(Math.abs(evaluate('erf(1)') - 0.8427007929497149) < 2e-15);
  assert.ok(Math.abs(evaluate('erf(-1)') + 0.8427007929497149) < 2e-15);
  assert.ok(Math.abs(evaluate('erfc(-1)') - 1.8427007929497149) < 2e-15);
  const tail = evaluate('erfc(10)');
  assert.ok(Math.abs(tail / 2.0884875837625449e-45 - 1) < 1e-13);
  assert.ok(evaluate('erfc(27.2)') > 0);
  assert.equal(evaluate('erfc(inf)'), 0);
  assert.equal(evaluate('erfc(-inf)'), 2);
  assert.ok(Math.abs(evaluate("erf'(0)") - 2 / Math.sqrt(Math.PI)) < 1e-14);
  const composed = math.compile(math.parse('diff(erfc(2x),x)'));
  assert.ok(Math.abs(composed({ x: 0.5 }) + 4 * Math.exp(-1) / Math.sqrt(Math.PI)) < 1e-14);
  assert.match(latex.astToLatex(math.parse('erfc(x)')), /^\\operatorname\{erfc\}/);
});

test('MathLive error-function operators survive normalization in nested input and bounds', () => {
  const read = (input) => mathfield.toInternal(input, convertLatexToAsciiMath(input));
  const { drawables } = prepare(read('y=2\\left(\\operatorname{erf}x+\\operatorname{erfc}\\left(x\\right)\\right)+x'));
  assert.ok(Math.abs(drawables[0].fn(0.3) - 2.3) < 2e-15);
  const bound = read('\\operatorname{erfc}\\left(0\\right)');
  assert.equal(math.compile(math.parse(bound))(), 1);
  assert.match(read('e\\cdot r\\cdot f\\cdot x'), /e\s*\*\s*r\s*\*\s*f\s*\*\s*x/);
});

test('coordinate tracing uses the plotted curve and leaves gaps unsnapped', () => {
  const graph = Object.create(Graph.prototype);
  graph.w = graph.h = 100;
  const segments = [[{ x: 5, y: 10 }, { x: 25, y: 30 }], [{ x: 45, y: 30 }, { x: 85, y: 10 }]];
  const entry = {
    drawable: { type: 'explicit', id: 'curve' },
    color: '#2563eb',
    edges: geometry.edgesFor(segments, graph.w, graph.h),
    at: ({ a, b }, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  };
  graph.traceEntries = [entry];
  graph.selectedId = null;
  assert.equal(graph.traceAt(15, 20), null);
  graph.selectedId = 'curve';
  assert.deepEqual(graph.traceAt(15, 90), { px: 15, py: 20, color: '#2563eb', showLabel: true });
  assert.equal(graph.traceAt(35, 28), null);
});

function graphInterests(index, ...input) {
  const graph = Object.assign(Object.create(Graph.prototype), { w: 820, h: 630, view: { x: 0, y: 0, scale: 64 } });
  const entries = prepare(...input).drawables.map((drawable) =>
    graph.interactiveEntry(graph.sampleEntry(drawable, graph.w, graph.h))
  );
  return geometry.interests(entries[index], entries, graph.worldToScreen(0, 0), graph.w, graph.h).map((marker) =>
    ({ ...graph.screenToWorld(marker.x, marker.y), kind: marker.kind })
  );
}

function hasMarker(markers, x, y, kind) {
  return markers.some((point) => point.kind === kind && Math.hypot(point.x - x, point.y - y) < 0.002);
}

test('mixed curves share intersection markers and only explicit functions have extrema', () => {
  const curves = ['y=x^2-1', 'x^2+y^2=4', '(t,1)', 'r=3', '(2,3)', 'x=-1'];
  const parabola = graphInterests(0, ...curves);
  assert.ok(hasMarker(parabola, 0, -1, 'minimum'));
  assert.ok(hasMarker(parabola, 1, 0, 'intercept'));
  assert.ok(hasMarker(parabola, Math.sqrt(2), 1, 'intersection'));
  assert.ok(hasMarker(parabola, 1.51749, 1.30278, 'intersection'));
  assert.ok(hasMarker(parabola, 1.83638, 2.37228, 'intersection'));
  assert.ok(hasMarker(parabola, 2, 3, 'intersection'));

  const circle = graphInterests(1, ...curves);
  assert.equal(circle.filter(({ kind }) => kind === 'intercept').length, 4);
  assert.ok(hasMarker(circle, Math.sqrt(3), 1, 'intersection'));
  assert.ok(hasMarker(circle, -1, -Math.sqrt(3), 'intersection'));
  assert.ok(!circle.some(({ kind }) => kind === 'minimum' || kind === 'maximum'));

  const polar = graphInterests(3, ...curves);
  assert.ok(hasMarker(polar, 0, -3, 'intercept'));
  assert.ok(hasMarker(polar, Math.sqrt(8), 1, 'intersection'));
});

test('tangent roots are isolated, while near misses, overlapping curves and poles stay unmarked', () => {
  assert.ok(hasMarker(graphInterests(1, 'y=(x-0.123)^2+1', 'y=1'), 0.123, 1, 'intersection'));
  assert.ok(hasMarker(graphInterests(0, '(x-1)^2+(y-1)^2=4', '(x-5)^2+(y-1)^2=4'), 3, 1, 'intersection'));
  const tangent = ['r=2', '(cos(t)+3*cos(0.4),sin(t)+3*sin(0.4))'];
  for (const selected of [0, 1]) {
    assert.ok(hasMarker(graphInterests(selected, ...tangent), 2 * Math.cos(0.4), 2 * Math.sin(0.4), 'intersection'));
  }
  const same = graphInterests(0, 'r=2', '(2*cos(t),2*sin(t))');
  assert.equal(same.length, 4);
  assert.ok(same.every(({ kind }) => kind === 'intercept'));
  assert.ok(!graphInterests(0, 'r=2', '(cos(t)+3.0001,sin(t))').some(({ kind }) => kind === 'intersection'));
  assert.deepEqual(graphInterests(0, 'y=1/x', 'y=0', 'x=0'), []);
});

test('English localizes labels and interpolated messages', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.t('Plotsy · 图形计算器'), 'Plotsy · Graphing Calculator');
  assert.equal(i18n.t('未定义变量：m, b'), 'Undefined variables: m, b');
  assert.equal(i18n.t('函数 sin 需要1 个参数'), 'sin expects 1 argument(s).');
  i18n.setLanguage('zh-CN');
  assert.equal(i18n.t('滑块'), '滑块');
});
