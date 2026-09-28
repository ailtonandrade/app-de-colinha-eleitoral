import { NextResponse } from 'next/server'

const TSE_API = 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1'
const officeCodes: Record<string, string> = {
  Presidente: '1',
  Governador: '3',
  Senador: '5',
  'Deputado federal': '6',
  'Deputado estadual': '7',
}

const brazilianStates = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

function extractCandidates(data: any, fallbackState?: string) {
  const raw = Array.isArray(data) ? data : data?.candidatos || data?.candidates || data?.content || []
  return raw.map((item: any) => ({
    id: String(item.id || item.sequencial || item.numero || item.nomeUrna),
    name: item.nomeUrna || item.nome || item.nomeCompleto,
    number: String(item.numero || item.numeroCandidato || ''),
    party: item.siglaPartido || item.partido?.sigla || item.partido || '',
    state: item.sgUf || item.uf || fallbackState,
    photo: item.foto || item.urlFoto || item.fotoUrl || undefined,
  })).filter((candidate: any) => candidate.name && candidate.number)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const office = searchParams.get('office') || 'Presidente'
  const state = searchParams.get('state') || ''
  const cargo = officeCodes[office]
  if (!cargo) return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 })

  // Presidente usa o código nacional. Os demais cargos são estaduais; sem filtro,
  // consultamos todos os estados para não devolver uma lista vazia para "BR".
  const states = state ? [state] : office === 'Presidente' ? ['BR'] : brazilianStates
  try {
    const responses = await Promise.all(states.map(async (uf) => {
      const url = `${TSE_API}/candidatura/listar/2026/${uf}/2040602026/${cargo}/candidatos`
      const response = await fetch(url, {
        next: { revalidate: 300 },
        headers: { Accept: 'application/json', 'User-Agent': 'ColinhaEleitoral/2026' },
      })
      if (!response.ok) return []
      return extractCandidates(await response.json(), uf)
    }))
    const candidates = Array.from(new Map(responses.flat().map((candidate: any) => [candidate.id, candidate])).values())
    return NextResponse.json({ candidates, source: 'TSE', scope: state || 'BR' })
  } catch {
    return NextResponse.json({ candidates: [], error: 'Não foi possível consultar os dados oficiais do TSE agora. Tente novamente em instantes.' }, { status: 502 })
  }
}
