/**
 * Cute color-bubble face. Circle body + capsule eyes punched as mask holes.
 * Rest life is gaze drift and blinking (Bloub approach; original numbers).
 */
import { useEffect, useId, useRef, useState } from 'react'
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

function useBubbleFrame(mood: PersonaMood, seed: number): BubbleFrame {
  const clock = useRef(0)
  const fromMood = useRef(mood)
  const shownMood = useRef(mood)
  const mixAt = useRef(0)
  const [frame, setFrame] = useState<BubbleFrame>(() => (
    sampleBubble({ t: 0, mood, seed, reducedMotion: true })
  ))

  useEffect(() => {
    fromMood.current = shownMood.current
    shownMood.current = mood
    mixAt.current = clock.current
  }, [mood])

  useEffect(() => {
    if (reducedMotion()) {
      setFrame(sampleBubble({ t: 0, mood, seed, reducedMotion: true }))
      return
    }
    let raf = 0
    let last = 0
    const tick = (ms: number): void => {
      raf = requestAnimationFrame(tick)
      const dt = last === 0 ? 0 : Math.min((ms - last) / 1000, 0.064)
      last = ms
      clock.current += dt
      const t = clock.current
      setFrame(sampleBubble({
        t,
        mood,
        seed,
        fromMood: fromMood.current,
        mix: (t - mixAt.current) / 0.28,
      }))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mood, seed])

  return frame
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
  const frame = useBubbleFrame(mood, seed)
  const light = mixHex(color, 255, 0.22)
  const dark = mixHex(color, 12, 0.3)
  const [left, right] = frame.eyes
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
            <circle cx={frame.cx} cy={frame.cy} r={frame.r} fill="#fff" />
            <g fill="#000">
              <EyeHole eye={left} cx={frame.cx} cy={frame.cy} r={frame.r} lid={frame.lid} />
              <EyeHole eye={right} cx={frame.cx} cy={frame.cy} r={frame.r} lid={frame.lid} />
            </g>
          </mask>
        </defs>
        <g transform={`translate(${frame.cx} ${frame.cy}) scale(1 ${frame.breath}) translate(${-frame.cx} ${-frame.cy})`}>
          <circle
            className="personaShape"
            cx={frame.cx}
            cy={frame.cy}
            r={frame.r}
            fill={`url(#pb-${uid})`}
            mask={`url(#pm-${uid})`}
          />
        </g>
      </svg>
      <span className="visuallyHidden">{glyph}</span>
    </span>
  )
}

function EyeHole(props: {
  readonly eye: { readonly x: number; readonly y: number; readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly w: number; readonly h: number }
  readonly cx: number
  readonly cy: number
  readonly r: number
  readonly lid: number
}) {
  const ex = props.cx + props.eye.x
  const ey = props.cy + props.eye.y
  return (
    <ellipse
      className="personaEye"
      rx={props.eye.w * props.r}
      ry={props.eye.h * props.r}
      transform={`translate(${ex} ${ey}) scale(1 ${props.lid}) matrix(${props.eye.a} ${props.eye.b} ${props.eye.c} ${props.eye.d} 0 0)`}
    />
  )
}
