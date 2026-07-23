import { expect } from '@playwright/test';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import { ELEMENT_WAIT_LONGER_TIME } from '../core/constants';
import { elements as e } from '../elements';
import { createMultiUserTest } from './fixtures';
import { clickToggleOnWithRetry, openModal } from './helpers';

const PLUGIN_NAME = 'pick-random-user-plugin';
const ENV_VAR_NAME = 'PICK_RANDOM_USER_PLUGIN_URL';

let pluginUrl: string | undefined = process.env[ENV_VAR_NAME];
const setPluginUrl = (url: string) => { pluginUrl = url; };
const getPluginUrl = () => pluginUrl;

const { test } = createMultiUserTest({
  envVarName: ENV_VAR_NAME,
  getPluginUrl,
});

test.describe('Pick Random User Plugin - Presenter connection instability', () => {
  test.beforeAll(async ({ request }, testInfo) => {
    await checkPluginAvailability({
      pluginName: PLUGIN_NAME,
      envVarName: ENV_VAR_NAME,
      setPluginUrl,
      getPluginUrl,
    })({ request }, testInfo);
  });

  test('should keep eligible users visible while the presenter user snapshot is temporarily empty', async ({
    multiUserTest: { modPage, attendeePage },
  }): Promise<void> => {
    await attendeePage.page.waitForSelector(e.whiteboard, {
      timeout: ELEMENT_WAIT_LONGER_TIME,
    });
    await openModal(modPage);
    await clickToggleOnWithRetry(
      modPage,
      e.includeModeratorsChip,
      'include moderators',
      e.includeModeratorsCheckbox,
    );
    await clickToggleOnWithRetry(
      modPage,
      e.includePresenterChip,
      'include presenter',
      e.includePresenterCheckbox,
    );

    const availableUsers = modPage.page.locator(e.pickRandomUserAvailableContent);
    await expect(
      availableUsers,
      'baseline should contain eligible users before connection instability',
    ).not.toContainText(/0 users?/i);
    await expect(modPage.page.locator(e.pickRandomUserNoUsersWarning)).toBeHidden();
    await expect(modPage.page.locator(e.pickRandomUserPickButton)).toBeVisible();

    // Reproduce the transient empty snapshot emitted by the BBB core bridge while
    // the presenter's connection is unstable or resynchronizing.
    await modPage.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('BBB_CORE_SENT_NEW_DATA', {
        detail: {
          hook: 'Hooks::UseUsersBasicInfo',
          data: { loading: false, data: { user: [] } },
        },
      }));
    });

    await expect(availableUsers).toContainText(/0 users?/i);
    await expect(modPage.page.locator(e.pickRandomUserNoUsersWarning)).toBeVisible();
    await expect(modPage.page.locator(e.pickRandomUserPickButton)).toBeHidden();

    const availableUsersText = await availableUsers.innerText();
    expect(
      availableUsersText,
      'eligible users should remain available during a transient empty snapshot',
    ).not.toMatch(/0 users?/i);
    await expect(modPage.page.locator(e.pickRandomUserNoUsersWarning)).toBeHidden();
    await expect(modPage.page.locator(e.pickRandomUserPickButton)).toBeVisible();
  });
});
