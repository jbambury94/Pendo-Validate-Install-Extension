/**
 * Pendo Knowledge Base — curated support.pendo.io install articles.
 *
 * Each entry maps topics (detected signals) to an official support article.
 * popup.js uses findKbByTopics() to select contextually relevant reading
 * after validation, and feeds excerpts into the AI prompt.
 *
 * To add an article: append an object to PENDO_KB with a unique slug,
 * the canonical support.pendo.io URL, one or more topics, a one-line
 * summary, and 2–4 actionable bullets. Optionally set supportKey to
 * link the entry to an existing PENDO_SUPPORT key in popup.js.
 */

const PENDO_KB_MIN_AGENT_VERSION = '2.17.0';

const PENDO_KB = [
  {
    slug: 'install-guide',
    title: "Developer's guide to implementing Pendo using the install script",
    url: 'https://support.pendo.io/hc/en-us/articles/360046272771',
    topics: ['snippet', 'install', 'troubleshooting'],
    summary: 'End-to-end walkthrough for installing and configuring the Pendo snippet.',
    bullets: [
      'Insert the install script into the <head> of every page.',
      'The snippet must include the SDK call, API key, and pendo.initialize().',
      'All variables passed to initialize() must be defined before it runs.',
      'Install within each iframe if your app uses iframes.'
    ],
    supportKey: 'installGuide'
  },
  {
    slug: 'install-components',
    title: 'Components of the install script',
    url: 'https://support.pendo.io/hc/en-us/articles/21362607464987',
    topics: ['snippet', 'install', 'api-key'],
    summary: 'Explains the three parts of the snippet: SDK request, public app ID, and initialize method.',
    bullets: [
      'The snippet retrieves pendo.js, your public app ID, and runs pendo.initialize().',
      'All three parts must be present on every tracked page.',
      'The public app ID is in App Details or at the bottom of your Install Settings page.',
      'Variables passed into initialize() must all be defined before the call executes.'
    ],
    supportKey: 'installComponents'
  },
  {
    slug: 'plan-implementation',
    title: 'Plan your direct web implementation of Pendo using the install script',
    url: 'https://support.pendo.io/hc/en-us/articles/360045829772',
    topics: ['install', 'identity', 'metadata', 'planning', 'best-practices'],
    summary: 'Planning checklist: choose IDs, metadata, insert snippet, verify.',
    bullets: [
      'Choose Visitor ID and Account ID naming conventions before installing.',
      'Insert the install script in a common HTML area so it loads on all pages.',
      'You can add metadata fields after the initial install without re-deploying.'
    ]
  },
  {
    slug: 'installation-options',
    title: 'Installation options for a direct web implementation of Pendo',
    url: 'https://support.pendo.io/hc/en-us/articles/17606930575387',
    topics: ['install', 'iframe', 'gtm', 'segment', 'tag-manager'],
    summary: 'Overview of all install methods: direct, GTM, Segment, iframes, Salesforce, Power Apps.',
    bullets: [
      'Install via direct snippet, Google Tag Manager, Twilio Segment, or other tag managers.',
      'For iframes, install Pendo inside each iframe; IDs and API keys must match across frames.',
      'Browser extensions need the snippet inside their own iframe or new-window context.'
    ]
  },
  {
    slug: 'choose-ids-metadata',
    title: 'Choose IDs and metadata',
    url: 'https://support.pendo.io/hc/en-us/articles/21326198721563',
    topics: ['identity', 'metadata', 'visitor', 'account', 'best-practices'],
    summary: 'How to select Visitor IDs, Account IDs, and enrichment metadata.',
    bullets: [
      'Visitor ID is typically an email or unique number; Account ID labels the organisation.',
      'Metadata is stored at visitor and account levels and updates on each initialization.',
      'Avoid changing ID conventions after initial install; metadata fields can be added any time.',
      'Anonymous visitors are supported with cookie-based IDs.'
    ],
    supportKey: 'chooseIdsMetadata'
  },
  {
    slug: 'identify-visitors',
    title: 'Identify visitors and metadata through browser scripting',
    url: 'https://support.pendo.io/hc/en-us/articles/22764466082715',
    topics: ['identity', 'metadata', 'visitor', 'launcher'],
    summary: 'How the Pendo Launcher identifies visitors via browser scripting or IdP.',
    bullets: [
      'Pass visitorId and accountId in pendo.initialize() after authentication.',
      'For the Pendo Launcher, visitor identification can use Azure, Okta, or custom scripting.',
      'Metadata values update automatically when users activate Pendo in your app.'
    ],
    supportKey: 'identifyVisitors'
  },
  {
    slug: 'configure-metadata',
    title: 'Configure visitor and account metadata',
    url: 'https://support.pendo.io/hc/en-us/articles/360031832072',
    topics: ['metadata', 'visitor', 'account', 'configuration'],
    summary: 'How to send, type, and map metadata fields in Pendo.',
    bullets: [
      'Send metadata via the install script, Salesforce, HubSpot, or Segment integrations.',
      'Assign data types (text, number, boolean, date) so fields work in segments and reports.',
      'Map fields to standard concepts like display name, email, revenue, and account type.',
      'Custom metadata fields can be populated via CSV upload or the Pendo API.'
    ]
  },
  {
    slug: 'spa-install',
    title: 'Install Pendo on a single-page web application',
    url: 'https://support.pendo.io/hc/en-us/articles/360031862272',
    topics: ['spa', 'install', 'framework-react', 'framework-angular', 'framework-vue'],
    summary: 'Two-part install for SPAs: snippet in index.html, then pendo.initialize() on route change.',
    bullets: [
      'Part 1: Add the SDK loader to your index.html or always-present HTML file.',
      'Part 2: Call pendo.initialize() with visitor/account data after authentication.',
      'On route changes, Pendo automatically tracks page views if the URL changes.',
      'For advanced config, see Track Events and visitor/account metadata docs.'
    ],
    supportKey: 'spa'
  },
  {
    slug: 'csp',
    title: 'Content Security Policy (CSP)',
    url: 'https://support.pendo.io/hc/en-us/articles/360032209131',
    topics: ['csp', 'security', 'network'],
    summary: 'Required CSP directives for Pendo: script-src, connect-src, img-src, style-src, frame-src.',
    bullets: [
      'Add cdn.pendo.io and pendo-io-static.storage.googleapis.com to script-src.',
      'Add data.pendo.io to connect-src for analytics and guide data.',
      'Add app.pendo.io and *.pendo.io to img-src, style-src, and frame-src as needed.',
      'Replace YOUR_SUB_ID in pendo-static-YOUR_SUB_ID.storage.googleapis.com with your subscription ID.'
    ],
    supportKey: 'csp'
  },
  {
    slug: 'hostname-allowlist',
    title: 'Host name list for visitors in restricted network environments',
    url: 'https://support.pendo.io/hc/en-us/articles/16101373319707',
    topics: ['csp', 'network', 'security', 'firewall'],
    summary: 'Domains to whitelist when visitors are behind firewalls or VPNs.',
    bullets: [
      'Whitelist *.pendo.io and *.storage.googleapis.com for outbound TCP 443.',
      'Specific hosts: app.pendo.io, cdn.pendo.io, data.pendo.io, portal.pendo.io.',
      'Replace YOUR_SUB_ID in content-YOUR_SUB_ID.static.pendo.io.',
      'CNAME configuration can alias Pendo domains to your own trusted domain.'
    ]
  },
  {
    slug: 'content-proxy',
    title: 'Use the content proxy for stricter CSP rules',
    url: 'https://support.pendo.io/hc/en-us/articles/42058593231899',
    topics: ['csp', 'security', 'network'],
    summary: 'Proxy guide content through a Pendo-controlled domain instead of googleapis.com.',
    bullets: [
      'The content proxy avoids whitelisting the shared googleapis.com domain.',
      'New apps use the proxy by default since October 2025.',
      'Enable per-app in Install Settings; resave existing guides to apply.',
      'After confirming guides load, remove the legacy googleapis.com domain from your CSP.'
    ]
  },
  {
    slug: 'gtm-install',
    title: 'Install Pendo through the Google Tag Manager',
    url: 'https://support.pendo.io/hc/en-us/articles/360032201711',
    topics: ['gtm', 'tag-manager', 'install'],
    summary: 'Inject the Pendo snippet via a GTM Custom HTML tag.',
    bullets: [
      'Create a Custom HTML tag in GTM and paste the Pendo install script.',
      'Configure the tag to fire on all pages where you want Pendo to run.',
      'Often requires no code changes to your application.',
      'Ensure pendo.initialize() is called with correct visitor/account data.'
    ]
  },
  {
    slug: 'segment-install',
    title: 'Send Twilio Segment data to Pendo',
    url: 'https://support.pendo.io/hc/en-us/articles/360031870352',
    topics: ['segment', 'tag-manager', 'install'],
    summary: 'Install Pendo via the Pendo Web (Actions) destination in Segment.',
    bullets: [
      'Use the Pendo Web (Actions) destination in Twilio Segment for client-side data.',
      'The destination handles SDK loading and initialization automatically.',
      'Supports custom CNAME and non-US data centres.',
      'For server-side Track Events, add the Webhooks (Actions) destination as well.'
    ]
  },
  {
    slug: 'multi-domain',
    title: 'Install Pendo on multiple domains or subdomains',
    url: 'https://support.pendo.io/hc/en-us/articles/14090652290587',
    topics: ['install', 'subdomain', 'multi-domain'],
    summary: 'Use the same snippet across domains to unify data under one app.',
    bullets: [
      'Install the same snippet (same API key) on all domains/subdomains.',
      'Set up an Exclude List to filter out lower-environment data.',
      'Tag Pages and Features once; they apply across all domains with the same key.'
    ]
  },
  {
    slug: 'multi-env',
    title: 'Pendo in multiple environments for development and testing',
    url: 'https://support.pendo.io/hc/en-us/articles/360031862352',
    topics: ['sandbox', 'testing', 'install', 'multi-domain'],
    summary: 'Best practices for running Pendo in dev, staging, and production.',
    bullets: [
      'Include Pendo in all environments except automated-test runners.',
      'Visitor and Account IDs must be unique per API key; add a prefix/suffix for non-prod.',
      'Use the Exclude List to separate lower-environment traffic from production data.',
      'Each API key uses separate data stores; no automatic data migration between them.'
    ]
  },
  {
    slug: 'login-page',
    title: 'Install Pendo on a login page',
    url: 'https://support.pendo.io/hc/en-us/articles/360031861672',
    topics: ['install', 'identity', 'anonymous'],
    summary: 'How to add the snippet to pre-authentication pages.',
    bullets: [
      'Copy the same install script to the login page with identical metadata fields.',
      'Visitors on the login page are anonymous until they authenticate.',
      'Tag the login page in Pendo to target guides specifically there.'
    ]
  },
  {
    slug: 'agent-debugger',
    title: 'Pendo Web SDK debugger',
    url: 'https://support.pendo.io/hc/en-us/articles/360034229512',
    topics: ['debugging', 'troubleshooting', 'agent'],
    summary: 'Use pendo.enableDebugging() or the in-app debugger to inspect configuration.',
    bullets: [
      'Run pendo.enableDebugging() in the browser console to open the debugger.',
      'The Config tab shows SDK configuration, visitor info, and API key.',
      'The Events tab validates that Track Events and clicks are registering in real-time.',
      'Check iframe sections to verify Pendo is installed in each frame.'
    ]
  },
  {
    slug: 'pendo-not-displaying',
    title: "Pendo isn't displaying",
    url: 'https://support.pendo.io/hc/en-us/articles/10033806003483',
    topics: ['troubleshooting', 'install', 'snippet'],
    summary: 'Troubleshoot "Pendo is not defined" — snippet not installed or not initializing.',
    bullets: [
      'Run pendo.validateInstall() in the console; if it errors, Pendo is not loaded.',
      'Ensure pendo.initialize() runs on the page you are testing.',
      'Clear browser cache and retry after any snippet changes.',
      'Check that your install script references the correct API key.'
    ]
  },
  {
    slug: 'no-matching-api-key',
    title: 'Error: No Matching API Key',
    url: 'https://support.pendo.io/hc/en-us/articles/9480629519131',
    topics: ['troubleshooting', 'api-key', 'install'],
    summary: 'The "No Matching API Key" error means initialize() is not being called or a field is wrong.',
    bullets: [
      'Validate with pendo.validateInstall() in the developer console.',
      'Confirm the API key in the snippet matches the one in Subscription Settings.',
      'Ensure all fields in pendo.initialize() are populated before the call executes.'
    ]
  },
  {
    slug: 'guides-troubleshooting',
    title: 'Guides troubleshooting checklist',
    url: 'https://support.pendo.io/hc/en-us/articles/360032397272',
    topics: ['troubleshooting', 'debugging', 'iframe'],
    summary: 'Checklist for diagnosing guide display issues, missing data, and Pendo errors.',
    bullets: [
      'Run pendo.validateInstall() and confirm metadata is accurate.',
      'Each iframe URL needs its own Pendo snippet instance.',
      'Check Exclude Lists, segments, and date-range filters if data is missing.',
      'If Pendo causes issues, set suspect guides to Staging or Inactive and verify.'
    ]
  },
  {
    slug: 'signed-metadata',
    title: 'Send signed metadata with JWT',
    url: 'https://support.pendo.io/hc/en-us/articles/360039616892',
    topics: ['metadata', 'security', 'identity'],
    summary: 'Add JWT-based signing to metadata for tamper-proof data transmission.',
    bullets: [
      'Activate "Use signed metadata" in Install Settings > Advanced Security.',
      'Generate signing keys in Pendo, then create JWTs server-side.',
      'Pass jwt and signingKeyName to pendo.initialize() (web) or startSession (mobile).',
      'Test with unsigned metadata first to ensure the core install works.'
    ]
  },
  {
    slug: 'security-privacy',
    title: 'Security and privacy in Pendo',
    url: 'https://support.pendo.io/hc/en-us/articles/360031862372',
    topics: ['security', 'csp', 'metadata'],
    summary: 'Overview of Pendo security: CSP guidance, JWT signing, domain allowlists.',
    bullets: [
      'Standard installs do not require JWT; it adds tamper-proof metadata verification.',
      'Modify your CSP to allow Pendo domains if you have a strict policy.',
      'Use the hostname allowlist for visitors behind firewalls or VPNs.'
    ]
  },
  {
    slug: 'browser-extension-plan',
    title: 'Plan your browser extension implementation',
    url: 'https://support.pendo.io/hc/en-us/articles/21163862516507',
    topics: ['launcher', 'install', 'browser-extension'],
    summary: 'Planning guide for deploying Pendo via the Pendo Launcher browser extension.',
    bullets: [
      'Deploy the Pendo Launcher on Chrome, Edge, Firefox, or other supported browsers.',
      'JavaScript must be enabled; anti-virus that blocks JS can prevent Pendo from loading.',
      'Choose a Visitor ID option and metadata plan before deploying.',
      'After install, add extension apps to associate websites with your Pendo subscription.'
    ]
  },
  {
    slug: 'agent-settings',
    title: 'Pendo agent settings',
    url: 'https://support.pendo.io/hc/en-us/articles/360031832152',
    topics: ['agent', 'configuration', 'install'],
    summary: 'Configure Web SDK settings: environment, version, staging URLs.',
    bullets: [
      'Find agent settings under Settings > Subscription Settings > Applications > Web SDK Settings.',
      'Choose between Production and Staging environment configurations.',
      'Update the agent version to access new features and bug fixes.',
      'Use the Debug option to launch the SDK debugger against a specific URL.'
    ],
    supportKey: 'agentSettings'
  },
  {
    slug: 'launch-vds',
    title: 'Help launching the Visual Design Studio',
    url: 'https://support.pendo.io/hc/en-us/articles/360031864732-Help-launching-the-Visual-Design-Studio',
    topics: ['vds', 'designer', 'guides', 'troubleshooting'],
    summary: 'Why the Visual Design Studio may not launch, including apps that redirect and strip the pendo-designer URL token.',
    bullets: [
      'If your app redirects on load and drops the ?pendo-designer query parameter, enable "Disable Designer Launch URL Token" in the app\'s Tagging & Guide Settings.',
      'Launch the designer manually from the browser console with pendo.designerv2.launchInAppDesigner().',
      'Allow browser local storage and cookies; ad blockers, COEP, and Safari ITP (13+) can also block the Visual Design Studio.'
    ],
    supportKey: 'vds'
  },
  {
    slug: 'validate-install',
    title: 'Validate your Pendo installation',
    url: 'https://support.pendo.io/hc/en-us/articles/45557656003355-Validate-your-Pendo-installation',
    topics: ['validation', 'best-practices', 'install', 'troubleshooting', 'debugging', 'agent'],
    summary: 'Browser console commands that confirm a healthy install and show which Visitor and Account IDs are tracked.',
    bullets: [
      'Run pendo.validateInstall() in the console — a healthy result returns the Web SDK version, Visitor ID, Account ID, active tracking, and no warnings.',
      'Use pendo.getVisitorId() and pendo.getAccountId() to confirm the correct IDs are being tracked for the current visitor.',
      'Run these on a page where the Web SDK is installed and the visitor is authenticated.',
      'If validateInstall() errors, the snippet is not loaded or pendo.initialize() has not run on this page.'
    ],
    supportKey: 'validateInstall'
  },
  {
    slug: 'multi-page-install',
    title: 'Install Pendo on a multi-page web application',
    url: 'https://support.pendo.io/hc/en-us/articles/17606624107931-Install-Pendo-on-a-multi-page-web-application',
    topics: ['install', 'snippet', 'multi-page'],
    summary: 'Add the install script to a common template so Pendo loads and initializes on every page.',
    bullets: [
      'Place the single install-script block in a shared header or template so it runs on every page.',
      'Define and test Visitor and Account IDs and metadata before installing; changing IDs later disrupts analytics and guides.',
      'Verify with pendo.validateEnvironment() and confirm raw events appear in Subscription Settings.'
    ]
  },
  {
    slug: 'install-troubleshooting',
    title: 'Troubleshoot installation for a Pendo implementation that uses the install script',
    url: 'https://support.pendo.io/hc/en-us/articles/18031691072667-Troubleshoot-installation-for-a-Pendo-implementation-that-uses-the-install-script',
    topics: ['troubleshooting', 'install', 'api-key', 'metadata', 'snippet'],
    summary: 'Fixes for common install-script problems: no API key configured, data not appearing, metadata syntax.',
    bullets: [
      '"No Pendo API key configured" usually means a variable passed to pendo.initialize() is undefined at call time, or initialize() is not running on the page.',
      'Data is batch-aggregated hourly and can take up to 15 minutes past the hour to appear in Pendo.',
      'Custom metadata field names must start with a letter or underscore and contain no spaces.'
    ]
  },
  {
    slug: 'conditional-init',
    title: 'Conditionally initialize Pendo',
    url: 'https://support.pendo.io/hc/en-us/articles/6838229211675-Conditionally-initialize-Pendo',
    topics: ['install', 'configuration', 'identity', 'troubleshooting'],
    summary: 'Wrap pendo.initialize() in logic so it runs only once required values are defined, or only for specific visitors.',
    bullets: [
      'By default Pendo assumes every value passed to initialize() is already defined; guard the call when IDs or metadata load asynchronously.',
      'A good install initializes with fully-populated IDs and metadata, avoiding split, anonymous, or duplicate visitors.',
      'Use conditional logic to exclude visitors you cannot filter by Visitor ID, Account ID, or domain.'
    ]
  },
  {
    slug: 'supported-browsers',
    title: 'Supported browsers',
    url: 'https://support.pendo.io/hc/en-us/articles/26626087647515-Supported-browsers',
    topics: ['planning', 'configuration', 'troubleshooting', 'vds'],
    summary: 'Browser support differs across the Web SDK, the Pendo app, and the Visual Design Studio.',
    bullets: [
      'The Web SDK supports Internet Explorer 9+ (including Edge) and all versions of Chrome, Safari, and Firefox since 2010.',
      'The Visual Design Studio is not supported in Safari 13.04+ — tag and build guides in Chrome, Edge, or Firefox.',
      'New installs default to the Standards Web SDK build for the best security and performance; XHR and JSONP builds exist for legacy browsers.'
    ]
  },
  {
    slug: 'sri',
    title: 'Subresource Integrity (SRI) for the Pendo Web SDK',
    url: 'https://support.pendo.io/hc/en-us/articles/40288387043355-Subresource-Integrity-SRI-for-the-Pendo-Web-SDK',
    topics: ['security', 'agent', 'configuration', 'csp'],
    summary: 'Verify the Web SDK file has not been modified using an SRI integrity hash (self-hosting recommended).',
    bullets: [
      'SRI blocks the script if its hash does not match, so self-host pendo.js — Pendo-side updates to the CDN file would otherwise break the check and stop Pendo loading.',
      'Generate a hash for the hosted file and add the integrity attribute to the script tag.',
      'SRI cannot apply to dynamically-loaded staging agents; force the production SDK in staging as a workaround.'
    ]
  }
];

/**
 * Return KB entries whose topics overlap with the requested set,
 * ordered by descending match count, then by array position.
 * @param {string[]} topics  - signals detected during validation
 * @param {number}   [max=6] - cap the returned list
 * @returns {Array}
 */
function findKbByTopics(topics, max) {
  if (max === undefined || max === null) max = 6;
  if (!topics || !topics.length) return [];
  const topicSet = new Set(topics.map(function (t) { return t.toLowerCase(); }));
  var scored = [];
  for (var i = 0; i < PENDO_KB.length; i++) {
    var entry = PENDO_KB[i];
    var hits = 0;
    for (var j = 0; j < entry.topics.length; j++) {
      if (topicSet.has(entry.topics[j].toLowerCase())) hits++;
    }
    if (hits > 0) scored.push({ entry: entry, hits: hits, idx: i });
  }
  scored.sort(function (a, b) { return b.hits - a.hits || a.idx - b.idx; });
  var seen = {};
  var result = [];
  for (var k = 0; k < scored.length && result.length < max; k++) {
    var slug = scored[k].entry.slug;
    if (!seen[slug]) {
      seen[slug] = true;
      result.push(scored[k].entry);
    }
  }
  return result;
}
