# Let the owner remember the PAT on this device

Ynot authenticates with a YNAB Personal Access Token. Issue #6 kept that token in page memory only, so every reload, closed tab or 15-minute idle lock meant pasting it again from a password manager. That friction falls on every session. The risk that memory-only storage reduces is script running on Ynot's own origin reading the token. A strict Content Security Policy and the absence of third-party scripts make such script much harder to introduce. But they do not stop script that does run on the origin, whether through an XSS bug, a compromised bundled dependency or a malicious extension, from reading `localStorage`. Storing the token accepts that residual risk. Issue #1 originally allowed the credential to be "stored securely in the user's browser".

The owner chose to allow it, as an explicit opt-in, knowing that the token never expires and grants full read and write access to the YNAB account. Entering a PAT offers **Remember on this device**, unselected by default. When it is selected, the PAT is kept in the Ynot origin's `localStorage`, and nothing else is: financial data, memos, tag state, results and undo stay in page memory and die with the tab.

## Consequences

- A remembered PAT never expires and has no scope. It grants full read and write access to the YNAB account until revoked in YNAB, and the privacy explanation says so plainly.
- **Disconnect** deletes the remembered PAT as well as the session. A 401 from YNAB deletes it and tells the user the token was revoked or is invalid.
- The 15-minute inactivity lock is removed. Its only job was to bound how long a memory-only token stayed live on an unattended device. A remembered token outlives any lock, and the operating system's screen lock already covers an unattended personal machine.
- The strict CSP, the dedicated origin, and the absence of third-party runtime scripts become the main protection of the stored token. They stay mandatory and are checked at release.
- Switching budget keeps the remembered PAT and the connection, and resets everything else.
- **OAuth is the planned follow-up, with a known tension.** YNAB's implicit flow runs without a server but issues two-hour tokens with no refresh, which brings back a reconnect every two hours. The authorization-code flow refreshes silently but needs a client secret, and so a small backend, which would relax the no-backend boundary. That choice is made when OAuth is picked up.
