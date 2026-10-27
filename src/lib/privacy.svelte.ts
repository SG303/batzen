/**
 * Privacy mode hides every amount, e.g. when someone looks at the phone. It is a setting per device,
 * kept in a cookie so the server already renders the page without amounts.
 */
export const privacy = $state({ on: false });

export const PRIVACY_COOKIE = 'privacy';

export function setPrivacy(on: boolean) {
	privacy.on = on;
	document.documentElement.toggleAttribute('data-privacy', on);
	document.cookie = `${PRIVACY_COOKIE}=${on ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
}
