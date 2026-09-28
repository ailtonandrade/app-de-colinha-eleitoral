import { NextResponse } from 'next/server'

const TSE_API = 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1'
// ID oficial da "Eleição Geral Federal 2026" em /eleicao/ordinarias.
const ELECTION_ID = '20322002026'

const officeCodes: Record<string, string> = {
  Presidente: '1',
  Governador: '3',
  Senador: '5',
  'Deputado federal': '6',
  'Deputado estadual': '7',
}
// No DF não há deputado estadual: o cargo equivalente é deputado distrital.
const DEPUTADO_DISTRITAL = '8'

const brazilianStates = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

// A listagem do TSE não traz a foto, mas o endereço dela é determinístico a partir do ID.
function photoUrl(candidateId: string, uf: string) {
  return `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${ELECTION_ID}/${candidateId}/${uf}`
}

function extractCandidates(data: any, fallbackState: string) {
  const raw = Array.isArray(data) ? data : data?.candidatos || []
  return raw.map((item: any) => {
    const id = String(item.id)
    const state = item.ufCandidatura || fallbackState
    return {
      id,
      name: item.nomeUrna || item.nomeCompleto,
      number: String(item.numero ?? ''),
      party: item.partido?.sigla || item.nomeColigacao || '',
      state,
      photo: item.fotoUrl || photoUrl(id, state),
      status: item.descricaoSituacao || undefined,
    }
  }).filter((candidate: any) => candidate.id && candidate.name && candidate.number)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const office = searchParams.get('office') || 'Presidente'
  const state = (searchParams.get('state') || '').toUpperCase()
  if (!officeCodes[office]) return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 })
  if (state && state !== 'BR' && !brazilianStates.includes(state)) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })

  const isNational = office === 'Presidente'
  const isDeputy = office.startsWith('Deputado')
  const scopedState = state === 'BR' ? '' : state
  // Deputados passam de mil por estado: sem estado a lista ficaria enorme e inútil pra colinha.
  if (isDeputy && !scopedState) return NextResponse.json({ candidates: [], needsState: true, source: 'TSE', scope: 'BR' })

  const states = isNational ? ['BR'] : scopedState ? [scopedState] : brazilianStates
  try {
    const results = await Promise.all(states.map(async (uf) => {
      const cargo = office === 'Deputado estadual' && uf === 'DF' ? DEPUTADO_DISTRITAL : officeCodes[office]
      // A rota pública atual do DivulgaCandContas recebe ano, UF e cargo.
      // O identificador da eleição é usado apenas na rota de fotos.
      const url = `${TSE_API}/candidatura/listar/2026/${uf}/${cargo}/candidatos`
      const response = await fetch(url, {
        next: { revalidate: 3600 },
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'ColinhaEleitoral/2026 (consulta publica)',
          Referer: 'https://divulgacandcontas.tse.jus.br/',
        },
      })
      if (!response.ok) return null
      return extractCandidates(await response.json(), uf)
    }))
    if (results.every((result) => result === null)) throw new Error('TSE indisponível')
    const candidates = Array.from(new Map(results.flatMap((result) => result || []).map((candidate: any) => [candidate.id, candidate])).values())
      .sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR'))
    return NextResponse.json({ candidates, source: 'TSE', scope: isNational ? 'BR' : scopedState || 'BR' })
  } catch {
    return NextResponse.json({ candidates: [], error: 'Não foi possível consultar os dados oficiais do TSE agora. Tente novamente em instantes.' }, { status: 502 })
  }
}
