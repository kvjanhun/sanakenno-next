import type { Context, Env } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError } from 'zod';

type ErrorMapper<E extends Env, P extends string> =
  | string
  | ((error: ZodError, c: Context<E, P>) => { error: string; status?: ContentfulStatusCode });

/**
 * Create a custom `@hono/zod-validator` hook returning Sanakenno's `{ error }` payload shape.
 */
export function zodErrorHook<E extends Env = Env, P extends string = string>(
  mapError: ErrorMapper<E, P>,
) {
  return (
    result: { success: true; data: unknown } | { success: false; error: ZodError; data: unknown },
    c: Context<E, P>,
  ): Response | void => {
    if (result.success) return;
    if (typeof mapError === 'string') {
      return c.json({ error: mapError }, 400);
    }
    const { error, status } = mapError(result.error, c);
    return c.json({ error }, status ?? 400);
  };
}
