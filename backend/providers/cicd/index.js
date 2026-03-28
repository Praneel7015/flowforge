/**
 * CI/CD Generator Factory
 * Returns the appropriate CI/CD generator based on platform name.
 */
const { getCICDConfig, getDefaults } = require('../../config');
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

// Cached generator instances
const instances = {};

/**
 * Get a CI/CD generator instance by platform name.
 * @param {string} [name] - Platform name. Defaults to DEFAULT_CICD_PLATFORM env var.
 * @returns {CICDGenerator}
 * @throws {Error} If generator is not found.
 */
function getCICDGenerator(name) {
  const platformName = name || getDefaults().cicdPlatform;

  // Return cached instance if available
  if (instances[platformName]) {
    return instances[platformName];
  }

  const GeneratorClass = generators[platformName];
  if (!GeneratorClass) {
    throw new Error(
      `Unknown CI/CD platform: ${platformName}. Available: ${Object.keys(generators).join(', ')}`
    );
  }

  // Create and cache the instance
  instances[platformName] = new GeneratorClass();
  return instances[platformName];
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
  Object.keys(instances).forEach((key) => delete instances[key]);
}

module.exports = {
  getCICDGenerator,
  getAvailablePlatforms,
  getAllPlatformMetadata,
  clearCache,
};
