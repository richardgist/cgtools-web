import assert from 'node:assert/strict'

const {
  A5_LOW_FRAME_POINTS,
  buildA5LowFrameCaptureCommand,
  buildA5LowFrameCaptureFrameCommand,
  buildA5LowFrameTeleportCommand,
  convertA5PointRotationToForwardVector,
} = await import('../a5LowFramePoints.js')

assert.equal(A5_LOW_FRAME_POINTS.length, 21, 'A5 low-frame preset should contain all 21 points')

assert.equal(
  buildA5LowFrameTeleportCommand(A5_LOW_FRAME_POINTS[0]),
  'ServerCMD TeleportAndRotateTo 164727 91180 1905 0.990737 0.086678 0.104528',
  'pos1 should expose teleport with forward vector converted from Roll/Pitch/Yaw',
)

assert.equal(
  buildA5LowFrameCaptureFrameCommand(A5_LOW_FRAME_POINTS[0]),
  'fa.captureframe pos1',
  'pos1 should expose capture as an independent command',
)

assert.equal(
  buildA5LowFrameCaptureCommand(A5_LOW_FRAME_POINTS[0]),
  [
    'ServerCMD TeleportAndRotateTo 164727 91180 1905 0.990737 0.086678 0.104528',
    'fa.captureframe pos1',
  ].join('\n'),
  'pos1 should teleport first and capture with tag pos1',
)

assert.equal(
  buildA5LowFrameCaptureCommand(A5_LOW_FRAME_POINTS[8]),
  [
    'ServerCMD TeleportAndRotateTo 312800 70204 2853 -0.884365 0.450607 -0.121869',
    'fa.captureframe pos9',
  ].join('\n'),
  'pos9 should convert wrapped pitch and yaw into a forward vector',
)

assert.equal(
  buildA5LowFrameCaptureCommand(A5_LOW_FRAME_POINTS[20]),
  [
    'ServerCMD TeleportAndRotateTo 303006 67397 2919 0.898794 0.438371 0.000000',
    'fa.captureframe pos21',
  ].join('\n'),
  'pos21 should use the final capture tag',
)

assert.deepEqual(
  convertA5PointRotationToForwardVector(A5_LOW_FRAME_POINTS[0]).map((value) => value.toFixed(6)),
  ['0.990737', '0.086678', '0.104528'],
  'point rotation should be interpreted as Roll/Pitch/Yaw and converted to a UE forward vector',
)

for (const [index, point] of A5_LOW_FRAME_POINTS.entries()) {
  assert.equal(point.tag, `pos${index + 1}`)
  assert.match(buildA5LowFrameTeleportCommand(point), /^ServerCMD TeleportAndRotateTo /)
  assert.equal(buildA5LowFrameCaptureFrameCommand(point), `fa.captureframe pos${index + 1}`)
  assert.match(buildA5LowFrameCaptureCommand(point), /^ServerCMD TeleportAndRotateTo .+\nfa\.captureframe pos\d+$/)
}
