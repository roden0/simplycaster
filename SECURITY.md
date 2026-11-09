# Security policy

Please **do not open a public issue** for a vulnerability. Report it privately through GitHub: *Security* tab → *Report a vulnerability*. We answer within a week and agree on a disclosure date with you.

Only the latest release is supported: fixes go into a new release, not into old ones.

When you run your own instance, keep `BACKOFFICE_TOKEN` secret and long (`openssl rand -hex 16`): until you delete the Initial Admin, anyone with it can sign in as an Admin and download every recording. Keep `DATA_DIR` private too: `session.key` can forge sessions and `accounts.json` holds names and email addresses.
