import { json } from '@sveltejs/kit';
import { loadData } from '#lib/server/repo.ts';
import { currentMonth } from '#lib/domain.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json(
		{ exportedAt: new Date().toISOString(), note: 'Beträge in Rappen', ...loadData() },
		{
			headers: {
				'content-disposition': `attachment; filename="batzen-${currentMonth()}.json"`
			}
		}
	);
