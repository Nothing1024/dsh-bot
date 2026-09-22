// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Markdown } from '../src/Markdown.tsx'

describe('Markdown', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps loose list numbering, non-one starts, and nested content', () => {
    const { container } = render(<Markdown text={'3. 第三项\n\n4. 第四项\n\n   补充段落\n\n   - 子项\n\n5. 第五项'} />)
    const list = container.querySelector('ol')!
    expect(list.getAttribute('start')).toBe('3')
    expect(list.children).toHaveLength(3)
    expect(list.children[1]?.textContent).toContain('补充段落')
    expect(list.children[1]?.querySelector('ul li')?.textContent).toBe('子项')
  })

  it('renders GFM inlines, lists, fences, and http links', () => {
    const { container } = render(
      <Markdown text={'# 标题\n\n一段 **粗** 和 `码`\n\n```ts\nconst x = 1\n```\n\n- a\n- b\n\n[站](https://example.com)\n\n[坏](javascript:alert(1))'} />,
    )
    expect(container.querySelector('h1')?.textContent).toBe('标题')
    expect(container.querySelector('strong')?.textContent).toBe('粗')
    expect(container.querySelector('pre code')?.textContent).toBe('const x = 1\n')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    const hrefs = [...container.querySelectorAll('a')].map(node => node.getAttribute('href'))
    expect(hrefs).toEqual(['https://example.com'])
    expect(container.textContent).toMatch(/坏/)
  })

  it('renders a GFM table with alignment', () => {
    const { container } = render(
      <Markdown
        text={[
          '| 名称 | 数量 | 备注 |',
          '| :--- | ---: | :---: |',
          '| 苹果 | 3 | **红** |',
          '| 梨 | 12 | `鲜` |',
        ].join('\n')}
      />,
    )
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect([...table!.querySelectorAll('th')].map(node => node.textContent)).toEqual(['名称', '数量', '备注'])
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(table!.querySelector('strong')?.textContent).toBe('红')
    expect(table!.querySelector('code')?.textContent).toBe('鲜')
    const aligns = [...table!.querySelectorAll('th')].map(node => node.style.textAlign)
    expect(aligns).toEqual(['left', 'right', 'center'])
  })
})
