import { hc } from 'hono/client';
import type { AppType } from '@sanakenno/server/app';

/**
 * Single typed Hono RPC client for @sanakenno/web.
 * Direct fetch() calls outside src/api/ are forbidden by tests/architecture.test.ts.
 */
export const apiClient = hc<AppType>('/');
