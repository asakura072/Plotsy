/* Screen-space geometry shared by graph selection, tracing, and point finding. */
(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});
  const TILE = 16;
  const CONTACT = 0.8;
  const ROOT_TOLERANCE = 0.015;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const mix = (a, b, t) => a + (b - a) * t;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const along = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), u: mix(a.u, b.u, t) });

  function clip(a, b, width, height) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let start = 0;
    let end = 1;
    for (const [direction, gap] of [[-dx, a.x], [dx, width - a.x], [-dy, a.y], [dy, height - a.y]]) {
      if (direction < 0) start = Math.max(start, gap / direction);
      else if (direction > 0) end = Math.min(end, gap / direction);
      else if (gap < 0) return null;
      if (start > end) return null;
    }
    return { a: start === 0 ? a : along(a, b, start), b: end === 1 ? b : along(a, b, end) };
  }

  function edgesFor(segments, width, height) {
    const edges = [];
    for (const path of segments) {
      for (let i = 1; i < path.length; i += 1) {
        const a = path[i - 1];
        const b = path[i];
        if (a.x === b.x && a.y === b.y) continue;
        if (a.x >= 0 && a.x <= width && b.x >= 0 && b.x <= width &&
            a.y >= 0 && a.y <= height && b.y >= 0 && b.y <= height) {
          edges.push({ a, b });
        } else {
          const edge = clip(a, b, width, height);
          if (edge && (edge.a.x !== edge.b.x || edge.a.y !== edge.b.y)) edges.push(edge);
        }
      }
    }
    return edges;
  }

  function parameterAt(edge, point) {
    const dx = edge.b.x - edge.a.x;
    const dy = edge.b.y - edge.a.y;
    return ((point.x - edge.a.x) * dx + (point.y - edge.a.y) * dy) / (dx * dx + dy * dy);
  }

  function nearest(entry, target, radius = Infinity, alignX = false) {
    if (entry.position) return distance(entry.position, target) <= radius ? entry.position : null;
    let best = null;
    let bestDistance = radius;
    for (const edge of entry.edges) {
      const { a, b } = edge;
      if (alignX && (target.x < a.x || target.x > b.x)) continue;
      const t = alignX ? (target.x - a.x) / (b.x - a.x) : clamp(parameterAt(edge, target), 0, 1);
      const chord = along(a, b, t);
      const separation = distance(chord, target);
      if (separation <= bestDistance) {
        best = { edge, t, chord };
        bestDistance = separation;
      }
    }
    return best && (entry.at(best.edge, best.t) || best.chord);
  }

  function minimize(evaluate, start, end) {
    for (let i = 0; i < 22; i += 1) {
      const a = mix(start, end, 1 / 3);
      const b = mix(start, end, 2 / 3);
      if (evaluate(a) <= evaluate(b)) end = b;
      else start = a;
    }
    return (start + end) / 2;
  }

  function refineRoot(evaluate, start, end, sign) {
    for (let i = 0; i < 24; i += 1) {
      const middle = (start + end) / 2;
      if (Math.sign(evaluate(middle)) === sign) start = middle;
      else end = middle;
    }
    return (start + end) / 2;
  }

  function boundedEdges(entry, box, padding) {
    const [minX, minY, maxX, maxY] = box;
    const candidates = new Set();
    for (let y = Math.floor((minY - padding) / TILE); y <= Math.floor((maxY + padding) / TILE); y += 1) {
      for (let x = Math.floor((minX - padding) / TILE); x <= Math.floor((maxX + padding) / TILE); x += 1) {
        for (const edge of entry.tiles.get(x + ',' + y) || []) candidates.add(edge);
      }
    }
    return candidates;
  }

  function bounds(edge) {
    return [Math.min(edge.a.x, edge.b.x), Math.min(edge.a.y, edge.b.y),
      Math.max(edge.a.x, edge.b.x), Math.max(edge.a.y, edge.b.y)];
  }

  function index(entry) {
    if (entry.tiles) return;
    entry.tiles = new Map();
    for (const edge of entry.edges) {
      const [minX, minY, maxX, maxY] = bounds(edge);
      for (let y = Math.floor(minY / TILE); y <= Math.floor(maxY / TILE); y += 1) {
        for (let x = Math.floor(minX / TILE); x <= Math.floor(maxX / TILE); x += 1) {
          const key = x + ',' + y;
          if (!entry.tiles.has(key)) entry.tiles.set(key, []);
          entry.tiles.get(key).push(edge);
        }
      }
    }
  }

  function nearby(a, b, box) {
    const [minX, minY, maxX, maxY] = box;
    if (Math.min(b.a.x, b.b.x) > maxX + CONTACT || Math.max(b.a.x, b.b.x) < minX - CONTACT ||
        Math.min(b.a.y, b.b.y) > maxY + CONTACT || Math.max(b.a.y, b.b.y) < minY - CONTACT) return false;
    const side = (edge, point) => {
      const dx = edge.b.x - edge.a.x;
      const dy = edge.b.y - edge.a.y;
      return (dx * (point.y - edge.a.y) - dy * (point.x - edge.a.x)) / Math.hypot(dx, dy);
    };
    const onSameSide = (edge, other) => {
      const start = side(edge, other.a);
      const stop = side(edge, other.b);
      return Math.sign(start) === Math.sign(stop) && Math.min(Math.abs(start), Math.abs(stop)) > CONTACT;
    };
    return !onSameSide(a, b) && !onSameSide(b, a);
  }

  function closestOnEdge(entry, edge, target) {
    const pointAt = (t) => entry.at(edge, t);
    let t = clamp(parameterAt(edge, target), 0, 1);
    for (let i = 0; i < 5; i += 1) {
      const center = pointAt(t);
      const left = pointAt(clamp(t - 0.02, 0, 1));
      const right = pointAt(clamp(t + 0.02, 0, 1));
      if (!center || !left || !right) break;
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const length = dx * dx + dy * dy;
      if (!length) break;
      const next = clamp(t + (clamp(t + 0.02, 0, 1) - clamp(t - 0.02, 0, 1)) *
        ((target.x - center.x) * dx + (target.y - center.y) * dy) / length, 0, 1);
      if (Math.abs(next - t) < 1e-8) break;
      t = next;
    }
    return pointAt(t);
  }

  function touches(entry, point, tolerance, candidates) {
    if (entry.residual) return Math.abs(entry.residual(point)) <= tolerance;
    const box = [point.x, point.y, point.x, point.y];
    for (const edge of candidates || boundedEdges(entry, box, CONTACT)) {
      const chord = along(edge.a, edge.b, clamp(parameterAt(edge, point), 0, 1));
      if (distance(point, chord) > CONTACT) continue;
      const exact = closestOnEdge(entry, edge, point);
      if (exact && distance(point, exact) <= tolerance) return true;
    }
    return false;
  }

  function pairContacts(path, edge, other, otherEdge, add) {
    const at = (t) => path.at(edge, t);
    const chord = otherEdge;
    const dx = chord.b.x - chord.a.x;
    const dy = chord.b.y - chord.a.y;
    const length = Math.hypot(dx, dy);
    const residual = (t) => {
      const p = at(t);
      if (!p) return NaN;
      if (other.residual) return other.residual(p);
      const q = closestOnEdge(other, chord, p);
      return q ? (dx * (p.y - q.y) - dy * (p.x - q.x)) / length : NaN;
    };
    const values = [residual(0), residual(0.5), residual(1)];
    if (!values.every(Number.isFinite) || values.every((value) => Math.abs(value) < 1e-8)) return;

    const report = (t) => {
      const value = residual(t);
      if (!(Math.abs(value) <= ROOT_TOLERANCE)) return;
      const point = at(t);
      const projection = along(chord.a, chord.b, clamp(parameterAt(chord, point), 0, 1));
      if (distance(point, projection) > CONTACT * 1.5) return;
      if (!other.residual) {
        const exact = closestOnEdge(other, chord, point);
        if (!exact || distance(point, exact) > 1e-5) return;
        const step = 0.8 / distance(edge.a, edge.b);
        const near = at(t - step);
        const far = at(t + step);
        if (near && far && touches(other, near, 1e-7) && touches(other, far, 1e-7)) return;
      }
      add(point, 'intersection');
    };

    let crossed = false;
    for (let i = 0; i < 2; i += 1) {
      const left = values[i];
      const right = values[i + 1];
      if (Math.abs(left) < 1e-9) report(i / 2);
      if (Math.sign(left) * Math.sign(right) < 0) {
        crossed = true;
        report(refineRoot(residual, i / 2, (i + 1) / 2, Math.sign(left)));
      }
    }
    if (Math.abs(values[2]) < 1e-9) report(1);
    if (!crossed) {
      // A touch need not fall in the middle of a sampled edge.
      const gap = other.residual ? (t) => Math.abs(residual(t)) : (t) => {
        const p = at(t);
        const q = p && closestOnEdge(other, chord, p);
        return q ? distance(p, q) : Infinity;
      };
      const inset = 0.001;
      if (gap(inset) < gap(0) && gap(1 - inset) < gap(1)) {
        const t = minimize(gap, 0, 1);
        if (gap(t) < 1e-6) report(t);
      }
    }
  }

  function intersections(first, second, add) {
    if (first.position || second.position) {
      const pointEntry = first.position ? first : second;
      const other = pointEntry === first ? second : first;
      const point = pointEntry.position;
      const close = nearest(other, point, CONTACT);
      index(other);
      if (close && (other.position ? distance(point, close) <= ROOT_TOLERANCE : touches(other, point, ROOT_TOLERANCE))) add(point, 'intersection');
      return;
    }
    if (!first.residual && !second.residual) {
      // A tangent can sit at an edge endpoint in one sampling direction and
      // inside an edge in the other. Inspect both for parametric paths.
      intersectPaths(first, second, add);
      intersectPaths(second, first, add);
      return;
    }
    // Prefer the side with an equation to evaluate, especially for an implicit
    // contour. Its chords only locate the neighborhood of a possible root.
    const straight = (entry) => ['vertical', 'axis'].includes(entry.drawable.type);
    const [path, other] = first.residual && (!second.residual ||
      (!straight(second) && (straight(first) || first.drawable.type === 'implicit')))
      ? [second, first] : [first, second];
    intersectPaths(path, other, add);
  }

  function intersectPaths(path, other, add) {
    index(other);
    for (const edge of path.edges) {
      const box = bounds(edge);
      const candidates = [...boundedEdges(other, box, CONTACT)].filter((candidate) => nearby(edge, candidate, box));
      if (!other.residual && candidates.length > 1 && [0, 0.5, 1].every((t) => {
        const point = path.at(edge, t);
        return point && touches(other, point, 1e-7, candidates);
      })) continue;
      for (const candidate of candidates) pairContacts(path, edge, other, candidate, add);
    }
  }

  function extrema(entry, add) {
    if (entry.drawable.type !== 'explicit' || (entry.drawable.relation && entry.drawable.relation !== '=')) return;
    for (const path of entry.segments) {
      for (let i = 1; i + 1 < path.length; i += 1) {
        const a = path[i - 1];
        const middle = path[i];
        const b = path[i + 1];
        const rightY = middle.y === b.y ? path[i + 2]?.y : b.y;
        const max = middle.y < a.y && middle.y < rightY;
        const min = middle.y > a.y && middle.y > rightY;
        if (!max && !min) continue;
        const at = (t) => entry.at({ a, b }, t);
        const t = minimize((value) => {
          const point = at(value);
          return point ? point.y * (max ? 1 : -1) : Infinity;
        }, 0, 1);
        const point = at(t);
        if (point) add(point, max ? 'maximum' : 'minimum');
      }
    }
  }

  function interests(selected, entries, origin, width, height) {
    if (!selected) return [];
    const markers = [];
    const add = (point, kind) => {
      if (!(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height)) return;
      if (Math.abs(point.x - origin.x) < 1e-4) point = { ...point, x: origin.x };
      if (Math.abs(point.y - origin.y) < 1e-4) point = { ...point, y: origin.y };
      if (markers.some((marker) => distance(marker, point) < 3)) return;
      markers.push({ x: point.x, y: point.y, kind });
    };
    extrema(selected, add);
    for (const [key, a, b] of [
      ['y', { x: 0, y: origin.y }, { x: width, y: origin.y }],
      ['x', { x: origin.x, y: 0 }, { x: origin.x, y: height }]
    ]) {
      if (origin[key] < 0 || origin[key] > (key === 'x' ? width : height)) continue;
      const axis = {
        drawable: { type: 'axis' },
        edges: [{ a, b }],
        at: (edge, t) => along(edge.a, edge.b, t),
        residual: (point) => point[key] - origin[key]
      };
      intersections(selected, axis, (point) => add({ ...point, [key]: origin[key] }, 'intercept'));
    }
    for (const entry of entries) if (entry !== selected) intersections(selected, entry, add);
    return markers;
  }

  Plotsy.geometry = { edgesFor, nearest, interests };
})(typeof window !== 'undefined' ? window : globalThis);
