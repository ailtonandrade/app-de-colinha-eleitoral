import { NextResponse } from 'next/server'
import fallbackCandidates from '@/data/candidates-2026.json'

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
  const localCandidates = (fallbackCandidates as Record<string, any[]>)[office]

  if (!localCandidates) return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 })
  if (state && state !== 'BR' && !brazilianStates.includes(state)) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })

  // A tela usa a base local para funcionar mesmo quando a API do TSE está indisponível.
  // O filtro vazio significa todos os estados; as fotos são opcionais e falham para iniciais.
  const candidates = localCandidates
    .filter((candidate) => !state || state === 'BR' || candidate.state === 'BR' || candidate.state === state)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  return NextResponse.json({ candidates, source: 'Base local 2026', scope: state || 'BR' })
}
