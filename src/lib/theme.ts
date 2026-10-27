export type Theme = 'light' | 'dark' | 'system';

export function effectiveTheme(theme: Theme): 'light' | 'dark' {
	if (theme !== 'system') return theme;
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
	const root = document.documentElement;
	if (theme === 'system') delete root.dataset.theme;
	else root.dataset.theme = theme;
	document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}
