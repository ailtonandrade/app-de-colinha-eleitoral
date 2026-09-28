'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'

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
  const [partyFilter, setPartyFilter] = useState('')
  const [copied, setCopied] = useState(false)
  // Deputados passam de mil por estado: renderiza aos poucos pra não travar o celular.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectionHydrated, setSelectionHydrated] = useState(false)
  const [donationOpen, setDonationOpen] = useState(false)
  const [pixCopied, setPixCopied] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState('')

  const pixKey = '641a1e61-9c0d-407b-bc06-30010099a536'

  const activeApi = offices.find((office) => office.name === activeOffice)!.api
  const cacheKey = `${activeApi}|${state || 'BR'}`

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sharedState = params.get('uf')
    if (sharedState && states.some(([uf]) => uf === sharedState)) setState(sharedState)
    const encoded = params.get('colinha')
    const saved = window.localStorage.getItem('colinha-eleitoral-2026')
    try {
      const source = encoded ? JSON.parse(encoded) : saved ? JSON.parse(saved) : null
      if (source && typeof source === 'object') {
        setSelected(Object.fromEntries(Object.entries(source).filter(([office]) => offices.some((item) => item.name === office))))
      }
    } catch {
      // Links ou dados locais inválidos não interrompem a montagem.
    }
    setSelectionHydrated(true)
  }, [])

  useEffect(() => {
    if (!selectionHydrated) return
    window.localStorage.setItem('colinha-eleitoral-2026', JSON.stringify(selected))
  }, [selected, selectionHydrated])

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

  const partyOptions = useMemo(() => {
    return Array.from(new Set((candidateData[cacheKey] || []).map((candidate) => candidate.party).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [candidateData, cacheKey])

  const filteredCandidates = useMemo(() => {
    const term = search.toLowerCase().trim()
    // O mesmo candidato não pode ocupar os dois votos de Senador.
    const otherSenator = activeOffice === '1º Senador' ? selected['2º Senador'] : activeOffice === '2º Senador' ? selected['1º Senador'] : undefined
    return (candidateData[cacheKey] || []).filter((candidate) => {
      if (otherSenator && candidate.id === otherSenator.id) return false
      if (partyFilter && candidate.party !== partyFilter) return false
      return !term || `${candidate.name} ${candidate.number} ${candidate.party}`.toLowerCase().includes(term)
    })
  }, [candidateData, cacheKey, search, activeOffice, selected])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
    setPartyFilter('')
  }, [cacheKey, activeOffice, search])

  const changeState = (next: string) => {
    setState(next)
    // Escolhas estaduais de outro estado não valem mais na nova colinha.
    setSelected((current) => Object.fromEntries(Object.entries(current).filter(([, candidate]) => !next || !candidate?.state || candidate.state === 'BR' || candidate.state === next)))
  }

  const progress = Object.keys(selected).length
  const chooseCandidate = (candidate: Candidate) => {
    setSelected((current) => {
      const currentCandidate = current[activeOffice]
      if (currentCandidate?.id === candidate.id) {
        const next = { ...current }
        delete next[activeOffice]
        return next
      }
      return { ...current, [activeOffice]: candidate }
    })
    setSearch('')
  }

  const share = async () => {
  const params = new URLSearchParams({ colinha: JSON.stringify(selected) })
  if (state) params.set('uf', state)
  const url = `${window.location.origin}/?${params.toString()}`

  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const context = canvas.getContext('2d')
  if (!context) return

  context.fillStyle = '#006b45'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#ffd600'
  context.fillRect(0, 0, canvas.width, 18)
  context.fillStyle = '#f4fbe9'
  context.beginPath()
  context.roundRect(36, 48, 1008, 1344, 36)
  context.fill()
  context.fillStyle = '#005c3b'
  context.font = '700 58px Arial'
  context.fillText('Minha colinha eleitoral', 84, 142)
  context.fillStyle = '#6a7c70'
  context.font = '500 30px Arial'
  context.fillText(`Eleições 2026${state ? ` · ${state}` : ''}`, 84, 190)

  const cardWidth = 450
  const cardHeight = 310
  const gap = 42
  const startX = 72
  const startY = 250
  const loadImage = async (source: string) => {
  const response = await fetch(`/api/image?url=${encodeURIComponent(source)}`, { cache: 'force-cache' })
  if (!response.ok) throw new Error('Foto indisponível')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const image = new Image()
  image.src = objectUrl
  await image.decode()
  return image
  }

  await Promise.all(offices.map(async (office, index) => {
  const candidate = selected[office.name]
  const x = startX + (index % 2) * (cardWidth + gap)
  const y = startY + Math.floor(index / 2) * (cardHeight + gap)
  context.fillStyle = candidate ? '#087f50' : '#e7f2df'
  context.beginPath()
  context.roundRect(x, y, cardWidth, cardHeight, 26)
  context.fill()
  context.strokeStyle = candidate ? '#ffd600' : '#c9dbcc'
  context.lineWidth = 5
  context.stroke()
  context.fillStyle = candidate ? '#dff7b8' : '#607267'
  context.font = '600 25px Arial'
  context.fillText(officeShort(office.name, state).toUpperCase(), x + 28, y + 48)
  context.fillStyle = candidate ? '#ffffff' : '#567064'
  context.font = '700 54px Arial'
  context.fillText(candidate?.number || '—', x + 28, y + 118)
  context.font = '700 28px Arial'
  context.fillText(candidate ? candidate.name.split(/\s+/)[0] : 'Não escolhido', x + 28, y + 164)
  context.font = '500 27px Arial'
  context.fillText(candidate?.party || '', x + 28, y + 204)
  if (candidate?.photo) {
  try {
  const image = await loadImage(candidate.photo)
  context.save()
  context.beginPath()
  context.arc(x + cardWidth - 82, y + 94, 48, 0, Math.PI * 2)
  context.clip()
  context.drawImage(image, x + cardWidth - 130, y + 46, 96, 96)
  context.restore()
  } catch {
  // Mantém o card funcional quando a foto remota não permite uso no canvas.
  }
  }
  if (candidate) {
  context.fillStyle = '#ffd600'
  context.font = '700 32px Arial'
  context.fillText('✓ escolhido', x + 28, y + 252)
  }
  }))

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (blob && navigator.share && navigator.canShare?.({ files: [new File([blob], 'minha-colinha.jpg', { type: 'image/jpeg' })] })) {
  const file = new File([blob], 'minha-colinha.jpg', { type: 'image/jpeg' })
  await navigator.share({ files: [file], title: 'Minha colinha eleitoral', text: 'Minha colinha para as eleições de 2026.' })
  setCopied(true)
  window.setTimeout(() => setCopied(false), 2200)
  return
  }
  try {
  await navigator.clipboard.writeText(url)
  setCopied(true)
  window.setTimeout(() => setCopied(false), 2200)
  } catch {
  window.prompt('Copie seu link de compartilhamento:', url)
  }
  }

  const copyPixKey = async () => {
    await navigator.clipboard.writeText(pixKey)
    setPixCopied(true)
    window.setTimeout(() => setPixCopied(false), 2200)
  }

  useEffect(() => {
    QRCode.toDataURL(`PIX\nChave: ${pixKey}`, { width: 220, margin: 1, color: { dark: '#005b38', light: '#f8fff2' } })
      .then(setQrCodeUrl)
      .catch(() => setQrCodeUrl(''))
  }, [])

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
          <button className="coffee-header-button" onClick={() => setDonationOpen(true)}>Doe um cafezinho</button>
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
                    {candidate && <span className="chip-check" aria-hidden="true">✓</span>}
                    <span>{candidate ? candidate.number : '—'}</span>
                    {candidate && <strong className="chip-name">{candidate.name.split(/\s+/)[0]}</strong>}
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

          <div className="candidate-area">
            <div className="candidate-title"><div><span className="mini-label">CARGO</span><h3>{officeLabel(activeOffice, state)}</h3></div><span className="digits">{activeDigits} dígitos</span></div>
            <div className="search-wrap"><Icon>⌕</Icon><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Busque por nome, número ou partido" aria-label="Buscar candidato" /></div>
            {partyOptions.length > 0 && (
              <div className="party-filter-wrap">
                <label htmlFor="party-filter">Filtrar por partido</label>
                <select id="party-filter" value={partyFilter} onChange={(event) => setPartyFilter(event.target.value)}>
                  <option value="">Todos os partidos</option>
                  {partyOptions.map((party) => <option key={party} value={party}>{party}</option>)}
                </select>
              </div>
            )}
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

      {donationOpen && (
        <div className="donation-backdrop" role="presentation" onClick={() => setDonationOpen(false)}>
          <section className="donation-modal" role="dialog" aria-modal="true" aria-labelledby="donation-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setDonationOpen(false)} aria-label="Fechar">×</button>
            <span className="donation-kicker">APOIE A COLINHA</span>
            <h2 id="donation-title">Um cafezinho para nós?</h2>
            <p>Copie a chave Pix ou escaneie o QR Code para apoiar o projeto.</p>
            {qrCodeUrl ? <img className="pix-qr" src={qrCodeUrl} alt="QR Code para doação via Pix" /> : <div className="pix-qr qr-loading" aria-label="Gerando QR Code">Gerando QR Code...</div>}
            <strong className="qr-caption">Escaneie com o app do seu banco</strong>
            <div className="pix-key-row"><code>{pixKey}</code><button onClick={copyPixKey}>{pixCopied ? 'Copiada' : 'Copiar chave'}</button></div>
          </section>
        </div>
      )}
    </main>
  )
}
