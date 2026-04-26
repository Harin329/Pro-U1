This is a golf ball tracking dashboard built with [Next.js](https://nextjs.org) and Supabase.

## Dashboard features (MVP)

- 🏆 Best ball card based on lowest average score from `ball_stats`
- 📊 Ball comparison table (`score`, `FW%`, `GIR%`, `putts`, `up-and-down %`)
- 📝 Recent rounds list (latest 5 rounds)
- ✍️ In-app logger to add a ball, create a round, and save holes 1-18

## Getting started

1. Install dependencies.
2. Copy `.env.example` to `.env.local`.
3. Add your Supabase project URL and anon key.
4. Run the app.

The app reads these environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to view the dashboard.

You can customize the dashboard in `src/app/page.tsx`.

## Expected Supabase schema

This UI expects:

- A `rounds` table with at least: `id`, `course_name`, `total_score`, `date`
- A `ball_stats` view with at least:
	- `ball_id`, `brand`, `model`, `rounds_played`
	- `avg_score`, `avg_putts`, `fairway_pct`, `gir_pct`, `up_and_down_pct`

## Learn more

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - framework docs
- [Supabase Docs](https://supabase.com/docs) - database and API docs

## Notes

If Supabase environment variables are missing, the dashboard will show a setup notice instead of crashing.

If you see `Unable to load all dashboard data` with a `division by zero` message, recreate the
`ball_stats` view using `supabase/ball_stats_view.sql` in your Supabase SQL editor.
