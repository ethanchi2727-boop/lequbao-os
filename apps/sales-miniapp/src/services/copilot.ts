import type {
  ProblemDetails,
  SalesAiArtifactKind,
  SalesAiArtifactSummary,
  SalesAiCopilotOverview,
  SalesAiObjectionType,
  SalesAiRoleplaySessionSummary,
} from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-city-sales-2026'

interface UniRequestResult<T> {
  statusCode: number
  data: T
}

function request<T>(options: UniApp.RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      header: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        ...options.header,
      },
      success: (response) => {
        const result = response as unknown as UniRequestResult<T | ProblemDetails>
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data as T)
          return
        }
        const problem = result.data as ProblemDetails
        reject(new Error(problem.detail ?? 'AI 销售助手请求失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接服务，请确认 API 已启动')),
    })
  })
}

function mutation(
  url: string,
  idempotencyKey: string,
  data: Record<string, unknown>,
): Promise<SalesAiCopilotOverview> {
  return request<SalesAiCopilotOverview>({
    url,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    data,
  })
}

export function fetchSalesCopilot(
  focusLeadId?: string,
): Promise<SalesAiCopilotOverview> {
  return request<SalesAiCopilotOverview>({
    url: `${API_BASE}/sales/copilot${focusLeadId
      ? `?focusLeadId=${encodeURIComponent(focusLeadId)}`
      : ''}`,
    method: 'GET',
  })
}

export function generateSalesArtifact(
  leadId: string,
  kind: SalesAiArtifactKind,
  objective: string,
  contextNotes: string[],
): Promise<SalesAiCopilotOverview> {
  return mutation(
    `${API_BASE}/sales/copilot/leads/${encodeURIComponent(leadId)}/artifacts`,
    `sales-ai:artifact:${leadId}:${kind}:${Date.now()}`,
    { kind, objective, contextNotes },
  )
}

export function confirmSalesArtifact(
  artifact: SalesAiArtifactSummary,
  leadVersion: number,
  crmWriteback?: {
    channel: 'PHONE' | 'WECHAT' | 'VISIT' | 'VIDEO'
    summary: string
    nextAction: string
    nextActionAt: string
  },
): Promise<SalesAiCopilotOverview> {
  return mutation(
    `${API_BASE}/sales/copilot/artifacts/${encodeURIComponent(artifact.artifactKey)}/confirm`,
    `sales-ai:confirm:${artifact.artifactKey}:v${artifact.revision}`,
    {
      expectedRevision: artifact.revision,
      expectedLeadVersion: leadVersion,
      confirmed: true,
      ...(crmWriteback ? { crmWriteback } : {}),
    },
  )
}

export function startSalesRoleplay(
  leadId: string,
  objectionType: SalesAiObjectionType,
  scenario: string,
): Promise<SalesAiCopilotOverview> {
  return mutation(
    `${API_BASE}/sales/copilot/leads/${encodeURIComponent(leadId)}/roleplay-sessions`,
    `sales-ai:roleplay:${leadId}:${objectionType}:${Date.now()}`,
    { objectionType, scenario },
  )
}

export function replySalesRoleplay(
  session: SalesAiRoleplaySessionSummary,
  response: string,
): Promise<SalesAiCopilotOverview> {
  const salesTurnCount = session.turns.filter((turn) => turn.actor === 'SALES').length
  return mutation(
    `${API_BASE}/sales/copilot/roleplay-sessions/${encodeURIComponent(session.id)}/turns`,
    `sales-ai:roleplay:${session.id}:turn:${salesTurnCount + 1}`,
    { response },
  )
}
