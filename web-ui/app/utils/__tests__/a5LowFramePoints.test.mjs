import assert from 'node:assert/strict'

const {
  A5_LOW_FRAME_POINTS,
  buildA5LowFrameCaptureCommand,
} = await import('../a5LowFramePoints.js')

assert.equal(A5_LOW_FRAME_POINTS.length, 21, 'A5 low-frame preset should contain all 21 points')

assert.equal(
  buildA5LowFrameCaptureCommand(A5_LOW_FRAME_POINTS[0]),
  [
    'ServerCMD TeleportAndRotateTo 164727 91180 1905 0 6 5',
    'fa.captureframe pos1',
  ].join('\n'),
  'pos1 should teleport first and capture with tag pos1',
)

assert.equal(
  buildA5LowFrameCaptureCommand(A5_LOW_FRAME_POINTS[8]),
  [
    'ServerCMD TeleportAndRotateTo 312800 70204 2853 0 353 153',
    'fa.captureframe pos9',
  ].join('\n'),
  'pos9 should keep the uncommented source point data',
)

assert.equal(
  buildA5LowFrameCaptureCommand(A5_LOW_FRAME_POINTS[20]),
  [
    'ServerCMD TeleportAndRotateTo 303006 67397 2919 0 360 26',
    'fa.captureframe pos21',
  ].join('\n'),
  'pos21 should use the final capture tag',
)

for (const [index, point] of A5_LOW_FRAME_POINTS.entries()) {
  assert.equal(point.tag, `pos${index + 1}`)
  assert.match(buildA5LowFrameCaptureCommand(point), /^ServerCMD TeleportAndRotateTo .+\nfa\.captureframe pos\d+$/)
}
