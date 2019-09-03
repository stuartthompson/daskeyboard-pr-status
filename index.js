const q = require('daskeyboard-applet');
const request = require('request-promise');

const logger = q.logger;
const TOTAL_KEYS = 12;
var prListHash = "";

/**
 * Implements a DasKeyboard Q Applet to monitor the status of pull requests in Stash.
 */
class PRStatusMonitor extends q.DesktopApp {
  constructor() {
    super();

    // Hack to ignore certificate validation failures
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0

    // Poll for pull requests every 10s
    this.pollingInterval = 10000;
    logger.info("Pull Request Status Applet Started");
  }

  /**
   * Runs the logic of the applet.
   * 
   * This function is called every polling interval.
   */
  async run() {
    let pullRequests = await this.getPullRequests();
    
    // Store list of ids
    const newListHash = this.getPRListHash(pullRequests);
    var prListChanged = false;
    if (newListHash !== prListHash) {
      prListChanged = true;
    }

    // Build messsage
    var message = `Found ${pullRequests.length} pull requests.`;
    if (prListChanged) {
      message += " List of PRs has changed since last update.";
    }

    // Build the list of points
    let points = this.generatePoints(pullRequests);

    // Build the signal
    const signal = new q.Signal({
      points: [points],
      name: "Pull Request List Updated",
      message: message,
      isMuted: prListChanged
    });

    return signal;
  }

  /**
   * Gets the list of pull requests from Stash.
   */
  async getPullRequests() {
    const url = this.config.stashURL;
    logger.info(`Requesting list of pull requests from ${this.config.stashURL}`);

    // Return a promise of the list of pull requests
    return request.get({
      url: url,
      headers: { 'Authorization': `Bearer ${this.config.bearerToken}` },
      json: true
    }).then(body => {
      if (body.values) {
        // 'values' contains the pull request details
        return body.values;
      }
      else {
        throw new Error("No PRs returned.");
      }
    }).catch((error) => {
      // Log and throw the error
      const errMessage = `Error reading pull requests. Error: ${error}`;
      logger.error(errMessage);
      throw new Error(errMessage);
    });
  }

  /**
   * Generates the points to send to the device.
   * 
   * @param {*} pullRequests - The list of pull requests being visualized.
   */
  generatePoints(pullRequests) {
    let qPoints = [];
    const numPRs = pullRequests.length;

    // Generate 10 points
    for (let i = 0; i < TOTAL_KEYS; i++) {
      if (i < numPRs) {
        // Get the status color for this PR
        const color = this.getPRStatusColor(pullRequests[i]);
        // Push a new point
        qPoints.push(new q.Point(color));
      }
      // Pad remaining keys with default color
      else {
        qPoints.push(new q.Point(this.config.defaultColor || '#000000'));
      }
    }

    return qPoints;
  }

  /**
   * Determines the status color for a pull request.
   * 
   * @param {*} pullRequest - The pull request to evaluate.
   */
  getPRStatusColor(pullRequest) {
    const reviewers = pullRequest.reviewers;
    let isApproved = false;
    let needsWork = false;
    let isDeclined = false;
    let hasComments = false;
    
    // Look for activity on the PR
    for (var i = 0; i < reviewers.length; i++) {
      if (reviewers[i].approved === true) {
        isApproved = true;
      }
      if (reviewers[i].status === "NEEDS_WORK") {
        needsWork = true;
      }
      if (reviewers[i].status === "DECLINED") {
        isDeclined = true;
      }
      if (pullRequest.properties.commentCount && pullRequest.properties.commentCount > 0) {
        hasComments = true;
      }
    }

    // Needs work takes priority
    if (needsWork) {
      return "#ffa500"; // Orange for needs work
    }
    // Then approved
    if (isApproved) {
      return "#00ff00"; // Green for approved
    }
    // Then declined
    if (isDeclined) {
      return "#ff0000"; // Red for declined
    }
    // Has no comments
    if (!hasComments) {
      return "#ffffff"; // White for untouched
    }
    // Otherwise, has comments (i.e. reviewed) but no status
    return "#0000ff"; // Blue for no outcome
  }

  /**
   * Calculates the hash for the list of pull requests.
   * 
   * @param {*} pullRequests - The list of pull requests being hashed.
   */
  calculatePRListHash(pullRequests) {
    // Extract the list of PR IDs
    const prIds = [];
    for(var i = 0; i < pullRequests.length; i++) {
      prIds.push(pullRequests[i].id);
    }

    // Sort the list of PR  IDs
    prIds = prIds.sort();

    // Concatenate the IDs to form the hash
    var hash = "";
    for (var prId in prIds) {
      hash += prId;
    }
    return hash;
  }
}

module.exports = {
  PRStatusMonitor: PRStatusMonitor
};

const prStatusMonitor = new PRStatusMonitor();