# Receipt Scanner

Photograph a receipt and get it itemised, categorised and searchable. Claude reads the photo, you check the result, and it's saved to your account.

Built with React, Vite, Supabase (Auth, Postgres, Storage, Edge Functions) and Claude Vision.

## How it works

1. The browser resizes the photo to 2000px, applies its rotation and uploads it to a private Storage bucket.
2. The `scan-receipt` Edge Function downloads it as the signed-in user and sends it to Claude, which returns JSON that matches a schema.
3. The review form shows the photo beside the result and flags totals that don't add up. Nothing is saved until you confirm.

Design decisions worth knowing:

- **The Anthropic key never reaches the browser.** It exists only as an Edge Function secret.
- **Row Level Security does the isolation.** The function acts as the caller rather than using a service-role key, so RLS applies to it too.
- **Scans are capped at 30 per user per day**, enforced in Postgres, so open signup can't run up your bill. Change `daily_limit` in `consume_scan()`.
- **Each receipt keeps its own currency.** Monthly totals are grouped by currency and never added together.

## Deploy

You need a [Supabase project](https://supabase.com/dashboard) and an [Anthropic API key](https://platform.claude.com/settings/keys). None of these steps need Docker.

```bash
npm install
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase secrets set ANTHROPIC_API_KEY=your-key
npx supabase functions deploy scan-receipt --use-api
```

Then host the frontend. The included workflow publishes to GitHub Pages on every push to `main`:

1. Set repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase: Settings > API).
2. Under Settings > Pages, set the source to GitHub Actions.
3. In Supabase, under Authentication > URL Configuration, set the Site URL to your Pages URL so confirmation emails link back to it.
4. Restrict the function to your site: `npx supabase secrets set ALLOWED_ORIGIN=https://YOUR-USER.github.io`

Any static host works instead: run `npm run build` with those two variables set and upload `dist`.

Supabase's built-in email sender only allows a few messages per hour. Add your own SMTP provider before inviting many people to sign up.

## Develop

```bash
cp .env.example .env.local
npm run dev
```

```bash
npm test
```

```bash
npm run typecheck
```

For a full local backend, `npx supabase start` needs Docker. Put the Anthropic key in `supabase/functions/.env`, then run `npx supabase functions serve`.

## Configuration

| Secret | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude access | Required |
| `CLAUDE_MODEL` | Model used for scans | `claude-opus-5-5` |
| `ALLOWED_ORIGIN` | CORS origin for the function | `*` |
