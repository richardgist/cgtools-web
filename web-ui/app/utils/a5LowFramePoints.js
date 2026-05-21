export const A5_LOW_FRAME_POINTS = [
  { index: 1, tag: 'pos1', label: '低帧点1', coords: [164727, 91180, 1905, 0, 6, 5] },
  { index: 2, tag: 'pos2', label: '水', coords: [227525, 139456, 3611, 0, 358, 337] },
  { index: 3, tag: 'pos3', label: '低帧点3', coords: [188635, 87538, 1987, 0, 358, 10] },
  { index: 4, tag: 'pos4', label: '低帧点4', coords: [188431, 106206, 1179, 0, 1, 58] },
  { index: 5, tag: 'pos5', label: '低帧点5', coords: [280657, 124802, 2943, 0, 353, 301] },
  { index: 6, tag: 'pos6', label: '低帧点6', coords: [297182, 123234, 1636, 0, 358, 1] },
  { index: 7, tag: 'pos7', label: '低帧点7', coords: [311625, 118323, 2049, 0, 360, 226] },
  { index: 8, tag: 'pos8', label: '低帧点8', coords: [313240, 89474, 1790, 0, 358, 216] },
  { index: 9, tag: 'pos9', label: '低帧点9', coords: [312800, 70204, 2853, 0, 353, 153] },
  { index: 10, tag: 'pos10', label: '低帧点10', coords: [301977, 83441, 2357, 0, 360, 296] },
  { index: 11, tag: 'pos11', label: '低帧点11', coords: [273900, 47126, 3755, 0, 0, 30] },
  { index: 12, tag: 'pos12', label: '低帧点12', coords: [274063, 47726, 3684, 0, 1, 146] },
  { index: 13, tag: 'pos13', label: '低帧点13', coords: [220397, 68305, 703, 0, 4, 38] },
  { index: 14, tag: 'pos14', label: '低帧点14', coords: [220397, 68305, 703, 0, 357, 170] },
  { index: 15, tag: 'pos15', label: '低帧点15', coords: [243414, 125652, 4492, 0, 2, 88] },
  { index: 16, tag: 'pos16', label: '高DC面数', coords: [278420, 145291, 3655, 0, 0, 207] },
  { index: 17, tag: 'pos17', label: '山洞高DC面数', coords: [265090, 93895, 3556, 0, 359, 180] },
  { index: 18, tag: 'pos18', label: '低帧点18', coords: [190552, 146653, 1891, 0, 7, 327] },
  { index: 19, tag: 'pos19', label: '低帧点19', coords: [202390, 144172, 2659, 0, 2, 351] },
  { index: 20, tag: 'pos20', label: '低帧点20', coords: [224626, 146371, 3865, 0, 2, 333] },
  { index: 21, tag: 'pos21', label: '低帧点21', coords: [303006, 67397, 2919, 0, 360, 26] },
]

export const buildA5LowFrameTeleportCommand = (point) => (
  `ServerCMD TeleportAndRotateTo ${point.coords.join(' ')}`
)

export const buildA5LowFrameCaptureCommand = (point) => [
  buildA5LowFrameTeleportCommand(point),
  `fa.captureframe ${point.tag}`,
].join('\n')
