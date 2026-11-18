// One command to check, commit and push:   npm run ship -- "what changed"
// If the Vercel project is connected to the GitHub repo, the push also deploys.
import { execFileSync, execSync } from 'node:child_process';

const message = process.argv.slice(2).join(' ').trim() || `Update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const git = (...args) => execFileSync('git', args, { stdio: 'inherit' });

console.log('› Building to catch errors before they reach Vercel…');
execSync('npm run build', { stdio: 'inherit' });

git('add', '-A');
let staged = true;
try {
  execFileSync('git', ['diff', '--cached', '--quiet']);
  staged = false;
} catch {
  // a non-zero exit means there are staged changes
}
if (staged) git('commit', '-m', message);
else console.log('› Nothing new to commit.');

git('push');
console.log('\n✓ Pushed to GitHub. Vercel deploys it in about a minute (if the repo is connected, see README).');
