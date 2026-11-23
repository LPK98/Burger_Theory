import { cn } from '../lib/utils'

interface SplitLinesProps {
  lines: string[]
  as?: 'h1' | 'h2' | 'h3' | 'p'
  id?: string
  className?: string
  lineClassName?: string
}

/**
 * A headline split into hand-set lines. Each line sits in a clipping mask so its
 * inner span (`[data-line]`) can slide up into view. Screen readers get one sentence.
 */
export function SplitLines({ lines, as: Tag = 'h2', id, className, lineClassName }: SplitLinesProps) {
  return (
    <Tag id={id} className={className}>
      {lines.map((line, i) => (
        <span key={line} className={cn('line-mask', lineClassName)}>
          <span className="line-inner" data-line>
            {line}
          </span>
          {i < lines.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  )
}
