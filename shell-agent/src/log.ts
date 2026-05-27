import chalk from 'chalk';

const W = Math.min(process.stdout.columns ?? 72, 80);

// ── Section separators ─────────────────────────────────────────────────────

export function sep(label?: string): void {
  if (label) {
    const bar = chalk.cyan('─'.repeat(Math.max(0, W - label.length - 4)));
    console.log(`\n${chalk.cyan('──')} ${chalk.bold(label)} ${bar}`);
  } else {
    console.log(chalk.dim('─'.repeat(W)));
  }
}

// ── Event lines ────────────────────────────────────────────────────────────

export type EventTag = 'IOI' | 'PROPOSAL' | 'ORDER' | 'SETTLE' | 'INFO' | 'ERROR';

const TAG_FMT: Record<EventTag, (s: string) => string> = {
  IOI:      (s) => chalk.blue.bold(s),
  PROPOSAL: (s) => chalk.yellow.bold(s),
  ORDER:    (s) => chalk.magenta.bold(s),
  SETTLE:   (s) => chalk.green.bold(s),
  INFO:     (s) => chalk.white(s),
  ERROR:    (s) => chalk.red.bold(s),
};

export function logEvent(tag: EventTag, data: string): void {
  const fmt = TAG_FMT[tag];
  console.log(`${fmt(`◆ ${tag.padEnd(8)}`)} ${data}`);
}

// ── Tool call / result line (used in llm/loop.ts) ─────────────────────────

export function logTool(name: string, args: unknown, result: unknown): void {
  const a = shortJson(args);
  const r = shortJson(result);
  console.log(
    `  ${chalk.cyan('[tool]')} ${chalk.bold.cyan(name)}${chalk.dim(`(${a})`)} ${chalk.dim('→')} ${chalk.green(r)}`,
  );
}

// ── LLM verdict panel ─────────────────────────────────────────────────────

export function logVerdict(decision: string, reasoning: string, policyCheck: boolean): void {
  const isAccept = decision === 'accept_match';
  const isReject = decision === 'reject_match';
  const color = isAccept ? chalk.green : isReject ? chalk.red : chalk.yellow;
  const label = isAccept ? 'ACCEPT' : isReject ? 'REJECT' : 'WAIT';
  const policyIcon = policyCheck ? chalk.green('✓') : chalk.red('✗');
  console.log('');
  console.log(`  ${color.bold.inverse(` ${label} `)}  ${policyIcon} policy_check=${policyCheck}`);
  console.log(`  ${chalk.dim('↳')} ${chalk.italic(reasoning)}`);
  console.log('');
}

// ── Status helpers ─────────────────────────────────────────────────────────

export function logPass(msg: string): void {
  console.log(chalk.green(`  ✓ ${msg}`));
}

export function logWarn(msg: string): void {
  console.log(chalk.yellow(`  ⚠ ${msg}`));
}

export function logFail(msg: string): void {
  console.log(chalk.red(`  ✗ ${msg}`));
}

// ── Internal ───────────────────────────────────────────────────────────────

function shortJson(v: unknown): string {
  const s = JSON.stringify(v) ?? '';
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}
