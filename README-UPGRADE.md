# Upgrade notes
Dashboard: replace the old admin-dashboard folder (config.js, styles.css, theme.js and icons are unchanged).
Admin Logs (optional, one-time): run supabase/admin_logs.sql, set secret ADMIN_EMAILS, then
`supabase functions deploy admin-logs`. The existing admin-users function is untouched.
Until deployed, the Admin logs tab shows a setup message and everything else works.
