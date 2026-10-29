/**
 * CI/CD Generator Factory
 * Returns the appropriate CI/CD generator based on platform name.
 */
const { getDefaults } = require('../../config');
const GitLabCIGenerator = require('./GitLabCIGenerator');
const GitHubActionsGenerator = require('./GitHubActionsGenerator');
const JenkinsGenerator = require('./JenkinsGenerator');
const CircleCIGenerator = require('./CircleCIGenerator');
const BitbucketPipelinesGenerator = require('./BitbucketPipelinesGenerator');

// Generator registry. A Map: the platform name comes from the request, so a
// lookup must only ever return one of these classes (never an inherited
// property such as "constructor").
const generators = new Map([
  ['gitlab', GitLabCIGenerator],
  ['github', GitHubActionsGenerator],
  ['jenkins', JenkinsGenerator],
  ['circleci', CircleCIGenerator],
  ['bitbucket', BitbucketPipelinesGenerator],
]);

// Cached generator instances. A Map so a request-supplied platform name like
// "__proto__" can't reach Object.prototype.
const instances = new Map();

/**
 * Get a CI/CD generator instance by platform name.
 * @param {string} [name] - Platform name. Defaults to DEFAULT_CICD_PLATFORM env var.
 * @returns {CICDGenerator}
 * @throws {Error} If generator is not found.
 */
function getCICDGenerator(name) {
  const platformName = name || getDefaults().cicdPlatform;
  // Names come from requests; only strings can match the registry or be cached.
  if (typeof platformName !== 'string') {
    const error = new Error('CI/CD platform must be a string');
    error.status = 400;
    error.expose = true;
    throw error;
  }

  // Return cached instance if available
  if (instances.has(platformName)) {
    return instances.get(platformName);
  }

  // Allowlist check before the lookup, and a function check before `new`, so
  // a request-supplied name can never select an unexpected callee.
  const GeneratorClass = getAvailablePlatforms().includes(platformName)
    ? generators.get(platformName)
    : undefined;
  if (typeof GeneratorClass !== 'function') {
    const error = new Error(
      `Unknown CI/CD platform: ${platformName}. Available: ${getAvailablePlatforms().join(', ')}`
    );
    error.status = 400;
    error.expose = true;
    throw error;
  }

  // Create and cache the instance
  const generator = new GeneratorClass();
  instances.set(platformName, generator);
  return generator;
}

/**
 * Get list of available CI/CD platform names.
 * @returns {string[]}
 */
function getAvailablePlatforms() {
  return [...generators.keys()];
}

/**
 * Get metadata for all platforms.
 * @returns {Array<{name: string, displayName: string, fileName: string}>}
 */
function getAllPlatformMetadata() {
  return getAvailablePlatforms().map((name) => {
    const generator = getCICDGenerator(name);
    return generator.getMetadata();
  });
}

/**
 * Clear cached generator instances (useful for testing).
 */
function clearCache() {
  instances.clear();
}

module.exports = {
  getCICDGenerator,
  getAvailablePlatforms,
  getAllPlatformMetadata,
  clearCache,
};
