/**
 * Cute color-bubble face. Circle body + capsule eyes punched as mask holes.
 * Rest life is gaze drift and blinking. The rAF loop writes SVG attributes
 * directly so React does not reconcile a mask 60 times a second.
 */
import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { hashAvatarColor, nameInitial } from './avatar.ts'
import { sampleBubble, seedOf, type BubbleFrame, type PersonaMood } from './bubble.ts'

export type { PersonaMood }
export type PersonaSize = 'sm' | 'md' | 'lg'

export interface PersonaProps {
  readonly botId: string
  readonly name: string
  readonly color?: string
  readonly emoji?: string
  readonly size?: PersonaSize
  readonly mood?: PersonaMood
  readonly testId?: string
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function parseHex(hex: string): readonly [number, number, number] | undefined {
  const raw = hex.trim().replace('#', '')
  if (raw.length === 3 && /^[0-9a-f]+$/i.test(raw)) {
    return [
      Number.parseInt(raw[0]! + raw[0], 16),
      Number.parseInt(raw[1]! + raw[1], 16),
      Number.parseInt(raw[2]! + raw[2], 16),
    ]
  }
  if (raw.length === 6 && /^[0-9a-f]+$/i.test(raw)) {
    return [
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
    ]
  }
  return undefined
}

function mixHex(hex: string, toward: number, amount: number): string {
  const rgb = parseHex(hex) ?? [91, 141, 239]
  const mixed = rgb.map(channel => clampByte(channel + (toward - channel) * amount))
  return `#${mixed.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}

function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function q(value: number, steps = 4): number {
  return Math.round(value * steps) / steps
}

function eyeTransform(
  eye: BubbleFrame['eyes'][number],
  cx: number,
  cy: number,
  lid: number,
): string {
  const ex = q(cx + eye.x)
  const ey = q(cy + eye.y)
  const lidQ = q(lid, 20)
  return `translate(${ex} ${ey}) scale(1 ${lidQ}) matrix(${q(eye.a)} ${q(eye.b)} ${q(eye.c)} ${q(eye.d)} 0 0)`
}

function applyEye(
  node: SVGEllipseElement | null,
  eye: BubbleFrame['eyes'][number],
  frame: BubbleFrame,
): void {
  if (node === null) return
  node.setAttribute('rx', String(q(eye.w * frame.r, 10)))
  node.setAttribute('ry', String(q(eye.h * frame.r, 10)))
  node.setAttribute('transform', eyeTransform(eye, frame.cx, frame.cy, frame.lid))
}

function applyBubbleFrame(
  body: SVGGElement | null,
  left: SVGEllipseElement | null,
  right: SVGEllipseElement | null,
  frame: BubbleFrame,
  lastKey: { current: string },
): void {
  const breath = q(frame.breath, 80)
  const key = `${eyeTransform(frame.eyes[0]!, frame.cx, frame.cy, frame.lid)}|${eyeTransform(frame.eyes[1]!, frame.cx, frame.cy, frame.lid)}|${breath}`
  if (lastKey.current === key) return
  lastKey.current = key
  if (body !== null) {
    body.setAttribute(
      'transform',
      `translate(${frame.cx} ${frame.cy}) scale(1 ${breath}) translate(${-frame.cx} ${-frame.cy})`,
    )
  }
  applyEye(left, frame.eyes[0]!, frame)
  applyEye(right, frame.eyes[1]!, frame)
}

/**
 * 24/32/40px color-bubble face.
 */
export function Persona(props: PersonaProps) {
  const color = props.color !== undefined && props.color !== ''
    ? props.color
    : hashAvatarColor(props.botId)
  const glyph = props.emoji !== undefined && props.emoji !== ''
    ? props.emoji
    : nameInitial(props.name)
  const size = props.size ?? 'md'
  const mood = props.mood ?? 'idle'
  const testId = props.testId ?? `persona-${props.botId}`
  const seed = seedOf(props.botId)
  const uid = useId().replace(/:/g, '')
  const light = mixHex(color, 255, 0.22)
  const dark = mixHex(color, 12, 0.3)
  const bodyRef = useRef<SVGGElement>(null)
  const leftRef = useRef<SVGEllipseElement>(null)
  const rightRef = useRef<SVGEllipseElement>(null)
  const lastKey = useRef('')
  const clock = useRef(0)
  const fromMood = useRef(mood)
  const shownMood = useRef(mood)
  const mixAt = useRef(0)
  const moodRef = useRef(mood)
  moodRef.current = mood

  useEffect(() => {
    fromMood.current = shownMood.current
    shownMood.current = mood
    mixAt.current = clock.current
  }, [mood])

  useLayoutEffect(() => {
    applyBubbleFrame(
      bodyRef.current,
      leftRef.current,
      rightRef.current,
      sampleBubble({ t: 0, mood, seed, reducedMotion: true }),
      lastKey,
    )
  }, [mood, seed])

  useEffect(() => {
    if (reducedMotion()) return
    let raf = 0
    let last = 0
    let lastApply = 0
    const tick = (ms: number): void => {
      raf = requestAnimationFrame(tick)
      const dt = last === 0 ? 0 : Math.min((ms - last) / 1000, 0.064)
      last = ms
      clock.current += dt
      const t = clock.current
      const frame = sampleBubble({
        t,
        mood: moodRef.current,
        seed,
        fromMood: fromMood.current,
        mix: (t - mixAt.current) / 0.28,
      })
      const blinking = frame.lid < 0.97
      if (!blinking && ms - lastApply < 90) return
      lastApply = ms
      applyBubbleFrame(
        bodyRef.current,
        leftRef.current,
        rightRef.current,
        frame,
        lastKey,
      )
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seed])

  return (
    <span
      className={`persona ${size}`}
      data-mood={mood}
      data-testid={testId}
      title={props.name}
      aria-hidden="true"
    >
      <svg className="personaBody" viewBox="0 0 40 40" focusable="false">
        <defs>
          <linearGradient id={`pb-${uid}`} x1="0.2" y1="0.05" x2="0.85" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
          <mask id={`pm-${uid}`} maskUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="16.6" fill="#fff" />
            <g fill="#000">
              <ellipse className="personaEye" ref={leftRef} />
              <ellipse className="personaEye" ref={rightRef} />
            </g>
          </mask>
        </defs>
        <g ref={bodyRef}>
          <circle
            className="personaShape"
            cx="20"
            cy="20"
            r="16.6"
            fill={`url(#pb-${uid})`}
            mask={`url(#pm-${uid})`}
          />
        </g>
      </svg>
      <span className="visuallyHidden">{glyph}</span>
    </span>
  )
}
