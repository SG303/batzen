import { error } from '@sveltejs/kit';
import { yearRange } from '#lib/domain.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
	const year = Number(params.jahr);
	const { data } = await parent();
	if (!yearRange(data).includes(year)) error(404, 'Für dieses Jahr gibt es keine Zahlen.');
	return { year };
};
