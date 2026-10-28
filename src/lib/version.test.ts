import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bumpVersion, releaseChangelog, sectionNotes } from '../../scripts/release.js';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const changelog = `# Changelog

## [Unreleased]

### Fixed

- Something

## [0.1.0] - 2026-01-01

### Added

- First

[Unreleased]: https://github.com/SG303/batzen/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SG303/batzen/releases/tag/v0.1.0
`;

describe('bumpVersion', () => {
	it('raises the requested part and resets the lower ones', () => {
		expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
		expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
		expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
	});

	it('rejects unknown kinds and pre-release versions', () => {
		expect(() => bumpVersion('1.2.3', 'huge')).toThrow();
		expect(() => bumpVersion('0.1.0-alpha', 'patch')).toThrow();
	});
});

describe('changelog', () => {
	it('reads the notes of one version', () => {
		expect(sectionNotes(changelog, '0.1.0')).toBe('### Added\n\n- First');
		expect(sectionNotes(changelog, 'Unreleased')).toBe('### Fixed\n\n- Something');
		expect(sectionNotes(changelog, '9.9.9')).toBeNull();
	});

	it('moves Unreleased into a dated release and updates the links', () => {
		const released = releaseChangelog(changelog, '0.1.1', '2026-02-02');
		expect(sectionNotes(released, 'Unreleased')).toBe('');
		expect(sectionNotes(released, '0.1.1')).toBe('### Fixed\n\n- Something');
		expect(released).toContain('## [0.1.1] - 2026-02-02');
		expect(released).toContain('[Unreleased]: https://github.com/SG303/batzen/compare/v0.1.1...HEAD');
		expect(released).toContain('[0.1.1]: https://github.com/SG303/batzen/compare/v0.1.0...v0.1.1');
		expect(sectionNotes(released, '0.1.0')).toBe('### Added\n\n- First');
	});

	it('refuses to release without changes or twice', () => {
		const empty = releaseChangelog(changelog, '0.1.1', '2026-02-02');
		expect(() => releaseChangelog(empty, '0.1.2', '2026-02-03')).toThrow(/empty/);
		expect(() => releaseChangelog(changelog, '0.1.0', '2026-02-03')).toThrow(/already/);
	});
});

describe('repository version', () => {
	const { version } = JSON.parse(read('package.json'));

	it('is a plain MAJOR.MINOR.PATCH version', () => {
		expect(version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('is the same in package-lock.json', () => {
		const lock = JSON.parse(read('package-lock.json'));
		expect(lock.version).toBe(version);
		expect(lock.packages[''].version).toBe(version);
	});

	it('has an entry in CHANGELOG.md', () => {
		const text = read('CHANGELOG.md');
		expect(sectionNotes(text, 'Unreleased')).not.toBeNull();
		expect(sectionNotes(text, version), `CHANGELOG.md has no section for ${version}`).toBeTruthy();
	});
});
