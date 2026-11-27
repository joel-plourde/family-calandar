# Family Calendar

Private-by-invitation French reservation calendar for January 18–February 14, 2027.

## Deployment

- GitHub Pages: Settings → Pages → Deploy from a branch → main / (root).
- Supabase project: `ally-reservations` (Canada Central).
- Database schema: [supabase/schema.sql](supabase/schema.sql)
- Edge Function: [family-calendar](supabase/functions/family-calendar/index.ts)

The deployed database and function are already configured. The invitation token is not stored in this repository. The public site without a valid token displays a locked screen.

## Security

- All booking data lives in a non-exposed PostgreSQL schema with RLS enabled.
- Only the Edge Function's service role can execute the reservation RPC.
- Two slots per date are enforced by a unique constraint and transactional locking.
- The invitation token is stored as a SHA-256 hash. Invited family members can cancel any reservation without a personal code.
- Invitation expires at midnight Toronto time after February 14, 2027.
- No account is required. Anyone who obtains the invitation link can use it; share only with the intended group.
- A shared rate limit applies to authorized API requests. It does not prevent all infrastructure-level abuse.

## Admin: rotate invitation

Run in the Supabase SQL editor. This invalidates the previous invitation; keep the returned token private.

```sql
with token as (
  select encode(extensions.gen_random_bytes(32), 'hex') as value
), updated as (
  update family_private.invitation
  set token_hash = sha256(convert_to(token.value, 'UTF8'))
  from token
  where singleton
  returning token.value
)
select value as invitation_token from updated;
```

Append the returned value to the site URL after `#invite=`. To revoke access immediately, set `expires_at = now()` in the invitation table. Delete reservation data from the Supabase dashboard once no longer needed.

