# Security policy

Please **do not open a public issue** for a vulnerability. Report it privately through GitHub: *Security* tab → *Report a vulnerability*. We answer within a week and agree on a disclosure date with you.

Only the latest release is supported: fixes go into a new release, not into old ones.

When you run your own instance, keep `BACKOFFICE_TOKEN` secret and long (`openssl rand -hex 16`): anyone with the backoffice link can create Rooms and download every recording.
