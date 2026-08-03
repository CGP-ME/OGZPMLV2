// PostHog analytics bootstrap — shared by every public page (marketing site
// via nginx + dashboard via the node server; both serve from public/).
//
// Loads the full posthog-js bundle directly and inits on load. Any
// posthog.capture() call made before the bundle finishes loading is dropped;
// no page does that today (pageviews are captured by init itself).
//
// To activate: paste the project API key (starts with "phc_", it is a
// public client-side key) into POSTHOG_KEY below. Until then this file
// no-ops with a console warning.
(function () {
  var POSTHOG_KEY = 'phc_JKHka01Dc2uIcatSA8sd8ub4yGsy5c6Jm21Fi3TyHwR';
  var POSTHOG_HOST = 'https://us.i.posthog.com';

  if (!/^phc_/.test(POSTHOG_KEY)) {
    console.warn('[posthog-init] No project key set; analytics disabled.');
    return;
  }

  var s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = POSTHOG_HOST.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
  s.onload = function () {
    if (window.posthog && window.posthog.init) {
      window.posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        defaults: '2026-05-30',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        persistence: 'localStorage+cookie'
      });
    }
  };
  document.head.appendChild(s);
})();
