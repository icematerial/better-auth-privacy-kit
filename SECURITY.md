# Security Policy

`better-auth-privacy-kit` handles identity and privacy workflows. Please avoid filing a public issue for a vulnerability that could expose data, preserve access after deletion/anonymization, or bypass authorization.

For now, report security issues privately through GitHub's **Report a vulnerability** feature once the repository is published. If private vulnerability reporting is not enabled, open a minimal issue asking for a private contact channel without including exploit details.

## Supported versions

Until `1.0.0`, only the latest release is supported.

## Security design notes

- All user-facing endpoints require a Better Auth session.
- Export responses strip session tokens and OAuth/credential secrets.
- Anonymization revokes sessions and removes linked accounts before changing identity fields.
- Hard deletion is disabled by default.
- Consent metadata is size-limited.

This project is not a substitute for an application-specific security or legal review.
