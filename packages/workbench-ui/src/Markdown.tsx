/**
 * Chat markdown, DSH-shaped: GFM subset as React nodes, no raw HTML.
 * Links/images must be http(s).
 */
import type { ReactNode } from 'react'

export interface MarkdownProps {
  readonly text: string
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function renderInlines(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`+)([^`]*?)\1|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)|~~(.+?)~~|!\[([^\]]*)\]\((https?:[^)\s]+)\)|\[([^\]]+)\]\((https?:[^)\s]+)\)/gu
  let last = 0
  let n = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) {
      nodes.push(text.slice(last, index))
    }
    const key = `i${n}`
    n += 1
    if (match[2] !== undefined) {
      nodes.push(<code key={key}>{match[2]}</code>)
    } else if (match[3] !== undefined || match[4] !== undefined) {
      nodes.push(<strong key={key}>{match[3] ?? match[4]}</strong>)
    } else if (match[5] !== undefined || match[6] !== undefined) {
      nodes.push(<em key={key}>{match[5] ?? match[6]}</em>)
    } else if (match[7] !== undefined) {
      nodes.push(<del key={key}>{match[7]}</del>)
    } else if (match[9] !== undefined && isHttpUrl(match[9])) {
      nodes.push(<img key={key} src={match[9]} alt={match[8] ?? ''} />)
    } else if (match[11] !== undefined && isHttpUrl(match[11])) {
      nodes.push(
        <a key={key} href={match[11]} target="_blank" rel="noopener noreferrer">
          {match[10] ?? match[11]}
        </a>,
      )
    } else {
      nodes.push(match[0])
    }
    last = index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function fenceLang(line: string): string | undefined {
  const match = /^```([\w.+-]*)\s*$/.exec(line.trim())
  if (match === null) return undefined
  const lang = match[1]
  return lang === '' ? undefined : lang
}

function listKind(line: string): 'ul' | 'ol' | undefined {
  if (/^\s*[-*+]\s+\S/.test(line) || /^\s*[-*+]\s+$/.test(line)) return 'ul'
  if (/^\s*\d+\.\s+/.test(line)) return 'ol'
  return undefined
}

function listItemText(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
}

function heading(line: string): { level: 1 | 2 | 3; text: string } | undefined {
  const match = /^(#{1,3})\s+(.+)$/.exec(line)
  if (match === null) return undefined
  const level = match[1]!.length as 1 | 2 | 3
  return { level, text: match[2]!.trim() }
}

function splitCells(line: string): string[] {
  let raw = line.trim()
  if (raw.startsWith('|')) raw = raw.slice(1)
  if (raw.endsWith('|')) raw = raw.slice(0, -1)
  return raw.split('|').map(cell => cell.trim())
}

function tableAlign(cell: string): 'left' | 'center' | 'right' | undefined {
  const token = cell.replace(/\s+/g, '')
  if (!token.includes('-') || !/^:?-+:?$/.test(token)) return undefined
  const left = token.startsWith(':')
  const right = token.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  return 'left'
}

function isTableSep(line: string): boolean {
  const cells = splitCells(line)
  return cells.length > 0 && cells.every(cell => tableAlign(cell) !== undefined)
}

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('```') || trimmed.startsWith('>')) return false
  if (heading(trimmed) !== undefined) return false
  return trimmed.includes('|')
}

/**
 * DSH-like chat markdown: headings, lists, fences, quotes, hr, inlines.
 */
export function Markdown(props: MarkdownProps) {
  const lines = props.text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let n = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i += 1
      continue
    }
    const key = `b${n}`
    n += 1
    if (/^---+\s*$/.test(line.trim())) {
      blocks.push(<hr key={key} />)
      i += 1
      continue
    }
    const lang = fenceLang(line)
    if (lang !== undefined || line.trim() === '```') {
      const code: string[] = []
      i += 1
      while (i < lines.length && lines[i]!.trim() !== '```') {
        code.push(lines[i]!)
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push(
        <pre key={key} data-lang={lang}>
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }
    const head = heading(line)
    if (head !== undefined) {
      const Tag = (`h${head.level}`) as 'h1' | 'h2' | 'h3'
      blocks.push(<Tag key={key}>{renderInlines(head.text)}</Tag>)
      i += 1
      continue
    }
    if (looksLikeTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1]!)) {
      const header = splitCells(line)
      const aligns = splitCells(lines[i + 1]!).map(tableAlign)
      i += 2
      const body: string[][] = []
      while (i < lines.length && looksLikeTableRow(lines[i]!) && !isTableSep(lines[i]!)) {
        body.push(splitCells(lines[i]!))
        i += 1
      }
      const width = header.length
      const pad = (cells: string[]): string[] => {
        const next = cells.slice(0, width)
        while (next.length < width) next.push('')
        return next
      }
      const styleOf = (index: number): { textAlign: 'left' | 'center' | 'right' } | undefined => {
        const align = aligns[index]
        return align === undefined ? undefined : { textAlign: align }
      }
      blocks.push(
        <div key={key} className="mdTableWrap">
          <table>
            <thead>
              <tr>
                {pad(header).map((cell, index) => (
                  <th key={index} style={styleOf(index)}>{renderInlines(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {pad(row).map((cell, index) => (
                    <td key={index} style={styleOf(index)}>{renderInlines(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    if (line.startsWith('> ')) {
      const quote: string[] = []
      while (i < lines.length && lines[i]!.startsWith('> ')) {
        quote.push(lines[i]!.slice(2))
        i += 1
      }
      blocks.push(<blockquote key={key}>{renderInlines(quote.join('\n'))}</blockquote>)
      continue
    }
    const kind = listKind(line)
    if (kind !== undefined) {
      const items: string[] = []
      while (i < lines.length && listKind(lines[i]!) === kind) {
        items.push(listItemText(lines[i]!))
        i += 1
      }
      const Tag = kind
      blocks.push(
        <Tag key={key}>
          {items.map((item, index) => <li key={index}>{renderInlines(item)}</li>)}
        </Tag>,
      )
      continue
    }
    const para: string[] = []
    while (
      i < lines.length
      && lines[i]!.trim() !== ''
      && fenceLang(lines[i]!) === undefined
      && lines[i]!.trim() !== '```'
      && heading(lines[i]!) === undefined
      && listKind(lines[i]!) === undefined
      && !lines[i]!.startsWith('> ')
      && !/^---+\s*$/.test(lines[i]!.trim())
      && !(looksLikeTableRow(lines[i]!) && i + 1 < lines.length && isTableSep(lines[i + 1]!))
    ) {
      para.push(lines[i]!)
      i += 1
    }
    blocks.push(<p key={key}>{renderInlines(para.join('\n'))}</p>)
  }
  return <div className="md">{blocks}</div>
}
