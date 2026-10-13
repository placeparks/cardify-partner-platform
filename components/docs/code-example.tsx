"use client"

import { useId, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import styles from './docs.module.css'

// Highlight text as React nodes. Code examples are never interpreted as HTML.
function highlighted(code: string) {
  return code.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|#[^\n]*|\b(?:const|let|await|async|if|return|throw|new|import|from|true|false|null|None|def)\b|\b\d+\b)/g).map((part, index) => {
    const token = /^(\/\/|#)/.test(part) ? 'comment' : /^["']/.test(part) ? 'string' : /^\d/.test(part) ? 'number' : /^(const|let|await|async|if|return|throw|new|import|from|true|false|null|None|def)$/.test(part) ? 'keyword' : undefined
    return token ? <span key={index} data-token={token}>{part}</span> : part
  })
}

export function CodeExample({ label, children }: { label: string; children: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const code = useRef<HTMLElement>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true); setFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const range = document.createRange()
      if (code.current) { range.selectNodeContents(code.current); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range) }
      setFailed(true)
    }
  }
  return <div className={styles.codeBlock}>
    <div className={styles.codeHeader}><span>{label}</span><button type="button" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? <Check size={14} /> : <Copy size={14} />}<span aria-live="polite">{copied ? 'Copied' : failed ? 'Select & copy' : 'Copy'}</span>
    </button></div>
    <pre tabIndex={0} aria-label={label}><code ref={code}>{highlighted(children)}</code></pre>
  </div>
}

export function CodeTabs({ examples }: { examples: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0)
  const id = useId()
  return <div className={styles.codeTabs}>
    <div role="tablist" aria-label="Example language" className={styles.tabs}>
      {examples.map((example, i) => <button key={example.label} type="button" role="tab" id={`${id}-tab-${i}`} aria-selected={active === i} aria-controls={`${id}-panel`} tabIndex={active === i ? 0 : -1}
        onClick={() => setActive(i)} onKeyDown={event => {
          let next = i
          if (event.key === 'ArrowRight') next = (i + 1) % examples.length
          else if (event.key === 'ArrowLeft') next = (i + examples.length - 1) % examples.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = examples.length - 1
          else return
          event.preventDefault(); setActive(next); document.getElementById(`${id}-tab-${next}`)?.focus()
        }}>{example.label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`}><CodeExample key={active} label={examples[active].label}>{examples[active].code}</CodeExample></div>
  </div>
}
