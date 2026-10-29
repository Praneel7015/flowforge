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

// Generator registry
const generators = {
  gitlab: GitLabCIGenerator,
  github: GitHubActionsGenerator,
  jenkins: JenkinsGenerator,
  circleci: CircleCIGenerator,
  bitbucket: BitbucketPipelinesGenerator,
};

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

  // Return cached instance if available
  if (instances.has(platformName)) {
    return instances.get(platformName);
  }

  const GeneratorClass = Object.prototype.hasOwnProperty.call(generators, platformName)
    ? generators[platformName]
    : null;
  if (!GeneratorClass) {
    throw new Error(
      `Unknown CI/CD platform: ${platformName}. Available: ${Object.keys(generators).join(', ')}`
    );
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
  return Object.keys(generators);
}

/**
 * Get metadata for all platforms.
 * @returns {Array<{name: string, displayName: string, fileName: string}>}
 */
function getAllPlatformMetadata() {
  return Object.keys(generators).map((name) => {
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
