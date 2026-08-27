# Changelog

## [1.3.0](https://github.com/khawarahemad/KH-cloude/compare/v1.2.0...v1.3.0) (2026-08-27)


### Features

* implement SSE streaming for real-time runtime logs and limit build logs buffer ([2933c71](https://github.com/khawarahemad/KH-cloude/commit/2933c71a87566dc873ea591899f6f67dc97689a3))
* **networking:** implement Xray VLESS proxy architecture ([7377d60](https://github.com/khawarahemad/KH-cloude/commit/7377d606e40c2218fbe1fd80c47d089c439d35a6))


### Bug Fixes

* add x-user-id to CORS allowedHeaders — was blocking all API calls from the frontend ([431c519](https://github.com/khawarahemad/KH-cloude/commit/431c5194a20e2ae41b2b4937991beb26cf62ad76))
* auto-logout stale sessions that have no accessToken — prevents 401 loop on dashboard ([2c37f81](https://github.com/khawarahemad/KH-cloude/commit/2c37f8115d14bc7de3eeb87de479c9d9b384213f))
* issue JWT tokens on OAuth login and send them with all API requests — resolves 401 auth failures after login ([38582f1](https://github.com/khawarahemad/KH-cloude/commit/38582f160bf55c66ebd0658e80492455136c5206))
* pass JWT_SECRET and BACKUP_ENCRYPTION_KEY into backend container via docker-compose ([5d75e15](https://github.com/khawarahemad/KH-cloude/commit/5d75e15b7f9fab14c2bb45faf04f81eedb05ca01))
* remove aggressive process.exit on default storage keys to prevent backend crash loops ([c5db13b](https://github.com/khawarahemad/KH-cloude/commit/c5db13b91b0d171dd8772878e62fa0e994ff9c10))
* remove all hardcoded demo/mock fallback data from ProjectsTab — show real data or empty state ([a922271](https://github.com/khawarahemad/KH-cloude/commit/a922271236a37990ef8cb6d0442b78eb8b5cdd53))
* remove remaining process.exit calls on missing env vars to prevent backend crash loops ([dfb7b87](https://github.com/khawarahemad/KH-cloude/commit/dfb7b87832ec7d2d5f60b90bcaa4a6452b61de59))
* rename OAuth token vars to avoid accessToken redeclaration — fixes TS2451 build error ([eedafeb](https://github.com/khawarahemad/KH-cloude/commit/eedafeb0f367b34e5f189538f7e09dd338e15d86))
* resolve infinite redirect loop between cloud and auth subdomains when handling stale sessions, and ensure accessToken is parsed from session_data ([3a1dfc4](https://github.com/khawarahemad/KH-cloude/commit/3a1dfc481f1bb0c17570559f0688653078554be8))
* resolve TS error for removed fetchRuntimeLogs ([464bbce](https://github.com/khawarahemad/KH-cloude/commit/464bbcecccf137cda0f941dbf375145787a26dbf))
* skip loading spinner during background polling in Projects and Databases tabs ([42f6c01](https://github.com/khawarahemad/KH-cloude/commit/42f6c01c7686edbc8382e14259a92506c450557f))
* update onClick handler for fetchDatabases to resolve TS error with silent parameter ([1f82e2f](https://github.com/khawarahemad/KH-cloude/commit/1f82e2ff583a733a7804fa94fac77f165db170bf))
