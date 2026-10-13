"use client"

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Braces, ChevronRight, FileJson, Menu, Search, X } from 'lucide-react'
import styles from './docs.module.css'

export type DocsTopic = { id: string; title: string; group: string; description: string; keywords?: string; method?: string; content: ReactNode }

export function DocsShell({ topics, baseUrl }: { topics: DocsTopic[]; baseUrl: string }) {
  const [active, setActive] = useState('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [toc, setToc] = useState<{ id: string; label: string }[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  const article = useRef<HTMLElement>(null)
  const topic = topics.find(item => item.id === active) || topics[0]
  const index = topics.indexOf(topic)
  const groups = Array.from(new Set(topics.map(item => item.group)))
  const results = topics.filter(item => query.toLowerCase().trim().split(/\s+/).every(word => `${item.title} ${item.description} ${item.keywords || ''} ${item.group}`.toLowerCase().includes(word)))

  useEffect(() => {
    function readHash() {
      let hash = window.location.hash.slice(1)
      try { hash = decodeURIComponent(hash) } catch { /* Ignore malformed fragments. */ }
      const id = hash === 'api-base' ? 'overview' : hash.split('--')[0]
      if (!id) setActive('overview')
      else if (topics.some(item => item.id === id)) setActive(id)
      setMenuOpen(false)
    }
    readHash(); window.addEventListener('hashchange', readHash)
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); dialog.current?.showModal() }
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', shortcut)
    return () => { window.removeEventListener('hashchange', readHash); window.removeEventListener('keydown', shortcut) }
  }, [topics])

  useEffect(() => {
    document.title = `${topic.title} · TCGPlaytest Docs`
    const headings = Array.from(article.current?.querySelectorAll<HTMLElement>('h2, h3') || []).filter(el => getComputedStyle(el).display !== 'none')
    headings.forEach((heading, i) => { if (!heading.id) heading.id = `${active}--section-${i}` })
    setToc(headings.map(heading => ({ id: heading.id, label: heading.textContent || '' })))
    const anchor = window.location.hash.slice(1)
    if (anchor.includes('--') || anchor === 'api-base') document.getElementById(anchor)?.scrollIntoView()
    else window.scrollTo({ top: 0, behavior: 'instant' })
  }, [active, topic.title])

  function choose(id: string) {
    setActive(id); setMenuOpen(false); dialog.current?.close()
    if (window.location.hash === `#${id}`) window.scrollTo({ top: 0, behavior: 'instant' })
  }

  return <div className={styles.shell}>
    <a href="#docs-content" className={styles.skip}>Skip to content</a>
    <header className={styles.header}>
      <a className={styles.brand} href="/docs"><img src="/logo-word.svg" width="49" height="32" alt="" /><strong>TCGPlaytest</strong><span>docs</span></a>
      <button type="button" aria-label="Search documentation" className={styles.searchTrigger} onClick={() => dialog.current?.showModal()}><Search size={16} /><span>Find a guide or endpoint…</span><kbd>Ctrl K</kbd></button>
      <a href="/dashboard" className={styles.dashboard}>Dashboard <ArrowRight size={15} /></a>
      <button type="button" className={styles.mobileMenu} aria-label={menuOpen ? 'Close documentation menu' : 'Open documentation menu'} aria-expanded={menuOpen} aria-controls="docs-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
    </header>
    <div className={styles.layout}>
      <aside id="docs-navigation" className={`${styles.sidebar} ${menuOpen ? styles.menuOpen : ''}`}>
        <div className={styles.sidebarTitle}><BookOpen size={16} /> Developer documentation <span>v1</span></div>
        <nav aria-label="Documentation topics">{groups.map(group => <div className={styles.navGroup} key={group}>
          <p>{group}</p>{topics.filter(item => item.group === group).map(item => <a href={`#${item.id}`} key={item.id} aria-current={active === item.id ? 'page' : undefined} onClick={() => choose(item.id)}>
            {item.method && <span className={styles.method} data-method={item.method}>{item.method}</span>}{item.title}
          </a>)}
        </div>)}</nav>
        <div className={styles.resources}><a href="/openapi.json"><FileJson size={16} />OpenAPI specification</a><a href="/llms.txt"><Braces size={16} />Docs for AI agents</a></div>
      </aside>
      {menuOpen && <button type="button" aria-label="Close documentation menu" className={styles.backdrop} onClick={() => setMenuOpen(false)} />}
      <div className={styles.readingArea}>
        <article id="docs-content" ref={article} tabIndex={-1} className={styles.article} key={topic.id}>
          <div className={styles.breadcrumb}>Documentation <ChevronRight size={13} /> {topic.group}</div>
          {active !== 'overview' && <div className={styles.pageIntro}><span className={styles.eyebrow}>{topic.method ? 'API reference' : topic.group}</span><h1>{topic.title}</h1><p>{topic.description}</p></div>}
          <div className={styles.content}>{topic.content}</div>
          <footer className={styles.pagination}>
            {index > 0 ? <a href={`#${topics[index - 1].id}`} onClick={() => choose(topics[index - 1].id)}><ArrowLeft size={16} /><span><small>Previous</small>{topics[index - 1].title}</span></a> : <span />}
            {index < topics.length - 1 && <a href={`#${topics[index + 1].id}`} onClick={() => choose(topics[index + 1].id)}><span><small>Next</small>{topics[index + 1].title}</span><ArrowRight size={16} /></a>}
          </footer>
          <p className={styles.footer}><a href="https://www.tcgplaytest.com/">TCGPlaytest · Cardify LLC</a> <a href="/terms">Partner terms</a></p>
        </article>
        <aside className={styles.rightRail} aria-label="On this page">
          <p>ON THIS PAGE</p>
          {toc.length ? toc.map(item => <a key={item.id} href={`#${item.id}`}>{item.label}</a>) : <a href={`#${topic.id}`} onClick={() => choose(topic.id)}>{topic.title}</a>}
          <div className={styles.helpCard}><Braces size={19} /><strong>Build with your tools</strong><p>Use the OpenAPI schema in your editor, or give your coding agent our API guide.</p><a href="/llms.txt">Open agent guide <ArrowRight size={13} /></a></div>
          <div className={styles.origin}><span>API BASE URL</span><code>{baseUrl}</code></div>
        </aside>
      </div>
    </div>
    <dialog ref={dialog} className={styles.searchDialog} aria-label="Search documentation" onClose={() => setQuery('')} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <div className={styles.searchInput}><Search size={19} /><input autoFocus aria-label="Search guides and endpoints" placeholder="Search guides and endpoints…" value={query} onChange={event => setQuery(event.target.value)} /><button type="button" aria-label="Close search" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      <p className={styles.searchCount} aria-live="polite">{results.length} {results.length === 1 ? 'topic' : 'topics'}</p>
      <div className={styles.searchResults}>{results.map(item => <a key={item.id} href={`#${item.id}`} onClick={() => choose(item.id)}><span>{item.group}</span><strong>{item.title}<ArrowRight size={15} /></strong><p>{item.description}</p></a>)}{!results.length && <p>No matching topics. Try “uploads”, “credits”, “Python” or “webhooks”.</p>}</div>
    </dialog>
  </div>
}
