// Release helper for the version in package.json and CHANGELOG.md.
// Usage:
//   node scripts/release.js <major|minor|patch>   moves [Unreleased] into a dated release and bumps the version
//   node scripts/release.js notes [version]       prints the changelog section of a version (default: package.json)
// See "Versioning" in README.md.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const REPO_URL = 'https://github.com/SG303/batzen';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * @param {string} version
 * @param {string} kind
 */
export function bumpVersion(version, kind) {
	const match = SEMVER.exec(version);
	if (!match) throw new Error(`"${version}" is not a plain MAJOR.MINOR.PATCH version`);
	const [major, minor, patch] = match.slice(1).map(Number);
	if (kind === 'major') return `${major + 1}.0.0`;
	if (kind === 'minor') return `${major}.${minor + 1}.0`;
	if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
	throw new Error(`Unknown kind "${kind}", use major, minor or patch`);
}

/**
 * Text between a version heading and the next heading or the link references at the end.
 * @param {string} changelog
 * @param {string} version a version number or "Unreleased"
 */
export function sectionNotes(changelog, version) {
	const lines = changelog.split('\n');
	const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
	if (start === -1) return null;
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => line.startsWith('## [') || /^\[[^\]]+\]: /.test(line));
	return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/**
 * Turns the [Unreleased] section into the release `version` and leaves an empty [Unreleased] behind.
 * @param {string} changelog
 * @param {string} version
 * @param {string} date YYYY-MM-DD
 */
export function releaseChangelog(changelog, version, date) {
	if (!sectionNotes(changelog, 'Unreleased')) {
		throw new Error('Nothing to release: [Unreleased] in CHANGELOG.md is empty');
	}
	if (sectionNotes(changelog, version) !== null) throw new Error(`CHANGELOG.md already has ${version}`);

	const previous = /^\[(\d+\.\d+\.\d+)\]: /m.exec(changelog)?.[1];
	const refs = [
		`[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD`,
		previous
			? `[${version}]: ${REPO_URL}/compare/v${previous}...v${version}`
			: `[${version}]: ${REPO_URL}/releases/tag/v${version}`
	];
	return changelog
		.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`)
		.replace(/^\[Unreleased\]: .*\n/m, `${refs.join('\n')}\n`);
}

/** @param {string} path relative to the repository root */
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function main() {
	const [command, arg] = argv.slice(2);
	const pkg = JSON.parse(read('package.json'));

	if (command === 'notes') {
		const notes = sectionNotes(read('CHANGELOG.md'), arg ?? pkg.version);
		if (!notes) throw new Error(`No changelog entry for ${arg ?? pkg.version}`);
		console.log(notes);
		return;
	}

	const version = bumpVersion(pkg.version, command);
	const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
	writeFileSync(new URL('CHANGELOG.md', root), releaseChangelog(read('CHANGELOG.md'), version, date));
	// Updates package.json and package-lock.json together, without a commit or tag
	execFileSync('npm', ['version', version, '--no-git-tag-version'], {
		cwd: fileURLToPath(root),
		stdio: 'inherit'
	});
	console.log(`Released ${version}. Commit CHANGELOG.md, package.json and package-lock.json.`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		exit(1);
	}
}
