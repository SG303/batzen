import { firstUserMonth } from '#lib/server/auth.ts';
import { ensureCategories, loadData } from '#lib/server/repo.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, depends }) => {
	depends('app:data');
	ensureCategories();
	const { id, username } = locals.user!;
	return { data: loadData(), user: { id, username }, startedMonth: firstUserMonth() };
};
