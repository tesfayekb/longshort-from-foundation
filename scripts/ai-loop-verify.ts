#!/usr/bin/env -S deno run --allow-read

/**
 * ai-loop-verify — §11.10.5 AI-loop verification CLI.
 *
 * Usage:
 *   deno run --allow-read scripts/ai-loop-verify.ts --fixture=<path>
 *
 * Output: JSON to stdout matching AILoopVerificationResult shape.
 * Exit: 0 on agree, 1 on disagree.
 *
 * Suitable for PR-evidence-bundle inclusion: the JSON output is the §11.10.5 audit artifact.
 */

import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';
import { verifyAILoopFromPath } from '../src/features/longshort/services/replay/ai-loop-verifier.ts';

export interface AILoopVerifyArgs {
  fixture: string;
}

export function parseAILoopArguments(argv: string[]): AILoopVerifyArgs {
  const parsed = parseArgs(argv, { string: ['fixture'] });
  return { fixture: parsed.fixture as string ?? '' };
}

if (import.meta.main) {
  const args = parseAILoopArguments(Deno.args);
  if (!args.fixture) {
    console.error('ai-loop-verify: --fixture=<path> required');
    Deno.exit(2);
  }
  const result = await verifyAILoopFromPath(args.fixture);
  console.log(JSON.stringify(result, null, 2));
  Deno.exit(result.status === 'agree' ? 0 : 1);
}