/**
 * Compact bubble-face engine (Bloub-style approach, original numbers).
 * Pure `sample(t)`: circle body, capsule eyes as mask holes, gaze on a
 * sphere, rest life = blink + look wander (no float).
 */
export type PersonaMood = 'idle' | 'thinking' | 'working'

export interface HeadGaze {
  readonly yaw: number
  readonly pitch: number
  readonly roll: number
}

export interface EyePose {
  readonly x: number
  readonly y: number
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly w: number
  readonly h: number
}

export interface BubbleFrame {
  readonly cx: number
  readonly cy: number
  readonly r: number
  readonly breath: number
  readonly lid: number
  readonly eyes: readonly [EyePose, EyePose]
}

export const BUBBLE_CX = 20
export const BUBBLE_CY = 20
export const BUBBLE_R = 16.6

const EYE_SPLIT = 15
const EYE_W = 0.132
const EYE_H = 0.29

type Vec3 = readonly [number, number, number]

function deg(value: number): number {
  return (value * Math.PI) / 180
}

function spin(u: Vec3, v: Vec3, angle: number): [Vec3, Vec3] {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [
    [u[0] * cosine + v[0] * sine, u[1] * cosine + v[1] * sine, u[2] * cosine + v[2] * sine],
    [v[0] * cosine - u[0] * sine, v[1] * cosine - u[1] * sine, v[2] * cosine - u[2] * sine],
  ]
}

function eyePoses(gaze: HeadGaze, scale: number, split: number): [Omit<EyePose, 'w' | 'h'>, Omit<EyePose, 'w' | 'h'>] {
  let forward: Vec3 = [0, 0, 1]
  let right: Vec3 = [1, 0, 0]
  let down: Vec3 = [0, 1, 0]
  ;[forward, right] = spin(forward, right, deg(gaze.yaw))
  ;[down, forward] = spin(down, forward, deg(gaze.pitch))
  ;[right, down] = spin(right, down, deg(gaze.roll))
  const build = (side: number) => {
    const [eyeForward, eyeRight] = spin(forward, right, deg(split * side))
    return {
      x: eyeForward[0] * scale,
      y: eyeForward[1] * scale,
      a: eyeRight[0],
      b: eyeRight[1],
      c: down[0],
      d: down[1],
    }
  }
  return [build(-1), build(1)]
}

