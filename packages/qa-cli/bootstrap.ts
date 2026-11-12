import { execute, parseArgs } from './qa-cli.ts';

/** Run the shared TypeScript command dispatcher from a platform bootstrap. */
try {
  process.exitCode = await execute(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
