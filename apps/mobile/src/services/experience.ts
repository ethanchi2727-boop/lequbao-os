import type { ExperienceSnapshot, ProblemDetails } from '@lequ/contracts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN ?? 'dev-hq-super-2026'

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
        reject(new Error(problem.detail ?? '请求失败，请稍后重试'))
      },
      fail: () => reject(new Error('暂时无法连接服务，请确认 API 已启动')),
    })
  })
}

export function fetchExperience(): Promise<ExperienceSnapshot> {
  return request<ExperienceSnapshot>({
    url: `${API_BASE}/experience`,
    method: 'GET',
  })
}

export function advanceExperience(
  snapshot: ExperienceSnapshot,
): Promise<ExperienceSnapshot> {
  if (!snapshot.nextStep) {
    return Promise.resolve(snapshot)
  }
  return request<ExperienceSnapshot>({
    url: `${API_BASE}/experience/advance`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `${snapshot.runId}:step:${snapshot.nextStep.index}`,
    },
    data: { expectedStep: snapshot.nextStep.index },
  })
}

export function resetExperience(): Promise<ExperienceSnapshot> {
  return request<ExperienceSnapshot>({
    url: `${API_BASE}/experience/reset`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `reset:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    },
    data: {},
  })
}
