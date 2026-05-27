import React from 'react'

export function renderMarkdown(raw: string): React.ReactNode {
  const TOKEN = /\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|_([\s\S]+?)_|\*([\s\S]+?)\*/g
  const nodes: React.ReactNode[] = []
  let last = 0
  let key = 0
  const str = raw.replace(/\r\n?/g, '\n').trim()

  const addText = (s: string) => {
    if (!s) return
    s.split('\n').forEach((seg, si) => {
      if (si > 0) nodes.push(<br key={key++} />)
      if (seg) nodes.push(seg)
    })
  }

  let m: RegExpExecArray | null
  while ((m = TOKEN.exec(str)) !== null) {
    addText(str.slice(last, m.index))
    const inner = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
    const Tag: 'strong' | 'em' = (m[1] != null || m[2] != null) ? 'strong' : 'em'
    const innerNodes: React.ReactNode[] = []
    inner.split('\n').forEach((seg, si) => {
      if (si > 0) innerNodes.push(<br key={key++} />)
      if (seg) innerNodes.push(seg)
    })
    nodes.push(<Tag key={key++}>{innerNodes}</Tag>)
    last = m.index + m[0].length
  }
  addText(str.slice(last))
  return nodes
}
