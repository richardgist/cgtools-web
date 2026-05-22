import { A5_LOW_FRAME_POINTS } from './a5LowFramePoints.js'

export const DEFAULT_CONSOLE_MAP_POINT_PRESET_ID = 'a5-low-frame'

const clonePoint = (point, fallbackIndex) => {
  const coords = Array.isArray(point?.coords)
    ? point.coords.map((value) => Number(value))
    : []
  if (coords.length !== 6 || coords.some((value) => !Number.isFinite(value))) return null

  const index = Number.isFinite(Number(point.index)) && Number(point.index) > 0
    ? Number(point.index)
    : fallbackIndex

  return {
    index,
    tag: String(point.tag || `pos${index}`),
    label: String(point.label || `点位${index}`),
    coords,
  }
}

const createPresetId = (label, usedIds) => {
  const base = String(label || 'map')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'map'
  let id = base
  let suffix = 2
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  return id
}

export const createDefaultConsoleMapPointPresets = () => [{
  id: DEFAULT_CONSOLE_MAP_POINT_PRESET_ID,
  label: 'A5低帧点',
  meta: '21 组 · ServerCMD TeleportAndRotateTo + fa.captureframe pos[1-21]',
  points: A5_LOW_FRAME_POINTS.map((point, index) => clonePoint(point, index + 1)),
}]

export const normalizeConsoleMapPointPresets = (presets) => {
  if (!Array.isArray(presets)) return createDefaultConsoleMapPointPresets()

  const usedIds = new Set()
  const normalized = []
  for (const preset of presets) {
    const points = Array.isArray(preset?.points)
      ? preset.points.map((point, index) => clonePoint(point, index + 1)).filter(Boolean)
      : []
    const label = String(preset.label || '').trim()
    if (!label) continue

    const id = String(preset.id || '').trim() || createPresetId(label, usedIds)
    if (usedIds.has(id)) continue
    usedIds.add(id)

    normalized.push({
      id,
      label,
      meta: String(preset.meta || `${points.length} 组 · ServerCMD TeleportAndRotateTo + fa.captureframe`).trim(),
      points,
    })
  }

  return normalized.length ? normalized : createDefaultConsoleMapPointPresets()
}

const parsePointLabel = (line) => {
  const text = String(line || '')
    .replace(/^\s*[#/]+\s*/, '')
    .trim()
  if (!text || /Pointdata/i.test(text)) return ''

  const withoutIndex = text.replace(/^\d+\s*[:：]?\s*/, '').replace(/[:：]\s*$/, '').trim()
  return withoutIndex || ''
}

export const parseConsoleMapPointText = (text) => {
  const points = []
  let pendingLabel = ''

  for (const line of String(text || '').split(/\r?\n/)) {
    const pointMatch = line.match(/Pointdata\s*=\s*"([^"]+)"/i)
    if (!pointMatch) {
      const label = parsePointLabel(line)
      if (label) pendingLabel = label
      continue
    }

    const coords = pointMatch[1].split(',').map((part) => Number(part.trim()))
    if (coords.length !== 6 || coords.some((value) => !Number.isFinite(value))) {
      pendingLabel = ''
      continue
    }

    const index = points.length + 1
    points.push({
      index,
      tag: `pos${index}`,
      label: pendingLabel || `点位${index}`,
      coords,
    })
    pendingLabel = ''
  }

  return points
}
