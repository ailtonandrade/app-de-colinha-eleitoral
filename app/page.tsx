'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type Office = 'Presidente' | 'Governador' | 'Senador' | 'Deputado federal' | 'Deputado estadual'

type Candidate = {
  id: string
  name: string
  number: string
  party: string
  state?: string
  photo?: string
}

const offices: { name: Office; hint: string; digits: number }[] = [
  { name: 'Presidente', hint: '2 dígitos', digits: 2 },
  { name: 'Governador', hint: '2 dígitos', digits: 2 },
  { name: 'Senador', hint: '3 dígitos', digits: 3 },
  { name: 'Deputado federal', hint: '4 dígitos', digits: 4 },
  { name: 'Deputado estadual', hint: '5 dígitos', digits: 5 },
]

const emptyCandidates: Record<Office, Candidate[]> = {
  Presidente: [],
  Governador: [],
  Senador: [],
  'Deputado federal': [],
  'Deputado estadual': [],
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>
}

export default function Page() {
  const [state, setState] = useState('')
  const [activeOffice, setActiveOffice] = useState<Office>('Presidente')
  const [selected, setSelected] = useState<Partial<Record<Office, Candidate>>>({})
  const [candidateData, setCandidateData] = useState(emptyCandidates)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [dataError, setDataError] = useState('')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get('colinha')
    if (!encoded) return
    try {
      const shared = JSON.parse(decodeURIComponent(encoded)) as Partial<Record<Office, Candidate>>
      setSelected(shared)
    } catch {
      // Links inválidos não interrompem a montagem de uma nova colinha.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingCandidates(true)
    setDataError('')
    const scope = state || 'BR'
    fetch(`/api/candidates?office=${encodeURIComponent(activeOffice)}&state=${scope}`)
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Falha ao consultar o TSE')
        if (!cancelled) setCandidateData((current) => ({ ...current, [activeOffice]: payload.candidates }))
      })
      .catch((error) => { if (!cancelled) setDataError(error.message) })
      .finally(() => { if (!cancelled) setLoadingCandidates(false) })
    return () => { cancelled = true }
  }, [activeOffice, state])

  const filteredCandidates = useMemo(() => {
    const term = search.toLowerCase().trim()
    return candidateData[activeOffice].filter((candidate) => {
      const matchesState = !state || !candidate.state || candidate.state === state
      const matchesSearch = !term || `${candidate.name} ${candidate.number} ${candidate.party}`.toLowerCase().includes(term)
      return matchesState && matchesSearch
    })
  }, [activeOffice, search, state])

  const progress = Object.keys(selected).length
  const chooseCandidate = (candidate: Candidate) => {
    setSelected((current) => ({ ...current, [activeOffice]: candidate }))
    setSearch('')
  }

  const share = async () => {
    const payload = encodeURIComponent(JSON.stringify(selected))
    const url = `${window.location.origin}/?colinha=${payload}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      window.prompt('Copie seu link de compartilhamento:', url)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Colinha Eleitoral 2026">
          <span className="brand-mark"><span /></span>
          <span><strong>colinha</strong><small>ELEITORAL 2026</small></span>
        </a>
        <div className="top-actions">
          <span className="secure"><Icon>⌁</Icon> Gratuito e independente</span>
          <button className="share-button" onClick={share}><Icon>↗</Icon>{copied ? 'Link copiado' : 'Compartilhar'}</button>
        </div>
      </header>

      <div className="content-grid">
        <section className="builder-card">
          <div className="builder-title"><h1>Monte sua colinha</h1><span>{progress}/5</span></div>

          <div className="selected-strip" aria-label="Candidatos escolhidos">
            <div className="selected-strip-label">Sua seleção</div>
            <div className="selected-strip-list">
              {offices.map((office) => {
                const candidate = selected[office.name]
                return <button key={office.name} className={candidate ? 'selected-chip filled' : 'selected-chip'} onClick={() => setActiveOffice(office.name)} aria-label={`${office.name}: ${candidate ? candidate.name : 'não escolhido'}`}><span>{candidate ? candidate.number : '—'}</span><small>{office.name.replace('Deputado ', 'Dep. ')}</small></button>
              })}
            </div>
          </div>

          <div className="location-row">
            <label htmlFor="state">Seu estado</label>
            <select id="state" value={state} onChange={(event) => setState(event.target.value)}><option value="">Todos os estados</option><option value="SP">SP — São Paulo</option><option value="RJ">RJ — Rio de Janeiro</option><option value="MG">MG — Minas Gerais</option><option value="BA">BA — Bahia</option></select>
            <span className="location-help">Comece vendo candidatos de todos os estados.</span>
          </div>

          <div className="office-tabs" role="tablist" aria-label="Cargos">
            {offices.map((office, index) => (
              <button key={office.name} className={activeOffice === office.name ? 'office-tab active' : 'office-tab'} onClick={() => setActiveOffice(office.name)} role="tab" aria-selected={activeOffice === office.name}>
                <span className="tab-index">0{index + 1}</span><strong>{office.name}</strong><small>{selected[office.name] ? 'Selecionado' : office.hint}</small>
                {selected[office.name] && <span className="tab-check">✓</span>}
              </button>
            ))}
          </div>

          <div className="candidate-area">
            <div className="candidate-title"><div><span className="mini-label">CARGO</span><h3>{activeOffice}</h3></div><span className="digits">{offices.find((item) => item.name === activeOffice)?.digits} dígitos</span></div>
            <div className="search-wrap"><Icon>⌕</Icon><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Busque por nome, número ou partido" aria-label="Buscar candidato" /></div>
            <div className="candidate-list">
              {loadingCandidates && <p className="empty-state">Consultando a lista oficial do TSE...</p>}
              {!loadingCandidates && dataError && <p className="empty-state">{dataError}</p>}
              {!loadingCandidates && !dataError && filteredCandidates.length === 0 && <p className="empty-state">Nenhuma candidatura encontrada para este cargo e filtro.</p>}
              {!loadingCandidates && filteredCandidates.map((candidate) => <button className={selected[activeOffice]?.id === candidate.id ? 'candidate selected' : 'candidate'} key={candidate.id} onClick={() => chooseCandidate(candidate)}><span className="candidate-avatar">{candidate.photo ? <img src={candidate.photo} alt={`Foto de ${candidate.name}`} loading="lazy" /> : candidate.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><span className="candidate-info"><strong>{candidate.name}</strong><small>{candidate.party}{candidate.state ? ` · ${candidate.state}` : ''}</small></span><span className="candidate-number">{candidate.number}</span><span className="radio">{selected[activeOffice]?.id === candidate.id ? '✓' : ''}</span></button>)}
            </div>
            <p className="data-source"><Icon>⌁</Icon> Consulte os dados oficiais do TSE antes de votar.</p>
          </div>
        </section>

      </div>

      <footer className="footer"><span>Uma ferramenta cidadã, sem vínculo com partidos políticos.</span><span>Consulte também <a href="https://www.tse.jus.br/" target="_blank" rel="noreferrer">tse.jus.br ↗</a></span></footer>
    </main>
  )
}
