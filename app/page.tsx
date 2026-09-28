'use client'

import { useEffect, useMemo, useState } from 'react'

// Em 2026 o eleitor vota 6 vezes. Senado renova 2/3: são 2 votos para senador.
type Office = 'Deputado federal' | 'Deputado estadual' | '1º Senador' | '2º Senador' | 'Governador' | 'Presidente'
type ApiOffice = 'Presidente' | 'Governador' | 'Senador' | 'Deputado federal' | 'Deputado estadual'

type Candidate = {
  id: string
  name: string
  number: string
  party: string
  state?: string
  photo?: string
  status?: string
}

const offices: { name: Office; api: ApiOffice; digits: number }[] = [
  { name: 'Presidente', api: 'Presidente', digits: 2 },
  { name: '1º Senador', api: 'Senador', digits: 3 },
  { name: '2º Senador', api: 'Senador', digits: 3 },
  { name: 'Governador', api: 'Governador', digits: 2 },
  { name: 'Deputado federal', api: 'Deputado federal', digits: 4 },
  { name: 'Deputado estadual', api: 'Deputado estadual', digits: 5 },
]

const states: [string, string][] = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'],
  ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'],
  ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'],
  ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'],
  ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
]

const PAGE_SIZE = 60

const officeLabel =(office: Office, state: string) => office === 'Deputado estadual' && state === 'DF' ? 'Deputado distrital' : office
const officeShort = (office: Office, state: string) => officeLabel(office, state).replace('Deputado ', 'Dep. ')
const initials = (name: string) => name.split(' ').filter(Boolean).map((word) => word[0]).slice(0, 2).join('')

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>
}

