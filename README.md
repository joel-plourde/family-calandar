# Family Calendar

Private-by-invitation French reservation calendar for January 18–February 14, 2027.

## Deployment

- GitHub Pages: Settings → Pages → Deploy from a branch → main / (root).
- Supabase project: `ally-reservations` (Canada Central).
- Database schema: [supabase/schema.sql](supabase/schema.sql)
- Edge Function: [family-calendar](supabase/functions/family-calendar/index.ts)

The deployed database and function are already configured. Neither invitation token is stored in this repository. The public site without a valid token displays a locked screen.

## Security

- All booking data lives in a non-exposed PostgreSQL schema with RLS enabled.
- Only the Edge Function's service role can execute the reservation RPC.
- Two slots per date are enforced by a unique constraint and transactional locking.
- Both invitation tokens (64-character legacy hexadecimal and 22-character Base64URL) are stored as SHA-256 hashes. Invited family members can cancel any reservation without a personal code.
- Both invitations expire at midnight Toronto time after February 14, 2027.
- No account is required. Anyone who obtains the invitation link can use it; share only with the intended group.
- A shared rate limit applies to authorized API requests. It does not prevent all infrastructure-level abuse.

## Admin: rotate invitation

Run in the Supabase SQL editor. This rotates both invitations and invalidates the previous links; keep the returned tokens private.

```sql
with tokens as materialized (
  select encode(extensions.gen_random_bytes(32), 'hex') as long_value,
    rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=') as short_value
), updated as (
  update family_private.invitation
  set token_hash = sha256(convert_to(tokens.long_value, 'UTF8')),
      short_token_hash = sha256(convert_to(tokens.short_value, 'UTF8'))
  from tokens
  where singleton
  returning tokens.long_value, tokens.short_value
)
select long_value, short_value from updated;
```

Append the long value after `#invite=` or the short value directly after `#`. Both links access the same calendar. To revoke access immediately, set `expires_at = now()` in the invitation table. Delete reservation data from the Supabase dashboard once no longer needed.

