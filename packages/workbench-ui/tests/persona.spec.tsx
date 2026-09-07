// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Persona } from '../src/Persona.tsx'
import { sampleBubble } from '../src/bubble.ts'

describe('Persona', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps a hidden identity glyph and switches mood on a bubble face', () => {
    const { rerender } = render(
      <Persona botId="shiren-xiaobei" name="诗人小北" color="#c9a227" emoji="📜" mood="idle" testId="p" />,
    )
    expect(screen.getByTestId('p').textContent).toBe('📜')
    expect(screen.getByTestId('p').getAttribute('data-mood')).toBe('idle')
    rerender(
      <Persona botId="shiren-xiaobei" name="诗人小北" color="#c9a227" emoji="📜" mood="working" testId="p" />,
    )
    expect(screen.getByTestId('p').getAttribute('data-mood')).toBe('working')
  })

  it('falls back to the name initial when there is no emoji', () => {
    render(<Persona botId="dsh-bot" name="DSH Bot" testId="p" />)
    expect(screen.getByTestId('p').textContent).toBe('D')
  })

  it('draws a circle with two mask-hole eyes and no corner badge', () => {
    const { container } = render(
      <Persona botId="dsh-bot" name="DSH Bot" testId="p" />,
    )
    expect(container.querySelectorAll('.personaEye').length).toBe(2)
    expect(container.querySelector('.personaGlyph')).toBeNull()
    expect(container.querySelector('.personaShape')?.tagName.toLowerCase()).toBe('circle')
  })
})

describe('sampleBubble', () => {
  it('is a pure function of time', () => {
    const input = { t: 1.4, mood: 'idle' as const, seed: 0.3 }
    expect(sampleBubble(input)).toEqual(sampleBubble(input))
  })

  it('places two capsule eyes with 3d foreshortening', () => {
    const frame = sampleBubble({ t: 0, mood: 'idle', seed: 0.2, reducedMotion: true })
    const [left, right] = frame.eyes
    expect(left.x).not.toBe(right.x)
    const leftSpan = Math.hypot(left.a, left.b)
    const rightSpan = Math.hypot(right.a, right.b)
    expect(Math.abs(leftSpan - rightSpan)).toBeGreaterThan(0.02)
  })

  it('blinks without floating the body', () => {
    const open = sampleBubble({ t: 0, mood: 'idle', seed: 0.1 })
    let minLid = 1
    for (let t = 0; t < 6; t += 0.02) {
      minLid = Math.min(minLid, sampleBubble({ t, mood: 'idle', seed: 0.1 }).lid)
    }
    expect(open.lid).toBeGreaterThan(0.99)
    expect(minLid).toBeLessThan(0.2)
    expect(open.r).toBe(sampleBubble({ t: 1, mood: 'idle', seed: 0.1 }).r)
    expect(Math.abs(open.breath - 1)).toBeLessThan(0.02)
  })

  it('moves the gaze enough to read at 32px', () => {
    const a = sampleBubble({ t: 0.2, mood: 'idle', seed: 0.4 })
    let maxTravel = 0
    for (let t = 0.2; t < 8; t += 0.05) {
      const b = sampleBubble({ t, mood: 'idle', seed: 0.4 })
      const travel = Math.hypot(b.eyes[0].x - a.eyes[0].x, b.eyes[0].y - a.eyes[0].y)
      if (travel > maxTravel) maxTravel = travel
    }
    expect(maxTravel).toBeGreaterThan(2.4)
  })
})