function Avatar({ candidate, className = 'candidate-avatar' }: { candidate: Candidate; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={className}>
      {candidate.photo && !failed
        ? <img src={candidate.photo} alt={`Foto de ${candidate.name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : initials(candidate.name)}
    </span>
  )
}

export default function Page() {
  const [state, setState] = useState('')
  const [activeOffice, setActiveOffice] = useState<Office>('Presidente')
  const [selected, setSelected] = useState<Partial<Record<Office, Candidate>>>({})
  // Cache por "cargo|estado": os dois votos de Senador compartilham a mesma lista.
  const [candidateData, setCandidateData] = useState<Record<string, Candidate[]>>({})
  const [needsState, setNeedsState] = useState(false)
  const [loadingCandidates, setLoadingCandidates] = useState(true)
  const [dataError, setDataError] = useState('')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  // Deputados passam de mil por estado: renderiza aos poucos pra não travar o celular.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const activeApi = offices.find((office) => office.name === activeOffice)!.api
  const cacheKey = `${activeApi}|${state || 'BR'}`

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sharedState = params.get('uf')
    if (sharedState && states.some(([uf]) => uf === sharedState)) setState(sharedState)
    const encoded = params.get('colinha')
    if (!encoded) return
    try {
      const shared = JSON.parse(encoded) as Record<string, Candidate>
      setSelected(Object.fromEntries(Object.entries(shared).filter(([office]) => offices.some((item) => item.name === office))))
    } catch {
      // Links inválidos não interrompem a montagem de uma nova colinha.
    }
  }, [])

  useEffect(() => {
    if (candidateData[cacheKey]) { setNeedsState(false); setDataError(''); return }
    let cancelled = false
    setLoadingCandidates(true)
    setDataError('')
    setNeedsState(false)
    fetch(`/api/candidates?office=${encodeURIComponent(activeApi)}&state=${state || 'BR'}`)
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Falha ao consultar o TSE')
        if (cancelled) return
        if (payload.needsState) setNeedsState(true)
        else setCandidateData((current) => ({ ...current, [cacheKey]: payload.candidates }))
      })
      .catch((error) => { if (!cancelled) setDataError(error.message) })
      .finally(() => { if (!cancelled) setLoadingCandidates(false) })
    return () => { cancelled = true }
  }, [cacheKey, activeApi, state, candidateData])

  const filteredCandidates = useMemo(() => {
    const term = search.toLowerCase().trim()
    // O mesmo candidato não pode ocupar os dois votos de Senador.
    const otherSenator = activeOffice === '1º Senador' ? selected['2º Senador'] : activeOffice === '2º Senador' ? selected['1º Senador'] : undefined
    return (candidateData[cacheKey] || []).filter((candidate) => {
      if (otherSenator && candidate.id === otherSenator.id) return false
      return !term || `${candidate.name} ${candidate.number} ${candidate.party}`.toLowerCase().includes(term)
    })
  }, [candidateData, cacheKey, search, activeOffice, selected])

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [cacheKey, activeOffice, search])

  const changeState = (next: string) => {
    setState(next)
    // Escolhas estaduais de outro estado não valem mais na nova colinha.
    setSelected((current) => Object.fromEntries(Object.entries(current).filter(([, candidate]) => !next || !candidate?.state || candidate.state === 'BR' || candidate.state === next)))
  }

  const progress = Object.keys(selected).length
  const chooseCandidate = (candidate: Candidate) => {
    setSelected((current) => ({ ...current, [activeOffice]: candidate }))
    setSearch('')
  }

  const share = async () => {
    const params = new URLSearchParams({ colinha: JSON.stringify(selected) })
    if (state) params.set('uf', state)
    const url = `${window.location.origin}/?${params.toString()}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      window.prompt('Copie seu link de compartilhamento:', url)
    }
  }

  const activeDigits = offices.find((item) => item.name === activeOffice)?.digits

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
          <div className="builder-title"><h1>Monte sua colinha</h1><span>{progress}/{offices.length}</span></div>

          <div className="selected-strip" aria-label="Candidatos escolhidos">
            <div className="selected-strip-label">Sua seleção</div>
            <div className="selected-strip-list">
              {offices.map((office) => {
                const candidate = selected[office.name]
                return (
                  <button key={office.name} className={candidate ? 'selected-chip filled' : 'selected-chip'} onClick={() => setActiveOffice(office.name)} aria-label={`${officeLabel(office.name, state)}: ${candidate ? candidate.name : 'não escolhido'}`}>
                    {candidate && <Avatar candidate={candidate} className="chip-avatar" />}
                    <span>{candidate ? candidate.number : '—'}</span>
                    <small>{officeShort(office.name, state)}</small>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="location-row">
            <label htmlFor="state">Seu estado</label>
            <select id="state" value={state} onChange={(event) => changeState(event.target.value)}>
              <option value="">Todos os estados</option>
              {states.map(([uf, name]) => <option key={uf} value={uf}>{uf} — {name}</option>)}
            </select>
            <span className="location-help">Você vota nos candidatos do estado do seu título.</span>
          </div>

          <div className="office-tabs" role="tablist" aria-label="Cargos">
            {offices.map((office, index) => (
              <button key={office.name} className={activeOffice === office.name ? 'office-tab active' : 'office-tab'} onClick={() => { setActiveOffice(office.name); setSearch('') }} role="tab" aria-selected={activeOffice === office.name}>
                <span className="tab-index">0{index + 1}</span><strong>{officeLabel(office.name, state)}</strong><small>{selected[office.name] ? 'Selecionado' : `${office.digits} dígitos`}</small>
                {selected[office.name] && <span className="tab-check">✓</span>}
              </button>
            ))}
          </div>

          <div className="candidate-area">
            <div className="candidate-title"><div><span className="mini-label">CARGO</span><h3>{officeLabel(activeOffice, state)}</h3></div><span className="digits">{activeDigits} dígitos</span></div>
            <div className="search-wrap"><Icon>⌕</Icon><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Busque por nome, número ou partido" aria-label="Buscar candidato" /></div>
            <div className="candidate-list">
              {loadingCandidates && <p className="empty-state">Consultando a lista oficial do TSE...</p>}
              {!loadingCandidates && dataError && <p className="empty-state">{dataError}</p>}
              {!loadingCandidates && !dataError && needsState && <p className="empty-state">Escolha seu estado acima para ver os candidatos a {officeLabel(activeOffice, state).toLowerCase()}.</p>}
              {!loadingCandidates && !dataError && !needsState && filteredCandidates.length === 0 && <p className="empty-state">Nenhuma candidatura encontrada para este cargo e filtro.</p>}
              {!loadingCandidates && !needsState && filteredCandidates.slice(0, visibleCount).map((candidate) => {
                const isSelected = selected[activeOffice]?.id === candidate.id
                const flagged = candidate.status && !candidate.status.startsWith('Deferido')
                return (
                  <button className={isSelected ? 'candidate selected' : 'candidate'} key={candidate.id} onClick={() => chooseCandidate(candidate)}>
                    <Avatar candidate={candidate} />
                    <span className="candidate-info">
                      <strong>{candidate.name}</strong>
                      <small>{candidate.party}{candidate.state && candidate.state !== 'BR' ? ` · ${candidate.state}` : ''}{flagged && <em className="candidate-status"> · {candidate.status}</em>}</small>
                    </span>
                    <span className="candidate-number">{candidate.number}</span>
                    <span className="radio">{isSelected ? '✓' : ''}</span>
                  </button>
                )
              })}
              {!loadingCandidates && !needsState && filteredCandidates.length > visibleCount && (
                <button className="show-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                  Mostrar mais ({filteredCandidates.length - visibleCount} restantes) — ou busque pelo nome/número
                </button>
              )}
            </div>
            <p className="data-source"><Icon>⌁</Icon> Dados e fotos do DivulgaCandContas (TSE). Confira a situação da candidatura antes de votar.</p>
          </div>
        </section>

      </div>

      <footer className="footer"><span>Uma ferramenta cidadã, sem vínculo com partidos políticos.</span><span>Consulte também <a href="https://www.tse.jus.br/" target="_blank" rel="noreferrer">tse.jus.br ↗</a></span></footer>
    </main>
  )
}