export function seedOf(botId: string): number {
  let hash = 2166136261
  for (let i = 0; i < botId.length; i += 1) {
    hash ^= botId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

function loopNoise(t: number, period: number, phase: number): number {
  return Math.sin((t / period) * Math.PI * 2 + phase)
}

function fract(value: number): number {
  return value - Math.floor(value)
}

function hash01(value: number): number {
  return fract(Math.sin(value * 127.1 + 311.7) * 43758.5453)
}

function oneBlink(local: number, start: number, duration: number): number {
  if (local < start || local > start + duration) return 1
  const k = (local - start) / duration
  return k < 0.42 ? 1 - k / 0.42 : (k - 0.42) / 0.58
}

function blinkLid(t: number, seed: number, periodScale: number): number {
  const period = (1.55 + seed * 1.35) * periodScale
  const shift = t + seed * 9.1
  const local = ((shift % period) + period) % period
  const cycle = Math.floor(shift / period)
  const doubled = hash01(cycle + seed * 17) < 0.22
  const primary = oneBlink(local, 0.12, 0.16)
  if (!doubled) return primary
  return Math.min(primary, oneBlink(local, 0.36, 0.14))
}

/** Quick look-away that holds, then eases back. Visible at 24–32px. */
function saccade(t: number, seed: number, intensity: number): HeadGaze {
  if (intensity <= 0) return { yaw: 0, pitch: 0, roll: 0 }
  const period = 1.85 + seed * 1.25
  const shift = t + seed * 4.7
  const local = ((shift % period) + period) % period
  const cycle = Math.floor(shift / period)
  const sign = hash01(cycle + 3.1) < 0.5 ? -1 : 1
  const pitchSign = hash01(cycle + 8.8) < 0.45 ? -1 : 1
  const yawAmt = (11 + hash01(cycle) * 8) * intensity * sign
  const pitchAmt = (5 + hash01(cycle + 1) * 6) * intensity * pitchSign
  const outDur = 0.09
  const hold = 0.38 + hash01(cycle + 2) * 0.22
  const backDur = 0.16
  const start = 0.28
  if (local < start) return { yaw: 0, pitch: 0, roll: 0 }
  const u = local - start
  let k = 0
  if (u < outDur) k = easeOutCubic(u / outDur)
  else if (u < outDur + hold) k = 1
  else if (u < outDur + hold + backDur) k = 1 - easeOutCubic((u - outDur - hold) / backDur)
  else return { yaw: 0, pitch: 0, roll: 0 }
  return { yaw: yawAmt * k, pitch: pitchAmt * k, roll: 3 * intensity * sign * k }
}

function blinkScale(lid: number): number {
  const clamped = lid < 0 ? 0 : lid > 1 ? 1 : lid
  return 0.08 + 0.92 * clamped
}

interface MoodPose {
  readonly gaze: HeadGaze
  readonly split: number
  readonly w: number
  readonly h: number
  readonly wander: number
  readonly saccade: number
  readonly blinkSlow: number
}

const MOODS: Record<PersonaMood, MoodPose> = {
  idle: {
    gaze: { yaw: 18, pitch: 12, roll: -11 },
    split: EYE_SPLIT,
    w: EYE_W,
    h: EYE_H,
    wander: 1,
    saccade: 1,
    blinkSlow: 1,
  },
  thinking: {
    gaze: { yaw: 6, pitch: 28, roll: -9 },
    split: 14.5,
    w: 0.138,
    h: 0.18,
    wander: 0.55,
    saccade: 0.35,
    blinkSlow: 1.25,
  },
  working: {
    gaze: { yaw: 10, pitch: 6, roll: -8 },
    split: 16.2,
    w: 0.148,
    h: 0.32,
    wander: 1.25,
    saccade: 1.35,
    blinkSlow: 0.78,
  },
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpPose(a: MoodPose, b: MoodPose, t: number): MoodPose {
  return {
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    wander: lerp(a.wander, b.wander, t),
    saccade: lerp(a.saccade, b.saccade, t),
    blinkSlow: lerp(a.blinkSlow, b.blinkSlow, t),
  }
}

function easeOutCubic(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return 1 - (1 - x) ** 3
}

export interface SampleInput {
  readonly t: number
  readonly mood: PersonaMood
  readonly seed: number
  readonly fromMood?: PersonaMood
  readonly mix?: number
  readonly reducedMotion?: boolean
}

/**
 * Pose at time `t` (seconds). Same inputs always yield the same frame.
 */
export function sampleBubble(input: SampleInput): BubbleFrame {
  const reduced = input.reducedMotion === true
  const target = MOODS[input.mood]
  const origin = input.fromMood === undefined ? target : MOODS[input.fromMood]
  const mix = input.mix === undefined ? 1 : easeOutCubic(input.mix)
  const pose = lerpPose(origin, target, mix)
  const t = reduced ? 0 : input.t
  const wander = reduced ? 0 : pose.wander
  const phase = input.seed * 6.2
  const dart = reduced ? { yaw: 0, pitch: 0, roll: 0 } : saccade(t, input.seed, pose.saccade)
  const gaze: HeadGaze = {
    yaw: pose.gaze.yaw
      + loopNoise(t, 7.4, phase) * 12 * wander
      + loopNoise(t, 2.9, phase + 1) * 4.5 * wander
      + dart.yaw,
    pitch: pose.gaze.pitch
      + loopNoise(t, 6.2, phase + 2) * 9 * wander
      + loopNoise(t, 3.4, phase + 0.4) * 3.2 * wander
      + dart.pitch,
    roll: pose.gaze.roll
      + loopNoise(t, 9.6, phase + 3) * 5 * wander
      + dart.roll,
  }
  const lid = reduced ? 1 : blinkScale(blinkLid(t, input.seed, pose.blinkSlow))
  const breath = reduced ? 1 : 1 + Math.sin((t / 2.8) * Math.PI * 2) * 0.012
  const [left, right] = eyePoses(gaze, BUBBLE_R, pose.split)
  return {
    cx: BUBBLE_CX,
    cy: BUBBLE_CY,
    r: BUBBLE_R,
    breath,
    lid,
    eyes: [
      { ...left, w: pose.w, h: pose.h },
      { ...right, w: pose.w, h: pose.h },
    ],
  }
}
