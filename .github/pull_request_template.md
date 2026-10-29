## Summary

<!-- What changed and why. Link the issue if there is one. -->

## How it was tested

- [ ] `cd backend && npm run lint && npm test`
- [ ] `cd frontend && npm run lint && npm run build`
- [ ] `cd frontend && npm run test:e2e` (if UI flows changed)
- [ ] Manually checked in the browser (describe below)

## Checklist

- [ ] No secrets, API keys or tokens in code, logs or screenshots
- [ ] User-supplied URLs go through `backend/utils/ssrf.js`
- [ ] README / `.env.example` updated for new env vars or features
