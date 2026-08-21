// lib/id.ts — short unique id (crypto.randomUUID with hyphens removed).
import { randomUUID } from 'node:crypto';

export function randomId(): string {
  return randomUUID().replace(/-/g, '');
}
