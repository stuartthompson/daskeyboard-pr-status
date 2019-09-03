const q = require('daskeyboard-applet');
const request = require('request-promise');

const logger = q.logger;
const TOTAL_KEYS = 12;
var prListHash = "";

class QTest extends q.DesktopApp {
  constructor() {
    super();

    // Hack to disable certificate chain failures during execution
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0

    // Poll for new PRs every 10s
    this.pollingInterval = 10000;
    logger.info("Stash PR Monitor is good to go.");
  }

  // call this function every pollingInterval
  async run() {
    let pullRequests = await this.getPullRequests();
    let points = this.generatePoints(pullRequests);

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

    return new q.Signal({
      points: [points],
      name: "Pull Request List Updated",
      message: message,
      isMuted: prListChanged
    });
  }

  getRequestHeaders() {
    return {
      'Authorization': `Bearer ${this.config.bearerToken}`
    }
  }

  async getPullRequests() {
    const url = this.config.stashURL;
    logger.info('Requesting list of PRs.');

    return request.get({
      url: url,
      headers: this.getRequestHeaders(),
      json: true
    }).then(body => {
      if (body.values) {
        // Just return number of PRs for now
        return body.values;
      }
      else {
        throw new Error("No PRs returned.");
      }
    }).catch((error) => {
      logger.error(`Error when reading PRs: ${error}`);
      throw new Error(`Error when reading PRs: ${error}`);
    });
  }

  isPRApproved(pullRequest) {
    const reviewers = pullRequest.reviewers;
    
    for (var i = 0; i < reviewers.length; i++) {
      if (reviewers[i].approved === true) {
        // At least one approval found
        return true;
      }
    }

    // No approvals found
    return false;
  }

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

  getPRListHash(pullRequests) {
    var hash = "";
    for(var i = 0; i < pullRequests.length; i++) {
      hash += pullRequests[i].id;
    }
    return hash;
  }
}

module.exports = {
  QTest: QTest
};

const qTest = new QTest();