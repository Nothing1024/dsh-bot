import ReactMarkdown, { type Components } from 'react-markdown'
import { memo } from 'react'
import remarkGfm from 'remark-gfm'

export interface MarkdownProps {
  readonly text: string
}

function httpUrl(value: string): string {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : ''
  } catch {
    return ''
  }
}

const REMARK_PLUGINS = [remarkGfm]

const COMPONENTS: Components = {
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <>{children}</>,
  img: ({ src, alt }) => src ? <img src={src} alt={alt ?? ''} /> : <>{alt}</>,
  table: ({ children }) => <div className="mdTableWrap"><table>{children}</table></div>,
  th: ({ children, style }) => <th style={style}>{children}</th>,
  td: ({ children, style }) => <td style={style}>{children}</td>,
}

/** 保留完整列表结构；原始 HTML 不作为可执行内容渲染。 */
export const Markdown = memo(function Markdown(props: MarkdownProps) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        skipHtml
        urlTransform={httpUrl}
        components={COMPONENTS}
      >{props.text}</ReactMarkdown>
    </div>
  )
})
