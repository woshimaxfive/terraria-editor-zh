// Browser draft adaptations of the pinned TEdit World.Properties setters (MS-PL).
// These functions use domain values only; file serialization stays in the adapter.
export function worldLayerLimits({ height, layerMargin = 478 }, safe = true) {
  const rock = safe ? Math.max(6, Math.min(height, height - layerMargin)) : height;
  return { surface: Math.max(0, rock - 6), rock };
}

export function editWorldPropertyDraft(values, id, value, limits) {
  const next = { ...values, [id]: value };
  if (typeof value !== 'number' || !Number.isFinite(value)) return next;
  if (/^(tree|cave)Split[0-2]$/.test(id)) {
    const prefix = id.slice(0, -1), index = Number(id.at(-1));
    if (index > 0 && Number.isFinite(values[prefix + (index - 1)])) next[id] = Math.max(next[id], values[prefix + (index - 1)]);
    if (index < 2 && Number.isFinite(values[prefix + (index + 1)])) next[id] = Math.min(next[id], values[prefix + (index + 1)]);
  } else if (id === 'orbCount') next.orbSmashed = value > 0;
  else if (id === 'surfaceLevel' || id === 'rockLevel') {
    Object.assign(next, values);
    const surface = level => {
      if (level < 0) return;
      next.surfaceLevel = Math.min(level, limits.surface);
      if (next.surfaceLevel >= next.rockLevel) rock(next.surfaceLevel + 6);
    };
    const rock = level => {
      if (level < 0) return;
      next.rockLevel = Math.min(level, limits.rock);
      if (next.surfaceLevel >= next.rockLevel) surface(next.rockLevel - 6);
    };
    if (id === 'surfaceLevel') surface(value); else rock(value);
  }
  return next;
}

export function constrainWorldLayers(values, limits) {
  let next = values;
  if (next.surfaceLevel > limits.surface) next = editWorldPropertyDraft(next, 'surfaceLevel', limits.surface, limits);
  if (next.rockLevel > limits.rock) next = editWorldPropertyDraft(next, 'rockLevel', limits.rock, limits);
  return next;
}

export function fixWorldLayerGap(values, limits) {
  const remainder = (values.rockLevel - values.surfaceLevel) % 6;
  if (remainder === 0) return values;
  if (values.rockLevel <= limits.rock - 6) return editWorldPropertyDraft(values, 'rockLevel', values.rockLevel + 6 - remainder, limits);
  if (values.rockLevel >= 12) return editWorldPropertyDraft(values, 'rockLevel', values.rockLevel - remainder, limits);
  if (values.surfaceLevel > 6) return editWorldPropertyDraft(values, 'surfaceLevel', values.surfaceLevel - remainder, limits);
  return editWorldPropertyDraft(values, 'surfaceLevel', values.surfaceLevel + 6 - remainder, limits);
}
