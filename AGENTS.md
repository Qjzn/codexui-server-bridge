# AGENTS.md

## Detached HEAD: Merge To Local `main` Without Creating A Branch

- If working in detached `HEAD`, commit there first.
- Then apply that commit onto local `main` from the main worktree using fast-forward merge or cherry-pick.

## Completion Verification Requirement

- After completing a task that changes behavior or UI, always run a Playwright verification in headless mode.
- Before taking any screenshot, wait a few seconds to ensure the UI has fully loaded.
- Always capture a screenshot of the changed result and display that screenshot in chat when reporting completion.
