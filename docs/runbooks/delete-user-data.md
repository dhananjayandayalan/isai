# Delete a member's data

**Self-service:** a member can delete their own account on the About page ("Delete my
account"). That removes:
- their Song files
- their songs, jobs and sessions
- their profile, auth user and invite

Error reports they sent keep no link to them (the user id is set to null).

**The owner, on request** (for someone who can't sign in, or who leaves the group), from
`pipeline/` with the production keys:

```sh
uv run isai admin delete-user friend@example.com
```

It deletes their files in `songs` and any leftover `uploads`, then the auth user (which
cascades to everything else), then the invite. It prints what it removed.

**Backups:** a deleted member is still in older backup archives until those age out (the
last 8 weeks are kept). If someone asks for that too, tell them when the last archive
holding their data will be deleted, or re-encrypt the kept archives without them by
restoring to staging, deleting them there, and taking a new backup.

**Shared songs:** their shared songs disappear for everyone.
