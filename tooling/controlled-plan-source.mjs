import { isDeepStrictEqual } from 'node:util';

export function assertControlledPlanSource(plan, planSource) {
  let parsedPlan;
  try {
    parsedPlan = JSON.parse(planSource);
  } catch {
    throw new Error('controlled acceptance plan source is invalid JSON');
  }
  if (!isDeepStrictEqual(parsedPlan, plan))
    throw new Error('controlled acceptance plan source does not match the plan object');
}
