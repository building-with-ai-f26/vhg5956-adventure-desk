// The default product entry point uses the real local scouting workflow.
if(process.env.GEEZ_TEST_MODE==='1')throw Error('This launcher uses actual local models. Run injected QA separately.');
process.env.GEEZ_SCOUT_MODE='1';
process.env.GEEZ_SCOUT_BASELINE='1';
process.env.GEEZ_TEST_MODE='0';
process.env.GEEZ_DEMO_STATE_DIR||='.baseline-state';
process.env.PORT||='8792';
process.env.GEEZ_DEMO_COOKIE_NAMESPACE||='scouting'+process.env.PORT+'_';
await import('./server.mjs');
