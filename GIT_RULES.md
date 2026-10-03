# BedLink Git & Security Governance Rules

> **Authoritative Invariant**: **ABSOLUTE ZERO TOLERANCE FOR COMMITTED SECRETS AND API KEYS.**
> Under NO circumstances shall any private API key, authentication token, service role key, database credential, certificate, or private environment file be committed to any Git branch or repository.

---

## 1. Zero-Tolerance Policy: Forbidden Secrets

The following items are strictly forbidden from being staged, committed, or pushed:

| Category | Examples of Forbidden Items |
| :--- | :--- |
| **Supabase Credentials** | `SUPABASE_SERVICE_ROLE_KEY`, `service_role` secrets, non-placeholder JWT tokens, database connection URIs containing passwords. |
| **Map & Third-Party APIs** | Real Google Maps JavaScript API keys (`AIzaSy...`), Twilio credentials, SendGrid keys, AWS/GCP/Azure service account keys. |
| **Authentication Secrets** | JWT signing secrets, session secret cookies, OAuth client secrets, private RSA/ECDSA keys. |
| **Local Environment Files** | `.env`, `.env.local`, `.env.production`, `.env.staging`, `.env.development`, or any custom `.env.*` file. |
| **Key & Certificate Files** | `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.cert`, `*.crt`, `id_rsa`, `id_ed25519`. |
| **Service Accounts** | `serviceAccountKey*.json`, `service-account*.json`, `firebase-adminsdk*.json`, `client_secret*.json`. |

---

## 2. Environment Variable Standards

1. **Only `.env.example` is Tracked**:
   - `.env.example` is the **only** environment configuration file checked into version control.
   - It MUST only contain public placeholder values (e.g. `your-google-maps-api-key`, `https://your-project.supabase.co`).
   - Never copy actual keys into `.env.example`.

2. **Local Machine Configuration**:
   - Copy `.env.example` to `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
   - Store real development keys **only** inside `.env.local`.
   - `.env.local` is explicitly ignored by Git in `.gitignore`.

3. **Cloud & Production Deployments**:
   - Production secrets must be configured via **Vercel Project Settings > Environment Variables** or secure cloud key vaults (AWS Secrets Manager, GCP Secret Manager).
   - Never inject production keys into source code or hardcoded defaults.

---

## 3. Mandatory Pre-Commit Checklist

Before staging or committing any code, every engineer and agent MUST execute this three-step verification:

### Step 1: Check Staged Files
```bash
git status
```
*Verify that no `.env*`, `.json` credentials, or unexpected binary files appear in the staged list.*

### Step 2: Inspect Staged Diffs
```bash
git diff --cached
```
*Carefully inspect line-by-line diffs. Ensure no API keys, private URLs, or passwords were inadvertently added.*

### Step 3: Run Automated Secret Scanner
```bash
npm run check:secrets
```
*BedLink includes an automated secret scanner that validates all tracked and staged files against known credential patterns.*

---

## 4. Automated Git Pre-Commit Hook

To guarantee that keys cannot be committed even by accident, BedLink provides a pre-commit hook in `.githooks/pre-commit`.

### How to Enable the Pre-Commit Hook
Run this command in the repository root:
```bash
git config core.hooksPath .githooks
```

Once enabled, Git will automatically execute `npm run check:secrets` prior to every `git commit`. If a key pattern is detected, the commit will be rejected immediately.

---

## 5. Emergency Incident Response Protocol

If an API key or secret is accidentally committed to Git:

### Immediate Action 1: Revoke the Compromised Secret Immediately
1. Go directly to the provider console (e.g. Supabase Dashboard, Google Cloud Console, AWS Console).
2. **Delete or rotate the compromised key within 5 minutes.**
3. Generate a new key and update environment variables in Vercel and local `.env.local`.
4. *Remember: Simply deleting the key in a subsequent commit DOES NOT remove it from Git history!*

### Immediate Action 2: Purge Git History
If the commit has not been pushed:
```bash
# Soft-reset the commit and unstage the key
git reset HEAD~1
```

If the commit was already pushed to remote:
1. Use `git filter-repo` to permanently erase the file or string from all commit trees:
   ```bash
   git filter-repo --replace-text <(echo 'COMPROMISED_KEY==>REDACTED')
   ```
2. Force push the rewritten history:
   ```bash
   git push origin --force --all
   ```
3. Immediately notify the repository administrator to invalidate any stale local checkouts.

---

## 6. Branching & Commit Message Guidelines

- **Branch Naming**:
  - `feat/feature-name` (New capability)
  - `fix/bug-name` (Bug fix)
  - `perf/optimization-name` (Performance improvements)
  - `sec/security-hardening` (Security updates)
- **Commit Messages**:
  - Follow Conventional Commits: `feat:`, `fix:`, `perf:`, `docs:`, `chore:`.
  - Never include sensitive details, IPs, or authorization headers in commit messages.
