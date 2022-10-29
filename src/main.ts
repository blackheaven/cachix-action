import * as core from '@actions/core';
import * as exec from '@actions/exec';
import which from 'which';

export const IsPost = !!process.env['STATE_isPost']

// inputs
const name = core.getInput('name', { required: true });
const extraPullNames = core.getInput('extraPullNames');
const signingKey = core.getInput('signingKey');
const authToken = core.getInput('authToken')
const skipPush = core.getInput('skipPush');
const pathsToPush = core.getInput('pathsToPush');
const pushFilter = core.getInput('pushFilter');
const cachixArgs = core.getInput('cachixArgs');
const installCommand =
  core.getInput('installCommand') ||
  "nix-env --quiet -j8 -iA cachix -f https://cachix.org/api/v1/install";
const useFlakes = core.getInput('useFlakes');

async function setup() {
  try {
    if(!which.sync('cachix', { nothrow: true })) {
      core.startGroup('Cachix: installing')
      await exec.exec('bash', ['-c', installCommand]);
      core.endGroup()
    }

    core.startGroup('Cachix: checking version')
    await exec.exec('cachix', ['--version']);
    core.endGroup()

    // for managed signing key and private caches
    if (authToken !== "") {
      await exec.exec('cachix', ['authtoken', authToken]);
    }

    core.startGroup(`Cachix: using cache ` + name);
    await exec.exec('cachix', ['use', name]);
    core.endGroup();

    if (extraPullNames != "") {
      core.startGroup(`Cachix: using extra caches ` + extraPullNames);
      const extraPullNameList = extraPullNames.split(',');
      for (let itemName of extraPullNameList) {
        const trimmedItemName = itemName.trim();
        await exec.exec('cachix', ['use', trimmedItemName]);
      }
      core.endGroup();
    }

    if (signingKey !== "") {
      core.exportVariable('CACHIX_SIGNING_KEY', signingKey);
    }
    // Remember existing store paths
    await exec.exec("sh", ["-c", `${__dirname}/list-nix-store.sh > /tmp/store-path-pre-build`]);
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
}

async function upload() {
  core.startGroup('Cachix: push');
  try {
    if (skipPush === 'true') {
      core.info('Pushing is disabled as skipPush is set to true');
    } else if (signingKey !== "" || authToken !== "") {
      await exec.exec(`${__dirname}/push-paths.sh`, ['cachix', cachixArgs, name, pathsToPush, pushFilter, useFlakes]);
    } else {
      core.info('Pushing is disabled as signingKey nor authToken are set (or are empty?) in your YAML file.');
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
  core.endGroup();
}

// Main
if (!IsPost) {
  // Publish a variable so that when the POST action runs, it can determine it should run the cleanup logic.
  // This is necessary since we don't have a separate entry point.
  core.saveState('isPost', 'true');
  setup()
} else {
  // Post
  upload()
}
