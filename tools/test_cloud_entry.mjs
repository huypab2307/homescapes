// Test harness only: initialize local SQLite BEFORE enabling cloud HTTP mode.
// Production src/server/main.ts always requires PostgreSQL in HC_CLOUD_MODE=1.
process.env.HC_CLOUD_MODE = '0';
const { initLicenses } = await import('../src/server/licenses.ts');
await initLicenses();
process.env.HC_CLOUD_MODE = '1';
await import('../src/server/main.ts');
